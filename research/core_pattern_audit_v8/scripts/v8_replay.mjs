/**
 * V8 CORE PATTERN EXECUTION AUDIT -- production-faithful per-bar replay with model-eligibility and pattern/setup/trigger
 * traces (RESEARCH ONLY). Mirrors handoff/edge_discovery_lab/scripts/lab_replay.mjs exactly (REQ 500, FETCH_LAG 80 s,
 * higher timeframes cut at the decision time, forming bar never used) and adds, per confirmed 5m bar:
 *   - the production decision (action, wait reason, model, candidate side, quality, geometry),
 *   - TRACE: which models are eligible under the real 15m bias and which trigger,
 *   - STAGES: bias-agnostic pattern(1) / setup(2) / trigger(3) for every model and both sides (stage 3 is asserted to equal
 *     the production model function under the same bias, bar by bar),
 *   - AGNOSTIC downstream: for WAIT bars with a bias-blocked trigger, whether risk/RR/quality/vetoes would pass had the
 *     15m bias been aligned (context-lag evidence; descriptive only).
 * Usage: V8_VARIANT=CONTROL|CONTROL_COPY|D1..D6|ALL V8_PHASE=DEV|HOLD [V8_MAX=n] node v8_replay.mjs
 * Output: results/rows/<variant>_<phase>.jsonl and results/rows/<variant>_<phase>.meta.json
 */
import os from 'node:os';
import { readFileSync, writeFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { VARIANTS } from './corrections.mjs';
try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* best effort: never compete with the live watcher */ }

const VARIANT = process.env.V8_VARIANT ?? 'CONTROL'; const PHASE = process.env.V8_PHASE ?? 'DEV'; const MAX = Number(process.env.V8_MAX || Infinity);
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const ENGINE_DIR = VARIANT === 'CONTROL' ? join(REPO, 'src', 'engine') : join(ROOT, 'engines', VARIANT, 'engine');
const FIXES = VARIANTS[VARIANT] ?? []; const STALE_GATE = FIXES.includes('D6');
const E = (p) => pathToFileURL(join(ENGINE_DIR, p)).href;
const { runPipeline } = await import(E('pipeline.js'));
const { classifyRegime, REGIME_PARAMS } = await import(E('regime.js'));
const { scoreQuality, classifySession } = await import(E('quality.js'));
const { atr, ema, adxDi } = await import(E('math.js'));
const { computeCorrection, CORRECTION_PARAMS } = await import(E('correction.js'));
const { computeHtfContext, detectHtfConflict } = await import(E('htf.js'));
const { computeBias, vetoedByFreshChoch } = await import(E('intraday/bias.js'));
const M = await import(E('intraday/models5m.js'));
const { computeIntradayRisk } = await import(E('intraday/risk5m.js'));
const { runIntradayPipeline, combineIntraday } = await import(E('intraday/pipeline5m.js'));
const { INTRADAY_PARAMS: P } = await import(E('intraday/params.js'));

const LAB = join(REPO, 'handoff', 'edge_discovery_lab', 'data');
const BARS = JSON.parse(readFileSync(join(LAB, 'XAUUSDm_bars.json'), 'utf8'));
const TF_SEC = { '5m': 300, '15m': 900, '30m': 1800, '1H': 3600, '4H': 14400 };
const FETCH_LAG = 80, REQ = 500, STALE_MULT = 3;
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
const TIMES = Object.fromEntries(Object.entries(BARS).map(([k, v]) => [k, v.map((b) => b.time)]));
const ub = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };
const confirmedAt = (tf, T) => { const cut = Math.floor(T / TF_SEC[tf]) * TF_SEC[tf]; const end = ub(TIMES[tf], cut); return BARS[tf].slice(Math.max(0, end - (REQ - 1)), end); };
const cache = { bias: new Map(), m30: new Map(), h1: new Map() };
const memo = (m, k, f) => { if (!m.has(k)) m.set(k, f()); return m.get(k); };
const biasAt = (T) => memo(cache.bias, Math.floor(T / 900), () => computeBias({ confirmedBars: confirmedAt('15m', T), params: P }));
const m30At = (T) => memo(cache.m30, Math.floor(T / 1800), () => runPipeline({ confirmedBars: confirmedAt('30m', T) }));
const h1At = (T) => memo(cache.h1, Math.floor(T / 3600), () => computeHtfContext(confirmedAt('1H', T), { includeCorrection: true }));
const staleAt = (tf, T) => { const c = confirmedAt(tf, T); if (!c.length) return true; return T - c.at(-1).time > TF_SEC[tf] * (STALE_MULT + 1); };
const b5 = BARS['5m'];
const win5 = (i) => b5.slice(Math.max(0, i - (REQ - 2)), i + 1);
const iso = (t) => new Date(t * 1000).toISOString(); const day = (t) => iso(t).slice(0, 10);
const SPLIT = { DEV: ['2025-05-07', '2025-12-31'], HOLD: ['2026-01-01', '2026-09-29'] };
const inPhase = (t) => { const d = day(t); const [a, b] = SPLIT[PHASE]; return d >= a && d <= b; };
const firstT = Math.max(b5[REQ - 1].time, BARS['15m'][REQ - 1].time, BARS['30m'][REQ - 1].time, BARS['1H'][REQ - 1].time, BARS['4H'][REQ - 1].time);
const lastIdx = b5.length - 2;
const ALL5 = ['MC', 'PB', 'BO', 'SR', 'MR'];

