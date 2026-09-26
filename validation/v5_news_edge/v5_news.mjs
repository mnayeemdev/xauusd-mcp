// V5 scheduled-news event study. Research only; nothing here is imported by production.
// Implements docs/XAUUSD_V5_RESEARCH_PROTOCOL.md exactly. Holdout is evaluated only for
// candidates with a machine-written validation_pass_<candidate>.json artifact.
import fs from 'node:fs';
import { etToUtc } from './et_time.mjs';

const DIR = 'validation/v5_news_edge';
const REG = { DISCOVERY: ['2022-07-04', '2024-06-30'], VALIDATION: ['2024-07-01', '2025-08-31'], HOLDOUT: ['2025-09-01', '2026-09-25'] };
const HOLDOUT_START = Date.parse('2025-09-01T00:00:00Z') / 1000;
const regionOf = (date) => Object.entries(REG).find(([, [a, b]]) => date >= a && date <= b)?.[0] ?? null;

const EV = JSON.parse(fs.readFileSync(`${DIR}/events_usd_official.json`, 'utf8')).events
  .filter(e => e.price_coverage && typeof e.spike_check === 'object');
const ALL = JSON.parse(fs.readFileSync('validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json', 'utf8'));
const B15 = ALL['15m'], B5 = ALL['5m'];
const idx15 = new Map(B15.map((b, i) => [b.time, i]));
const idx5 = new Map(B5.map((b, i) => [b.time, i]));
const tr = (bars, i) => Math.max(bars[i].high - bars[i].low, i > 0 ? Math.abs(bars[i].high - bars[i - 1].close) : 0, i > 0 ? Math.abs(bars[i].low - bars[i - 1].close) : 0);

// ---------------- event-time helpers ----------------
const allEventSecs = EV.map(e => Date.parse(e.utc) / 1000);
const nearListed = (sec, excludeSec) => allEventSecs.some(s => s !== excludeSec && Math.abs(s - sec) <= 240 * 60);
for (const e of EV) { e.sec = Date.parse(e.utc) / 1000; e.region = regionOf(e.date); e.contaminated = e.within_4h.length > 0; e.year = e.date < '2023' ? '2022H2' : e.date < '2024' ? '2023' : e.date < '2024-07' ? '2024H1' : e.date < '2025' ? '2024H2' : e.date < '2026' ? '2025' : '2026'; }

