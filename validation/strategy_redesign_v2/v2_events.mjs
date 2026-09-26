/**
 * STRATEGY REDESIGN V2 — PHASE 1 EVENT STUDY (DISCOVERY REGION A ONLY).
 * Research only; never imported by production; writes only into this folder.
 * Events are defined on CONFIRMED 5m bars using the production structure primitive
 * (computeStructure: pivots confirmed with 5 right bars, BOS/CHoCH) plus explicit
 * price rules. Forward behaviour is measured after the event bar closes (no lookahead).
 *
 * Run from repo root:  node validation/strategy_redesign_v2/v2_events.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeStructure, STRUCTURE_PARAMS } from '../../src/engine/structure.js';
import { atr } from '../../src/engine/math.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BARS = JSON.parse(readFileSync(join(HERE, '..', 'master_edge_validation', 'xauusdm_bars_master.json'), 'utf8'));
const b5 = BARS['5m'];
const REQ = 500, A_END = '2026-07-13', B_END = '2026-08-19';
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const region = (t) => (day(t) < A_END ? 'A' : day(t) < B_END ? 'B' : 'C');
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
const firstEvaluable = Date.UTC(2026, 3, 29, 9, 0) / 1000;
const ATR = atr(b5, 14);
const sCache = new Map(); const sAt = (i) => { if (!sCache.has(i)) sCache.set(i, computeStructure(b5.slice(Math.max(0, i - (REQ - 2)), i + 1), STRUCTURE_PARAMS)); return sCache.get(i); };
const H = [1, 2, 3, 6, 12];
const events = []; // { i, t, kind, dir(+1/-1), level, region }
const lastIdx = b5.length - 2;
let compBoxes = 0, barsA = 0, comp20 = 0;
for (let i = 500; i <= lastIdx - 13; i++) {
  const t = b5[i].time; if (t < firstEvaluable) continue; if (region(t) !== 'A') continue; // DISCOVERY ONLY
  barsA++;
  const a = ATR[i]; if (!(a > 0)) continue;
  const s = sAt(i); const off = i - (Math.min(i, REQ - 2)); // slice start index in absolute terms
  const abs = (localIdx) => off + localIdx;
  const bar = b5[i];
  const pivLows = s.pivots.filter((p) => p.type === 'low' && abs(p.index) >= i - 60 && abs(p.index) <= i - 6);
  const pivHighs = s.pivots.filter((p) => p.type === 'high' && abs(p.index) >= i - 60 && abs(p.index) <= i - 6);
  // SWEEP: intrabar pierce of a confirmed pivot by > 0.1 ATR with close back inside; first such pierce since confirmation
  for (const p of pivLows) { const L = p.price; const conf = abs(p.index) + 5; if (bar.low < L - 0.1 * a && bar.close >= L) { let prior = false; for (let j = conf + 1; j < i; j++) if (b5[j].low < L - 0.1 * a) { prior = true; break; } if (!prior) { events.push({ i, t, kind: 'SWEEP', dir: +1, level: L }); break; } } }
  for (const p of pivHighs) { const L = p.price; const conf = abs(p.index) + 5; if (bar.high > L + 0.1 * a && bar.close <= L) { let prior = false; for (let j = conf + 1; j < i; j++) if (b5[j].high > L + 0.1 * a) { prior = true; break; } if (!prior) { events.push({ i, t, kind: 'SWEEP', dir: -1, level: L }); break; } } }
  // RECLAIM: a confirmed close back above a pivot low (below a pivot high) after 1-6 confirmed closes beyond it (failed breakout)
  for (const p of pivLows) { const L = p.price; let beyond = 0; for (let j = i - 6; j < i; j++) if (j > abs(p.index) + 5 && b5[j].close < L) beyond++; if (beyond >= 1 && b5[i - 1].close < L && bar.close > L) { events.push({ i, t, kind: 'RECLAIM', dir: +1, level: L, beyond }); break; } }
  for (const p of pivHighs) { const L = p.price; let beyond = 0; for (let j = i - 6; j < i; j++) if (j > abs(p.index) + 5 && b5[j].close > L) beyond++; if (beyond >= 1 && b5[i - 1].close > L && bar.close < L) { events.push({ i, t, kind: 'RECLAIM', dir: -1, level: L, beyond }); break; } }
  // BOS / CHOCH: structure event happened at this bar
  const ev = s.lastEvent; if (ev && abs(ev.bar) === i) { const disp = Math.abs(bar.close - ev.level) / a; events.push({ i, t, kind: ev.type, dir: ev.direction === 'BULLISH' ? +1 : -1, level: ev.level, disp: r2(disp) }); }
  // RETEST_HOLD: 1-10 bars after a structure event, touch within 0.3 ATR of the level and close on the break side, no close back through since the event
  if (ev && abs(ev.bar) < i && i - abs(ev.bar) <= 10) { const d = ev.direction === 'BULLISH' ? +1 : -1; const L = ev.level; let broken = false; for (let j = abs(ev.bar) + 1; j < i; j++) if (d > 0 ? b5[j].close < L : b5[j].close > L) { broken = true; break; } const touched = d > 0 ? bar.low <= L + 0.3 * a && bar.low >= L - 0.6 * a : bar.high >= L - 0.3 * a && bar.high <= L + 0.6 * a; const held = d > 0 ? bar.close > L : bar.close < L; if (!broken && touched && held) events.push({ i, t, kind: 'RETEST_HOLD', dir: d, level: L, barsSinceEvent: i - abs(ev.bar), eventType: ev.type }); }
  // RANGE-EXTREME SWEEP: intrabar pierce of structure.rangeLow / rangeHigh (lowest/highest of the last 5 confirmed pivots) with close back inside
  if (s.rangeLow != null && bar.low < s.rangeLow - 0.1 * a && bar.close >= s.rangeLow) events.push({ i, t, kind: 'RANGE_SWEEP', dir: +1, level: s.rangeLow });
  if (s.rangeHigh != null && bar.high > s.rangeHigh + 0.1 * a && bar.close <= s.rangeHigh) events.push({ i, t, kind: 'RANGE_SWEEP', dir: -1, level: s.rangeHigh });
  // COMPRESSION (looser): 20-bar box height <= 2.0 ATR and ATR14 <= 0.8 x mean ATR14 of the prior 100 bars; break = confirmed close outside by >= 0.1 ATR
  { const box20 = b5.slice(i - 20, i); const h20 = Math.max(...box20.map((x) => x.high)), l20 = Math.min(...box20.map((x) => x.low)); let sum = 0, cnt = 0; for (let j = i - 100; j < i; j++) if (ATR[j] > 0) { sum += ATR[j]; cnt++; } const atrAvg = cnt ? sum / cnt : a; if (h20 - l20 <= 2.0 * a && a <= 0.8 * atrAvg) { comp20++; if (bar.close > h20 + 0.1 * a) events.push({ i, t, kind: 'COMP20_BREAK', dir: +1, level: h20, boxAtr: r2((h20 - l20) / a) }); else if (bar.close < l20 - 0.1 * a) events.push({ i, t, kind: 'COMP20_BREAK', dir: -1, level: l20, boxAtr: r2((h20 - l20) / a) }); } }
  // COMPRESSION BREAK: 12-bar box height <= 1.5 ATR, confirmed close outside by >= 0.1 ATR with bar range >= 0.8 ATR
  const box = b5.slice(i - 12, i); const bh = Math.max(...box.map((x) => x.high)), bl = Math.min(...box.map((x) => x.low)); const height = bh - bl;
  if (height <= 1.5 * a) { compBoxes++; const rng = bar.high - bar.low; if (bar.close > bh + 0.1 * a && rng >= 0.8 * a) events.push({ i, t, kind: 'COMP_BREAK', dir: +1, level: bh, boxAtr: r2(height / a) }); else if (bar.close < bl - 0.1 * a && rng >= 0.8 * a) events.push({ i, t, kind: 'COMP_BREAK', dir: -1, level: bl, boxAtr: r2(height / a) }); }
}
// forward measures
function forward(e) { const a = ATR[e.i]; const c0 = b5[e.i].close; const out = {}; let mfe = 0, mae = 0; for (let h = 1; h <= 12; h++) { const b = b5[e.i + h]; const fav = e.dir > 0 ? b.high - c0 : c0 - b.low; const adv = e.dir > 0 ? c0 - b.low : b.high - c0; mfe = Math.max(mfe, fav); mae = Math.max(mae, adv); if (H.includes(h)) out[h] = { d: (b.close - c0) * e.dir / a, mfe: mfe / a, mae: mae / a }; } return out; }
for (const e of events) e.f = forward(e);
const DRIFT = {}; { const ds = { 1: [], 2: [], 3: [], 6: [], 12: [] }; for (let i = 500; i <= lastIdx - 13; i++) { const t = b5[i].time; if (t < firstEvaluable || region(t) !== 'A') continue; const a = ATR[i]; if (!(a > 0)) continue; for (const h of H) ds[h].push((b5[i + h].close - b5[i].close) / a); } for (const h of H) DRIFT[h] = ds[h].reduce((x, y) => x + y, 0) / ds[h].length; }
function summarize(list) { const n = list.length; if (!n) return { n: 0 }; const o = { n }; for (const h of H) { const ds = list.map((e) => e.f[h].d); const mean = ds.reduce((x, y) => x + y, 0) / n; const sd = Math.sqrt(ds.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, n - 1)); const mfe = list.reduce((x, e) => x + e.f[h].mfe, 0) / n, mae = list.reduce((x, e) => x + e.f[h].mae, 0) / n; const adj = mean - (list.reduce((x, e) => x + e.dir, 0) / n) * DRIFT[h]; o[`h${h}`] = { mean_move_atr: r3(mean), drift_adjusted_mean: r3(adj), ci95: [r3(mean - 1.96 * sd / Math.sqrt(n)), r3(mean + 1.96 * sd / Math.sqrt(n))], p_follow: r2(ds.filter((d) => d > 0).length / n * 100), p_reverse_025atr: r2(ds.filter((d) => d < -0.25).length / n * 100), mfe_atr: r2(mfe), mae_atr: r2(mae), mfe_mae_ratio: r2(mfe / mae) }; } return o; }
// unconditional baseline on A: random direction (sign of previous close move flipped every other bar) -> expect 0 mean and ratio 1; also "momentum baseline": direction of the current bar's close vs open
const base = []; for (let i = 500; i <= lastIdx - 13; i++) { const t = b5[i].time; if (t < firstEvaluable || region(t) !== 'A') continue; if (i % 7 !== 0) continue; base.push({ i, t, kind: 'BASELINE_BAR_DIRECTION', dir: b5[i].close >= b5[i].open ? +1 : -1 }); }
for (const e of base) e.f = forward(e);
const kinds = ['SWEEP', 'RANGE_SWEEP', 'RECLAIM', 'BOS', 'CHOCH', 'RETEST_HOLD', 'COMP_BREAK', 'COMP20_BREAK'];
const study = { region: 'A (discovery only)', bars_A: barsA, compression_boxes_A: compBoxes, compression20_boxes_A: comp20, unconditional_drift_atr_per_horizon: Object.fromEntries(H.map((h) => [h, r3(DRIFT[h])])), baseline_bar_direction: summarize(base), events: {} };
for (const k of kinds) { const L = events.filter((e) => e.kind === k); study.events[k] = { all: summarize(L), bull: summarize(L.filter((e) => e.dir > 0)), bear: summarize(L.filter((e) => e.dir < 0)) }; }
study.events.RETEST_HOLD_after_BOS = summarize(events.filter((e) => e.kind === 'RETEST_HOLD' && e.eventType === 'BOS'));
study.events.RETEST_HOLD_after_CHOCH = summarize(events.filter((e) => e.kind === 'RETEST_HOLD' && e.eventType === 'CHOCH'));
study.events.BOS_strong_displacement = summarize(events.filter((e) => e.kind === 'BOS' && e.disp >= 0.5));
study.events.BOS_weak_displacement = summarize(events.filter((e) => e.kind === 'BOS' && e.disp < 0.5));
study.events.COMP_BREAK_tight_box = summarize(events.filter((e) => e.kind === 'COMP_BREAK' && e.boxAtr <= 1.0));
study.events.RECLAIM_after_1_close = summarize(events.filter((e) => e.kind === 'RECLAIM' && e.beyond === 1));
study.events.RECLAIM_after_2plus_closes = summarize(events.filter((e) => e.kind === 'RECLAIM' && e.beyond >= 2));
// sweep + reclaim combination: a SWEEP followed within 3 bars by a close above the swept level + above the sweep bar high (structural confirmation)
const combo = []; for (const e of events.filter((x) => x.kind === 'SWEEP')) { for (let k = 1; k <= 3; k++) { const j = e.i + k; if (j > lastIdx - 13) break; const b = b5[j]; const ok = e.dir > 0 ? b.close > e.level && b.close > b5[e.i].high : b.close < e.level && b.close < b5[e.i].low; if (ok) { combo.push({ i: j, t: b5[j].time, kind: 'SWEEP_CONFIRMED', dir: e.dir, level: e.level, sweepBar: e.i }); break; } } }
for (const e of combo) e.f = forward(e);
const comboR = []; for (const e of events.filter((x) => x.kind === 'RANGE_SWEEP')) { for (let k = 1; k <= 3; k++) { const j = e.i + k; if (j > lastIdx - 13) break; const b = b5[j]; const ok = e.dir > 0 ? b.close > e.level && b.close > b5[e.i].high : b.close < e.level && b.close < b5[e.i].low; if (ok) { comboR.push({ i: j, t: b5[j].time, kind: 'RANGE_SWEEP_CONFIRMED', dir: e.dir, level: e.level, sweepBar: e.i }); break; } } }
for (const e of comboR) e.f = forward(e);
study.events.RANGE_SWEEP_then_CONFIRMED_CLOSE = { all: summarize(comboR), bull: summarize(comboR.filter((e) => e.dir > 0)), bear: summarize(comboR.filter((e) => e.dir < 0)) };
const comboC = []; for (const e of events.filter((x) => x.kind === 'COMP20_BREAK')) { const j = e.i + 1; if (j > lastIdx - 13) continue; const b = b5[j]; const ok = e.dir > 0 ? b.close > e.level : b.close < e.level; if (ok) comboC.push({ i: j, t: b5[j].time, kind: 'COMP20_ACCEPTED', dir: e.dir, level: e.level }); }
for (const e of comboC) e.f = forward(e);
study.events.COMP20_BREAK_then_ACCEPTANCE_CLOSE = { all: summarize(comboC), bull: summarize(comboC.filter((e) => e.dir > 0)), bear: summarize(comboC.filter((e) => e.dir < 0)) };
study.events.SWEEP_then_CONFIRMED_CLOSE = { all: summarize(combo), bull: summarize(combo.filter((e) => e.dir > 0)), bear: summarize(combo.filter((e) => e.dir < 0)) };
writeFileSync(join(HERE, 'v2_event_study_A.json'), JSON.stringify({ study, events_sample: events.slice(0, 50) }, null, 1));
console.log(JSON.stringify(study, null, 1));
