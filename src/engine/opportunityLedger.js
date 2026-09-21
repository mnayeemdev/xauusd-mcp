/**
 * Opportunity Ledger — append-only factual history for the Pre-Entry
 * Opportunity Planner (src/engine/opportunityPlanner.js).
 *
 * THIS MODULE NEVER COMPUTES OR CHANGES A TRADING DECISION. Every input
 * here (`decision`, `plan`) is already fully computed by the protected
 * pipeline and the pure opportunityPlanner.js — this module only
 * PERSISTS what those layers already produced, mirroring
 * src/engine/anticipationStore.js's own proven architecture and
 * philosophy (deterministic identity excluding volatile fields, atomic
 * writes, append-only history, dedup on meaningful change only). It
 * never calls calculateEntry(), never fetches OHLCV, never opens a CDP
 * connection, never touches TradingView, and never places a broker
 * order. It performs ONLY local filesystem I/O (read/write JSON + append
 * JSONL).
 *
 * NOT A REPLACEMENT FOR STAGE 3 (mission Section 29): src/engine/
 * anticipationStore.js remains the factual anticipation/WAIT
 * observability layer, UNCHANGED and UNTOUCHED by this file. This is a
 * SEPARATE, additive ledger for the richer zone/candidate-geometry
 * planner data Stage 3 does not compute. `confirmed_bar_time` is the
 * natural join key between the two, when both exist for the same bar.
 *
 * TWO PERSISTED ARTIFACTS, exactly Stage 3's own precedent:
 *   1. The STORE (loadLedgerStore/saveLedgerStore) — latest known record
 *      per opportunity_id, used to detect a meaningful state transition
 *      and to dedup.
 *   2. The LOG (appendLedgerLogLine/loadLedgerLog) — append-only JSONL,
 *      one line per genuinely new, non-duplicate observation. NEVER
 *      overwritten or mutated in place — this is what preserves
 *      "candidate-before-overextended" history (mission Section 24):
 *      once a transition is written, it is written forever, regardless
 *      of what a later observation says.
 *
 * RUNTIME LOCATION: state/ (gitignored), the same precedent
 * anticipationStore.js/watcherState.js/drawingRegistry.js already use.
 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const LEDGER_STORE_SCHEMA_VERSION = 1;
export const LEDGER_LOG_SCHEMA_VERSION = 1;

export const DEFAULT_LEDGER_STORE_PATH = fileURLToPath(new URL('../../state/xauusd_opportunity_ledger_store.json', import.meta.url));
export const DEFAULT_LEDGER_LOG_PATH = fileURLToPath(new URL('../../state/xauusd_opportunity_ledger_log.jsonl', import.meta.url));

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// ── Store: latest-observation-per-opportunity, atomic JSON persistence ──

export function loadLedgerStore(path) {
  if (!existsSync(path)) return { schema_version: LEDGER_STORE_SCHEMA_VERSION, opportunities: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.opportunities !== 'object' || parsed.opportunities === null) {
      return { schema_version: LEDGER_STORE_SCHEMA_VERSION, opportunities: {} };
    }
    return { schema_version: LEDGER_STORE_SCHEMA_VERSION, opportunities: parsed.opportunities };
  } catch {
    return { schema_version: LEDGER_STORE_SCHEMA_VERSION, opportunities: {} };
  }
}

/** Atomic temp-file + rename write -- a process kill mid-write can never leave a torn/partial store file. */
export function saveLedgerStore(path, store) {
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify({ schema_version: LEDGER_STORE_SCHEMA_VERSION, opportunities: store.opportunities ?? {} }, null, 2) + '\n';
  const tmpPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tmpPath, payload);
  renameSync(tmpPath, path);
}

// ── Log: append-only JSONL, resilient to a torn last line ───────────────

export function appendLedgerLogLine(path, record) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}