// ---------------- measurement at a 15m bar index ----------------
function measure15(i0) {
  if (i0 < 101 || i0 + 16 >= B15.length) return null;
  let s = 0; for (let k = i0 - 100; k <= i0 - 5; k++) s += tr(B15, k); const atr = s / 96; if (!(atr > 0)) return null;
  const o = B15[i0].open; const m = { atr, usd_per_atr: atr };
  const rs = (a, b) => { let x = 0; for (let k = a; k < b; k++) x += tr(B15, k); return x / atr; };
  m.pre_rr_60_30 = rs(i0 - 4, i0 - 2); m.pre_rr_30_15 = rs(i0 - 2, i0 - 1); m.pre_rr_15_0 = rs(i0 - 1, i0); m.pre_rr_60_0 = rs(i0 - 4, i0);
  m.pre_abs_60_0 = Math.abs(B15[i0 - 1].close - B15[i0 - 4].open) / atr;
  m.bar0_disp = Math.abs(B15[i0].close - o) / atr; m.bar0_range = (B15[i0].high - B15[i0].low) / atr;
  const dir = Math.sign(B15[i0].close - o); m.dir = dir;
  for (const [h, n] of [[15, 1], [30, 2], [60, 4], [120, 8], [240, 16]]) {
    let hi = -Infinity, lo = Infinity; for (let k = i0; k < i0 + n; k++) { hi = Math.max(hi, B15[k].high); lo = Math.min(lo, B15[k].low); }
    const sig = (B15[i0 + n - 1].close - o) / atr;
    m[`signed_${h}`] = sig; m[`abs_${h}`] = Math.abs(sig); m[`rr_${h}`] = rs(i0, i0 + n); m[`mr_${h}`] = (hi - lo) / atr;
    m[`mfeL_${h}`] = (hi - o) / atr; m[`maeL_${h}`] = (o - lo) / atr;
    if (dir !== 0) { m[`pers_${h}`] = Math.sign(sig) === dir ? 1 : 0; m[`fullrev_${h}`] = Math.sign(sig) === -dir ? 1 : 0; }
  }
  // FOMC segments
  m.rr_seg_0_30 = m.rr_30; m.rr_seg_30_90 = rs(i0 + 2, i0 + 6); m.signed_seg_30_90 = (B15[i0 + 5].close - B15[i0 + 2].open) / atr; m.abs_seg_30_90 = Math.abs(m.signed_seg_30_90);
  if (dir !== 0) {
    const c0 = B15[i0].close;
    m.cont_15 = dir * (B15[i0 + 1].close - c0) / atr; m.cont_30 = dir * (B15[i0 + 2].close - c0) / atr; m.cont_60 = dir * (B15[i0 + 4].close - c0) / atr;
    let adv = 0; for (let k = i0 + 1; k <= i0 + 4; k++) adv = Math.max(adv, dir === 1 ? (c0 - B15[k].low) : (B15[k].high - c0));
    m.retrace_60 = m.bar0_disp > 0 ? (adv / atr) / m.bar0_disp : null;
    m.second_leg = m.fullrev_60 ? (Math.sign(m.signed_240) === -dir ? 1 : 0) : null;
  }
  let best = 0, bk = 1; for (let k = 1; k <= 16; k++) { const v = Math.abs(B15[i0 + k - 1].close - o); if (v > best) { best = v; bk = k; } } m.t_peak_240 = 15 * bk;
  m.rangeSeq = []; for (let k = 0; k <= 16; k++) m.rangeSeq.push((B15[i0 + k].high - B15[i0 + k].low) / atr);
  return m;
}

// ---------------- matched controls ----------------
function controlsFor(e, allowHoldout) {
  const [hh, mm] = e.et_time.split(':').map(Number); const out = [];
  const d0 = new Date(e.date + 'T00:00:00Z');
  for (let dd = -42; dd <= 42; dd += 7) { // same weekday
    if (dd === 0) continue;
    const d = new Date(d0.getTime() + dd * 86400000); const ds = d.toISOString().slice(0, 10);
    const sec = Date.parse(etToUtc(ds, hh, mm).iso) / 1000;
    if (!allowHoldout && sec >= HOLDOUT_START) continue;
    if (nearListed(sec, null)) continue;
    const i = idx15.get(sec); if (i === undefined) continue;
    const m = measure15(i); if (m) out.push(m);
  }
  return out;
}

// ---------------- statistics ----------------
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
let seed = 20260926; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
function boot(vals, fn, R = 2000) { const n = vals.length, out = []; for (let r = 0; r < R; r++) { const s = []; for (let i = 0; i < n; i++) s.push(vals[Math.floor(rnd() * n)]); out.push(fn(s)); } out.sort((a, b) => a - b); return { lo: out[Math.floor(0.025 * R)], hi: out[Math.floor(0.975 * R)], arr: out }; }
const wilson = (k, n) => { if (!n) return null; const p = k / n, z = 1.96; const den = 1 + z * z / n; const c = (p + z * z / (2 * n)) / den; const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den; return [+(c - h).toFixed(3), +(c + h).toFixed(3)]; };
const r3 = x => (x === null || x === undefined || Number.isNaN(x)) ? null : +x.toFixed(3);

