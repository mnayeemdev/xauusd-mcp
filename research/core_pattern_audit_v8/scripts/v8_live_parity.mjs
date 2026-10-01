/**
 * V8 -- LIVE-STYLE vs RESEARCH replay parity (RESEARCH ONLY). Drives the PRODUCTION live orchestrator
 * (src/core/xauusd_calculate.js calculateEntry, intraday_5m profile) completely offline: injected bar fetcher (no CDP),
 * no-op lock, in-memory signal store (the real store file is never touched), Pine comparison off. The forming bar handed to
 * the orchestrator is deliberately GARBAGE (extreme high/low): if any decision changes, the forming bar leaked into it.
 * Compares action, wait reason, model, entry, SL, TP1, TP2, RR with the research replay rows (results/rows/CONTROL_*.jsonl).
 * Also runs the D6 research copy of the orchestrator on stale-snapshot fixtures (fail-closed check).
 *   node research/core_pattern_audit_v8/scripts/v8_live_parity.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const { calculateEntry } = await import(pathToFileURL(join(REPO, 'src', 'core', 'xauusd_calculate.js')).href);
const D6 = await import(pathToFileURL(join(ROOT, 'engines', 'D6', 'core', 'xauusd_calculate.js')).href);
const LAB = join(REPO, 'handoff', 'edge_discovery_lab', 'data');
const BARS = JSON.parse(readFileSync(join(LAB, 'XAUUSDm_bars.json'), 'utf8'));
const TFMAP = { 5: '5m', 15: '15m', 30: '30m', 60: '1H', 240: '4H' }; const TF_SEC = { '5m': 300, '15m': 900, '30m': 1800, '1H': 3600, '4H': 14400 };
const TIMES = Object.fromEntries(Object.entries(BARS).map(([k, v]) => [k, v.map((b) => b.time)]));
const ub = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };
const REQ = 500, LAG = 80; const b5 = BARS['5m'];
const iso = (t) => new Date(t * 1000).toISOString();
function rowsOf(phase) { const p = join(ROOT, 'results', 'rows', `CONTROL_${phase}.jsonl`); const m = new Map(); if (!existsSync(p)) return m; for (const l of readFileSync(p, 'utf8').split('\n')) if (l) { const r = JSON.parse(l); m.set(r.i, r); } return m; }
const ROWS = new Map([...rowsOf('DEV'), ...rowsOf('HOLD')]);
const garbage = (prev, tfSec) => { const x = prev.close; return { time: prev.time + tfSec, open: x, high: x * 1.5, low: x * 0.5, close: x * 1.2, volume: 1 }; };
function windowFor(label, T) { const sec = TF_SEC[label]; const cut = Math.floor(T / sec) * sec; const end = ub(TIMES[label], cut); const conf = BARS[label].slice(Math.max(0, end - (REQ - 1)), end); return [...conf, garbage(conf.at(-1), sec)]; }
function depsFor(i) {
  const T = b5[i].time + 300 + LAG; let tf = '5';
  return { getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '5' }), setTimeframe: async ({ timeframe }) => { tf = String(timeframe); },
    getOhlcv: async () => { const label = TFMAP[tf]; if (!label) throw new Error(`timeframe ${tf} not in the research dataset`); if (label === '5m') { const conf = b5.slice(Math.max(0, i - (REQ - 2)), i + 1); return { bars: [...conf, garbage(conf.at(-1), 300)] }; } return { bars: windowFor(label, T) }; },
    getMasterState: async () => { throw new Error('pine comparison disabled'); }, loadStore: () => ({ signals: [] }), saveStore: () => {}, storePath: join(ROOT, 'results', '.no_store.json'), cdpLockPath: join(ROOT, 'results', '.no_lock'), withCdpLock: async (_p, fn) => fn(), env: { XAUUSD_ENGINE_PROFILE: 'intraday_5m' } };
}
// sample: every bar of the last replayed week + a seeded spread over DEV/HOLD
const idx = [...ROWS.keys()].sort((a, b) => a - b); const lastWeek = idx.filter((i) => b5[i].time >= Date.parse('2026-09-22T00:00:00Z') / 1000);
let s = 20261001 >>> 0; const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const spread = new Set(); while (spread.size < 600) spread.add(idx[Math.floor(rand() * idx.length)]);
const sample = [...new Set([...lastWeek, ...spread])].sort((a, b) => a - b);
const fields = ['action', 'wait_reason', 'model', 'entry', 'stop_loss', 'tp1', 'tp2', 'rr']; const mis = Object.fromEntries(fields.map((f) => [f, 0])); const examples = []; let compared = 0, signals = 0; let keys = null;
for (const i of sample) {
  const r = ROWS.get(i); const res = await calculateEntry({ enablePineComparison: false, engineProfile: 'intraday_5m', _deps: depsFor(i) }); if (!keys) keys = Object.keys(res);
  const live = { action: res.action, wait_reason: res.action === 'WAIT' ? (res.reason ?? null) : null, model: res.setup ?? null, entry: res.entry ?? null, stop_loss: res.sl ?? null, tp1: res.tp1 ?? null, tp2: res.tp2 ?? null, rr: res.rr ?? null };
  const sig = r.act === 'BUY' || r.act === 'SELL'; if (sig) signals++;
  const research = { action: r.act, wait_reason: r.act === 'WAIT' ? r.wr : null, model: r.mdl, entry: sig ? r.g.e : null, stop_loss: sig ? r.g.sl : null, tp1: sig ? r.g.tp1 : null, tp2: sig ? r.g.tp2 : null, rr: sig ? r.g.rr : null };
  compared++; for (const f of fields) { if (!sig && ['entry', 'stop_loss', 'tp1', 'tp2', 'rr'].includes(f)) continue; if (f === 'model' && !sig) continue; if ((live[f] ?? null) !== (research[f] ?? null)) { mis[f]++; if (examples.length < 15) examples.push({ i, t: iso(b5[i].time), field: f, live: live[f], research: research[f] }); } }
}
// D6: stale 15m snapshot on the live path (production vs D6 copy). Bars are re-timed so the 5m series is fresh "now".
async function staleCase(mod, staleTf) {
  const nowSec = Math.floor(Date.now() / 1000); const i = idx[Math.floor(idx.length / 2)]; const shift = nowSec - (b5[i].time + 300 + 30);
  const T = b5[i].time + 300 + LAG; let tf = '5';
  const re = (bars, extra = 0) => bars.map((b) => ({ ...b, time: b.time + shift - extra }));
  const deps = { ...depsFor(i), setTimeframe: async ({ timeframe }) => { tf = String(timeframe); }, getOhlcv: async () => { const label = TFMAP[tf]; if (!label) throw new Error('n/a'); const raw = label === '5m' ? [...b5.slice(i - (REQ - 2), i + 1), garbage(b5[i], 300)] : windowFor(label, T); return { bars: re(raw, label === staleTf ? 4 * 3600 : 0) }; } };
  const res = await mod.calculateEntry({ enablePineComparison: false, engineProfile: 'intraday_5m', _deps: deps }); return { status: res.status ?? null, action: res.action, reason: res.reason ?? res.wait_reason ?? null, errors: res.errors ?? null };
}
const stale = { production_15m_stale_4h: await staleCase({ calculateEntry }, '15m'), d6_15m_stale_4h: await staleCase(D6, '15m'), production_fresh: await staleCase({ calculateEntry }, null), d6_fresh: await staleCase(D6, null) };
const result = { generated_utc: new Date().toISOString(), sample_bars: compared, signals_in_sample: signals, last_week_bars: lastWeek.length, mismatches: mis, examples, forming_bar: 'garbage (high x1.5, low x0.5) on every timeframe', result_keys: keys, stale_snapshot: stale, pass: Object.values(mis).every((x) => x === 0) };
writeFileSync(join(ROOT, 'results', 'live_parity.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ compared, signals, mismatches: mis, pass: result.pass, stale }, null, 1));
