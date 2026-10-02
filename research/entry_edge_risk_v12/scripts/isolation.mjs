/**
 * V12 ENTRY EDGE ISOLATION -- pure helpers (RESEARCH ONLY; no order code; never changes an entry).
 * Spec: ../V12_PREREGISTRATION.md (Part A). Stage strings come from the frozen V8 replay rows: per side, one digit per model in the
 * order MC PB BO SR MR (0 none, 1 pattern, 2 setup, 3 trigger; bias-agnostic, independently verified in V8). `trig` lists the
 * model+side triggers that survive the 15m bias / eligibility rules (comma-separated, e.g. "MCB,BOB").
 */
import { checkEntryGeometry } from '../../entry_risk_integration_v11/scripts/integrate.mjs';

export const MODELS = Object.freeze(['MC', 'PB', 'BO', 'SR', 'MR']);
export const STAGES = Object.freeze(['PATTERN', 'SETUP', 'TRIGGER', 'DIRECTION', 'ENTRY']);
export const PROBE_SL_ATR = 1.35;
export const ATTRIBUTION = Object.freeze(['PATTERN_ERROR', 'SETUP_ERROR', 'TRIGGER_ERROR', 'DIRECTION_ERROR', 'LOCATION_ERROR', 'SL_ERROR', 'RR_ERROR', 'VALID_LOSING_TRADE', 'UNKNOWN']);

export function stageOf(row, m, side) { const s = side === 'BUY' ? row.stB : row.stS; if (typeof s !== 'string' || s.length !== MODELS.length) return null; const v = Number(s[MODELS.indexOf(m)]); return Number.isInteger(v) ? v : null; }
export const triggersOf = (row) => new Set(String(row.trig ?? '').split(',').filter(Boolean));
export const directionOk = (row, m, side) => triggersOf(row).has(`${m}${side[0]}`);
/** 15m bias supports the side (the engine's bias.direction). */
export const biasSupports = (row, side) => (side === 'BUY' && row.b15 === 'BULLISH') || (side === 'SELL' && row.b15 === 'BEARISH');
/**
 * Trigger valid under the model's own rule. Bias-agnostic stage 3, or -- SR only -- stage 2 (at a level, counter to the 5m
 * structure) where the 15m bias supports the side: the frozen SR rule (counterStructureConfirmed) accepts that case, while the
 * bias-agnostic stage evaluator ran it with a NEUTRAL bias. Found on DEV (5 trades) before the freeze.
 */
export function triggerValid(row, m, side) { const st = stageOf(row, m, side); if (st === 3) return true; return m === 'SR' && st === 2 && biasSupports(row, side); }
/** Which funnel stages (m, side) reached at this bar. */
export function stagesReached(row, m, side) { const st = stageOf(row, m, side); const entry = row.act === side && row.mdl === m; if (st == null) return { PATTERN: false, SETUP: false, TRIGGER: false, DIRECTION: false, ENTRY: entry };
  const trig = triggerValid(row, m, side); return { PATTERN: st >= 1, SETUP: st >= 2, TRIGGER: trig, DIRECTION: trig && directionOk(row, m, side), ENTRY: entry }; }
/** Standardized probe at a stage bar: entry = close, SL = close -/+ 1.35 x ATR14 (null when ATR is unavailable). */
export function probe(bars, F, i, side) { const a = F.atr[i]; if (!(a > 0)) return null; const e = bars[i].close; return { i, side, entry: e, sl: side === 'BUY' ? e - PROBE_SL_ATR * a : e + PROBE_SL_ATR * a }; }
/** Mirror of a trade: opposite side, same entry and SL distance (hindsight counterfactual only). */
export const mirror = (t) => ({ i: t.i, side: t.side === 'BUY' ? 'SELL' : 'BUY', entry: t.entry, sl: t.side === 'BUY' ? t.entry + Math.abs(t.entry - t.sl) : t.entry - Math.abs(t.entry - t.sl) });