function stat(pairs, key, { ratio = false, prob = false } = {}) {
  // pairs: [{ev: measure, ctrlMean: number|null, ctrlVals: []}] for a metric
  const rows = pairs.filter(p => p.ev[key] !== undefined && p.ev[key] !== null && Number.isFinite(p.ev[key]));
  if (!rows.length) return null;
  const ev = rows.map(p => p.ev[key]); const out = { n: rows.length, mean: r3(mean(ev)), median: r3(median(ev)) };
  const b = boot(ev, mean); out.ci95 = [r3(b.lo), r3(b.hi)];
  if (prob) { const k = ev.reduce((a, v) => a + v, 0); out.p = r3(k / ev.length); out.wilson = wilson(k, ev.length); }
  const withC = rows.filter(p => p.ctrl[key] !== null && p.ctrl[key] !== undefined);
  if (withC.length >= 4) {
    const cm = withC.map(p => p.ctrl[key]); out.ctrl_mean = r3(mean(cm)); out.n_with_ctrl = withC.length;
    if (ratio) {
      const R = withC.map((p, i) => ({ e: p.ev[key], c: cm[i] }));
      const rb = boot(R, s => mean(s.map(x => x.e)) / mean(s.map(x => x.c)));
      out.ratio = r3(mean(R.map(x => x.e)) / mean(cm)); out.ratio_ci95 = [r3(rb.lo), r3(rb.hi)]; out.p_ratio_le_1 = r3(rb.arr.filter(v => v <= 1).length / rb.arr.length);
    } else {
      const D = withC.map((p, i) => p.ev[key] - cm[i]); const db = boot(D, mean);
      out.diff = r3(mean(D)); out.diff_ci95 = [r3(db.lo), r3(db.hi)]; out.p_diff_le_0 = r3(db.arr.filter(v => v <= 0).length / db.arr.length);
    }
  }
  // outlier panel
  if (ev.length >= 8) { const s = [...ev].sort((a, b) => Math.abs(b) - Math.abs(a)); out.mean_no_top1 = r3(mean(s.slice(1))); const q = [...ev].sort((a, b) => a - b); const lo = q[Math.floor(0.05 * q.length)], hi = q[Math.floor(0.95 * q.length)]; out.mean_winsor = r3(mean(ev.map(v => Math.min(hi, Math.max(lo, v))))); }
  return out;
}

const METRICS = {
  ratio: ['pre_rr_60_30', 'pre_rr_30_15', 'pre_rr_15_0', 'pre_rr_60_0', 'pre_abs_60_0', 'bar0_disp', 'bar0_range', 'abs_15', 'abs_30', 'abs_60', 'abs_120', 'abs_240', 'rr_15', 'rr_30', 'rr_60', 'rr_120', 'rr_240', 'mr_60', 'mr_240', 'mfeL_60', 'maeL_60', 'mfeL_240', 'maeL_240', 'rr_seg_0_30', 'rr_seg_30_90', 'abs_seg_30_90', 't_peak_240'],
  diff: ['signed_15', 'signed_30', 'signed_60', 'signed_120', 'signed_240', 'signed_seg_30_90', 'cont_15', 'cont_30', 'cont_60', 'retrace_60'],
  prob: ['pers_30', 'pers_60', 'pers_120', 'pers_240', 'fullrev_60', 'fullrev_120', 'second_leg'],
};

