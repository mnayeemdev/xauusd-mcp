/**
 * Stage 7 Step 2 -- forward-only, read-only Opportunity Outcome Resolver.
 * Hardened per Step 2 review (horizon semantics + observation/opportunity
 * counting distinction -- see module sections below).
 *
 * Measures what happened AFTER an already-recorded Opportunity Ledger
 * observation (src/engine/opportunityLedger.js, UNCHANGED, UNTOUCHED),
 * using only confirmed bars strictly after that observation's own
 * confirmed_bar_time. Architectural template: src/engine/signalStore.js's
 * resolveOpenSignals() -- same forward-bars-only rule, same
 * immutable-once-terminal discipline, applied here to candidate/
 * opportunity geometry instead of confirmed-trade geometry.
 *
 * THIS MODULE NEVER:
 *   - writes to the Opportunity Ledger's own store/log files (it only ever
 *     READS the Ledger's already-published log via its own exported
 *     loadLedgerLog(), and only from resolveAllPendingOpportunityOutcomes()
 *     below -- never appends/mutates a Ledger record)
 *   - reads or writes Stage 3's anticipation store
 *   - calls calculateEntry()/analyzeMarket()/runPipeline() or fetches OHLCV
 *   - recomputes or alters candidate_entry_zone / provisional_invalidation
 *     / candidate_tp1 / candidate_tp2 / candidate_rr / blocking_conditions
 *     -- those are read-only inputs, copied VERBATIM into the (separate)
 *     outcome record for convenience, never recomputed
 *   - produces a BUY/SELL signal, or feeds any result back into the
 *     pipeline, planner, quality/RR/confirmation gates, model eligibility,
 *     the watcher's alert decision, or calculateEntry()
 *
 * TWO PERSISTED ARTIFACTS, exactly the Ledger's own precedent:
 *   1. STORE (loadOutcomeStore/saveOutcomeStore) -- latest known PROGRESS
 *      per outcome_source_id (see "Incremental/resumable scanning" below).
 *      Updated on every call so progress is never lost between watcher
 *      cycles; used to idempotency-guard/short-circuit the resolver once
 *      terminal.
 *   2. LOG (appendOutcomeLogLine/loadOutcomeLog) -- append-only JSONL, one
 *      line per genuine status TRANSITION (never one line per resolver
 *      invocation, never a duplicate of an unchanged status). A terminal
 *      status is written exactly once: once store.outcomes[id].terminal is
 *      true, the resolver returns that stored record verbatim and reads no
 *      bar at all -- later market data structurally cannot rewrite it.
 *
 * IDENTITY: outcome_source_id links to the EXACT Ledger observation -- the
 * Ledger's own row-uniqueness triple (opportunity_id, confirmed_bar_time,
 * opportunity_state) -- not merely the broad opportunity_id lifecycle. Two
 * different observations of the SAME opportunity_id (e.g. DEVELOPING, then
 * later ARMED, at different confirmed bars) get two independent outcome
 * records, each measuring "what happened after THIS SPECIFIC observation."
 * A single opportunity_id can therefore produce MANY outcome records --
 * see validation/opportunity_outcome_metrics.js's explicit
 * observation-count-vs-independent-opportunity-count distinction.
 *
 * ── Incremental/resumable scanning (horizon-semantics hardening) ──────
 * The caller (the watcher) supplies whatever confirmed bars it CURRENTLY
 * has for this observation's timeframe -- a ROLLING window (currently up
 * to ~499 confirmed 15m bars per src/core/xauusd_calculate.js's own
 * OHLCV_REQUEST_COUNT=500, minus the always-stripped forming bar), NOT an
 * ever-growing history. A single such window can therefore NEVER, by
 * itself, contain enough forward bars to prove a large configured horizon
 * (e.g. 500 bars) was genuinely observed for any real observation (the
 * observation's own bar necessarily has non-trivial history BEFORE it in
 * the same window, e.g. src/engine/pipeline.js's own MIN_BARS_REQUIRED).
 * Naively recomputing "bars strictly after confirmed_bar_time" fresh from
 * whatever window happens to be supplied on a GIVEN call would conflate
 * "the window's own current size" with "how much forward time has
 * genuinely elapsed" -- and, worse, if the observation's own bar ever
 * rolls entirely off the window's retained history, EVERY bar in that
 * later window would look like a "forward" bar even though nothing proves
 * the stretch between the observation and the window's new start was ever
 * actually watched without a gap.
 *
 * This resolver instead ACCUMULATES scan progress across calls, persisted
 * in the STORE: `bars_scanned` (cumulative, monotonic, never re-derived
 * from a single window's size), `latest_scanned_bar_time` (resume point --
 * only bars strictly after THIS are ever considered new), and the
 * in-progress tp1/tp2/invalidation/ambiguous_event race state. Each call
 * only advances using bars strictly after the resume point, so repeatedly
 * re-supplying an overlapping or even IDENTICAL window can never
 * double-count a bar. `HORIZON_EXHAUSTED_NO_TOUCH`/`TP1_HORIZON_EXHAUSTED`
 * are only ever declared when `data_sufficient_for_horizon` is true for
 * THIS call -- meaning the supplied window contains at least one bar AT OR
 * BEFORE the resume point, proving the newly-scanned bars are a genuine,
 * gap-free continuation (never a rolled-past window silently skipping a
 * stretch that was never actually observed). Absent that proof, a genuine
 * TOUCH is still detected and recorded (a real crossing is a real crossing
 * regardless of what else was or wasn't visible), but the horizon can
 * never be declared exhausted from that call -- the outcome simply stays
 * PENDING (state A: insufficient VERIFIED data), never misreported as
 * state B (a genuinely completed horizon). The horizon itself remains a
 * PURELY OBSERVATIONAL bookkeeping parameter: it is never a trading
 * threshold, never an invalidation, never a loss, never a "failed
 * opportunity," and is never read by calculateEntry()/the pipeline/the
 * planner/any gate -- it only controls how long this module keeps
 * classifying an unresolved candidate as PENDING before giving up and
 * calling it HORIZON_EXHAUSTED, once that much time has been PROVABLY
 * observed.
 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { atr } from './math.js';
import { loadLedgerLog, DEFAULT_LEDGER_LOG_PATH } from './opportunityLedger.js';

export const OUTCOME_STORE_SCHEMA_VERSION = 1;
export const OUTCOME_LOG_SCHEMA_VERSION = 1;

export const DEFAULT_OUTCOME_STORE_PATH = fileURLToPath(new URL('../../state/xauusd_opportunity_outcome_store.json', import.meta.url));
export const DEFAULT_OUTCOME_LOG_PATH = fileURLToPath(new URL('../../state/xauusd_opportunity_outcome_log.jsonl', import.meta.url));

// maxHorizonBars: a purely observational bookkeeping constant (NEVER a
// trading parameter, NEVER read by calculateEntry()/the pipeline/the
// planner/any gate) for "how many CUMULATIVE, PROVEN-CONTIGUOUS forward
// bars do we keep waiting for before calling a candidate's outcome
// undecidable." 500 bars of 15m data is ~5.2 calendar days of continuous
// observation -- chosen only as a round, documented waiting budget, not
// derived from any trading threshold. See the module header
// ("Incremental/resumable scanning") for exactly how this is now measured
// safely across many watcher cycles rather than from one fetched window.
export const OUTCOME_PARAMS = Object.freeze({ maxHorizonBars: 500 });

export const OUTCOME_STATUSES = Object.freeze([
  'PENDING',
  'INVALIDATED_BEFORE_TP1',
  'AMBIGUOUS_SAME_BAR',
  'TP1_THEN_TP2',
  'TP1_THEN_INVALIDATED',
  'TP1_HORIZON_EXHAUSTED',
  'HORIZON_EXHAUSTED_NO_TOUCH',
]);

export const TERMINAL_OUTCOME_STATUSES = Object.freeze(OUTCOME_STATUSES.filter((s) => s !== 'PENDING'));

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// ── Store: latest-known-PROGRESS-per-observation, atomic JSON persistence ──

export function loadOutcomeStore(path) {
  if (!existsSync(path)) return { schema_version: OUTCOME_STORE_SCHEMA_VERSION, outcomes: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.outcomes !== 'object' || parsed.outcomes === null) {
      return { schema_version: OUTCOME_STORE_SCHEMA_VERSION, outcomes: {} };
    }
    return { schema_version: OUTCOME_STORE_SCHEMA_VERSION, outcomes: parsed.outcomes };
  } catch {
    return { schema_version: OUTCOME_STORE_SCHEMA_VERSION, outcomes: {} };
  }
}

/** Atomic temp-file + rename write -- a process kill mid-write can never leave a torn/partial store file (same discipline as opportunityLedger.js/signalStore.js). */
export function saveOutcomeStore(path, store) {
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify({ schema_version: OUTCOME_STORE_SCHEMA_VERSION, outcomes: store.outcomes ?? {} }, null, 2) + '\n';
  const tmpPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tmpPath, payload);
  renameSync(tmpPath, path);
}

