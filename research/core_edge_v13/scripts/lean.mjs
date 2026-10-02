/**
 * V13 CORE EDGE RECONSTRUCTION -- pure helpers for the lean strategy audit (RESEARCH ONLY; no order code; nothing is changed).
 * Spec: ../V13_PREREGISTRATION.md. Groupings use ONLY attributes the frozen V8 engine already records before entry.
 */
import { timingFeatures } from '../../entry_edge_risk_v12/scripts/isolation.mjs';

export const MIN_N = 100;
export const COSTS = Object.freeze({ GROSS: { spread: 0, slip: 0 }, NORMAL: { spread: 0.24, slip: 0.10 }, STRESS: { spread: 0.60, slip: 0.60 } });
const sideBull = (side) => side === 'BUY';
/** The six pre-registered groupings (existing pre-entry attributes; no new indicator, no threshold search). */
export const GROUPINGS = Object.freeze({
  DIRECTION: (row, e) => e.side,
  LOCATION: (row, e) => { const d = timingFeatures(row, e).anchor_dist_atr; return d == null ? null : d > 2.0 ? 'MARGINAL_2.0_2.5' : 'VALID_LE_2.0'; },
  STRUCTURE: (row, e) => (row.st5 === 'BULLISH' || row.st5 === 'BEARISH' ? ((row.st5 === 'BULLISH') === sideBull(e.side) ? 'ALIGNED' : 'COUNTER') : null),
  PATTERN_EVENT: (row) => (Array.isArray(row.ev5) && (row.ev5[0] === 'BOS' || row.ev5[0] === 'CHOCH') ? row.ev5[0] : null),
  SL_SOURCE: (row) => row.g?.src ?? null,
  BIAS: (row, e) => { if (row.b15 === 'NEUTRAL') return 'NEUTRAL'; if (row.b15 !== 'BULLISH' && row.b15 !== 'BEARISH') return null; return (row.b15 === 'BULLISH') === sideBull(e.side) ? 'ALIGNED' : 'OPPOSED'; },
});
/** Stage test class from the DEV and HOLD intervals. */
export function stageClass(dev, hold) { if (dev?.lo > 0 && hold?.lo > 0) return 'DEMONSTRATED'; if (dev?.hi < 0 && hold?.hi < 0) return 'NEGATIVE_REPLICATED'; return 'NOT_DEMONSTRATED'; }
/** Entry-level edge criteria on one split (rule A / D): sample, gross and normal CI above 0, stress mean above 0. */
export const meetsEdge = (x) => !!x && x.n >= MIN_N && x.gross?.lo > 0 && x.normal?.lo > 0 && x.stress_mean > 0;
/** Strategy status (rule A). `split` = { entries: {...}, walk: { normal_expectancy } }. */
export function strategyStatus(dev, hold) { if (!(dev?.entries?.n >= MIN_N) || !(hold?.entries?.n >= MIN_N)) return 'INSUFFICIENT_EVIDENCE'; const ok = (s) => meetsEdge(s.entries) && s.walk.normal_expectancy > 0; return ok(dev) && ok(hold) ? 'EDGE_DEMONSTRATED' : 'EDGE_NOT_DEMONSTRATED'; }
/** Cost label (rule B) for one split. */
export function costLabel(x) { if (!x || x.gross?.mean == null) return 'NO_DATA'; if (x.gross.lo > 0 && x.normal.lo > 0 && x.stress_mean > 0) return 'COST_RESILIENT'; if (x.gross.hi < 0) return 'NEGATIVE_GROSS'; if (x.gross.lo > 0) return 'GROSS_EDGE_NOT_COST_RESILIENT'; return x.normal.mean < 0 ? 'NO_COST_RESILIENT_EDGE' : 'NOT_DEMONSTRATED'; }
/** Direction class (rule C) from the DEV and HOLD intervals of (BUY - SELL). */
export function directionClass(dev, hold) { if (dev?.lo > 0 && hold?.lo > 0) return 'BUY_BETTER_REPLICATED'; if (dev?.hi < 0 && hold?.hi < 0) return 'SELL_BETTER_REPLICATED'; return 'NO_DIRECTION_EDGE'; }
/** Subgroup sample label. */
export const sampleLabel = (nDev, nHold) => (nDev >= MIN_N && nHold >= MIN_N ? 'SUFFICIENT' : 'INSUFFICIENT_EVIDENCE');
/** Final EDGE_STATUS (rule E). */
export function finalStatus({ combinedStatus, strategyStatuses, survivingCandidates }) {
  if (combinedStatus === 'INSUFFICIENT_EVIDENCE') return 'INSUFFICIENT_EVIDENCE'; if (combinedStatus === 'EDGE_DEMONSTRATED') return 'EDGE_DEMONSTRATED';
  if (strategyStatuses.some((s) => s === 'EDGE_DEMONSTRATED') || survivingCandidates > 0) return 'EDGE_PARTIALLY_DEMONSTRATED'; return 'EDGE_NOT_DEMONSTRATED';
}
