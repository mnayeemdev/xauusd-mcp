/**
 * ENTRY ARCHITECTURE V2 -- candidate enrichment (measurement only). RESEARCH ONLY.
 * Re-runs frozen production pure functions at every replay candle where production produced a model
 * candidate, recording geometry, quality and context factors so alternative architectures can be
 * evaluated WITHOUT changing production. Reads Edge Lab data read-only; writes only results/candidates.jsonl.
 * Spec: research/entry_architecture_v2/PREREGISTRATION.md §2.
 */
import os from 'node:os';
import { readFileSync, createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* best effort */ }

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const OUT = join(REPO, 'research', 'entry_architecture_v2', 'results'); mkdirSync(OUT, { recursive: true });
const LAB = join(REPO, 'handoff', 'edge_discovery_lab', 'data');
const E = (p) => 'file:///' + join(REPO, 'src', 'engine', p).replace(/\\/g, '/');
const { runPipeline } = await import(E('pipeline.js'));
const { classifyRegime, REGIME_PARAMS } = await import(E('regime.js'));
const { computeStructure, STRUCTURE_PARAMS } = await import(E('structure.js'));
const { scoreQuality, classifySession } = await import(E('quality.js'));
const { atr, ema, adxDi } = await import(E('math.js'));
const { computeHtfContext, detectHtfConflict } = await import(E('htf.js'));
const { computeBias, vetoedByFreshChoch, alignedWithBias } = await import(E('intraday/bias.js'));
const { evaluateIntradayModels } = await import(E('intraday/models5m.js'));
const { computeIntradayRisk } = await import(E('intraday/risk5m.js'));
const { resolveQualityThreshold } = await import(E('intraday/pipeline5m.js'));
const { INTRADAY_PARAMS: P } = await import(E('intraday/params.js'));

const BARS = JSON.parse(readFileSync(join(LAB, 'XAUUSDm_bars.json'), 'utf8'));
const b5 = BARS['5m'];
const TF_SEC = { '15m': 900, '30m': 1800, '1H': 3600 };
const TIMES = Object.fromEntries(Object.entries(BARS).map(([k, v]) => [k, v.map((b) => b.time)]));
const ub = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };
const REQ = 500, LAG = 80;
const confirmedAt = (tf, T) => { const cut = Math.floor(T / TF_SEC[tf]) * TF_SEC[tf]; const end = ub(TIMES[tf], cut); return BARS[tf].slice(Math.max(0, end - (REQ - 1)), end); };
const win5 = (i) => b5.slice(Math.max(0, i - (REQ - 2)), i + 1);
const memo = (m, k, f) => { if (!m.has(k)) m.set(k, f()); return m.get(k); };
const cache = { bias: new Map(), m30: new Map(), h1: new Map() };
const biasAt = (T) => memo(cache.bias, Math.floor(T / 900), () => computeBias({ confirmedBars: confirmedAt('15m', T), params: P }));
const m30At = (T) => memo(cache.m30, Math.floor(T / 1800), () => runPipeline({ confirmedBars: confirmedAt('30m', T) }));
const h1At = (T) => memo(cache.h1, Math.floor(T / 3600), () => computeHtfContext(confirmedAt('1H', T), { includeCorrection: true }));
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
const align = (state, side, bull, bear) => (state === bull ? (side === 'BUY' ? 1 : -1) : state === bear ? (side === 'SELL' ? 1 : -1) : 0);
const CAND_WR = new Set(['NO_GOOD_ENTRY', 'RR_NOT_ACCEPTABLE', 'ENTRY_CONFLICT', 'HTF_CONFLICT', 'OVEREXTENDED', 'VOLATILITY_INSUFFICIENT', 'INVALID_GEOMETRY']);
const MEASURE_PARAMS = Object.freeze({ ...P, overextendAtrMult: Infinity, minAtrUsd: 0 }); // geometry for rejected populations ONLY (measurement, not a rule)