/** Rule-conformance attribution of a losing trade (first failure in pipeline order). `entry` is the frozen V11 entry record. */
export function attributeLoss(row, entry) {
  const m = entry.model, s = entry.side; const st = stageOf(row, m, s);
  if (st == null || row.gap === 1) return 'UNKNOWN';
  if (st === 0) return 'PATTERN_ERROR'; if (st === 1) return 'SETUP_ERROR'; if (!triggerValid(row, m, s)) return 'TRIGGER_ERROR';
  if (!directionOk(row, m, s) || (entry.candidate_side != null && entry.candidate_side !== s)) return 'DIRECTION_ERROR';
  const d = checkEntryGeometry(entry).defects;
  if (d.includes('OVEREXTENDED')) return 'LOCATION_ERROR';
  if (d.some((x) => ['SL_WRONG_SIDE', 'R_NONPOSITIVE', 'R_BELOW_MIN_ATR', 'PRICE_MISSING'].includes(x))) return 'SL_ERROR';
  if (d.some((x) => ['ENGINE_RR_BELOW_MIN', 'ENGINE_RR_INCONSISTENT', 'TP_WRONG_SIDE'].includes(x))) return 'RR_ERROR';
  if (d.some((x) => ['SIDE_MISMATCH', 'SIDE_INVALID'].includes(x))) return 'DIRECTION_ERROR';
  return 'VALID_LOSING_TRADE';
}
/** Hindsight outcome label of a valid losing trade (label only, never a rule). */
export const outcomeLabel = (mfeR) => (mfeR < 0.5 ? 'ADVERSE_FROM_START' : mfeR < 1.2 ? 'FAVOURABLE_THEN_LOST' : 'NEAR_TARGET_REVERSAL');

/** Pre-entry timing / location features of a valid entry (all known at the signal close). */
export function timingFeatures(row, entry) { const R = Math.abs(entry.entry - entry.sl); const atr = entry.risk_atr > 0 ? R / entry.risk_atr : null;
  return { bars_from_origin: Number.isInteger(row.org) ? row.i - row.org : null, anchor_dist_atr: atr ? Math.abs(entry.entry - entry.anchor) / atr : null, sl_atr: entry.risk_atr ?? null,
    bo_bars_since_event: entry.model === 'BO' && Array.isArray(row.ev5) ? row.i - row.ev5[2] : null, mr_bars_since_sweep: entry.model === 'MR' && Array.isArray(row.sw5) ? row.i - row.sw5[1] : null }; }

/** Day-block bootstrap of mean(A) or mean(A) - mean(B). obs: [{ d: 'YYYY-MM-DD', x }]. Deterministic (LCG seed). */
export function dayBlockCI(A, B = null, { reps = 1000, seed = 20261002 } = {}) {
  const agg = (xs) => { const m = new Map(); for (const o of xs) { const v = m.get(o.d) ?? [0, 0]; v[0] += o.x; v[1]++; m.set(o.d, v); } return m; };
  const a = agg(A), b = B ? agg(B) : null; const days = [...new Set([...a.keys(), ...(b ? b.keys() : [])])].sort(); if (!A.length || (B && !B.length)) return { mean: null, lo: null, hi: null, n: A.length, days: days.length };
  const meanOf = (xs) => xs.reduce((s, o) => s + o.x, 0) / xs.length; const point = meanOf(A) - (B ? meanOf(B) : 0);
  let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const stats = [];
  for (let r = 0; r < reps; r++) { let sa = 0, na = 0, sb = 0, nb = 0; for (let k = 0; k < days.length; k++) { const d = days[Math.floor(rnd() * days.length)]; const va = a.get(d); if (va) { sa += va[0]; na += va[1]; } if (b) { const vb = b.get(d); if (vb) { sb += vb[0]; nb += vb[1]; } } } if (!na || (b && !nb)) continue; stats.push(sa / na - (b ? sb / nb : 0)); }
  stats.sort((x, y) => x - y); const q = (p) => stats[Math.min(stats.length - 1, Math.max(0, Math.floor(p * stats.length)))];
  return { mean: point, lo: q(0.025), hi: q(0.975), n: A.length, days: days.length };
}
/** Summary of a set of R outcomes. */
export function summarizeR(rs, { mfe = [], mae = [], target = [] } = {}) { const w = rs.filter((x) => x > 0), l = rs.filter((x) => x <= 0); let cum = 0, peak = 0, dd = 0; for (const x of rs) { cum += x; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  return { n: rs.length, wins: w.length, losses: l.length, expectancy_r: mean(rs), pf: l.length ? w.reduce((a, b) => a + b, 0) / Math.abs(l.reduce((a, b) => a + b, 0)) : null, win_rate: rs.length ? w.length / rs.length : null, mfe_r: mean(mfe), mae_r: mean(mae), reach_170: target.length ? target.filter(Boolean).length / target.length : null, max_dd_r: dd, net_r: cum }; }