function summarize(events) {
  const pairs = events.map(e => e.pair).filter(Boolean);
  const S = { n_events: events.length, n_with_controls: pairs.filter(p => p.ctrlN >= 4).length, n_contaminated: events.filter(e => e.contaminated).length };
  for (const k of METRICS.ratio) S[k] = stat(pairs, k, { ratio: true });
  for (const k of METRICS.diff) S[k] = stat(pairs, k);
  for (const k of METRICS.prob) S[k] = stat(pairs, k, { prob: true });
  // signed_60 positive share
  const s60 = pairs.map(p => p.ev.signed_60).filter(Number.isFinite); if (s60.length) { const k = s60.filter(v => v > 0).length; S.p_pos_60 = { p: r3(k / s60.length), wilson: wilson(k, s60.length), n: s60.length }; }
  // matched-control continuation probability (control's own first-bar continuation)
  const cc = pairs.flatMap(p => p.ctrlVals.map(c => c.cont_60).filter(Number.isFinite)); if (cc.length) S.ctrl_cont_60_p = r3(cc.filter(v => v > 0).length / cc.length);
  const cr = pairs.flatMap(p => p.ctrlVals.map(c => c.fullrev_60).filter(v => v !== undefined)); if (cr.length) S.ctrl_fullrev_60_p = r3(mean(cr));
  // volatility normalisation: first bar k>=1 with range <= 1.5 x control median for slot k
  const norm = []; for (const p of pairs) { if (p.ctrlN < 4) continue; let found = null; for (let k = 1; k <= 16; k++) { const cm = median(p.ctrlVals.map(c => c.rangeSeq[k])); if (p.ev.rangeSeq[k] <= 1.5 * cm) { found = 15 * k; break; } } norm.push(found ?? 255); }
  if (norm.length) S.vol_normalization_min = { n: norm.length, median: median(norm), mean: r3(mean(norm)), share_not_within_240: r3(norm.filter(v => v === 255).length / norm.length) };
  // pre-compression -> expansion link (Spearman between pre_rr_60_0 ratio and rr_60 ratio)
  const xy = pairs.filter(p => p.ctrlN >= 4).map(p => [p.ev.pre_rr_60_0 / p.ctrl.pre_rr_60_0, p.ev.rr_60 / p.ctrl.rr_60]);
  if (xy.length >= 10) S.spearman_precomp_vs_post60 = spearman(xy);
  return S;
}
function rank(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); for (let i = 0; i < idx.length; i++) r[idx[i][1]] = i + 1; return r; }
function spearman(xy) { const x = rank(xy.map(p => p[0])), y = rank(xy.map(p => p[1])); const n = x.length; let d2 = 0; for (let i = 0; i < n; i++) d2 += (x[i] - y[i]) ** 2; const rho = 1 - 6 * d2 / (n * (n * n - 1)); let ge = 0; const P = 2000; const ys = xy.map(p => p[1]); for (let r = 0; r < P; r++) { const sh = [...ys]; for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; } const yr = rank(sh); let dd = 0; for (let i = 0; i < n; i++) dd += (x[i] - yr[i]) ** 2; const rr = 1 - 6 * dd / (n * (n * n - 1)); if (Math.abs(rr) >= Math.abs(rho)) ge++; } return { n, rho: r3(rho), perm_p: r3(ge / P) }; }

// ---------------- build pairs ----------------
function buildPairs(events, allowHoldout) {
  for (const e of events) {
    const i0 = idx15.get(e.sec); const m = i0 !== undefined ? measure15(i0) : null; if (!m) { e.pair = null; continue; }
    const ctrls = controlsFor(e, allowHoldout); const ctrl = {};
    if (ctrls.length >= 4) for (const k of [...METRICS.ratio, ...METRICS.diff, ...METRICS.prob]) { const v = ctrls.map(c => c[k]).filter(x => x !== null && x !== undefined && Number.isFinite(x)); ctrl[k] = v.length ? mean(v) : null; } else for (const k of [...METRICS.ratio, ...METRICS.diff, ...METRICS.prob]) ctrl[k] = null;
    e.pair = { ev: m, ctrl, ctrlVals: ctrls, ctrlN: ctrls.length };
  }
}

const FAMILIES = ['CPI', 'NFP', 'PPI', 'JOLTS', 'FOMC', 'PCE', 'GDP_ADV', 'USD_0830'];
const famEvents = (fam, region) => {
  if (fam === 'USD_0830') { const seen = new Set(); return EV.filter(e => e.region === region && e.et_time === '8:30' && ['CPI', 'NFP', 'PPI', 'PCE', 'GDP_ADV'].includes(e.family)).filter(e => { if (seen.has(e.sec)) return false; seen.add(e.sec); return true; }); }
  return EV.filter(e => e.region === region && e.family === fam && !e.contaminated);
};

