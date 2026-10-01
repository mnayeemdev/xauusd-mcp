/**
 * V8 -- BUY/SELL symmetry test by price mirroring (RESEARCH ONLY). For a seeded sample of DEV bars, every timeframe window is
 * mirrored around K = 2 x close(decision bar): open/close -> K - x, high -> K - low, low -> K - high (times unchanged), so the
 * mirrored chart is the same market upside down at the same price level. A symmetric implementation must return the mirrored
 * decision: BUY <-> SELL, the same model and wait reason, entry/SL/TP mirrored. Engines: CONTROL (production), ALL (corrected)
 * and SYMPROBE = production with the three price-relative terms neutralised (regime ATR% -> ATR, Bollinger width / basis -> absolute
 * width, sweep tolerance % -> fixed 2 USD), which separates genuine code asymmetry from price-level normalisation.
 *   node research/core_pattern_audit_v8/scripts/v8_symmetry.mjs
 */
import os from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* best effort */ }
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const PROBE = join(ROOT, 'engines', 'SYMPROBE');
if (!existsSync(PROBE)) {
  cpSync(join(ROOT, 'engines', 'CONTROL_COPY'), PROBE, { recursive: true });
  const rp = join(PROBE, 'engine', 'regime.js'); let t = readFileSync(rp, 'utf8'); const a = '(v !== null && closes[i] ? (v / closes[i]) * 100 : null)'; if (t.split(a).length !== 2) throw new Error('regime anchor'); writeFileSync(rp, t.replace(a, '(v !== null ? v : null) /* SYMPROBE: price-level-free */'));
  const mp = join(PROBE, 'engine', 'math.js'); t = readFileSync(mp, 'utf8'); const c = '(upper[i] - lower[i]) / basis[i]'; if (t.split(c).length !== 2) throw new Error('math anchor'); writeFileSync(mp, t.replace(c, '(upper[i] - lower[i]) /* SYMPROBE: absolute width */'));
  const sp = join(PROBE, 'engine', 'structure.js'); t = readFileSync(sp, 'utf8'); const b = 'const tol = piv.price * (STRUCTURE_PARAMS.sweepTolerancePct / 100);'; if (t.split(b).length !== 2) throw new Error('structure anchor'); writeFileSync(sp, t.replace(b, 'const tol = 2.0; /* SYMPROBE: fixed tolerance */'));
}
const LAB = join(REPO, 'handoff', 'edge_discovery_lab', 'data');
const BARS = JSON.parse(readFileSync(join(LAB, 'XAUUSDm_bars.json'), 'utf8')); const b5 = BARS['5m'];
const TF_SEC = { '15m': 900, '30m': 1800, '1H': 3600 }; const REQ = 500, LAG = 80;
const TIMES = Object.fromEntries(Object.entries(BARS).map(([k, v]) => [k, v.map((b) => b.time)]));
const ub = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };
const confirmedAt = (tf, T) => { const cut = Math.floor(T / TF_SEC[tf]) * TF_SEC[tf]; const end = ub(TIMES[tf], cut); return BARS[tf].slice(Math.max(0, end - (REQ - 1)), end); };
const mirror = (bars, K) => bars.map((b) => ({ ...b, open: K - b.open, high: K - b.low, low: K - b.high, close: K - b.close }));
async function engine(dir) { const E = (p) => pathToFileURL(join(dir, p)).href; const { runPipeline } = await import(E('pipeline.js')); const { computeHtfContext } = await import(E('htf.js')); const { computeBias } = await import(E('intraday/bias.js')); const { runIntradayPipeline, combineIntraday } = await import(E('intraday/pipeline5m.js')); const { INTRADAY_PARAMS: P } = await import(E('intraday/params.js'));
  return (w5, w15, w30, w1h) => { const bias = computeBias({ confirmedBars: w15, params: P }); const m30 = runPipeline({ confirmedBars: w30 }); const ctx1H = computeHtfContext(w1h, { includeCorrection: true }); const intra = runIntradayPipeline({ bars5: w5, bias, m30Regime: m30.regime, ctx1H, params: P }); const live = combineIntraday({ intraday: intra, bias, m30, ctx1H }); const r = intra.evidence?.risk; return { act: live.action, wr: live.wait_reason ?? null, mdl: intra.model ?? null, cs: intra.evidence?.candidate?.side ?? null, e: r?.entry ?? null, sl: r?.stop_loss ?? null, tp2: r?.tp2 ?? null, rr: r?.rr ?? null, b15: bias.direction, st5: intra.structure?.state ?? null }; }; }
