/**
 * FROZEN SHADOW CANDIDATE REGISTRY (Stage 11C). MEASURE ONLY.
 *
 * Every candidate is an immutable, versioned definition. Changing any field of an existing id is forbidden:
 * the frozen hash in candidates.frozen.json is verified at load and by tests; a change must be a NEW id
 * (e.g. SC1_SILVER_LEAD_v2). Candidates never produce production BUY/SELL, never touch quality, never block
 * or permit an entry, never alter risk. Their only output is an observation record with a hypothesis side and,
 * later, outcome records.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CANDIDATES = Object.freeze([
  Object.freeze({
    id: 'SC1_SILVER_LEAD_v1', version: 1, status: 'MEASURE_ONLY', origin: 'Stage 11B discovery near-miss (docs/XAUUSD_NEXT_EDGE_RESEARCH_RESULTS.md §1, D2:SELL)',
    hypothesis: 'A large 15m decline in silver (XAGUSDm) is followed by a decline in gold over the next 1-4 hours; measured on the SELL side only (the BUY side showed nothing in 11B).',
    data_source: 'Exness MT5 XAGUSDm 15m completed bars (same broker clock as XAUUSDm); trigger evaluated at the 15m close.',
    trigger: { input: 'XAGUSDm 15m log close-to-close return', zscore_window_bars: 96, z_threshold: -1.5, rule: 'z <= -1.5 at a COMPLETED 15m bar whose close time <= decision time' },
    hypothesis_side: 'SELL', timeframe: '15m', outcome_symbol: 'XAUUSDm',
    min_freshness_sec: 900, // the silver bar and the gold bar must both be complete and <= decision time; nothing newer is used
    duplicate_policy: 'one trigger per 15m bar_time (observation_id is derived from candidate_id+symbol+timeframe+bar_time)',
    missing_data_policy: 'if XAGUSDm bars are missing, stale (last bar close < decision time - 900 s) or fewer than 97 bars: NO trigger; the CANDLE_5M observation records cross_asset.XAGUSDm = null',
    observation_frequency: 'every completed 15m bar (evaluated on the 5m cycle whose close is a 15m boundary)',
    horizons: { h4: { bars_15m: 4 }, h8: { bars_15m: 8 }, h16: { bars_15m: 16 } },
    cost_assumptions: { spread_usd_round_trip: 0.26, spread_stress_usd: 0.40, slippage_usd: 0.10 },
    metrics: ['excess_atr (side-signed move in ATR14(15m) units minus the forward-period drift of gold measured over the same collection window)', 'p_win', 'p_plus05_before_minus05', 'mfe_mae', 'net_of_cost', 'no_top5', 'monthly_stability'],
  }),
  Object.freeze({
    id: 'SC2_PRODUCTION_SIGNAL_v1', version: 1, status: 'MEASURE_ONLY', origin: 'forward expectancy of the unchanged production engine (every genuine BUY/SELL candidate, executed or blocked)',
    hypothesis: 'Production BUY/SELL signals (intraday_5m engine) have positive forward expectancy at the engine geometry (TP1 before SL) and at fixed horizons; blocked signals are measured identically so the effect of each block reason can be audited.',
    data_source: 'production signal store validation/mcp_engine_signals.json (read-only) + REAL executor audit log state/xauusd_mt5_real_trade_log.jsonl (read-only) for execution status and block reason; outcome bars XAUUSDm 5m from MT5.',
    trigger: { rule: 'a new signal_id appears in the production signal store (side BUY/SELL, signal_bar_time, entry, stop_loss, tp1, tp2, rr, quality, model)' },
    hypothesis_side: 'AS_SIGNALLED', timeframe: '5m', outcome_symbol: 'XAUUSDm',
    min_freshness_sec: 600,
    duplicate_policy: 'one observation per signal_id (bar_time = signal_bar_time, candidate_id + signal_id in payload)',
    missing_data_policy: 'if the executor audit has no record for the signal within 10 min the execution status is UNKNOWN (recorded as such, never guessed); if the engine entry price is missing no fill is fabricated and geometry outcomes are skipped',
    observation_frequency: 'as signals occur',
    horizons: { h12: { bars_5m: 12 }, h24: { bars_5m: 24 }, h48: { bars_5m: 48 }, geometry: { rule: 'first touch of tp1 vs stop_loss within 48 bars from the signal close, R = (tp1-entry)/(entry-stop_loss) on a TP1 touch, -1 on an SL touch, mark-to-market R at 48 bars otherwise' } },
    cost_assumptions: { spread_usd_round_trip: 0.26, note: 'no fill is fabricated; the engine entry is the reference price; executed trades additionally carry the real fill from the audit log' },
    metrics: ['expectancy_R', 'p_tp1_first', 'excess_atr at h12/h24/h48', 'split by executed vs blocked reason', 'split by model', 'no_top5', 'monthly_stability'],
  }),
]);

export function candidateById(id) { return CANDIDATES.find((c) => c.id === id) ?? null; }
export function definitionHash(c) { return createHash('sha256').update(JSON.stringify(c)).digest('hex'); }
export function registryHashes() { return Object.fromEntries(CANDIDATES.map((c) => [c.id, definitionHash(c)])); }

/** Verifies the in-code definitions against the committed frozen hashes. Throws on any mismatch (immutability). */
export function verifyFrozenRegistry(frozenPath = fileURLToPath(new URL('./candidates.frozen.json', import.meta.url))) {
  const frozen = JSON.parse(readFileSync(frozenPath, 'utf8'));
  const live = registryHashes();
  const problems = [];
  for (const [id, h] of Object.entries(frozen.hashes)) { if (!live[id]) problems.push(`FROZEN_CANDIDATE_MISSING:${id}`); else if (live[id] !== h) problems.push(`CANDIDATE_MODIFIED:${id}`); }
  for (const id of Object.keys(live)) if (!frozen.hashes[id]) problems.push(`UNFROZEN_CANDIDATE:${id}`);
  if (problems.length) throw new Error(`shadow candidate registry integrity failure: ${problems.join(', ')}`);
  return { ok: true, frozen_at: frozen.frozen_at, ids: Object.keys(live) };
}