// ---------------- gates ----------------
function gate(type, D, V) {
  const g = { type, pass: false, reasons: [] };
  if (!D || !V) { g.reasons.push('missing region'); return g; }
  const minD = ['VOL', 'PRECOMP', 'SAFETY'].includes(type) ? 15 : 30, minV = ['VOL', 'PRECOMP', 'SAFETY'].includes(type) ? 8 : 15;
  if (D.n_with_controls < minD || V.n_with_controls < minV) { g.reasons.push(`N below minimum (disc ${D.n_with_controls} / val ${V.n_with_controls})`); g.inconclusive = true; return g; }
  const ok = (c, why) => { if (!c) g.reasons.push(why); return c; };
  let pass = true;
  if (type === 'VOL') { const d = D.rr_60, v = V.rr_60; pass = ok(d.ratio >= 1.5 && d.ratio_ci95[0] > 1, `disc rr_60 ratio ${d.ratio} ci ${d.ratio_ci95}`) & ok(v.ratio >= 1.5 && v.ratio_ci95[0] > 1, `val rr_60 ratio ${v.ratio} ci ${v.ratio_ci95}`); }
  if (type === 'PRECOMP') { const d = D.pre_rr_60_0, v = V.pre_rr_60_0; pass = ok(d.ratio <= 0.85 && d.ratio_ci95[1] < 1, `disc pre ratio ${d.ratio} ci ${d.ratio_ci95}`) & ok(v.ratio <= 0.85 && v.ratio_ci95[1] < 1, `val pre ratio ${v.ratio} ci ${v.ratio_ci95}`); }
  if (type === 'CONT') { const d = D.cont_60, v = V.cont_60, dp = D.pers_60, vp = V.pers_60; const dP = D.cont_60 ? r3(D.cont_60.n && D.pairsPos60) : null;
    pass = ok(D.cont_p60 >= 0.58 && D.cont_p60_wilson[0] > 0.5, `disc P(cont60) ${D.cont_p60} wilson ${D.cont_p60_wilson}`) & ok(d.mean >= 0.15 && d.ci95[0] > 0, `disc cont_60 mean ${d.mean} ci ${d.ci95}`) & ok(V.cont_p60 >= 0.55 && v.mean > 0, `val P(cont60) ${V.cont_p60} mean ${v.mean}`) & ok(D.cont_p60 - D.ctrl_cont_60_p >= 0.05 && V.cont_p60 - V.ctrl_cont_60_p >= 0.05, `vs control disc ${D.cont_p60}-${D.ctrl_cont_60_p} val ${V.cont_p60}-${V.ctrl_cont_60_p}`); void dp; void vp; void dP; }
  if (type === 'REV') { const d = D.fullrev_60, v = V.fullrev_60, dm = D.cont_60, vm = V.cont_60;
    pass = ok(d.p >= 0.55 && d.wilson[0] > 0.5, `disc P(fullrev60) ${d.p} wilson ${d.wilson}`) & ok(-dm.mean >= 0.15 && dm.ci95[1] < 0, `disc move against initial ${-dm.mean} ci ${dm.ci95}`) & ok(v.p >= 0.52 && -vm.mean > 0, `val P(fullrev60) ${v.p} mean against ${-vm.mean}`) & ok(d.p - D.ctrl_fullrev_60_p >= 0.05 && v.p - V.ctrl_fullrev_60_p >= 0.05, `vs control disc ${d.p}-${D.ctrl_fullrev_60_p} val ${v.p}-${V.ctrl_fullrev_60_p}`); }
  if (type === 'DIR') { const d = D.signed_60, v = V.signed_60; const sgn = Math.sign(d.mean);
    pass = ok(d.ci95[0] * d.ci95[1] > 0, `disc signed_60 ${d.mean} ci ${d.ci95}`) & ok(Math.sign(v.mean) === sgn && v.ci95[0] * v.ci95[1] > 0, `val signed_60 ${v.mean} ci ${v.ci95}`) & ok((sgn > 0 ? D.p_pos_60.p : 1 - D.p_pos_60.p) >= 0.58 && (sgn > 0 ? V.p_pos_60.p : 1 - V.p_pos_60.p) >= 0.58, `P(sign) disc ${D.p_pos_60.p} val ${V.p_pos_60.p}`); }
  if (type === 'SAFETY') { const d = D.bar0_range, v = V.bar0_range; pass = ok(d.ratio >= 3 && d.ratio_ci95[0] > 1, `disc bar0 range ratio ${d.ratio}`) & ok(v.ratio >= 3 && v.ratio_ci95[0] > 1, `val bar0 range ratio ${v.ratio}`); }
  g.pass = !!pass; return g;
}