// ── Log: append-only JSONL, resilient to a torn last line ───────────────

export function appendOutcomeLogLine(path, record) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}

/** Missing file -> []. A malformed/torn line is skipped, never fatal -- same discipline as opportunityLedger.js's loadLedgerLog(). */
export function loadOutcomeLog(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  const records = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { records.push(JSON.parse(trimmed)); } catch { /* skip a malformed/torn line rather than crash */ }
  }
  return records;
}

// ── Identity ──────────────────────────────────────────────────────────

/**
 * Links an outcome to the EXACT Ledger observation row -- the Ledger's own
 * (opportunity_id, confirmed_bar_time, opportunity_state) row-uniqueness
 * triple -- never merely the broad opportunity_id lifecycle. A later
 * observation of the SAME opportunity_id (a genuine state transition) gets
 * its own, independent outcome_source_id and its own independent forward
 * measurement. (See module header: this means observation-level counts
 * are NOT independent-opportunity-level counts -- validation/
 * opportunity_outcome_metrics.js reports both, explicitly labeled.)
 */
export function computeOutcomeSourceId({ opportunity_id, confirmed_bar_time, opportunity_state }) {
  const canonical = `${opportunity_id ?? 'NONE'}|${confirmed_bar_time ?? 'NONE'}|${opportunity_state ?? 'NONE'}`;
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

// ── Pure measurement ──────────────────────────────────────────────────

function isTargetTouched(bar, level, direction) {
  if (!Number.isFinite(level)) return false;
  return direction === 'BEARISH' ? bar.low <= level : bar.high >= level;
}

function isInvalidationTouched(bar, level, direction) {
  if (!Number.isFinite(level)) return false;
  return direction === 'BEARISH' ? bar.high >= level : bar.low <= level;
}

/** ATR AT the observation bar -- backward-looking only (bars at-or-before confirmed_bar_time), the exact same convention pipeline.js's own atrVal uses (its confirmedBars array's LAST element IS the decision bar). Never reads a bar after the observation. */
function computeAtrAtObservation(confirmedBars, confirmedBarTime) {
  if (!Array.isArray(confirmedBars)) return null;
  const upToObservation = confirmedBars
    .filter((b) => Number.isFinite(b?.time) && b.time <= confirmedBarTime)
    .sort((a, b) => a.time - b.time);
  if (upToObservation.length === 0) return null;
  const series = atr(upToObservation, 14);
  const value = series.at(-1);
  return Number.isFinite(value) ? value : null;
}

/** Zone width alone needs no bars at all -- always computable from the observation's own recorded geometry. */
function computeZoneWidth(observation) {
  const zone = observation?.candidate_entry_zone;
  if (!zone || !Number.isFinite(zone.lower) || !Number.isFinite(zone.upper)) return null;
  return round2(Math.abs(zone.upper - zone.lower));
}

/**
 * Pure, resumable forward-only resolution. `observation` is a plain
 * Ledger-log-row-shaped object (symbol/direction/confirmed_bar_time/
 * opportunity_state/candidate_entry_zone/provisional_invalidation/
 * candidate_tp1/candidate_tp2/candidate_rr). `confirmedBars` is whatever
 * confirmed bars the caller CURRENTLY has for that observation's own
 * timeframe -- a rolling window, not necessarily anchored back to
 * confirmed_bar_time on every call. `priorProgress` is the previously
 * persisted STORE record for this exact outcome_source_id (or omitted/null
 * on the very first call) -- see the module header
 * ("Incremental/resumable scanning") for why this is required for correct
 * horizon semantics. Returns null when the observation cannot be resolved
 * at all (missing direction) -- the caller must then skip it, never
 * fabricate a result.
 *
 * Same-bar ambiguity: if a single forward bar touches BOTH sides of a
 * still-open race (TP1 vs invalidation, or -- once TP1 is already resolved
 * -- TP2 vs invalidation-after-TP1), intrabar ordering is unknowable from
 * OHLC alone. This is classified AMBIGUOUS_SAME_BAR (terminal) rather than
 * guessing an order. A bar touching TP1 AND TP2 together, WITHOUT touching
 * invalidation, is NOT ambiguous (TP2 is farther than TP1 in the same
 * direction, so reaching it implies passing TP1's level first) -- but if
 * that same bar ALSO touches invalidation, the TP1-vs-invalidation
 * ambiguity takes precedence and no order is guessed for any of the three.
 *
 * TP2 never corrupts TP1: `tp1` is set at most once, ever, and never
 * revisited; the TP2/invalidation-after-TP1 race only ever begins once
 * `tp1` already holds a value.
 */
export function resolveOpportunityOutcome({ observation, confirmedBars, priorProgress = null } = {}, params = OUTCOME_PARAMS) {
  if (!observation || !Number.isFinite(observation.confirmed_bar_time)) return null;
  const direction = observation.direction;
  if (direction !== 'BULLISH' && direction !== 'BEARISH') return null;

  // Already terminal progress has nothing left to resume -- returned
  // verbatim, zero bars read. (recordOpportunityOutcome() below already
  // short-circuits before ever reaching this call in the normal path; this
  // guard keeps the pure function itself idempotent for any direct caller.)
  if (priorProgress && priorProgress.status && priorProgress.status !== 'PENDING') {
    return {
      direction,
      zone_width: priorProgress.zone_width ?? null,
      zone_width_atr_multiple: priorProgress.zone_width_atr_multiple ?? null,
      atr_value_at_observation: priorProgress.atr_value_at_observation ?? null,
      status: priorProgress.status, terminal: true, bars_scanned: priorProgress.bars_scanned ?? 0,
      latest_scanned_bar_time: priorProgress.latest_scanned_bar_time ?? null,
      data_sufficient_for_horizon: priorProgress.data_sufficient_for_horizon ?? null,
      tp1: priorProgress.tp1 ?? null, tp2: priorProgress.tp2 ?? null,
      invalidation: priorProgress.invalidation ?? null, ambiguous_event: priorProgress.ambiguous_event ?? null,
    };
  }

  const tp1Level = observation.candidate_tp1;
  const tp2Level = observation.candidate_tp2;
  const invalidationLevel = observation.provisional_invalidation?.level;

  let tp1 = priorProgress?.tp1 ?? null;
  let tp2 = priorProgress?.tp2 ?? null;
  let invalidation = priorProgress?.invalidation ?? null;
  let ambiguous_event = priorProgress?.ambiguous_event ?? null;
  let cumulativeBarsScanned = priorProgress?.bars_scanned ?? 0;

  // zone_width is always derivable from the observation alone. The ATR
  // multiple needs bars and is captured once, the first time it succeeds,
  // then frozen (never recomputed from a later, possibly-rolled window).
  const zone_width = priorProgress?.zone_width ?? computeZoneWidth(observation);
  let zone_width_atr_multiple = priorProgress?.zone_width_atr_multiple ?? null;
  let atr_value_at_observation = priorProgress?.atr_value_at_observation ?? null;
  if (!Number.isFinite(atr_value_at_observation)) {
    const atrValue = computeAtrAtObservation(confirmedBars, observation.confirmed_bar_time);
    if (Number.isFinite(atrValue) && atrValue > 0) {
      atr_value_at_observation = round2(atrValue);
      zone_width_atr_multiple = Number.isFinite(zone_width) ? round2(zone_width / atrValue) : null;
    }
  }

  // Resume strictly after whatever has ALREADY been scanned (never the
  // observation's own confirmed_bar_time again once progress exists) --
  // this is what makes cumulative progress correct across a caller-side
  // rolling window: re-supplying an overlapping or identical window on a
  // later call can never double-count or skip a bar.
  const scanFrom = priorProgress?.latest_scanned_bar_time ?? observation.confirmed_bar_time;
  const rawBars = Array.isArray(confirmedBars) ? confirmedBars : [];
  const newForwardBars = rawBars
    .filter((b) => Number.isFinite(b?.time) && b.time > scanFrom)
    .sort((a, b) => a.time - b.time);

  // Horizon-exhaustion proof: this call's window must contain at least one
  // bar AT OR BEFORE the resume point -- proof the newly-scanned bars are a
  // genuine, gap-free continuation, never a window that has silently
  // rolled past a stretch nobody ever actually observed. Without this
  // proof, a genuine touch below is still recognized, but the horizon can
  // never be declared exhausted from this call.
  const dataSufficientForHorizon = rawBars.some((b) => Number.isFinite(b?.time) && b.time <= scanFrom);

  let status = 'PENDING';
  let latestScannedBarTime = scanFrom;

  for (const bar of newForwardBars) {
    cumulativeBarsScanned += 1;
    latestScannedBarTime = bar.time;

    // Stage 1: TP1 vs invalidation-before-TP1 (only while TP1 unresolved).
    if (!tp1 && !invalidation && !ambiguous_event) {
      const touchedTp1 = isTargetTouched(bar, tp1Level, direction);
      const touchedInvalidation = isInvalidationTouched(bar, invalidationLevel, direction);
      if (touchedTp1 && touchedInvalidation) {
        ambiguous_event = { stage: 'TP1_VS_INVALIDATION', bar_time: bar.time };
        status = 'AMBIGUOUS_SAME_BAR';
        break;
      }
      if (touchedInvalidation) {
        invalidation = { touched: true, bar_time: bar.time, bars_elapsed: cumulativeBarsScanned, stage: 'BEFORE_TP1' };
        status = 'INVALIDATED_BEFORE_TP1';
        break;
      }
      if (touchedTp1) {
        tp1 = { touched: true, bar_time: bar.time, bars_elapsed: cumulativeBarsScanned };
        // Deliberately falls through to Stage 2 on this SAME bar: if this
        // same bar's range also reaches TP2 (without touching
        // invalidation), that is NOT ambiguous -- TP2 is farther than TP1
        // in the same direction, so reaching it implies passing TP1's
        // level first. Only a TP2-vs-invalidation same-bar race is
        // genuinely ambiguous, handled below.
      }
    }

    // Stage 2: TP2 vs invalidation-after-TP1 (once TP1 is resolved, same bar or a later one).
    if (tp1 && !tp2 && !invalidation && !ambiguous_event) {
      const touchedTp2 = isTargetTouched(bar, tp2Level, direction);
      const touchedInvalidation = isInvalidationTouched(bar, invalidationLevel, direction);
      if (touchedTp2 && touchedInvalidation) {
        ambiguous_event = { stage: 'TP2_VS_INVALIDATION', bar_time: bar.time };
        status = 'AMBIGUOUS_SAME_BAR';
        break;
      }
      if (touchedInvalidation) {
        invalidation = { touched: true, bar_time: bar.time, bars_elapsed: cumulativeBarsScanned, stage: 'AFTER_TP1' };
        status = 'TP1_THEN_INVALIDATED';
        break;
      }
      if (touchedTp2) {
        tp2 = { touched: true, bar_time: bar.time, bars_elapsed: cumulativeBarsScanned };
        status = 'TP1_THEN_TP2';
        break;
      }
    }
  }

  // HORIZON_EXHAUSTED requires BOTH a proven-contiguous scan this call
  // (dataSufficientForHorizon) AND a cumulative bar count that has
  // genuinely reached the configured budget -- never merely "the array
  // handed to this call happened to run out." Absent that proof, the
  // outcome correctly stays PENDING (state A), never misreported as a
  // genuinely completed horizon (state B).
  if (status === 'PENDING' && dataSufficientForHorizon && cumulativeBarsScanned >= params.maxHorizonBars) {
    status = tp1 ? 'TP1_HORIZON_EXHAUSTED' : 'HORIZON_EXHAUSTED_NO_TOUCH';
  }

  return {
    direction, zone_width, zone_width_atr_multiple, atr_value_at_observation,
    status, terminal: status !== 'PENDING', bars_scanned: cumulativeBarsScanned,
    latest_scanned_bar_time: latestScannedBarTime,
    data_sufficient_for_horizon: dataSufficientForHorizon,
    tp1, tp2, invalidation, ambiguous_event,
  };
}

// ── Recording API (idempotent, append-only, incrementally resumable) ────

function resolveDeps(_deps) {
  return {
    storePath: _deps?.storePath ?? DEFAULT_OUTCOME_STORE_PATH,
    logPath: _deps?.logPath ?? DEFAULT_OUTCOME_LOG_PATH,
    loadStore: _deps?.loadStore ?? loadOutcomeStore,
    saveStore: _deps?.saveStore ?? saveOutcomeStore,
    appendLogLine: _deps?.appendLogLine ?? appendOutcomeLogLine,
    now: _deps?.now ?? (() => new Date()),
  };
}

/**
 * Resolves/advances ONE Ledger observation's outcome. Performs ONLY local
 * filesystem I/O for its own separate outcome store/log -- no Ledger
 * write, no Stage 3 write, no CDP/OHLCV fetch, no calculateEntry() call.
 *
 * Idempotency/immutability: once the stored record for this exact
 * observation is terminal, this function short-circuits BEFORE even
 * resolving again (`ALREADY_TERMINAL`) -- later bars can never rewrite it.
 * While non-terminal, the STORE's cumulative scan progress
 * (bars_scanned/latest_scanned_bar_time/in-progress race state) is saved
 * on EVERY call, so a later cycle always resumes from exactly where the
 * previous one left off -- but the append-only LOG only ever gains a new
 * row on a genuine status TRANSITION (never one row per poll while merely
 * PENDING), so no duplicate rows are ever created by repeated invocation.
 *
 * @returns {{recorded: boolean, reason?: string, outcome_source_id?: string, record?: object}}
 */
export function recordOpportunityOutcome({ observation, confirmedBars, _deps } = {}, params = OUTCOME_PARAMS) {
  const deps = resolveDeps(_deps);

  if (!observation || !observation.opportunity_id || !Number.isFinite(observation.confirmed_bar_time) || !observation.opportunity_state) {
    return { recorded: false, reason: 'MISSING_INPUT' };
  }

  const outcomeSourceId = computeOutcomeSourceId(observation);
  const store = deps.loadStore(deps.storePath);
  const previous = store.outcomes[outcomeSourceId] ?? null;

  if (previous?.terminal) {
    return { recorded: false, reason: 'ALREADY_TERMINAL', outcome_source_id: outcomeSourceId, record: previous };
  }

  const resolved = resolveOpportunityOutcome({ observation, confirmedBars, priorProgress: previous }, params);
  if (!resolved) return { recorded: false, reason: 'RESOLUTION_FAILED', outcome_source_id: outcomeSourceId };

  const resolvedAtIso = deps.now().toISOString();
  const previousStatus = previous?.status ?? null;
  const statusChanged = previousStatus !== resolved.status;

  // Persist advancing scan progress unconditionally (whether or not the
  // externally-visible status changed this call) -- this is what lets the
  // NEXT call resume incrementally instead of re-deriving a possibly
  // misleading bar count from whatever window happens to be supplied then.
  store.outcomes[outcomeSourceId] = {
    outcome_source_id: outcomeSourceId,
    opportunity_id: observation.opportunity_id,
    status: resolved.status,
    terminal: resolved.terminal,
    bars_scanned: resolved.bars_scanned,
    latest_scanned_bar_time: resolved.latest_scanned_bar_time,
    data_sufficient_for_horizon: resolved.data_sufficient_for_horizon,
    zone_width: resolved.zone_width,
    zone_width_atr_multiple: resolved.zone_width_atr_multiple,
    atr_value_at_observation: resolved.atr_value_at_observation,
    tp1: resolved.tp1, tp2: resolved.tp2, invalidation: resolved.invalidation, ambiguous_event: resolved.ambiguous_event,
    last_checked_at: resolvedAtIso,
  };
  deps.saveStore(deps.storePath, store);

  if (!statusChanged) {
    return { recorded: false, reason: 'NO_STATUS_CHANGE', outcome_source_id: outcomeSourceId, record: store.outcomes[outcomeSourceId] };
  }

  const record = {
    schema_version: OUTCOME_LOG_SCHEMA_VERSION,
    outcome_source_id: outcomeSourceId,
    opportunity_id: observation.opportunity_id,
    symbol: observation.symbol ?? null,
    source_timeframe: observation.source_timeframe ?? null,
    direction: observation.direction ?? null,
    observation_confirmed_bar_time: observation.confirmed_bar_time,
    observation_opportunity_state: observation.opportunity_state,

    // Verbatim, read-only copies of the source observation's own geometry
    // -- never recomputed, never altered.
    candidate_entry_zone: observation.candidate_entry_zone ?? null,
    provisional_invalidation: observation.provisional_invalidation ?? null,
    candidate_tp1: observation.candidate_tp1 ?? null,
    candidate_tp2: observation.candidate_tp2 ?? null,
    candidate_rr: observation.candidate_rr ?? null,
    blocking_conditions: observation.blocking_conditions ?? [],

    // Derived, read-only measurement -- never fed back anywhere.
    zone_width: resolved.zone_width,
    zone_width_atr_multiple: resolved.zone_width_atr_multiple,
    atr_value_at_observation: resolved.atr_value_at_observation,

    status: resolved.status,
    previous_status: previousStatus,
    transition: previousStatus ? `${previousStatus} -> ${resolved.status}` : null,
    terminal: resolved.terminal,
    bars_scanned: resolved.bars_scanned,
    data_sufficient_for_horizon: resolved.data_sufficient_for_horizon,
    tp1: resolved.tp1,
    tp2: resolved.tp2,
    invalidation: resolved.invalidation,
    ambiguous_event: resolved.ambiguous_event,
    resolved_at: resolvedAtIso,
  };
  deps.appendLogLine(deps.logPath, record);

  return { recorded: true, outcome_source_id: outcomeSourceId, record };
}

/**
 * Watcher-facing batch entry point (OPTIONAL, observational only). Reads
 * the Opportunity Ledger's already-published LOG (read-only -- never
 * writes to it) and attempts to resolve/advance every row's outcome using
 * whatever confirmed bars the caller already has for that timeframe (the
 * SAME bars analyzeMarket() already fetched this cycle -- never a second
 * sweep, never a new OHLCV fetch). Rows whose stored outcome is already
 * terminal are skipped at negligible cost (recordOpportunityOutcome's own
 * short-circuit, see above). Cannot throw for a caller error -- an
 * unavailable bars array simply skips this cycle's resolution attempt.
 */
export function resolveAllPendingOpportunityOutcomes({ confirmedBars, _deps } = {}, params = OUTCOME_PARAMS) {
  if (!Array.isArray(confirmedBars) || confirmedBars.length === 0) {
    return { evaluated: 0, resolved: 0, unresolved: 0, skipped_reason: 'NO_BARS_AVAILABLE' };
  }

  const ledgerLogPath = _deps?.ledgerLogPath ?? DEFAULT_LEDGER_LOG_PATH;
  const loadLedger = _deps?.loadLedgerLog ?? loadLedgerLog;
  const rows = loadLedger(ledgerLogPath);

  let evaluated = 0, resolved = 0, unresolved = 0;
  for (const row of rows) {
    const outcome = recordOpportunityOutcome({ observation: row, confirmedBars, _deps }, params);
    evaluated += 1;
    const terminalNow = outcome.record?.terminal === true;
    if (terminalNow) resolved += 1; else unresolved += 1;
  }
  return { evaluated, resolved, unresolved };
}
