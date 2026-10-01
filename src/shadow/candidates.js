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
  Object.freeze({
    id: 'SC3_SILVER_N2_v1', version: 1, status: 'MEASURE_ONLY', execution_authority: 'NONE', origin: 'V7 NEW INFORMATION research (research/new_information_v7): silver confirmation = the only candidate with incremental value on both DEV and HOLDOUT (+0.066 / +0.085 R) but PF 1.02, CI through zero, stress-negative and sign-flipping under one bar of lag; forward measurement requested by the owner (SILVER N2 + DOM FORWARD OBSERVATION directive).',
    hypothesis: 'A production XAUUSDm signal whose direction is confirmed by the contemporaneous XAGUSDm 30-minute move (same-open 5m bar, 6-bar close change >= +0.75 silver ATR14 in the signal direction) has lower wrong-direction rate and higher after-cost expectancy than the unfiltered production stream; conflicting silver (<= -0.75) is worse. MEASURED ONLY; never authorises, blocks or permits an order.',
    data_source: 'Exness MT5 XAGUSDm 5m completed bars (same broker clock as XAUUSDm) read by the read-only shadow reader; the XAGUSDm bar used has the SAME open time as the production signal bar and is complete at the same instant.',
    rule: { feature: 'silver_mom6 = (close - close[-6]) / ATR14(14 simple TR) on XAGUSDm 5m', threshold_atr: 0.75, states: ['CONFIRMED (sgn*mom6 >= +0.75)', 'CONFLICT (sgn*mom6 <= -0.75)', 'NEUTRAL'], timing_variants: ['SAME_BAR (bar open == signal bar open, close <= decision)', 'LAG_1 (previous completed bar; realistic-latency variant)'], missing_policy: 'no XAGUSDm bar complete at the decision time or stale > 10 min -> state NA, recorded, never substituted' },
    hypothesis_side: 'AS_SIGNALLED', timeframe: '5m', outcome_symbol: 'XAUUSDm', min_freshness_sec: 900,
    duplicate_policy: 'one observation per production signal_id (observation_id derived from candidate_id + symbol + timeframe + signal bar_time)',
    hypothetical_geometry: { entry: 'production signal entry', stop_loss: 'production structural stop_loss', target: 'entry +/- 1.70 x |entry - stop_loss| (RR 1.70 CONTROL; production tp2 recorded alongside, not used)', exit_model: 'EXIT_F: broker fail-safe 1.5R + spread intrabar, thesis invalidation on close beyond the structural stop, target touch, 288-bar horizon, SL before TP on the same bar', costs: { normal: { spread_usd: 0.24, slippage_usd: 0.10 }, stress: { spread_usd: 0.60, slippage_usd: 0.20 } }, label: 'HYPOTHETICAL_NOT_EXECUTED' },
    horizons: { hyp288: { bars_5m: 288 } },
    metrics: ['wrong_direction (open-path MFE < 0.5R and structural stop reached)', 'reach 1R / 1.25R / 1.5R / 1.7R / 2R before invalidation', 'MFE_R', 'MAE_R', 'hypothetical exit_R normal and stress cost', 'duration bars', 'three-way CONTROL vs CONFIRMED vs CONFLICT', 'SAME_BAR vs LAG_1 timing sensitivity'],
    minimum_forward_sample: 300, gate: 'docs/XAUUSD_SILVER_N2_FORWARD_OBSERVATION.md section 5; evaluated only on FORWARD_LIVE records; backfill and replay never count',
  }),
  Object.freeze({
    id: 'SC4_DOM_SNAPSHOT_v1', version: 1, status: 'DOM_MEASURE_ONLY', execution_authority: 'NONE', origin: 'V7 FORWARD_ONLY_CANDIDATE (order flow / depth has no history; Exness CFD depth is broker-synthetic).',
    hypothesis: 'NONE YET. Collection only: record the MT5 market book of XAUUSDm at every 5m decision and at every production signal so a depth hypothesis can be pre-registered later on genuinely forward data. No entry rule is derived from DOM in this stage.',
    data_source: 'MetaTrader5.market_book_add / market_book_get on XAUUSDm (read-only subscription; broker depth, NOT global market depth). FORWARD_ONLY_DATA = true (no historical DOM exists; none is fabricated).',
    recorded: ['timestamp', 'best bid / best ask / spread', 'bid depth (sum of bid volumes)', 'ask depth', 'imbalance (bid - ask) / (bid + ask)', 'level count', 'depth change vs the previous snapshot', 'liquidity withdrawal flag (total depth fell >= 50 % vs previous snapshot)', 'availability / reason when the broker returns no book'],
    hypothesis_side: 'NONE', timeframe: '5m', outcome_symbol: 'XAUUSDm',
    duplicate_policy: 'embedded in the CANDLE_5M and SC3 observations of the same decision time (no separate record type)',
    missing_policy: 'book unavailable (broker/API) -> { available: false, reason } recorded; never filled',
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