// ---------------- run ----------------
const R = { generated_at: new Date().toISOString(), regions: REG, families: {}, gates: {}, candidates_validation_pass: [], holdout_opened: false, holdout: {}, by_year: {}, fivemin: {}, spread_1m: {} };
for (const fam of FAMILIES) {
  R.families[fam] = {};
  for (const region of ['DISCOVERY', 'VALIDATION']) {
    const evs = famEvents(fam, region); buildPairs(evs, false);
    const S = summarize(evs);
    const c60 = evs.map(e => e.pair?.ev.cont_60).filter(Number.isFinite); S.cont_p60 = c60.length ? r3(c60.filter(v => v > 0).length / c60.length) : null; S.cont_p60_wilson = c60.length ? wilson(c60.filter(v => v > 0).length, c60.length) : null;
    R.families[fam][region] = S;
    // year panel
    for (const y of [...new Set(evs.map(e => e.year))]) { const ye = evs.filter(e => e.year === y && e.pair && e.pair.ctrlN >= 4); if (ye.length < 3) continue; const pr = ye.map(e => e.pair); const yr = { n: ye.length }; yr.rr_60_ratio = r3(mean(pr.map(p => p.ev.rr_60)) / mean(pr.map(p => p.ctrl.rr_60))); yr.pre_rr_60_0_ratio = r3(mean(pr.map(p => p.ev.pre_rr_60_0)) / mean(pr.map(p => p.ctrl.pre_rr_60_0))); const c = pr.map(p => p.ev.cont_60).filter(Number.isFinite); yr.cont_60_mean = c.length ? r3(mean(c)) : null; yr.cont_60_p = c.length ? r3(c.filter(v => v > 0).length / c.length) : null; yr.signed_60_mean = r3(mean(pr.map(p => p.ev.signed_60))); yr.fullrev_60_p = r3(mean(pr.map(p => p.ev.fullrev_60).filter(v => v !== undefined))); (R.by_year[fam] ||= {})[y] = yr; }
  }
  R.gates[fam] = {};
  for (const t of ['VOL', 'PRECOMP', 'CONT', 'REV', 'DIR', 'SAFETY']) { const g = gate(t, R.families[fam].DISCOVERY, R.families[fam].VALIDATION); R.gates[fam][t] = g; if (g.pass) { const name = `${t}_${fam}`; fs.writeFileSync(`${DIR}/validation_pass_${name}.json`, JSON.stringify({ candidate: name, written_at: new Date().toISOString(), gate: g, discovery: R.families[fam].DISCOVERY[t === 'VOL' ? 'rr_60' : t === 'PRECOMP' ? 'pre_rr_60_0' : t === 'CONT' ? 'cont_60' : t === 'REV' ? 'fullrev_60' : t === 'DIR' ? 'signed_60' : 'bar0_range'], validation: R.families[fam].VALIDATION[t === 'VOL' ? 'rr_60' : t === 'PRECOMP' ? 'pre_rr_60_0' : t === 'CONT' ? 'cont_60' : t === 'REV' ? 'fullrev_60' : t === 'DIR' ? 'signed_60' : 'bar0_range'] }, null, 1)); R.candidates_validation_pass.push(name); } }
}
// pre-compression -> expansion link gate (reported per family; requires PRECOMP-type N)
for (const fam of FAMILIES) { const D = R.families[fam].DISCOVERY?.spearman_precomp_vs_post60, V = R.families[fam].VALIDATION?.spearman_precomp_vs_post60; R.gates[fam].PRECOMP_LINK = { discovery: D || null, validation: V || null, pass: !!(D && V && Math.sign(D.rho) === Math.sign(V.rho) && Math.abs(D.rho) >= 0.25 && Math.abs(V.rho) >= 0.25 && D.perm_p < 0.05) }; }