/** Missing file -> []. A malformed/torn line (e.g. an interrupted append) is skipped, never fatal -- same discipline as anticipationStore.js's loadObservationLog(). */
export function loadLedgerLog(path) {
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

// ── Opportunity identity (mission Section 27) ────────────────────────────

/**
 * Deterministic opportunity identity, following the SAME philosophy
 * Stage 3's computeSetupId() already established (see
 * anticipationStore.js's own extensive documentation of this choice) --
 * NEVER modified here, only the same philosophy reapplied to this
 * ledger's own richer zone geometry:
 *
 *   1. symbol
 *   2. source_timeframe
 *   3. direction
 *   4. zone anchor (the selected zone's [lower, upper] bounds, rounded --
 *      a genuinely different zone is a genuinely different opportunity;
 *      an unchanged zone across later confirmed bars keeps the SAME id,
 *      preserving continuity across DEVELOPING -> ... -> CONFIRMED)
 *   5. regime (ONLY when no zone anchor exists -- the degenerate
 *      "nothing developing" bucket)
 *
 * Deliberately EXCLUDED, mirroring Stage 3 exactly: setup_family/
 * setup_model (would mint a new id the moment a family/model first
 * resolves), opportunity_state, candidate geometry, wall-clock time.
 */
export function computeOpportunityId({ symbol, sourceTimeframe, direction, zone, regime }) {
  const anchorComponent = zone && Number.isFinite(zone.lower) && Number.isFinite(zone.upper) ? `${round2(zone.lower)}-${round2(zone.upper)}` : 'NO_ZONE';
  const bucketComponent = anchorComponent === 'NO_ZONE' ? (regime ?? 'NO_REGIME') : 'N/A';
  const canonical = [symbol ?? 'UNKNOWN_SYMBOL', sourceTimeframe ?? 'UNKNOWN_TF', direction ?? 'NONE', anchorComponent, bucketComponent].join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

// ── Recording API ─────────────────────────────────────────────────────

function resolveDeps(_deps) {
  return {
    storePath: _deps?.storePath ?? DEFAULT_LEDGER_STORE_PATH,
    logPath: _deps?.logPath ?? DEFAULT_LEDGER_LOG_PATH,
    loadStore: _deps?.loadStore ?? loadLedgerStore,
    saveStore: _deps?.saveStore ?? saveLedgerStore,
    appendLogLine: _deps?.appendLogLine ?? appendLedgerLogLine,
    now: _deps?.now ?? (() => new Date()),
  };
}

/**
 * Records one Opportunity Ledger observation for an ALREADY-COMPUTED
 * `decision` (calculateEntry() result) + `plan`
 * (opportunityPlanner.computeOpportunityPlan() result). Performs ONLY
 * local filesystem I/O -- no calculateEntry() call, no OHLCV fetch, no
 * CDP/TradingView interaction. Intended to be called ONCE per newly
 * confirmed 5m candle by the watcher, passing in the SAME decision/plan
 * it already computed for that candle -- never a second, independent
 * analysis sweep.
 *
 * Dedup (mission Section 28): a call whose (opportunity_id,
 * confirmed_bar_time, opportunity_state) exactly matches this
 * opportunity's already-persisted latest record is a no-op (`recorded:
 * false, reason: 'DUPLICATE_OBSERVATION'`) -- nothing is re-appended to
 * the log or re-saved to the store. A `status: 'NO_PLAN'` snapshot is
 * NEVER recorded at all (nothing objective exists to log) -- this
 * mirrors "do not fabricate a plan merely to produce a ledger row."
 *
 * @returns {{recorded: boolean, reason?: string, opportunity_id?: string, record?: object}}
 */
export function recordOpportunityObservation({ decision, plan, confirmedBarTime, observedAt, _deps } = {}) {
  const deps = resolveDeps(_deps);

  if (!decision || !plan) return { recorded: false, reason: 'MISSING_INPUT' };
  if (plan.status === 'NO_PLAN') return { recorded: false, reason: 'NO_OBJECTIVE_PLAN' };

  const symbol = plan.symbol ?? decision.symbol ?? null;
  const sourceTimeframe = plan.source_timeframe ?? null;
  const resolvedConfirmedBarTime = confirmedBarTime ?? plan.generated_from_bar_time ?? null;

  const opportunityId = computeOpportunityId({ symbol, sourceTimeframe, direction: plan.direction, zone: plan.zone, regime: null });

  const store = deps.loadStore(deps.storePath);
  const previousRecord = store.opportunities[opportunityId] ?? null;

  if (previousRecord
    && previousRecord.latest_confirmed_bar_time === resolvedConfirmedBarTime
    && previousRecord.opportunity_state === plan.opportunity_state) {
    return { recorded: false, reason: 'DUPLICATE_OBSERVATION', opportunity_id: opportunityId };
  }

  const previousOpportunityState = previousRecord?.opportunity_state ?? null;
  const transition = previousOpportunityState ? `${previousOpportunityState} -> ${plan.opportunity_state}` : null;
  const observedAtIso = observedAt ?? deps.now().toISOString();

  const record = {
    schema_version: LEDGER_LOG_SCHEMA_VERSION,
    observed_at: observedAtIso,
    confirmed_bar_time: resolvedConfirmedBarTime,
    symbol,
    source_timeframe: sourceTimeframe,
    opportunity_id: opportunityId,

    direction: plan.direction,
    setup_family: plan.setup_family,
    setup_model: plan.setup_model,

    opportunity_state: plan.opportunity_state,
    previous_opportunity_state: previousOpportunityState,
    transition,

    zone: plan.zone,
    interaction_state: plan.interaction_state,
    candidate_entry_zone: plan.candidate_entry_zone,
    provisional_invalidation: plan.provisional_invalidation,
    candidate_tp1: plan.candidate_tp1,
    candidate_tp2: plan.candidate_tp2,
    candidate_rr: plan.candidate_rr,

    confirmation_required: plan.confirmation_required,
    confirmation_observed: plan.confirmation_observed,
    blocking_conditions: plan.blocking_conditions,

    authoritative_action: decision.action ?? null,
    authoritative_reason: decision.reason ?? null,
  };

  store.opportunities[opportunityId] = {
    opportunity_id: opportunityId,
    opportunity_state: plan.opportunity_state,
    direction: plan.direction,
    latest_confirmed_bar_time: resolvedConfirmedBarTime,
    latest_observed_at: observedAtIso,
  };
  deps.saveStore(deps.storePath, store);
  deps.appendLogLine(deps.logPath, record);

  return { recorded: true, opportunity_id: opportunityId, record };
}
