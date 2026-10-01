/** V8 -- explains the single residual mirror mismatch of SYMPROBE: rebuilds SYMPROBE on top of the D1-corrected engine and re-tests that bar. */
import { readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const REPO = join(ROOT, '..', '..');
const sym = JSON.parse(readFileSync(join(ROOT, 'results', 'symmetry.json'), 'utf8')); const ex = sym.engines.SYMPROBE.examples;
const mk = (from, to) => { if (existsSync(to)) return; cpSync(from, to, { recursive: true }); const f = (p, a, b) => { const t = readFileSync(p, 'utf8'); if (t.split(a).length !== 2) throw new Error('anchor ' + p); writeFileSync(p, t.replace(a, b)); };
  f(join(to, 'engine', 'regime.js'), '(v !== null && closes[i] ? (v / closes[i]) * 100 : null)', '(v !== null ? v : null)'); f(join(to, 'engine', 'math.js'), '(upper[i] - lower[i]) / basis[i]', '(upper[i] - lower[i])'); f(join(to, 'engine', 'structure.js'), 'const tol = piv.price * (STRUCTURE_PARAMS.sweepTolerancePct / 100);', 'const tol = 2.0;'); };
mk(join(ROOT, 'engines', 'D1'), join(ROOT, 'engines', 'SYMPROBE_D1'));
const BARS = JSON.parse(readFileSync(join(REPO, 'handoff', 'edge_discovery_lab', 'data', 'XAUUSDm_bars.json'), 'utf8')); const b5 = BARS['5m'];
const P = (d) => pathToFileURL(join(ROOT, 'engines', d, 'engine', 'structure.js')).href;
const { computeStructure: prodS, findPivots } = await import(P('SYMPROBE')); const { computeStructure: fixS } = await import(P('SYMPROBE_D1'));
const mirror = (bars, K) => bars.map((b) => ({ ...b, open: K - b.open, high: K - b.low, low: K - b.high, close: K - b.close }));
const out = [];
for (const e of ex) { const i = e.i; const w = b5.slice(Math.max(0, i - 498), i + 1); const K = 2 * Math.round(b5[i].close); const m = mirror(w, K);
  const piv = findPivots(w, 5, 5); const both = [...new Set(piv.map((p) => p.index))].filter((x) => piv.filter((p) => p.index === x).length === 2);
  out.push({ i, t: e.t, bars_that_are_both_pivot_high_and_low: both.length, production_original: prodS(w).state, production_mirrored: prodS(m).state, d1_original: fixS(w).state, d1_mirrored: fixS(m).state }); }
writeFileSync(join(ROOT, 'results', 'symmetry_residual.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