// ---------------- holdout guard ----------------
const artifacts = fs.readdirSync(DIR).filter(f => /^validation_pass_.+\.json$/.test(f));
if (artifacts.length) {
  R.holdout_opened = true;
  for (const f of artifacts) { const name = f.replace(/^validation_pass_/, '').replace(/\.json$/, ''); const [type, ...rest] = name.split('_'); const fam = rest.join('_'); const evs = famEvents(fam, 'HOLDOUT'); buildPairs(evs, true); const S = summarize(evs); const c60 = evs.map(e => e.pair?.ev.cont_60).filter(Number.isFinite); S.cont_p60 = c60.length ? r3(c60.filter(v => v > 0).length / c60.length) : null; R.holdout[name] = { type, family: fam, n: evs.length, summary: S }; }
} else R.holdout_note = 'No validation-pass artifact exists; holdout not computed for any candidate (protocol §4).';

// ---------------- 5m sub-study (validation-region dates only unless holdout opened) ----------------
{
  const lim = R.holdout_opened ? '2026-12-31' : '2025-08-31';
  const evs = EV.filter(e => e.date >= '2025-05-07' && e.date <= lim && idx5.has(e.sec));
  const m5 = (i0) => { if (i0 < 300 || i0 + 13 >= B5.length) return null; let s = 0; for (let k = i0 - 291; k <= i0 - 4; k++) s += tr(B5, k); const atr = s / 288; if (!(atr > 0)) return null; const o = B5[i0].open, dir = Math.sign(B5[i0].close - o), c0 = B5[i0].close; const rs = (a, b) => { let x = 0; for (let k = a; k < b; k++) x += tr(B5, k); return x / atr; }; const r = { pre_rr_15_5: rs(i0 - 3, i0 - 1), pre_rr_5_0: rs(i0 - 1, i0), bar0_disp: Math.abs(c0 - o) / atr, bar0_range: (B5[i0].high - B5[i0].low) / atr, abs_5: Math.abs(c0 - o) / atr, rr_15: rs(i0, i0 + 3), rr_60: rs(i0, i0 + 12), dir }; if (dir !== 0) { r.cont_5 = dir * (B5[i0 + 1].close - c0) / atr; r.cont_10 = dir * (B5[i0 + 2].close - c0) / atr; r.cont_15 = dir * (B5[i0 + 3].close - c0) / atr; r.cont_30 = dir * (B5[i0 + 6].close - c0) / atr; r.cont_60 = dir * (B5[i0 + 12].close - c0) / atr; r.fullrev_60 = Math.sign(B5[i0 + 12].close - o) === -dir ? 1 : 0; } return r; };
  const rows = []; for (const e of evs) { const m = m5(idx5.get(e.sec)); if (!m) continue; const [hh, mm] = e.et_time.split(':').map(Number); const ctr = []; const d0 = new Date(e.date + 'T00:00:00Z'); for (let dd = -42; dd <= 42; dd += 7) { if (!dd) continue; const ds = new Date(d0.getTime() + dd * 86400000).toISOString().slice(0, 10); if (ds > lim) continue; const sec = Date.parse(etToUtc(ds, hh, mm).iso) / 1000; if (nearListed(sec, null)) continue; const i = idx5.get(sec); if (i === undefined) continue; const c = m5(i); if (c) ctr.push(c); } rows.push({ family: e.family, m, ctr }); }
  const agg = (key, prob) => { const rr = rows.filter(r => Number.isFinite(r.m[key]) && r.ctr.length >= 4); if (rr.length < 5) return null; const ev = rr.map(r => r.m[key]); const cm = rr.map(r => mean(r.ctr.map(c => c[key]).filter(Number.isFinite))); const o = { n: rr.length, mean: r3(mean(ev)), ctrl_mean: r3(mean(cm)), ci95: (b => [r3(b.lo), r3(b.hi)])(boot(ev, mean)) }; if (prob) o.p = r3(mean(ev)); else o.ratio = r3(mean(ev) / mean(cm)); if (key.startsWith('cont')) { o.p_pos = r3(ev.filter(v => v > 0).length / ev.length); const cc = rr.flatMap(r => r.ctr.map(c => c[key]).filter(Number.isFinite)); o.ctrl_p_pos = r3(cc.filter(v => v > 0).length / cc.length); } return o; };
  R.fivemin = { window: `2025-05-07 → ${lim}`, n_events: rows.length, families: Object.fromEntries(Object.entries(rows.reduce((a, r) => (a[r.family] = (a[r.family] || 0) + 1, a), {}))), pooled: {} };
  for (const k of ['pre_rr_15_5', 'pre_rr_5_0', 'bar0_disp', 'bar0_range', 'abs_5', 'rr_15', 'rr_60', 'cont_5', 'cont_10', 'cont_15', 'cont_30', 'cont_60']) R.fivemin.pooled[k] = agg(k, false);
  R.fivemin.pooled.fullrev_60 = agg('fullrev_60', true);
}

