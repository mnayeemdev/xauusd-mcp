/**
 * Stage 3 — anticipation persistence + observability primitives.
 *
 * THIS MODULE NEVER COMPUTES OR CHANGES A TRADING DECISION. Every input
 * here (`decision`, `evidence`, `anticipation`, `confluence`) is already
 * fully computed by the protected pipeline (src/core/xauusd_calculate.js)
 * and Stage 1/2's pure src/engine/anticipation.js — this module only
 * PERSISTS and RELABELS-WITH-HISTORY what those layers already produced.
 * It never calls calculateEntry(), never fetches OHLCV, never opens a CDP
 * connection, never touches TradingView, and never places a broker order.
 * It performs ONLY local filesystem I/O (read/write JSON + append JSONL).
 *
 * TWO PERSISTED ARTIFACTS, two different shapes on purpose:
 *   1. The STORE (loadStore/saveStore) — a small JSON object keyed by
 *      setup_id, holding only the LATEST known observation per setup.
 *      This is what lets a later call look up "what was this SAME setup's
 *      previous state" for transition/historical-invalidation detection —
 *      mirrors src/engine/watcherState.js's atomic temp-file+rename write
 *      discipline exactly.
 *   2. The LOG (appendLogLine/loadObservationLog) — an append-only JSONL
 *      file, one line per genuinely new, non-duplicate observation, used
 *      later by validation/opportunity_metrics.js for aggregate counts.
 *      A torn/malformed last line (e.g. from an interrupted process) is
 *      skipped on read, never treated as a fatal error.
 *
 * RUNTIME LOCATION: both files live under `state/`, which this project's
 * .gitignore already excludes wholesale ("XAUUSD auto signal watcher —
 * local runtime bookkeeping ... not a trading ledger. state/") — the same
 * precedent src/engine/watcherState.js already uses for exactly this kind
 * of local, non-authoritative bookkeeping. `validation/` was considered
 * (per the mission's suggested default) but rejected: files under
 * validation/ (e.g. mcp_engine_signals.json, the P6/P7/P8 ledgers) are
 * actually TRACKED in this repository's git history as committed research
 * evidence — the opposite of what "do not commit live/runtime observation
 * rows" requires. `state/` is the correct, already-established, already-
 * gitignored location for this kind of data.
 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { EVIDENCE_ONLY_FAMILIES } from './anticipation.js';

export const STORE_SCHEMA_VERSION = 1;
export const LOG_SCHEMA_VERSION = 1;

export const DEFAULT_STORE_PATH = fileURLToPath(new URL('../../state/xauusd_anticipation_store.json', import.meta.url));
export const DEFAULT_LOG_PATH = fileURLToPath(new URL('../../state/xauusd_wait_opportunity_log.jsonl', import.meta.url));

// ── Store: latest-observation-per-setup, atomic JSON persistence ────────

/**
 * Loads the store. Missing file -> a fresh, empty store (never an error).
 * Malformed/corrupt file -> fails SAFELY to a fresh, empty in-memory store
 * (same discipline as watcherState.js's loadWatcherState()) rather than
 * crash or fabricate prior state. This is not a destructive reset of real
 * data: the corrupt file on disk is left completely untouched until the
 * next successful atomic save overwrites it.
 */
export function loadStore(path) {
  if (!existsSync(path)) return { schema_version: STORE_SCHEMA_VERSION, setups: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.setups !== 'object' || parsed.setups === null) {
      return { schema_version: STORE_SCHEMA_VERSION, setups: {} };
    }
    return { schema_version: STORE_SCHEMA_VERSION, setups: parsed.setups };
  } catch {
    return { schema_version: STORE_SCHEMA_VERSION, setups: {} };
  }
}

/** Atomic temp-file + rename write -- a process kill mid-write can never leave a torn/partial store file. */
export function saveStore(path, store) {
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify({ schema_version: STORE_SCHEMA_VERSION, setups: store.setups ?? {} }, null, 2) + '\n';
  const tmpPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tmpPath, payload);
  renameSync(tmpPath, path);
}

// ── Log: append-only JSONL, resilient to a torn last line ───────────────

export function appendLogLine(path, record) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}

