/**
 * V8 FORWARD SHADOW VALIDATION -- pure library (RESEARCH ONLY, MEASURE ONLY, execution authority NONE).
 * Evaluates the FROZEN V8 corrected core (research/core_pattern_audit_v8/engines/ALL) and production CONTROL (src/engine)
 * on identical confirmed-bar windows, maps every WAIT to the owner's reason taxonomy, decomposes pattern / setup / trigger,
 * runs independent D1-D6 regression oracles, classifies missed setups and wrong-direction outcomes, and labels hypothetical
 * (NOT EXECUTED) outcomes with the V5/V8 EXIT_F simulator. Nothing here can place, modify or close an order.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { simulate, MILESTONES } from '../../trade_economics_v5/scripts/exitPolicies.mjs';

export const SCHEMA = 'v8f-1';
export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const V8_ENGINE_DIR = join(REPO, 'research', 'core_pattern_audit_v8', 'engines', 'ALL', 'engine');
export const CONTROL_ENGINE_DIR = join(REPO, 'src', 'engine');
export const TF_SEC = Object.freeze({ '5m': 300, '15m': 900, '30m': 1800, '1H': 3600 });
export const WINDOW = 499; // confirmed bars per timeframe (production: 500 returned incl. the forming bar)
export const STALE_MULT = 3; // production validateAndSplit: stale when older than (3 + 1) bar durations
export const SAFETY = Object.freeze({ maxSpreadUsd: 0.60, shockFreshSec: 900, demoEquityUsd: 10_000, realEquityUsd: 62.07, contractOzPerLot: 100, lot: 0.01, leverage: 200 });
export const COSTS = Object.freeze({ normal: { spread: 0.24, slip: 0.10 }, stress: { spread: 0.60, slip: 0.20 } });
export const RR = 1.70;
export const WAIT_CATEGORIES = Object.freeze(['NO_PATTERN', 'NO_SETUP', 'NO_TRIGGER', 'MODEL_NOT_ELIGIBLE', 'LOCATION_INVALID', 'STRUCTURAL_RISK_INVALID', 'RR_INVALID', 'SPREAD_BLOCK', 'NEWS_BLOCK', 'VOLATILITY_BLOCK', 'BROKER_SAFETY', 'DATA_UNAVAILABLE', 'STALE_DATA', 'CONTEXT_CONFLICT', 'OTHER_GOVERNED_REASON']);
export const MISSED_CLASSES = Object.freeze(['DETECTED_CORRECTLY', 'MISSED', 'DETECTED_LATE', 'BLOCKED_CORRECTLY', 'BLOCKED_INCORRECTLY', 'UNCERTAIN']);
export const WRONG_CLASSES = Object.freeze(['VALID_LOSING_TRADE', 'PATTERN_ERROR', 'SETUP_ERROR', 'TRIGGER_ERROR', 'DIRECTION_ERROR', 'LOCATION_ERROR', 'TIMING_ERROR', 'DATA_ERROR', 'OTHER']);
export const CHECKPOINTS = Object.freeze([25, 50, 100, 150, 200, 250, 300]);
export const MODELS = Object.freeze(['MC', 'PB', 'BO', 'SR', 'MR']);
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
export const sha = (s) => createHash('sha256').update(s).digest('hex');
export const windowHash = (bars) => sha(bars.map((b) => `${b.time},${b.open},${b.high},${b.low},${b.close}`).join(';'));
export const decisionId = (engine, barTime) => sha(`${SCHEMA}|${engine}|XAUUSDm|5m|${barTime}`).slice(0, 24);

/** Verifies the frozen V8 engine copy against the V8 manifest (configs/engines.sha256); throws on any difference. */
export function verifyFrozenV8Engine() {
  const man = readFileSync(join(REPO, 'research', 'core_pattern_audit_v8', 'configs', 'engines.sha256'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).filter(([, p]) => p?.startsWith('engines/ALL/engine/'));
  if (man.length < 10) throw new Error('V8 manifest incomplete');
  for (const [h, p] of man) { const f = join(REPO, 'research', 'core_pattern_audit_v8', p); if (!existsSync(f)) throw new Error(`FROZEN_ENGINE_MISSING:${p} (run research/core_pattern_audit_v8/scripts/build_engines.mjs)`); if (sha(readFileSync(f, 'utf8')) !== h) throw new Error(`FROZEN_ENGINE_MODIFIED:${p}`); }
  return { files: man.length, manifest_sha: sha(readFileSync(join(REPO, 'research', 'core_pattern_audit_v8', 'configs', 'engines.sha256'), 'utf8')) };
}

// ---------------- independent oracles (written from the specification, not copied from the engine) ----------------
export function oraclePivots(bars, L = 5, R = 5) { const out = []; for (let i = L; i < bars.length - R; i++) { let hi = true, lo = true; for (let k = i - L; k <= i + R; k++) { if (bars[k].high > bars[i].high) hi = false; if (bars[k].low < bars[i].low) lo = false; } if (hi) out.push({ index: i, price: bars[i].high, type: 'high' }); if (lo) out.push({ index: i, price: bars[i].low, type: 'low' }); } return out; }
/** D1 oracle: breaks walked in time order. */
export function oracleStructure(bars) { const piv = oraclePivots(bars); const br = []; for (const p of piv) for (let j = p.index + 6; j < bars.length; j++) { if (p.type === 'high' && bars[j].close > p.price) { br.push({ j, p, dir: 'BULLISH' }); break; } if (p.type === 'low' && bars[j].close < p.price) { br.push({ j, p, dir: 'BEARISH' }); break; } } br.sort((a, b) => a.j - b.j || a.p.index - b.p.index); let state = null, ev = null; for (const b of br) { ev = { type: state === null || state === b.dir ? 'BOS' : 'CHOCH', direction: b.dir, bar: b.j, level: b.p.price }; state = b.dir; } return { state, lastEvent: ev }; }
/** D2 oracle: most recent sweep event in time. */
export function oracleSweep(bars) { const piv = oraclePivots(bars); let best = null; for (const p of piv) { const tol = p.price * 0.0005; for (let j = p.index + 6; j < bars.length; j++) { let t = null; if (p.type === 'high' && bars[j].high > p.price + tol && bars[j].close <= p.price) t = 'SWEEP_HIGH'; if (p.type === 'low' && bars[j].low < p.price - tol && bars[j].close >= p.price) t = 'SWEEP_LOW'; if (t && (!best || j > best.bar || (j === best.bar && p.index > best.piv))) best = { type: t, bar: j, level: p.price, piv: p.index }; } } return best; }

// ---------------- engine loader ----------------
export async function loadEngine(dir, { fixes = [] } = {}) {
  const E = (p) => pathToFileURL(join(dir, p)).href;
  const m = { runPipeline: (await import(E('pipeline.js'))).runPipeline, regime: await import(E('regime.js')), quality: await import(E('quality.js')), math: await import(E('math.js')), correction: await import(E('correction.js')), htf: await import(E('htf.js')), bias: await import(E('intraday/bias.js')), M: await import(E('intraday/models5m.js')), risk: await import(E('intraday/risk5m.js')), pipe: await import(E('intraday/pipeline5m.js')), P: (await import(E('intraday/params.js'))).INTRADAY_PARAMS };
  return { dir, fixes, ...m };
}

// ---------------- stage decomposition (V8 replay definitions; stage 3 asserted against the model functions) ----------------
const beyond = (side, price, level) => (side === 'BUY' ? price > level : price < level);
function pbDepth(bars, side, P) { const i = bars.length - 1; const ws = Math.max(0, i - P.pbSwingLookback + 1); let ex = ws; for (let k = ws; k <= i; k++) if (side === 'BUY' ? bars[k].high > bars[ex].high : bars[k].low < bars[ex].low) ex = k; if (ex >= i) return 0; const after = bars.slice(ex + 1, i + 1); return side === 'BUY' ? bars[ex].high - Math.min(...after.map((b) => b.low)) : Math.max(...after.map((b) => b.high)) - bars[ex].low; }
export function stages(eng, ctx, side, levels, onBias) {
  const { bars, structure: s5, ema20, atrVal, atrRatio, regime, bias, m30Regime } = ctx; const P = eng.P; const i = bars.length - 1; const fix = (d) => eng.fixes.includes(d);
  // MC
  let mcPattern = i >= P.mcConfirmBars + 1; for (let k = 0; mcPattern && k < P.mcConfirmBars; k++) { const idx = i - k; if (ema20[idx] == null) { mcPattern = false; break; } const c = bars[idx].close; if (side === 'BUY' ? c <= ema20[idx] : c >= ema20[idx]) mcPattern = false; if (mcPattern && k < P.mcConfirmBars - 1) { const prev = bars[idx - 1].close; if (side === 'BUY' ? c <= prev : c >= prev) mcPattern = false; } }
  const mcSetup = mcPattern && atrRatio >= P.mcMinAtrRatio; let mcTrig = false; const sw = side === 'BUY' ? s5?.lastSwingHigh : s5?.lastSwingLow; if (mcSetup && sw && beyond(side, bars[i].close, sw.price)) { let bb = i; while (bb - 1 > sw.index && beyond(side, bars[bb - 1].close, sw.price)) bb--; mcTrig = i - bb <= P.mcMaxEntryLateBars; }
  // PB
  const depth = pbDepth(bars, side, P); const corr = eng.correction.computeCorrection(bars, side === 'BUY' ? 'BULLISH' : 'BEARISH', { ...eng.correction.CORRECTION_PARAMS, swingLookback: P.pbSwingLookback, corrAtrMultiplier: P.pbCorrAtrMultiplier, corrResolveConfirmBars: P.pbResolveConfirmBars });
  let run = 0; for (let k = i; k >= 0; k--) { if (ema20[k] == null) break; if (side === 'BUY' ? bars[k].close > ema20[k] : bars[k].close < ema20[k]) run++; else break; }
  const pbFresh = run - P.pbResolveConfirmBars >= 0 && run - P.pbResolveConfirmBars <= P.pbMaxEntryLateBars; const pbPattern = depth >= P.pbCorrAtrMultiplier * atrVal || corr.state === 'ACTIVE' || corr.state === 'RESOLVED';
  const pbSetup = fix('D3') ? atrVal > 0 && depth >= P.pbCorrAtrMultiplier * atrVal && run >= P.pbResolveConfirmBars : corr.state === 'RESOLVED'; const pbTrig = pbSetup && pbFresh;
  // BO
  let bo = 0; const ev = s5?.lastEvent; if (ev && regime !== 'CHOP_UNCERTAIN' && (ev.direction === 'BULLISH' ? 'BUY' : 'SELL') === side && ev.bar < i && i - ev.bar <= P.boMaxEntryLateBars) { const tol = atrVal * P.boRetestAtrTol; let ret = false; for (let j = ev.bar + 1; j <= i; j++) if (Math.abs(bars[j].close - ev.level) <= tol || (ev.direction === 'BULLISH' ? bars[j].low <= ev.level + tol : bars[j].high >= ev.level - tol)) { ret = true; break; } bo = !ret ? 1 : beyond(side, bars[i].close, ev.level) ? 3 : 2; }
  // SR
  let sr = 0; const bar = bars[i]; const range = bar.high - bar.low; if (range > 0 && atrVal > 0) { const wick = side === 'BUY' ? Math.min(bar.open, bar.close) - bar.low : bar.high - Math.max(bar.open, bar.close); const shape = wick / range >= P.srMinWickRatio && (side === 'BUY' ? bar.close >= bar.high - range * P.srCloseLocation : bar.close <= bar.low + range * P.srCloseLocation); if (shape) { const at = levels.filter((l) => l.side === side).filter((l) => (side === 'BUY' ? bar.low <= l.price + P.srLevelTouchAtr * atrVal && bar.low >= l.price - P.srLevelPierceAtr * atrVal && bar.close > l.price : bar.high >= l.price - P.srLevelTouchAtr * atrVal && bar.high <= l.price + P.srLevelPierceAtr * atrVal && bar.close < l.price)); if (!at.length) sr = 1; else { const opp = (side === 'SELL' && s5?.state === 'BULLISH') || (side === 'BUY' && s5?.state === 'BEARISH'); sr = at.some((l) => !opp || eng.M.counterStructureConfirmed({ bias: onBias, structure: s5, level: l.price, side, i, atrVal, p: P })) ? 3 : 2; } } }
  // MR
  let mr = 0; const swp = s5?.lastSweep; if (swp && i - swp.bar <= P.mrSweepMaxAgeBars && i - swp.bar >= 0 && (swp.type === 'SWEEP_HIGH' ? 'SELL' : 'BUY') === side) { const setup = bias?.regime === 'RANGE' && m30Regime !== 'BULL_TREND' && m30Regime !== 'BEAR_TREND' && regime !== 'HIGH_VOLATILITY'; if (!setup) mr = 1; else { mr = 3; if (fix('D4')) { const rh = bias.structure?.rangeHigh ?? null, rl = bias.structure?.rangeLow ?? null; const mid = rh !== null && rl !== null ? (rh + rl) / 2 : null; if (mid === null || (side === 'BUY' ? !(mid > bars[i].close) : !(mid < bars[i].close))) mr = 2; } } }
  return { MC: mcTrig ? 3 : mcSetup ? 2 : mcPattern ? 1 : 0, PB: pbTrig ? 3 : pbSetup ? 2 : pbPattern ? 1 : 0, BO: bo, SR: sr, MR: mr, pb_depth_atr: atrVal > 0 ? r3(depth / atrVal) : null, pb_corr_state: corr.state };
}

/** Which (model, side) pairs the real 15m bias allows. */
export function allowedPairs(bias) { const out = new Set(); const el = bias?.eligible_models ?? []; for (const m of el) for (const s of ['BUY', 'SELL']) { if ((m === 'MC' || m === 'PB') && bias.direction === 'NEUTRAL') continue; if (bias.direction === 'BULLISH' && s !== 'BUY') continue; if (bias.direction === 'BEARISH' && s !== 'SELL') continue; out.add(`${m}|${s}`); } return out; }

// ---------------- WAIT taxonomy ----------------
const lowestComponents = (b) => Object.entries(b ?? {}).filter(([k]) => k !== 'qHtfPenalty').sort((x, y) => x[1] - y[1]).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ');
export function waitCategory({ engineWr, regime, bias, st, quality, conflict, stale }) {
  switch (engineWr) {
    case null: case undefined: return { category: null, detail: null };
    case 'INSUFFICIENT_DATA': case 'BIAS_UNAVAILABLE': return { category: 'DATA_UNAVAILABLE', detail: engineWr };
    case 'DATA_UNAVAILABLE_STALE': return { category: 'STALE_DATA', detail: `stale ${stale}` };
    case 'VOLATILITY_INSUFFICIENT': return { category: 'VOLATILITY_BLOCK', detail: '5m ATR below the 2.00 USD minimum for the target horizon' };
    case 'OVEREXTENDED': return { category: 'LOCATION_INVALID', detail: 'entry more than 2.5 ATR from the setup anchor' };
    case 'INVALID_GEOMETRY': return { category: 'STRUCTURAL_RISK_INVALID', detail: 'structural risk distance zero / ATR unavailable' };
    case 'RR_NOT_ACCEPTABLE': return { category: 'RR_INVALID', detail: 'RR to the structural objective below 1.70' };
    case 'NO_GOOD_ENTRY': return { category: 'OTHER_GOVERNED_REASON', detail: `QUALITY_GATE: score ${quality?.score} < threshold ${quality?.threshold} (${quality?.threshold_basis}); weakest: ${lowestComponents(quality?.breakdown)}${quality?.breakdown?.qHtfPenalty ? `; 1H-opposed penalty ${quality.breakdown.qHtfPenalty}` : ''}` };
    case 'ENTRY_CONFLICT': case 'HTF_CONFLICT': return { category: 'CONTEXT_CONFLICT', detail: conflict ?? engineWr };
    case 'CHOP': return { category: 'MODEL_NOT_ELIGIBLE', detail: regime === 'CHOP_UNCERTAIN' ? '5m regime CHOP_UNCERTAIN: no model runs' : '15m CHOP: no eligible model' };
    case 'NO_ELIGIBLE_STRATEGY': {
      if (!st) return { category: 'NO_PATTERN', detail: 'no stage information' };
      const allowed = allowedPairs(bias); let blocked = null, maxAllowed = 0, best = null;
      for (const side of ['BUY', 'SELL']) for (const m of MODELS) { const s = st[side][m]; if (allowed.has(`${m}|${side}`)) { if (s > maxAllowed) { maxAllowed = s; best = `${m} ${side}`; } } else if (s === 3 && !blocked) blocked = `${m} ${side} triggered but not eligible under the 15m ${bias?.direction} ${bias?.regime} bias`; }
      if (blocked) return { category: 'MODEL_NOT_ELIGIBLE', detail: blocked };
      if (maxAllowed >= 3) return { category: 'OTHER_GOVERNED_REASON', detail: `STAGE_INCONSISTENT: ${best} reached trigger but the engine returned no candidate` };
      return maxAllowed === 2 ? { category: 'NO_TRIGGER', detail: `${best}: setup present, trigger not confirmed` } : maxAllowed === 1 ? { category: 'NO_SETUP', detail: `${best}: pattern present, setup conditions not met` } : { category: 'NO_PATTERN', detail: 'no eligible model shows its pattern' };
    }
    default: return { category: 'OTHER_GOVERNED_REASON', detail: engineWr };
  }
}

// ---------------- one engine, one decision ----------------
const stale = (bars, tf, nowSec) => !bars.length || nowSec - bars.at(-1).time > TF_SEC[tf] * (STALE_MULT + 1);
/**
 * windows: confirmed bars { '5m','15m','30m','1H' } (oldest first, forming bars already excluded), nowSec: decision time.
 * Returns the full shadow decision for one engine (before the execution-safety stage).
 */
export function evaluateEngine(eng, windows, nowSec, { applyStaleGate }) {
  const w5 = windows['5m']; const k = w5.length - 1; const P = eng.P;
  const staleTf = ['5m', '15m', '30m'].find((tf) => stale(windows[tf], tf, nowSec)) ?? null;
  const bias = eng.bias.computeBias({ confirmedBars: windows['15m'], params: P }); const m30 = eng.runPipeline({ confirmedBars: windows['30m'] }); const ctx1H = eng.htf.computeHtfContext(windows['1H'], { includeCorrection: true });
  const intra = eng.pipe.runIntradayPipeline({ bars5: w5, bias, m30Regime: m30.regime, ctx1H, params: P }); const live = eng.pipe.combineIntraday({ intraday: intra, bias, m30, ctx1H });
  const cand = intra.evidence?.candidate ?? null; const risk = intra.evidence?.risk ?? null; const s5 = intra.structure; const atrEngine = w5.length > 15 ? eng.math.atr(w5, 14).at(-1) : null;
  let action = live.action, wr = live.wait_reason ?? null; if (applyStaleGate && staleTf) { action = 'WAIT'; wr = 'DATA_UNAVAILABLE_STALE'; }
  const out = { engine_action: action, engine_wait_reason: wr, conflict: live.conflict ?? null, model: intra.model ?? null, candidate_side: cand?.side ?? null, stale_timeframe: staleTf, regime5: intra.regime ?? null, bias: { direction: bias.direction ?? null, regime: bias.regime ?? null, eligible: bias.eligible_models ?? [], fresh_choch: bias.fresh_opposing_choch?.direction ?? null, structure_state: bias.structure?.state ?? null }, m30: { regime: m30.regime ?? null, structure: m30.structure?.state ?? null }, h1: { regime: ctx1H.regime ?? null }, quality: intra.quality ? { score: intra.quality.score, threshold: intra.quality.threshold, threshold_basis: intra.quality.threshold_basis, breakdown: intra.quality.breakdown } : null };
  out.structure5 = s5?.state !== undefined ? { state: s5.state ?? null, last_event: s5.lastEvent ? { type: s5.lastEvent.type, direction: s5.lastEvent.direction, bar_time: w5[s5.lastEvent.bar]?.time ?? null, level: s5.lastEvent.level } : null, last_sweep: s5.lastSweep ? { type: s5.lastSweep.type, bar_time: w5[s5.lastSweep.bar]?.time ?? null, level: s5.lastSweep.level } : null } : null;
  if (cand && risk && Number.isFinite(risk.entry)) {
    const rawRisk = Math.abs(risk.entry - risk.stop_loss); const tp170 = cand.side === 'BUY' ? risk.entry + RR * rawRisk : risk.entry - RR * rawRisk; const rrRaw = rawRisk > 0 ? Math.abs(risk.tp2 - risk.entry) / rawRisk : null;
    out.candidate = { model: cand.model, side: cand.side, anchor: r3(cand.anchor), sl_anchor: r3(cand.slAnchor), origin_bar_time: Number.isInteger(cand.originBar) ? w5[cand.originBar]?.time ?? null : null, bars_from_origin: Number.isInteger(cand.originBar) ? k - cand.originBar : null, reason: cand.reason, gate: risk.gate ?? null, entry: risk.entry, stop_loss: risk.stop_loss, sl_source: risk.sl_source ?? null, risk_distance: r3(rawRisk), risk_atr: risk.risk_atr ?? null, tp1: risk.tp1, tp2_engine: risk.tp2, rr_engine: risk.rr, rr_engine_unrounded: r3(rrRaw), objective: risk.objective?.source ?? null, tp_170r: r3(tp170), reward_170r: r3(RR * rawRisk), overextension_atr: atrEngine > 0 ? r3(Math.abs(risk.entry - cand.anchor) / atrEngine) : null, midpoint: cand.model === 'MR' && cand.objectiveOverride != null ? r3(cand.objectiveOverride) : null };
  }
  // traces: stages for both sides (bias-agnostic), parity against the model functions
  if (bias.status === 'OK' && s5?.state !== undefined && intra.regime) {
    const ema20 = eng.math.ema(w5.map((b) => b.close), 20); const atrVal = eng.math.atr(w5, 14).at(-1); const atrRatio = intra.evidence?.atrRatio ?? 1;
    const ctx = { bars: w5, regime: intra.regime, structure: s5, atrVal, atrRatio, ema20, bias, m30Regime: m30.regime };
    const ovr = (d) => ({ ...bias, status: 'OK', direction: d, eligible_models: [...MODELS], fresh_opposing_choch: null }); const OB = ovr('BULLISH'), OS = ovr('BEARISH'), ON = ovr('NEUTRAL');
    const prod = { MC: { BUY: !!eng.M.evaluateMomentumContinuation({ ...ctx, bias: OB, params: P }), SELL: !!eng.M.evaluateMomentumContinuation({ ...ctx, bias: OS, params: P }) }, PB: { BUY: !!eng.M.evaluatePullbackContinuation({ ...ctx, bias: OB, params: P }), SELL: !!eng.M.evaluatePullbackContinuation({ ...ctx, bias: OS, params: P }) } };
    const bo = eng.M.evaluateBreakoutRetest({ ...ctx, bias: ON, params: P }), sr = eng.M.evaluateStructureRejection({ ...ctx, bias: ON, params: P }), mr = eng.M.evaluateMeanReversion({ ...ctx, bias: ON, params: P });
    prod.BO = { BUY: bo?.side === 'BUY', SELL: bo?.side === 'SELL' }; prod.SR = { BUY: sr?.side === 'BUY', SELL: sr?.side === 'SELL' }; prod.MR = { BUY: mr?.side === 'BUY', SELL: mr?.side === 'SELL' };
    const levels = []; const push = (x, side) => { if (x?.price != null) levels.push({ price: x.price, side }); }; push(bias.structure?.lastSwingLow, 'BUY'); push(bias.structure?.lastSwingHigh, 'SELL'); push(s5.lastSwingLow, 'BUY'); push(s5.lastSwingHigh, 'SELL');
    const st = { BUY: stages(eng, ctx, 'BUY', levels, ON), SELL: stages(eng, ctx, 'SELL', levels, ON) }; const parity = [];
    for (const side of ['BUY', 'SELL']) for (const m of MODELS) if ((st[side][m] === 3) !== prod[m][side]) parity.push(`${m}|${side}`);
    out.stages = { BUY: MODELS.map((m) => st.BUY[m]).join(''), SELL: MODELS.map((m) => st.SELL[m]).join(''), pb_depth_atr: { BUY: st.BUY.pb_depth_atr, SELL: st.SELL.pb_depth_atr }, pb_corr_state: { BUY: st.BUY.pb_corr_state, SELL: st.SELL.pb_corr_state } }; out.stage_parity_mismatch = parity;
    out._st = st; out.atr14 = r3(atrVal); out.atr_ratio = r3(atrRatio);
  }
  const wc = waitCategory({ engineWr: action === 'WAIT' ? wr : null, regime: intra.regime, bias, st: out._st ?? null, quality: out.quality, conflict: out.conflict, stale: staleTf });
  out.wait_category = wc.category; out.wait_detail = wc.detail; delete out._st;
  out.input_stale = staleTf;
  return out;
}

// ---------------- D1-D6 regression checks (per decision) ----------------
export function regressionChecks(decision, windows) {
  const out = {}; const w5 = windows['5m'];
  const o = oracleStructure(w5); const e = decision.structure5;
  if (e) { const evOk = (!o.lastEvent && !e.last_event) || (o.lastEvent && e.last_event && e.last_event.type === o.lastEvent.type && e.last_event.direction === o.lastEvent.direction && e.last_event.bar_time === w5[o.lastEvent.bar].time && Math.abs(e.last_event.level - o.lastEvent.level) < 1e-9); out.D1 = e.state === o.state && evOk ? 'OK' : 'VIOLATION'; const ws = oracleSweep(w5); const swOk = (!ws && !e.last_sweep) || (ws && e.last_sweep && e.last_sweep.type === ws.type && e.last_sweep.bar_time === w5[ws.bar].time && Math.abs(e.last_sweep.level - ws.level) < 1e-9); out.D2 = swOk ? 'OK' : 'VIOLATION'; } else { out.D1 = 'NA'; out.D2 = 'NA'; }
  const c = decision.candidate; const isSig = decision.engine_action === 'BUY' || decision.engine_action === 'SELL';
  out.D3 = c && isSig && c.model === 'PB' ? ((decision.stages?.pb_depth_atr?.[c.side] ?? 0) >= 1.0 - 1e-9 ? 'OK' : 'VIOLATION') : 'NA';
  out.D4 = c && isSig && c.model === 'MR' ? (c.midpoint != null && (c.side === 'BUY' ? c.midpoint > c.entry : c.midpoint < c.entry) ? 'OK' : 'VIOLATION') : 'NA';
  out.D5 = c && isSig ? ((c.rr_engine_unrounded ?? 0) >= 1.70 - 1e-9 ? 'OK' : 'VIOLATION') : 'NA';
  out.D6 = isSig ? (decision.input_stale ? 'VIOLATION' : 'OK') : (decision.input_stale ? (decision.engine_wait_reason === 'DATA_UNAVAILABLE_STALE' ? 'OK' : 'VIOLATION') : 'NA');
  return out;
}

// ---------------- execution-safety stage (shadow; production limits, read-only inputs) ----------------
export function safetyStage({ spread, news, shock, candidate }) {
  const checks = { spread_usd: spread == null ? null : r3(spread), spread_ok: spread != null && spread <= SAFETY.maxSpreadUsd, news_state: news?.state ?? 'UNKNOWN', news_ok: news?.state === 'NORMAL', shock_state: shock?.state ?? 'UNKNOWN', shock_ok: shock?.state !== 'VOLATILITY_SHOCK' };
  const margin = candidate ? (candidate.entry * SAFETY.contractOzPerLot * SAFETY.lot) / SAFETY.leverage : null; checks.margin_usd_001 = r3(margin); checks.broker_ok_demo_10k = margin == null || margin < SAFETY.demoEquityUsd * 0.5; checks.real_account_note = 'REAL account (62.07 USD) is below the ~71 USD MARGIN_SAFETY_VETO; the shadow validates the core against the 10,000 USD DEMO baseline';
  let block = null; if (spread == null) block = { category: 'DATA_UNAVAILABLE', detail: 'no live tick at the decision' }; else if (!checks.spread_ok) block = { category: 'SPREAD_BLOCK', detail: `spread ${checks.spread_usd} > ${SAFETY.maxSpreadUsd}` }; else if (!checks.news_ok) block = { category: 'NEWS_BLOCK', detail: `News V2 ${checks.news_state}${news?.event ? ` (${news.event})` : ''}` }; else if (!checks.shock_ok) block = { category: 'VOLATILITY_BLOCK', detail: 'production volatility-shock state active' }; else if (!checks.broker_ok_demo_10k) block = { category: 'BROKER_SAFETY', detail: 'margin for 0.01 lot not available' };
  return { checks, block };
}

// ---------------- hypothetical outcomes (NOT EXECUTED) ----------------
/** bars: archived 5m bars (oldest first); i: index of the signal bar. Returns null until every policy resolved or the horizon elapsed. */
export function labelOutcome(bars, i, c) {
  const e = { i, side: c.side, geo: { entry: c.entry, sl: c.stop_loss, tp2: c.tp2_engine }, atr: null };
  const pol = { open: { type: 'OPEN' }, fix170: { type: 'FIXED', rr: RR }, tp2: { type: 'FIXED', tpPrice: c.tp2_engine } }; const out = {};
  for (const [k, p] of Object.entries(pol)) for (const [cn, cost] of Object.entries(COSTS)) { if (k === 'open' && cn === 'stress') continue; const o = simulate(bars, e, p, cost); if (o.status === 'NO_DATA') return null; out[`${k}_${cn}`] = { exit: o.exit, r: o.r, pnl_usd: o.pnl_usd, bars: o.bars, mfe_r: o.mfe_r, mae_r: o.mae_r, gap: o.gap, milestones: Object.fromEntries(MILESTONES.filter((m) => [1, 1.25, 1.5, 1.7, 2].includes(m)).map((m) => [m, o.milestones[m] != null])) }; }
  const op = out.open_normal; const wrong = op.mfe_r < 0.5 && (op.exit === 'BROKER_SL' || op.exit === 'THESIS_INVALIDATION');
  return { label: 'HYPOTHETICAL_NOT_EXECUTED', executed: false, wrong_direction: wrong, against_entry: out.fix170_normal.r <= 0, ...out };
}

// ---------------- wrong-direction forensics ----------------
export function wrongDirectionClass(d) {
  const c = d.candidate; if (!c) return { cls: 'OTHER', why: 'no candidate geometry' };
  if (d.data_integrity && Object.values(d.data_integrity).some((v) => v === 'FAIL')) return { cls: 'DATA_ERROR', why: 'data-integrity check failed at the decision' };
  if (d.input_stale) return { cls: 'DATA_ERROR', why: `stale ${d.input_stale} input` };
  if ((d.latency_sec ?? 0) > 120 || (c.bars_from_origin ?? 0) > ({ MC: 3, PB: 3, BO: 10, SR: 0, MR: 3 }[c.model] ?? 99)) return { cls: 'TIMING_ERROR', why: 'decision or entry later than the model allows' };
  const rg = d.regression ?? {}; if (rg.D1 === 'VIOLATION' || rg.D2 === 'VIOLATION') return { cls: 'PATTERN_ERROR', why: 'structure / sweep differs from the specification oracle' };
  if (rg.D3 === 'VIOLATION') return { cls: 'SETUP_ERROR', why: 'PB depth below 1 ATR' };
  if (rg.D5 === 'VIOLATION') return { cls: 'TRIGGER_ERROR', why: 'RR below 1.70 before rounding' };
  if (rg.D4 === 'VIOLATION' || (c.overextension_atr ?? 0) > 2.5 + 1e-9) return { cls: 'LOCATION_ERROR', why: 'entry location outside the model rule' };
  const idx = MODELS.indexOf(c.model); const stg = d.stages?.[c.side]?.[idx]; if (stg !== '3') return { cls: 'TRIGGER_ERROR', why: `stage decomposition shows ${stg ?? 'none'} for the traded model` };
  const dirOk = c.model === 'MC' || c.model === 'PB' ? (c.side === 'BUY' ? d.bias.direction === 'BULLISH' : d.bias.direction === 'BEARISH') : true; if (!dirOk) return { cls: 'DIRECTION_ERROR', why: 'side not allowed by the model / bias rule' };
  const slOk = c.side === 'BUY' ? c.stop_loss < c.entry : c.stop_loss > c.entry; if (!slOk) return { cls: 'OTHER', why: 'stop on the wrong side' };
  return { cls: 'VALID_LOSING_TRADE', why: 'pattern, setup, trigger, direction, location, SL, timing and data all valid' };
}

// ---------------- move events and missed-setup classification ----------------
export function sma14Atr(bars, k) { if (k < 14) return null; let s = 0; for (let q = k - 13; q <= k; q++) { const b = bars[q], p = bars[q - 1]; s += Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)); } return s / 14; }
/** V3 move event at onset k (>= 3 ATR within 24 bars before 1 ATR adverse; break on a > 3 h gap). Needs bars up to k + 24 (or a gap). */
export function moveEventAt(bars, k) { const a = sma14Atr(bars, k); if (!a) return null; const c0 = bars[k].close; let maxH = -Infinity, minL = Infinity; for (let j = k + 1; j <= k + 24 && j < bars.length; j++) { const b = bars[j]; if (b.time - bars[j - 1].time > 3 * 3600) break; maxH = Math.max(maxH, b.high); minL = Math.min(minL, b.low); if (maxH - c0 >= 3 * a && c0 - minL <= a) return { k, dir: 'BUY', end: j, atr: a }; if (c0 - minL >= 3 * a && maxH - c0 <= a) return { k, dir: 'SELL', end: j, atr: a }; } return null; }
const GOVERNED = new Set(['MODEL_NOT_ELIGIBLE', 'LOCATION_INVALID', 'STRUCTURAL_RISK_INVALID', 'RR_INVALID', 'SPREAD_BLOCK', 'NEWS_BLOCK', 'VOLATILITY_BLOCK', 'BROKER_SAFETY', 'DATA_UNAVAILABLE', 'STALE_DATA', 'CONTEXT_CONFLICT', 'OTHER_GOVERNED_REASON', 'NO_TRIGGER', 'NO_SETUP', 'NO_PATTERN']);
/** decisionsByBarTime: Map(bar_time -> decision of ONE engine). barTimes: 5m bar times around the event (k-6 .. k+6). */
export function classifyMissed(ev, decisionsByBarTime, barTimes, onsetTime) {
  const dir = ev.dir; const win = barTimes.map((t) => decisionsByBarTime.get(t)).filter(Boolean); const before = win.filter((d) => d.bar_time <= onsetTime), after = win.filter((d) => d.bar_time > onsetTime);
  if (!win.length) return { cls: 'UNCERTAIN', why: 'no forward decision recorded around the move (runner not running)' };
  if (before.some((d) => d.shadow_signal && d.candidate?.side === dir)) return { cls: 'DETECTED_CORRECTLY', why: 'aligned shadow signal at or before the onset' };
  if (after.some((d) => d.shadow_signal && d.candidate?.side === dir)) return { cls: 'DETECTED_LATE', why: 'aligned shadow signal only after the onset' };
  const key = dir === 'BUY' ? 'BUY' : 'SELL'; const present = before.filter((d) => (d.stages?.[key] ?? '').includes('3') || d.candidate?.side === dir);
  if (!present.length) return { cls: 'UNCERTAIN', why: 'no existing model showed its trigger in the move direction (not one of the defined patterns)' };
  const bad = present.find((d) => d.replay_mismatch || Object.values(d.regression ?? {}).includes('VIOLATION') || (d.stage_parity_mismatch ?? []).length || String(d.wait_detail ?? '').startsWith('STAGE_INCONSISTENT'));
  if (bad) return { cls: 'BLOCKED_INCORRECTLY', why: 'the blocking decision failed a regression / parity check' };
  const gov = present.find((d) => GOVERNED.has(d.wait_category) || (d.valid_setup && !d.shadow_signal) || (d.shadow_signal && d.candidate?.side !== dir));
  if (gov) return { cls: 'BLOCKED_CORRECTLY', why: `governed rule: ${gov.shadow_signal ? 'opposite-side priority / signal' : gov.wait_category} ${gov.wait_detail ?? ''}`.trim() };
  return { cls: 'MISSED', why: 'a model triggered in the move direction and no governed reason explains the WAIT' };
}