// ---------- bias-agnostic pattern / setup / trigger decomposition (mirrors models5m.js conditions; stage 3 asserted) ----------
const beyond = (side, price, level) => (side === 'BUY' ? price > level : price < level);
function stagesMC(bars, structure, ema20, atrRatio, side) {
  const i = bars.length - 1; let pattern = i >= P.mcConfirmBars + 1;
  for (let k = 0; pattern && k < P.mcConfirmBars; k++) { const idx = i - k; if (ema20[idx] == null) { pattern = false; break; } const c = bars[idx].close; if (side === 'BUY' ? c <= ema20[idx] : c >= ema20[idx]) pattern = false; if (pattern && k < P.mcConfirmBars - 1) { const prev = bars[idx - 1].close; if (side === 'BUY' ? c <= prev : c >= prev) pattern = false; } }
  const setup = pattern && atrRatio >= P.mcMinAtrRatio;
  let trig = false; const swing = side === 'BUY' ? structure?.lastSwingHigh : structure?.lastSwingLow;
  if (setup && swing && beyond(side, bars[i].close, swing.price)) { let bb = i; while (bb - 1 > swing.index && beyond(side, bars[bb - 1].close, swing.price)) bb--; trig = i - bb <= P.mcMaxEntryLateBars; }
  return trig ? 3 : setup ? 2 : pattern ? 1 : 0;
}
function pbDepth(bars, side) { const i = bars.length - 1; const ws = Math.max(0, i - P.pbSwingLookback + 1); let ex = ws; for (let k = ws; k <= i; k++) if (side === 'BUY' ? bars[k].high > bars[ex].high : bars[k].low < bars[ex].low) ex = k; if (ex >= i) return 0; const after = bars.slice(ex + 1, i + 1); return side === 'BUY' ? bars[ex].high - Math.min(...after.map((b) => b.low)) : Math.max(...after.map((b) => b.high)) - bars[ex].low; }
function stagesPB(bars, ema20, atrVal, side) {
  const i = bars.length - 1; const depth = pbDepth(bars, side);
  const corr = computeCorrection(bars, side === 'BUY' ? 'BULLISH' : 'BEARISH', { ...CORRECTION_PARAMS, swingLookback: P.pbSwingLookback, corrAtrMultiplier: P.pbCorrAtrMultiplier, corrResolveConfirmBars: P.pbResolveConfirmBars });
  let run = 0; for (let k = i; k >= 0; k--) { if (ema20[k] == null) break; if (side === 'BUY' ? bars[k].close > ema20[k] : bars[k].close < ema20[k]) run++; else break; }
  const fresh = run - P.pbResolveConfirmBars >= 0 && run - P.pbResolveConfirmBars <= P.pbMaxEntryLateBars;
  const pattern = depth >= P.pbCorrAtrMultiplier * atrVal || corr.state === 'ACTIVE' || corr.state === 'RESOLVED';
  const setup = FIXES.includes('D3') ? atrVal > 0 && depth >= P.pbCorrAtrMultiplier * atrVal && run >= P.pbResolveConfirmBars : corr.state === 'RESOLVED';
  const trig = setup && fresh;
  return trig ? 3 : setup ? 2 : pattern ? 1 : 0;
}
function stagesBO(bars, regime, structure, atrVal, side) {
  const i = bars.length - 1; const ev = structure?.lastEvent; if (!ev || regime === 'CHOP_UNCERTAIN') return 0;
  if ((ev.direction === 'BULLISH' ? 'BUY' : 'SELL') !== side) return 0;
  if (!(ev.bar < i && i - ev.bar <= P.boMaxEntryLateBars)) return 0;
  const tol = atrVal * P.boRetestAtrTol; let retested = false;
  for (let j = ev.bar + 1; j <= i; j++) if (Math.abs(bars[j].close - ev.level) <= tol || (ev.direction === 'BULLISH' ? bars[j].low <= ev.level + tol : bars[j].high >= ev.level - tol)) { retested = true; break; }
  if (!retested) return 1; return beyond(side, bars[i].close, ev.level) ? 3 : 2;
}
function stagesSR(bars, s5, side, levels, atrVal, onBias) {
  const k = bars.length - 1; const bar = bars[k]; const range = bar.high - bar.low; if (!(range > 0) || !(atrVal > 0)) return 0;
  const wick = side === 'BUY' ? Math.min(bar.open, bar.close) - bar.low : bar.high - Math.max(bar.open, bar.close);
  const shape = wick / range >= P.srMinWickRatio && (side === 'BUY' ? bar.close >= bar.high - range * P.srCloseLocation : bar.close <= bar.low + range * P.srCloseLocation);
  if (!shape) return 0;
  const mine = levels.filter((l) => l.side === side);
  const touches = (l) => (side === 'BUY' ? bar.low <= l.price + P.srLevelTouchAtr * atrVal && bar.low >= l.price - P.srLevelPierceAtr * atrVal && bar.close > l.price : bar.high >= l.price - P.srLevelTouchAtr * atrVal && bar.high <= l.price + P.srLevelPierceAtr * atrVal && bar.close < l.price);
  const atLevel = mine.filter(touches);
  if (!atLevel.length) return 1;
  const opposes = (side === 'SELL' && s5?.state === 'BULLISH') || (side === 'BUY' && s5?.state === 'BEARISH');
  const trig = atLevel.some((l) => !opposes || M.counterStructureConfirmed({ bias: onBias, structure: s5, level: l.price, side, i: k, atrVal, p: P }));
  return trig ? 3 : 2;
}
function stagesMR(bars, regime, structure, bias, m30Regime, side) {
  const i = bars.length - 1; const sw = structure?.lastSweep; if (!sw || i - sw.bar > P.mrSweepMaxAgeBars || i - sw.bar < 0) return 0;
  if ((sw.type === 'SWEEP_HIGH' ? 'SELL' : 'BUY') !== side) return 0;
  const setup = bias?.regime === 'RANGE' && m30Regime !== 'BULL_TREND' && m30Regime !== 'BEAR_TREND' && regime !== 'HIGH_VOLATILITY';
  if (!setup) return 1;
  if (FIXES.includes('D4')) { const rh = bias.structure?.rangeHigh ?? null, rl = bias.structure?.rangeLow ?? null; const mid = rh !== null && rl !== null ? (rh + rl) / 2 : null; if (mid === null || (side === 'BUY' ? !(mid > bars[i].close) : !(mid < bars[i].close))) return 2; }
  return 3;
}