// ---------------- 1m spread description (spread column only; executability) ----------------
{
  const M1 = JSON.parse(fs.readFileSync(`${DIR}/xauusdm_m1_recent.json`, 'utf8')).bars; const i1 = new Map(M1.map((b, i) => [b[0], i]));
  const evs = EV.filter(e => i1.has(e.sec)); const out = {}; const OFF = [-5, -1, 0, 1, 2, 5, 10, 30];
  for (const e of evs) { const i0 = i1.get(e.sec); const [hh, mm] = e.et_time.split(':').map(Number); const ctr = []; const d0 = new Date(e.date + 'T00:00:00Z'); for (let dd = -28; dd <= 28; dd += 7) { if (!dd) continue; const ds = new Date(d0.getTime() + dd * 86400000).toISOString().slice(0, 10); const sec = Date.parse(etToUtc(ds, hh, mm).iso) / 1000; if (nearListed(sec, null)) continue; const j = i1.get(sec); if (j !== undefined) ctr.push(j); } if (ctr.length < 2) continue; const row = { family: e.family, date: e.date, spread_points: {}, ctrl_median_points: {} }; for (const o of OFF) { row.spread_points[o] = M1[i0 + o]?.[6] ?? null; row.ctrl_median_points[o] = median(ctr.map(j => M1[j + o]?.[6]).filter(Number.isFinite)); } (out[e.family] ||= []).push(row); }
  R.spread_1m = { note: 'spread column of 1m bars (points, 0.001 USD) at the release minute and around it vs same-weekday same-clock-time controls; price returns not used; 2026-06-26 → 2026-09-25', families: {} };
  for (const [fam, rows] of Object.entries(out)) { const s = { n: rows.length, ratio_by_offset: {} }; for (const o of OFF) { const r = rows.map(x => x.spread_points[o] / x.ctrl_median_points[o]).filter(Number.isFinite); s.ratio_by_offset[o] = r.length ? { median_ratio: r3(median(r)), max_ratio: r3(Math.max(...r)), median_points: median(rows.map(x => x.spread_points[o]).filter(Number.isFinite)) } : null; } R.spread_1m.families[fam] = s; }
}

fs.writeFileSync(`${DIR}/v5_results.json`, JSON.stringify(R, null, 1));
console.log('done; candidates passing validation:', R.candidates_validation_pass, 'holdout_opened:', R.holdout_opened);
