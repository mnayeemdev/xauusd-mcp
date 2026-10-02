/**
 * V15 LIVE DATA TEST -- read-only quote observation (RESEARCH ONLY). Uses the existing read-only shadow reader protocol
 * (src/shadow/mt5Reader.js -> mt5/mt5_shadow_reader.py): commands rates / tick / select / ping only. No order, position or account call.
 * Writes results/live_capture_raw.jsonl (no account identifiers) and results/live_capture_summary.json.
 *   node research/quote_integrity_v15/scripts/live_capture.mjs [seconds=180] [intervalMs=250]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createMt5Reader } from '../../../src/shadow/mt5Reader.js';
import { buildQuote, validateQuote, estimateServerOffsetMs, TECHNICAL_SCENARIOS_MS } from './quote.mjs';
import { PRODUCTION_MAX_QUOTE_AGE_MS } from './live_gate.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'results'); mkdirSync(OUT, { recursive: true });
const SECONDS = Number(process.argv[2] ?? 180), INTERVAL = Number(process.argv[3] ?? 250); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const reader = createMt5Reader({ log: () => {} }); const hello = await reader.start(); await reader.select('XAUUSDm').catch(() => null);
const raw = []; const t0 = Date.now();
try {
  while (Date.now() - t0 < SECONDS * 1000) { const req = Date.now(); let resp = null, err = null; try { resp = await reader.tick('XAUUSDm'); } catch (e) { err = e.message; } const nodeRecv = Date.now();
    raw.push({ request_ms: req, node_received_ms: nodeRecv, py_received_ms: resp?.received_ms ?? null, ok: !!resp?.ok, tick: resp?.tick ?? null, error: err }); await sleep(INTERVAL); }
  const bars = await reader.rates('XAUUSDm', '5m', 3).catch(() => null); raw.push({ candle_reference: bars?.ok ? bars.bars.map((b) => ({ time: b.time, close: b.close })) : null, at_ms: Date.now() });
} finally { await reader.stop(); }

const obs = raw.filter((x) => x.request_ms != null);
const offset = estimateServerOffsetMs(obs.filter((x) => x.tick).map((x) => ({ quote_timestamp_ms: x.tick.time_msc, received_ms: x.py_received_ms })));
let prev = null; const rows = []; for (const x of obs) { const q = buildQuote({ symbol: 'XAUUSDm', tick: x.tick, receivedMs: x.py_received_ms, decisionMs: x.node_received_ms, serverUtcOffsetMs: offset, offsetSource: 'live calibration: median(time_msc - received) rounded to 15 min' }); const v = validateQuote(q, { prev, maxAgeMs: PRODUCTION_MAX_QUOTE_AGE_MS }); rows.push({ q, v, newTick: prev ? q.quote_timestamp_ms !== prev.quote_timestamp_ms : true }); if (v.status === 'VALID' || v.status === 'STALE') prev = q; }
const ages = rows.filter((r) => typeof r.q.quote_age_ms === 'number').map((r) => r.q.quote_age_ms); const lat = obs.filter((x) => x.py_received_ms != null).map((x) => x.node_received_ms - x.py_received_ms);
const recvMinusTick = obs.filter((x) => x.tick).map((x) => x.py_received_ms - (x.tick.time_msc - offset)); const distinctTicks = new Set(obs.filter((x) => x.tick).map((x) => x.tick.time_msc)).size; const durS = (obs.at(-1).node_received_ms - obs[0].request_ms) / 1000;
const secConsistent = obs.filter((x) => x.tick).every((x) => Math.floor(x.tick.time_msc / 1000) === x.tick.time); const cand = raw.find((x) => x.candle_reference)?.candle_reference ?? null;
const summary = { captured_utc: new Date(t0).toISOString(), duration_s: Math.round(durS), interval_ms: INTERVAL, reader_read_only: hello?.read_only === true, observations: obs.length, ok: obs.filter((x) => x.ok).length, errors: obs.filter((x) => x.error).length,
  quote_timestamp_captured: obs.filter((x) => x.tick && Number.isFinite(x.tick.time_msc)).length, quote_timestamp_capture_share: obs.filter((x) => x.tick && Number.isFinite(x.tick.time_msc)).length / obs.length, time_s_consistent_with_time_msc: secConsistent,
  server_utc_offset_ms: offset, receive_minus_quote_ms: { min: Math.min(...recvMinusTick), p50: pct(recvMinusTick, 0.5), p99: pct(recvMinusTick, 0.99), max: Math.max(...recvMinusTick) },
  quote_age_ms: { n: ages.length, min: Math.min(...ages), p10: pct(ages, 0.1), p50: pct(ages, 0.5), p90: pct(ages, 0.9), p99: pct(ages, 0.99), max: Math.max(...ages) }, negative_ages: ages.filter((a) => a < 0).length,
  ipc_latency_ms: { p50: pct(lat, 0.5), p99: pct(lat, 0.99), max: Math.max(...lat) }, distinct_ticks: distinctTicks, tick_updates_per_s: Math.round((distinctTicks / durS) * 100) / 100, observations_with_new_tick: rows.filter((r) => r.newTick).length, duplicates: rows.filter((r) => r.v.duplicate).length,
  validation: rows.reduce((g, r) => { const k = r.v.status + (r.v.primary ? `:${r.v.primary}` : ''); g[k] = (g[k] ?? 0) + 1; return g; }, {}), out_of_order: rows.filter((r) => r.v.reasons.includes('OUT_OF_ORDER')).length,
  spread: { min: Math.min(...rows.filter((r) => typeof r.q.spread === 'number').map((r) => r.q.spread)), p50: pct(rows.filter((r) => typeof r.q.spread === 'number').map((r) => r.q.spread), 0.5), max: Math.max(...rows.filter((r) => typeof r.q.spread === 'number').map((r) => r.q.spread)), negative: rows.filter((r) => typeof r.q.spread === 'number' && r.q.spread < 0).length },
  technical_scenarios: Object.fromEntries(TECHNICAL_SCENARIOS_MS.map((t) => [t, Math.round((ages.filter((a) => a <= t).length / Math.max(1, ages.length)) * 10000) / 10000])), production_limit_ms: PRODUCTION_MAX_QUOTE_AGE_MS, within_production_limit: ages.filter((a) => a <= PRODUCTION_MAX_QUOTE_AGE_MS).length,
  candle_reference: cand, note_candle_vs_quote: 'candle time = bar OPEN time in seconds (server clock); it is never used as a quote timestamp' };
writeFileSync(join(OUT, 'live_capture_raw.jsonl'), obs.map((x) => JSON.stringify(x)).join('\n') + '\n'); writeFileSync(join(OUT, 'live_capture_summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
