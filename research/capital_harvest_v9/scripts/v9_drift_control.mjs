/**
 * V9 diagnostic -- is the RUN_TO_END (structural stop only, 288-bar horizon) result a property of the entries or of market drift?
 * Same entry bars and the same risk distance under: actual side, opposite side (SL mirrored), seeded random side, and BUY-only /
 * SELL-only. Research only; descriptive; no policy is selected from it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { features, simulateTrade, COSTS } from './harvest.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const REPO = join(ROOT, '..', '..');
const b5 = JSON.parse(readFileSync(join(REPO, 'handoff', 'edge_discovery_lab', 'data', 'XAUUSDm_bars.json'), 'utf8'))['5m']; const F = features(b5);
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10); const split = (t) => { const d = day(t); return d >= '2025-05-07' && d <= '2025-12-31' ? 'DEV' : d >= '2026-01-01' && d <= '2026-09-29' ? 'HOLD' : 'X'; };
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000); const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
let s = 777 >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const out = {};
for (const S of ['DEV', 'HOLD']) {
  const T = []; for (const l of readFileSync(join(REPO, 'research', 'core_pattern_audit_v8', 'results', 'rows', `ALL_${S}.jsonl`), 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l); if (r.act !== 'BUY' && r.act !== 'SELL') continue; T.push({ i: r.i, t: r.t, side: r.act, entry: r.g.e, sl: r.g.sl }); }
  const evalSet = (trades, pol) => { const R = trades.map((t) => simulateTrade(b5, F, t, pol, COSTS.normal)).filter((o) => o.status !== 'NO_DATA' && o.status !== 'INVALID').map((o) => o.r); const w = R.filter((x) => x > 0), l = R.filter((x) => x <= 0); return { n: R.length, expectancy_r: r3(mean(R)), win_rate: r3(w.length / Math.max(1, R.length)), pf: l.length ? r3(w.reduce((a, b) => a + b, 0) / -l.reduce((a, b) => a + b, 0)) : null }; };
  const flip = (t) => { const R = Math.abs(t.entry - t.sl); const side = t.side === 'BUY' ? 'SELL' : 'BUY'; return { ...t, side, sl: side === 'BUY' ? t.entry - R : t.entry + R }; };
  const randomSide = T.map((t) => (rnd() < 0.5 ? t : flip(t)));
  const RUN = { kind: 'RUN_TO_END' }, BASE = { kind: 'BASELINE' };
  const rec = {}; for (const [name, set] of [['actual', T], ['opposite_side', T.map(flip)], ['random_side', randomSide], ['actual_BUY_only', T.filter((t) => t.side === 'BUY')], ['actual_SELL_only', T.filter((t) => t.side === 'SELL')], ['all_entries_as_BUY', T.map((t) => (t.side === 'BUY' ? t : flip(t)))], ['all_entries_as_SELL', T.map((t) => (t.side === 'SELL' ? t : flip(t)))]]) rec[name] = { run_to_end: evalSet(set, RUN), fixed_170r: evalSet(set, BASE) };
  const first = b5.find((b) => split(b.time) === S), last = [...b5].reverse().find((b) => split(b.time) === S); rec.market_move = { first_close: first.close, last_close: last.close, change_pct: r3((last.close / first.close - 1) * 100) };
  out[S] = rec;
}
writeFileSync(join(ROOT, 'results', 'v9_drift_control.json'), JSON.stringify({ generated_utc: new Date().toISOString(), note: 'same entry bars and risk distance; RUN_TO_END = structural stop + broker fail-safe + 288-bar horizon, no target; NORMAL cost', ...out }, null, 1));
console.log(JSON.stringify(out, null, 1));