const PROBE_ALL = join(ROOT, 'engines', 'SYMPROBE_ALL');
if (!existsSync(PROBE_ALL)) { cpSync(join(ROOT, 'engines', 'ALL'), PROBE_ALL, { recursive: true }); for (const [f, a, b] of [['regime.js', '(v !== null && closes[i] ? (v / closes[i]) * 100 : null)', '(v !== null ? v : null)'], ['math.js', '(upper[i] - lower[i]) / basis[i]', '(upper[i] - lower[i])'], ['structure.js', 'const tol = piv.price * (STRUCTURE_PARAMS.sweepTolerancePct / 100);', 'const tol = 2.0;']]) { const fp = join(PROBE_ALL, 'engine', f); const t = readFileSync(fp, 'utf8'); if (t.split(a).length !== 2) throw new Error('anchor ' + f); writeFileSync(fp, t.replace(a, b)); } }
const ENGINES = { CONTROL: await engine(join(REPO, 'src', 'engine')), ALL: await engine(join(ROOT, 'engines', 'ALL', 'engine')), SYMPROBE: await engine(join(PROBE, 'engine')), SYMPROBE_ALL: await engine(join(PROBE_ALL, 'engine')) };
const flip = { BUY: 'SELL', SELL: 'BUY', BULLISH: 'BEARISH', BEARISH: 'BULLISH' };
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const firstT = Math.max(b5[REQ - 1].time, BARS['15m'][REQ - 1].time, BARS['30m'][REQ - 1].time, BARS['1H'][REQ - 1].time);
const cand = []; for (let i = 0; i < b5.length - 1; i++) { const d = day(b5[i].time); if (b5[i].time >= firstT && d >= '2025-05-07' && d <= '2025-12-31') cand.push(i); }
let s = 424242 >>> 0; const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const N = Number(process.env.V8_SYM_N || 3000); const pick = new Set(); while (pick.size < N) pick.add(cand[Math.floor(rand() * cand.length)]);
const res = {}; for (const k of Object.keys(ENGINES)) res[k] = { bars: 0, signals: 0, exact: 0, mismatch: 0, by_field: {}, examples: [] };
const close2 = (a, b) => a == null && b == null ? true : a != null && b != null && Math.abs(a - b) <= 0.011;
for (const i of [...pick].sort((a, b) => a - b)) {
  const T = b5[i].time + 300 + LAG; const w5 = b5.slice(Math.max(0, i - (REQ - 2)), i + 1); const w15 = confirmedAt('15m', T), w30 = confirmedAt('30m', T), w1h = confirmedAt('1H', T);
  const K = 2 * Math.round(b5[i].close);
  const m5 = mirror(w5, K), m15 = mirror(w15, K), m30 = mirror(w30, K), m1h = mirror(w1h, K);
  for (const [name, run] of Object.entries(ENGINES)) { const o = run(w5, w15, w30, w1h), m = run(m5, m15, m30, m1h); const R = res[name]; R.bars++; if (o.act !== 'WAIT') R.signals++;
    const bad = []; if ((flip[o.act] ?? o.act) !== m.act) bad.push('action'); if (o.act === 'WAIT' && o.wr !== m.wr) bad.push('wait_reason'); if (o.mdl !== m.mdl) bad.push('model'); if ((flip[o.cs] ?? o.cs) !== m.cs) bad.push('candidate_side'); if ((flip[o.b15] ?? o.b15) !== m.b15) bad.push('bias'); if ((flip[o.st5] ?? o.st5) !== m.st5) bad.push('structure');
    if (o.e != null || m.e != null) { if (!close2(o.e == null ? null : K - o.e, m.e)) bad.push('entry'); if (!close2(o.sl == null ? null : K - o.sl, m.sl)) bad.push('stop'); if (!close2(o.tp2 == null ? null : K - o.tp2, m.tp2)) bad.push('tp2'); if (o.rr !== m.rr && !(o.rr != null && m.rr != null && Math.abs(o.rr - m.rr) <= 0.011)) bad.push('rr'); }
    if (bad.length) { R.mismatch++; for (const f of bad) R.by_field[f] = (R.by_field[f] ?? 0) + 1; if (R.examples.length < 12) R.examples.push({ i, t: new Date(b5[i].time * 1000).toISOString(), fields: bad, original: o, mirrored: m }); } else R.exact++; }
}
for (const R of Object.values(res)) R.symmetry_rate = +(R.exact / Math.max(1, R.bars)).toFixed(4);
const out = { generated_utc: new Date().toISOString(), sample_bars: pick.size, split: 'DEV', K: '2 x round(close of the decision bar)', engines: res };
mkdirSync(join(ROOT, 'results'), { recursive: true }); writeFileSync(join(ROOT, 'results', 'symmetry.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { bars: v.bars, signals: v.signals, symmetry_rate: v.symmetry_rate, by_field: v.by_field }]))));