/** Missing file -> []. A malformed/torn line (e.g. an interrupted append) is skipped, never fatal. */
export function loadObservationLog(path) {
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

// ── Setup / scenario identity ────────────────────────────────────────────

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

/**
 * Deterministic setup identity. Canonical fields, in this exact order:
 *
 *   1. symbol
 *   2. timeframe               (decision's own source_timeframe, e.g. "15m")
 *   3. direction                ('BULLISH'/'BEARISH'/'NONE')
 *   4. structural anchor price  (the relevant swing price from evidence.structure
 *                                 for the CURRENT structure direction, rounded to
 *                                 2dp -- 'NO_ANCHOR' when structure is unresolved)
 *   5. regime                   (ONLY when the anchor is absent -- see below)
 *
 * Deliberately EXCLUDED (would create a new ID almost every evaluation,
 * defeating "follow the same developing opportunity across later confirmed
 * bars"): current wall-clock observation time, quality score, current RR,
 * ATR, session label. Bar/pivot ARRAY INDICES (as opposed to prices) are
 * also excluded for the same reason -- the underlying evidence modules
 * (structure.js/breakout.js) report pivot/event positions as INDICES into
 * a bars window that re-slices every call, not as stable timestamps; using
 * an index here would silently reproduce the exact "new ID every call"
 * failure mode the mission explicitly warns against. Price-based anchors
 * are used instead, since a genuinely unchanged structural swing reports
 * the identical price on every subsequent call until a new pivot displaces
 * it -- at which point a NEW setup_id is the correct, intended outcome
 * ("different structural anchor creates different setup_id").
 *
 * `structural anchor price` is deliberately computed independently from
 * `evidence.structure` here (mirroring anticipation.js's own
 * buildInvalidation() logic) rather than read from
 * `anticipation.primary_scenario.invalidation` -- primary_scenario is
 * `null` exactly when state is CONFIRMED (Stage 1/2's own design), which
 * would otherwise break identity continuity at the single most important
 * transition (ARMED -> CONFIRMED). Reading directly from `evidence`
 * (always populated regardless of decision.action) keeps the SAME anchor
 * basis available on both sides of that transition.
 *
 * `developing_strategy_family`/`mapped_model_code` are DELIBERATELY NOT
 * part of identity, despite being mentioned as candidate fields in the
 * mission: `developing_strategy_family` is frequently `null` while a
 * setup is merely DEVELOPING (bare regime eligibility, no specific
 * evidence yet) and only resolves to a real family/model the moment a
 * protected-model candidate actually triggers -- exactly the
 * DEVELOPING -> ARMED transition Stage 3 exists to track. Including it in
 * the hash would mint a brand-new setup_id at that exact moment,
 * fracturing continuity for the single most important transition this
 * stage is meant to observe. The structural anchor price is the more
 * stable, more specific identity signal for "the same opportunity" in
 * this domain (the same level being watched, whatever family eventually
 * explains why) and is used instead; family/model are still recorded on
 * every observation for classification, just not used to key identity.
 *
 * `regime` participates in identity ONLY for the degenerate "nothing
 * developing at all" bucket (no anchor at all) -- a resolved setup's
 * identity never depends on regime, which can fluctuate independently of
 * a stable structural anchor.
 */
export function computeSetupId({ symbol, timeframe, direction, structuralAnchorPrice, regime }) {
  const anchorComponent = Number.isFinite(structuralAnchorPrice) ? String(round2(structuralAnchorPrice)) : 'NO_ANCHOR';
  const bucketComponent = anchorComponent === 'NO_ANCHOR' ? (regime ?? 'NO_REGIME') : 'N/A';
  const canonical = [symbol ?? 'UNKNOWN_SYMBOL', timeframe ?? 'UNKNOWN_TF', direction ?? 'NONE', anchorComponent, bucketComponent].join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/** The relevant structural swing price for the CURRENT structure direction, or null. Same rule anticipation.js's buildInvalidation() uses, computed independently so it survives into the CONFIRMED state where primary_scenario is null. */
export function resolveStructuralAnchorPrice(evidence) {
  const structure = evidence?.structure;
  if (!structure?.state) return null;
  const relevantSwing = structure.state === 'BULLISH' ? structure.lastSwingLow : structure.lastSwingHigh;
  return relevantSwing?.price ?? null;
}

// ── Transition / progression semantics ───────────────────────────────────

// Explicit transition semantics table (mission Part 8). Ordinal "how close
// to confirmation" rank -- NOT a probability, NOT a weighted score, purely
// an ordering of the fixed, closed Stage 1/2 state vocabulary. Lateral
// moves within the same tier (e.g. RETEST_PENDING <-> RECLAIM_PENDING) are
// UNCHANGED, not IMPROVING/DETERIORATING, since no objective progress
// toward confirmation is demonstrated by that move alone.
const STATE_RANK = Object.freeze({
  MISSED: -1,
  INVALIDATED: -1,
  WAIT: 0,
  DEVELOPING: 1,
  APPROACHING_ZONE: 2,
  RETEST_PENDING: 2,
  RECLAIM_PENDING: 2,
  CONFIRMATION_PENDING: 3,
  ARMED: 4,
  CONFIRMED: 5,
});

/**
 * IMPROVING / DETERIORATING / UNCHANGED / UNKNOWN -- never a probability,
 * never a fabricated score. UNKNOWN when there is no previous observation
 * for this setup (nothing to compare against) or either state falls
 * outside the closed Stage 1/2 vocabulary (defensive).
 */
export function classifyProgression(previousState, currentState) {
  if (!previousState) return 'UNKNOWN';
  const prevRank = STATE_RANK[previousState];
  const currRank = STATE_RANK[currentState];
  if (prevRank === undefined || currRank === undefined) return 'UNKNOWN';
  if (currRank > prevRank) return 'IMPROVING';
  if (currRank < prevRank) return 'DETERIORATING';
  return 'UNCHANGED';
}

// States for which a stored invalidation anchor is still meaningful to
// re-check against later evidence. A setup that already reached CONFIRMED
// (a real trade) or is already MISSED/INVALIDATED is terminal for
// anticipation purposes -- re-flagging it later is meaningless noise, not
// a genuine new observation about the setup's OWN progression.
const NON_TERMINAL_STATES = new Set(['DEVELOPING', 'APPROACHING_ZONE', 'RETEST_PENDING', 'RECLAIM_PENDING', 'CONFIRMATION_PENDING', 'ARMED']);

/**
 * Historical invalidation (mission Part 7): true ONLY when (a) a previous,
 * still-open observation exists for this exact setup_id, (b) it recorded
 * an objective invalidation_level/direction, and (c) the CURRENT evidence's
 * last confirmed close has objectively crossed that stored level against
 * the stored direction. Returns false (never guesses INVALIDATED) whenever
 * any of that cannot be evaluated -- no previous record, no stored anchor,
 * or no current price available. Never infers invalidation from elapsed
 * time, a small adverse move, a different setup appearing, or any other
 * subjective signal.
 */
export function checkHistoricalInvalidation(previousRecord, evidence) {
  if (!previousRecord || !NON_TERMINAL_STATES.has(previousRecord.pre_entry_state)) return false;
  if (!Number.isFinite(previousRecord.invalidation_level) || !previousRecord.direction) return false;
  const currentPrice = evidence?.sessionContext?.current?.last_close;
  if (!Number.isFinite(currentPrice)) return false;
  if (previousRecord.direction === 'BULLISH') return currentPrice < previousRecord.invalidation_level;
  if (previousRecord.direction === 'BEARISH') return currentPrice > previousRecord.invalidation_level;
  return false;
}

// ── Model-coverage observability classification (mission Part 10) ───────
// OBSERVABILITY ONLY -- this never changes decision.action and is never
// consulted by any protected gate.
export const MODEL_COVERAGE_CLASSES = Object.freeze([
  'NO_OBJECTIVE_SETUP',
  'EVIDENCE_ONLY_FAMILY_DEVELOPING',
  'PROTECTED_MODEL_TRIGGER_NOT_COMPLETE',
  'PROTECTED_MODEL_CANDIDATE_BLOCKED_BY_GATE',
  'PROTECTED_MODEL_CONFIRMED',
  'UNKNOWN',
]);

export function classifyModelCoverage({ preEntryState, developingStrategyFamily, mappedModelCode }) {
  if (preEntryState === 'CONFIRMED') return 'PROTECTED_MODEL_CONFIRMED';
  // A real protected-model candidate already triggered (mapped_model_code
  // is only ever set from decision.setup or the primary timeframe's own
  // raw pipeline model -- see anticipation.js) but decision.action is
  // still not BUY/SELL: the model coverage exists, a downstream gate
  // (RR/quality/HTF/overextension/etc.) is what is blocking, not a
  // missing strategy.
  if (mappedModelCode) return 'PROTECTED_MODEL_CANDIDATE_BLOCKED_BY_GATE';
  if (!developingStrategyFamily) return preEntryState === 'WAIT' ? 'NO_OBJECTIVE_SETUP' : 'UNKNOWN';
  if (EVIDENCE_ONLY_FAMILIES.includes(developingStrategyFamily)) return 'EVIDENCE_ONLY_FAMILY_DEVELOPING';
  return 'PROTECTED_MODEL_TRIGGER_NOT_COMPLETE';
}

// ── Recording API (mission Part 13) ──────────────────────────────────────

function resolveDeps(_deps) {
  return {
    storePath: _deps?.storePath ?? DEFAULT_STORE_PATH,
    logPath: _deps?.logPath ?? DEFAULT_LOG_PATH,
    loadStore: _deps?.loadStore ?? loadStore,
    saveStore: _deps?.saveStore ?? saveStore,
    appendLogLine: _deps?.appendLogLine ?? appendLogLine,
    now: _deps?.now ?? (() => new Date()),
  };
}

/**
 * Records one Stage 3 observation for an ALREADY-COMPUTED decision +
 * evidence + anticipation (+ optional confluence, for htf_alignment).
 * This function performs ONLY local filesystem I/O -- no calculateEntry()
 * call, no OHLCV fetch, no CDP/TradingView interaction of any kind.
 * A future watcher/CLI integration (explicitly out of scope for Stage 3)
 * is expected to call this ONCE per newly confirmed 5m candle, passing in
 * the SAME decision/evidence/anticipation it already computed for that
 * candle -- never a second, independent analysis sweep.
 *
 * Deduplicates deterministically: a call whose (setup_id,
 * confirmed_bar_time, authoritative_action, pre_entry_state) exactly
 * matches this setup's already-persisted latest record is a no-op
 * (`recorded: false, reason: 'DUPLICATE_OBSERVATION'`) -- nothing is
 * re-appended to the log or re-saved to the store.
 *
 * @returns {{recorded: boolean, reason?: string, setup_id?: string, record?: object}}
 */
export function recordAnticipationObservation({ symbol, decision, evidence, anticipation, confluence = null, confirmedBarTime, observedAt, _deps } = {}) {
  const deps = resolveDeps(_deps);

  if (!decision || !anticipation) return { recorded: false, reason: 'MISSING_INPUT' };

  const timeframe = anticipation.timeframe ?? decision.diagnostics?.source_timeframe ?? null;
  const direction = anticipation.direction ?? null;
  const scenarioFamily = anticipation.developing_strategy_family ?? null;
  const structuralAnchorPrice = resolveStructuralAnchorPrice(evidence);
  const regime = evidence?.regime ?? null;
  const resolvedConfirmedBarTime = confirmedBarTime ?? decision.timeframes?.[timeframe]?.last_confirmed_bar_time ?? null;

  const setupId = computeSetupId({ symbol, timeframe, direction, structuralAnchorPrice, regime });

  const store = deps.loadStore(deps.storePath);
  const previousRecord = store.setups[setupId] ?? null;

  // Historical invalidation -- an ADDITIVE resolution layer around Stage
  // 1/2's own pure, stateless `anticipation.state`. Stage 1/2's OWN
  // current-snapshot INVALIDATED (from explicit current evidence) always
  // wins first and is never overridden; this only ever UPGRADES a
  // still-open state to INVALIDATED when the setup's OWN previously
  // stored anchor is now objectively violated -- it never downgrades or
  // otherwise alters what Stage 1/2 computed. anticipation.js itself is
  // never modified or made to depend on persistence.
  const historicallyInvalidated = anticipation.state !== 'INVALIDATED' && checkHistoricalInvalidation(previousRecord, evidence);
  const preEntryState = historicallyInvalidated ? 'INVALIDATED' : anticipation.state;

  const authoritativeAction = decision.action ?? null;

  if (previousRecord
    && previousRecord.latest_confirmed_bar_time === resolvedConfirmedBarTime
    && previousRecord.pre_entry_state === preEntryState
    && previousRecord.authoritative_action === authoritativeAction) {
    return { recorded: false, reason: 'DUPLICATE_OBSERVATION', setup_id: setupId };
  }

  const previousPreEntryState = previousRecord?.pre_entry_state ?? null;
  const transition = previousPreEntryState ? `${previousPreEntryState} -> ${preEntryState}` : null;
  const improvingOrDeteriorating = classifyProgression(previousPreEntryState, preEntryState);

  const mappedModelCode = anticipation.primary_scenario?.mapped_model_code
    ?? (preEntryState === 'CONFIRMED' ? decision.setup ?? null : null);
  const modelCoverage = classifyModelCoverage({ preEntryState, developingStrategyFamily: scenarioFamily, mappedModelCode });

  const invalidationLevel = anticipation.primary_scenario?.invalidation?.level ?? null;
  const observedAtIso = observedAt ?? deps.now().toISOString();

  const record = {
    schema_version: LOG_SCHEMA_VERSION,
    observed_at: observedAtIso,
    symbol: symbol ?? null,
    confirmed_bar_time: resolvedConfirmedBarTime,
    setup_id: setupId,

    authoritative_action: authoritativeAction,
    authoritative_wait_reason: anticipation.authoritative_wait_reason ?? null,

    pre_entry_state: preEntryState,
    previous_pre_entry_state: previousPreEntryState,
    transition,

    direction,
    developing_strategy_family: scenarioFamily,
    mapped_model_code: mappedModelCode,
    decision_timeframe: timeframe,

    regime,
    structure_state: evidence?.structure?.state ?? null,
    structure_event: evidence?.structure?.lastEvent?.type ?? null,

    session: evidence?.sessionContext?.current?.session ?? null,
    volatility_state: evidence?.volatilityContext?.state ?? null,
    htf_alignment: confluence?.htf_structure_alignment ?? null,

    pattern_context: (evidence?.classicalPatterns ?? []).map((p) => p.pattern_type),
    breakout_state: evidence?.breakoutState?.state ?? null,
    liquidity_state: evidence?.liquidityContext?.sweepReclaim?.swept
      ? (evidence.liquidityContext.sweepReclaim.reclaimed ? 'SWEPT_RECLAIMED' : 'SWEPT_PENDING')
      : (evidence ? 'NONE' : null),

    location: anticipation.primary_scenario?.location ?? null,
    distance_to_trigger: anticipation.primary_scenario?.distance_to_trigger ?? null,

    potential_rr_feasibility: anticipation.primary_scenario?.potential_rr_feasibility ?? null,
    late_overextension_risk: anticipation.primary_scenario?.late_overextension_risk ?? null,

    waiting_for: anticipation.waiting_for ?? [],
    invalidated_if: anticipation.invalidated_if ?? [],

    primary_scenario_present: !!anticipation.primary_scenario,
    alternate_scenario_present: !!anticipation.alternate_scenario,

    improving_or_deteriorating: improvingOrDeteriorating,
    model_coverage: modelCoverage,

    invalidation_level: invalidationLevel,
    structural_anchor_price: structuralAnchorPrice,
  };

  store.setups[setupId] = {
    setup_id: setupId,
    pre_entry_state: preEntryState,
    direction,
    invalidation_level: invalidationLevel,
    latest_confirmed_bar_time: resolvedConfirmedBarTime,
    authoritative_action: authoritativeAction,
    latest_observed_at: observedAtIso,
  };
  deps.saveStore(deps.storePath, store);
  deps.appendLogLine(deps.logPath, record);

  return { recorded: true, setup_id: setupId, record };
}