const ROWS_DIR = join(ROOT, 'results', 'rows'); mkdirSync(ROWS_DIR, { recursive: true });
const out = createWriteStream(join(ROWS_DIR, `${VARIANT}_${PHASE}.jsonl`));
const parity = { checked: 0, mismatch: 0, examples: [] }; const t0 = Date.now(); let n = 0;
const flagMismatch = (i, model, side, prod, stage) => { parity.mismatch++; if (parity.examples.length < 20) parity.examples.push({ i, t: iso(b5[i].time), model, side, production_triggers: prod, stage }); };
for (let i = 0; i <= lastIdx; i++) {
  const t = b5[i].time; if (t < firstT || !inPhase(t)) continue; if (n >= MAX) break; n++;
  const T = t + 300 + FETCH_LAG; const bars = win5(i); const k = bars.length - 1; const off = i - k;
  const bias = biasAt(T), m30 = m30At(T), ctx1H = h1At(T);
  const intra = runIntradayPipeline({ bars5: bars, bias, m30Regime: m30.regime, ctx1H, params: P });
  const live = combineIntraday({ intraday: intra, bias, m30, ctx1H });
  const cand = intra.evidence?.candidate ?? null; const risk = intra.evidence?.risk ?? null;
  const row = { i, t, act: live.action, wr: live.wait_reason ?? null, mdl: intra.model ?? null, cs: cand?.side ?? null, q: intra.quality?.score ?? null, qth: intra.quality?.threshold ?? null,
    rg5: intra.regime ?? null, b15: bias.direction ?? null, b15r: bias.regime ?? null, m30r: m30.regime ?? null, m30s: m30.structure?.state ?? null, h1r: ctx1H.regime ?? null, choch: bias.fresh_opposing_choch?.direction ?? null,
    gap: i > 0 && t - b5[i - 1].time > 3 * 3600 ? 1 : 0 };
  if (cand) { row.anc = r3(cand.anchor); row.org = Number.isInteger(cand.originBar) ? cand.originBar + off : null; }
  if (risk && Number.isFinite(risk.entry)) row.g = { e: risk.entry, sl: risk.stop_loss, tp1: risk.tp1, tp2: risk.tp2, rr: risk.rr, obj: risk.objective?.source ?? null, src: risk.sl_source ?? null, ra: risk.risk_atr ?? null };
  if (STALE_GATE) { const st = staleAt('15m', T) ? '15m' : staleAt('30m', T) ? '30m' : null; if (st) { row.stale = st; row.act = 'WAIT'; row.wr = 'DATA_UNAVAILABLE_STALE'; } }
  const s5 = intra.structure;
  if (s5?.state !== undefined) { row.st5 = s5.state ?? null; const ev = s5.lastEvent; if (ev) row.ev5 = [ev.type, ev.direction === 'BULLISH' ? 'B' : 'S', ev.bar + off, r3(ev.level)]; const sw = s5.lastSweep; if (sw) row.sw5 = [sw.type === 'SWEEP_HIGH' ? 'H' : 'L', sw.bar + off, r3(sw.level)]; }
  // ---------- traces (only when the 5m pipeline reached the model layer) ----------
  if (bias.status === 'OK' && s5?.state !== undefined && intra.regime) {
    const ema20 = ema(bars.map((b) => b.close), 20); const atrVal = atr(bars, 14).at(-1); const atrRatio = intra.evidence?.atrRatio ?? 1; const regime = intra.regime;
    const ctx = { bars, regime, structure: s5, atrVal, atrRatio, ema20, bias, m30Regime: m30.regime };
    row.elig = (bias.eligible_models ?? []).join('');
    if (regime !== 'CHOP_UNCERTAIN' && (bias.eligible_models ?? []).length) { const trig = []; for (const [m, f] of [['MC', M.evaluateMomentumContinuation], ['PB', M.evaluatePullbackContinuation], ['BO', M.evaluateBreakoutRetest], ['SR', M.evaluateStructureRejection], ['MR', M.evaluateMeanReversion]]) { const c = f({ ...ctx, params: P }); if (c) trig.push(`${m}${c.side[0]}`); } if (trig.length) row.trig = trig.join(','); }
    // bias-agnostic production triggers
    const ovr = (direction) => ({ ...bias, status: 'OK', direction, eligible_models: ALL5, fresh_opposing_choch: null });
    const OB = ovr('BULLISH'), OS = ovr('BEARISH'), ON = ovr('NEUTRAL');
    const prod = { MC: { BUY: !!M.evaluateMomentumContinuation({ ...ctx, bias: OB, params: P }), SELL: !!M.evaluateMomentumContinuation({ ...ctx, bias: OS, params: P }) }, PB: { BUY: !!M.evaluatePullbackContinuation({ ...ctx, bias: OB, params: P }), SELL: !!M.evaluatePullbackContinuation({ ...ctx, bias: OS, params: P }) } };
    const bo = M.evaluateBreakoutRetest({ ...ctx, bias: ON, params: P }); const sr = M.evaluateStructureRejection({ ...ctx, bias: ON, params: P }); const mr = M.evaluateMeanReversion({ ...ctx, bias: ON, params: P });
    prod.BO = { BUY: bo?.side === 'BUY', SELL: bo?.side === 'SELL' }; prod.SR = { BUY: sr?.side === 'BUY', SELL: sr?.side === 'SELL' }; prod.MR = { BUY: mr?.side === 'BUY', SELL: mr?.side === 'SELL' };
    const levels = []; const push = (sw, side) => { if (sw?.price != null) levels.push({ price: sw.price, side }); }; push(bias.structure?.lastSwingLow, 'BUY'); push(bias.structure?.lastSwingHigh, 'SELL'); push(s5.lastSwingLow, 'BUY'); push(s5.lastSwingHigh, 'SELL');
    const st = {};
    for (const side of ['BUY', 'SELL']) {
      const sg = { MC: stagesMC(bars, s5, ema20, atrRatio, side), PB: stagesPB(bars, ema20, atrVal, side), BO: stagesBO(bars, regime, s5, atrVal, side), SR: stagesSR(bars, s5, side, levels, atrVal, ON), MR: stagesMR(bars, regime, s5, bias, m30.regime, side) };
      for (const m of ALL5) { parity.checked++; if ((sg[m] === 3) !== prod[m][side]) flagMismatch(i, m, side, prod[m][side], sg[m]); }
      st[side] = ALL5.map((m) => sg[m]).join('');
    }
    row.stB = st.BUY; row.stS = st.SELL;
    // agnostic downstream for WAIT bars where a bias-agnostic trigger exists (context-lag evidence)
    if (row.act === 'WAIT') {
      const ag = [];
      for (const side of ['BUY', 'SELL']) {
        const mdl = ALL5.find((m) => prod[m][side]); if (!mdl) continue;
        const dirBias = side === 'BUY' ? OB : OS; const useBias = mdl === 'MC' || mdl === 'PB' ? dirBias : ON;
        const f = { MC: M.evaluateMomentumContinuation, PB: M.evaluatePullbackContinuation, BO: M.evaluateBreakoutRetest, SR: M.evaluateStructureRejection, MR: M.evaluateMeanReversion }[mdl];
        const c = f({ ...ctx, bias: useBias, params: P }); if (!c || c.side !== side) continue;
        const rk = computeIntradayRisk({ candidate: c, bars, atrVal, structure5: s5, structure15: bias.structure }, P);
        let q = null, pass = false;
        if (rk.gate === 'OK') {
          const { adx } = adxDi(bars, REGIME_PARAMS.adxDiLen, REGIME_PARAMS.adxSmoothing); const overextensionRatio = Math.abs(bars[k].close - c.anchor) / (atrVal * P.overextendAtrMult);
          const qq = scoreQuality({ candidate: { ...c, overextensionRatio }, structure: s5, regime, adxVal: adx.at(-1), adxThreshold: REGIME_PARAMS.adxTrendThreshold, atrRatio, htfRegime: m30.regime, session: classifySession(bars[k].time), rr: rk.rr, minRR: P.minRR });
          const htfOpp = detectHtfConflict(side, ctx1H); q = htfOpp ? Math.max(0, qq.score - P.htfOpposedQualityPenalty) : qq.score;
          const twoFactor = m30.status === 'OK' && ((m30.regime === 'BEAR_TREND' && side === 'BUY') || (m30.regime === 'BULL_TREND' && side === 'SELL')) && ((m30.structure?.state === 'BEARISH' && side === 'BUY') || (m30.structure?.state === 'BULLISH' && side === 'SELL'));
          pass = q >= P.qualityThreshold && !vetoedByFreshChoch(bias, side) && !twoFactor && !(htfOpp && mdl === 'MR');
        }
        ag.push({ s: side[0], m: mdl, gate: rk.gate, q, pass: pass ? 1 : 0, e: Number.isFinite(rk.entry) ? rk.entry : null, sl: Number.isFinite(rk.stop_loss) ? rk.stop_loss : null, tp2: Number.isFinite(rk.tp2) ? rk.tp2 : null, rr: rk.rr ?? null, anc: r3(c.anchor) });
      }
      if (ag.length) row.ag = ag;
    }
  }
  out.write(JSON.stringify(row) + '\n');
  if (n % 10000 === 0) console.log(`${VARIANT} ${PHASE} rows ${n} at ${iso(t)} elapsed ${Math.round((Date.now() - t0) / 1000)}s`);
  if (n % 2000 === 0) { const b = Math.floor(T / 900); for (const key of cache.bias.keys()) if (key < b - 400) cache.bias.delete(key); for (const key of cache.m30.keys()) if (key < Math.floor(T / 1800) - 200) cache.m30.delete(key); for (const key of cache.h1.keys()) if (key < Math.floor(T / 3600) - 100) cache.h1.delete(key); }
}
await new Promise((res) => out.end(res));
const meta = { variant: VARIANT, phase: PHASE, fixes: FIXES, stale_gate: STALE_GATE, engine_dir: ENGINE_DIR.replace(REPO, '.').replace(/\\/g, '/'), rows: n, stage_parity: parity, runtime_sec: Math.round((Date.now() - t0) / 1000), generated_utc: new Date().toISOString() };
writeFileSync(join(ROWS_DIR, `${VARIANT}_${PHASE}.meta.json`), JSON.stringify(meta, null, 1));
console.log(JSON.stringify(meta));
if (parity.mismatch) process.exitCode = 3;