const out = createWriteStream(join(OUT, 'candidates.jsonl'));
const rl = createInterface({ input: createReadStream(join(LAB, 'lab_rows.jsonl')) });
let n = 0, written = 0, mismatch = 0; const t0 = Date.now();
for await (const line of rl) {
  if (!line) continue; const r = JSON.parse(line); n++;
  const isCand = CAND_WR.has(r.wr) || r.act === 'BUY' || r.act === 'SELL';
  if (!isCand) continue;
  const i = r.i; const T = r.t + 300 + LAG; const bars = win5(i); const k = bars.length - 1;
  const bias = biasAt(T); const m30 = m30At(T); const ctx1H = h1At(T);
  if (!bias || bias.status !== 'OK') continue;
  const { regime, evidence: re } = classifyRegime(bars, REGIME_PARAMS); const structure = computeStructure(bars, STRUCTURE_PARAMS);
  const atrVal = atr(bars, 14).at(-1); const ema20 = ema(bars.map((b) => b.close), 20); const atrRatio = re?.atrRatio ?? 1;
  const cand = evaluateIntradayModels({ bars, regime, structure, atrVal, atrRatio, ema20, bias, m30Regime: m30.regime }, P);
  if (!cand) { mismatch++; continue; }
  const side = cand.side;
  const riskProd = computeIntradayRisk({ candidate: cand, bars, atrVal, structure5: structure, structure15: bias.structure }, P);
  const riskMeas = riskProd.gate === 'OK' || riskProd.gate === 'RR_NOT_ACCEPTABLE' ? riskProd : computeIntradayRisk({ candidate: cand, bars, atrVal, structure5: structure, structure15: bias.structure }, MEASURE_PARAMS);
  const geo = Number.isFinite(riskMeas.entry) && Number.isFinite(riskMeas.stop_loss) ? { entry: riskMeas.entry, sl: riskMeas.stop_loss, tp1: riskMeas.tp1, tp2: riskMeas.tp2, rr: riskMeas.rr, obj: riskMeas.objective?.source ?? null } : null;
  const { adx } = adxDi(bars, REGIME_PARAMS.adxDiLen, REGIME_PARAMS.adxSmoothing);
  const overext = Math.abs(bars[k].close - cand.anchor) / atrVal;
  const q = scoreQuality({ candidate: { ...cand, overextensionRatio: overext / P.overextendAtrMult }, structure, regime, adxVal: adx.at(-1), adxThreshold: REGIME_PARAMS.adxTrendThreshold, atrRatio, htfRegime: m30.regime, session: classifySession(bars[k].time), rr: geo?.rr ?? 0, minRR: P.minRR });
  const htfOpposed = detectHtfConflict(side, ctx1H);
  const { threshold, basis } = resolveQualityThreshold({ bias, side, ctx1H, params: P });
  const qFinal = htfOpposed ? Math.max(0, q.score - P.htfOpposedQualityPenalty) : q.score;
  const fresh_opp = vetoedByFreshChoch(bias, side) ? 1 : 0;
  const two_factor = !!(m30 && m30.status === 'OK' && ((m30.regime === 'BEAR_TREND' && side === 'BUY') || (m30.regime === 'BULL_TREND' && side === 'SELL')) && ((m30.structure?.state === 'BEARISH' && side === 'BUY') || (m30.structure?.state === 'BULLISH' && side === 'SELL')));
  const htf_conflict = htfOpposed && (cand.model === 'MR' || !alignedWithBias(bias, side));
  const rec = {
    i, t: r.t, close: bars[k].close, act: r.act, wr: r.wr, model: cand.model, side, anchor: r3(cand.anchor), atr: r3(atrVal), atrR: r3(atrRatio),
    gate_prod: riskProd.gate, geo, overext_atr: r3(overext), vol_ok: atrVal >= P.minAtrUsd, overext_ok: overext <= P.overextendAtrMult,
    q_base: q.score, q_final: qFinal, q_th: threshold, q_basis: basis, q_break: q.breakdown,
    a15: bias.direction === 'BULLISH' ? (side === 'BUY' ? 1 : -1) : bias.direction === 'BEARISH' ? (side === 'SELL' ? 1 : -1) : 0,
    a30r: align(m30.regime, side, 'BULL_TREND', 'BEAR_TREND'), a30s: align(m30.structure?.state, side, 'BULLISH', 'BEARISH'), a1h: align(ctx1H.regime, side, 'BULL_TREND', 'BEAR_TREND'), a5r: align(regime, side, 'BULL_TREND', 'BEAR_TREND'),
    mom: (adx.at(-1) ?? 0) >= REGIME_PARAMS.adxTrendThreshold ? 1 : 0, vol: atrRatio >= 0.7 && atrRatio <= 1.3 ? 1 : 0, fresh_opp, two_factor, htf_conflict,
    b15d: bias.direction, b15r: bias.regime, rg5: regime, m30r: m30.regime, m30s: m30.structure?.state ?? null, h1r: ctx1H.regime, ses: classifySession(r.t), hr: new Date(r.t * 1000).getUTCHours(),
  };
  out.write(JSON.stringify(rec) + '\n'); written++;
  if (written % 2000 === 0) { console.log(`candidates ${written} (rows ${n}) ${Math.round((Date.now() - t0) / 1000)}s`); for (const key of cache.bias.keys()) if (key < Math.floor(T / 900) - 400) cache.bias.delete(key); for (const key of cache.m30.keys()) if (key < Math.floor(T / 1800) - 200) cache.m30.delete(key); for (const key of cache.h1.keys()) if (key < Math.floor(T / 3600) - 100) cache.h1.delete(key); }
}
await new Promise((res) => out.end(res));
console.log(JSON.stringify({ rows: n, candidates_written: written, candidate_rows_without_model_candidate_on_recompute: mismatch, elapsed_s: Math.round((Date.now() - t0) / 1000) }));
