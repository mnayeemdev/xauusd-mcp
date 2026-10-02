/**
 * V16 EXECUTION TIMING TOLERANCE (2026-10-02) -- deterministic tests (RESEARCH ONLY; no order code).
 * 0-6 s delays with valid / invalidated states, > 6 s expiry, no forced BUY/SELL, latest-quote execution price, structural SL never
 * moved, RR 1.70, risk firewall, risk / broker rejection, stale / missing quote, future and out-of-order timestamps, clock drift vs
 * latency, restart, duplicate signal, replay, same-input same-decision, no-lookahead, fail-closed, runner integration.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTracker, observePoll, quoteSnapshot, checkTiming, executionPrice, MAX_EXECUTION_SIGNAL_AGE_MS, DELAY_SCENARIOS_S, BEYOND_SCENARIOS_S, CONTRACT } from '../research/execution_timing_v16/scripts/timing.mjs';
import { revalidate, invariantViolations, executionGeometry, STATES, ENGINE_RULES, PRODUCTION_RULES, CONFIGS } from '../research/execution_timing_v16/scripts/revalidate.mjs';
import { runProbes, replayProbe, PROBE_DELAYS_S } from '../research/execution_timing_v16/scripts/probes.mjs';
import { scenario, VARIANTS, GRID_DELAYS_S, SIGNAL_SELL, SIGNAL_BUY } from '../research/execution_timing_v16/scripts/scenarios.mjs';
import { RR } from '../research/entry_risk_integration_v11/scripts/integrate.mjs';
import { REAL_DEFAULTS } from '../src/engine/mt5RealPolicy.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url)); const V16 = join(ROOT, 'research', 'execution_timing_v16');
const run = (variant, k, sig = SIGNAL_SELL, cfg = 'ILLUSTRATIVE_PCT_0_50_10K') => revalidate({ ...scenario(variant, k, sig), configName: cfg });
const SIGS = [SIGNAL_SELL, SIGNAL_BUY];

describe('owner parameters and clock model', () => {
  it('MAX_EXECUTION_SIGNAL_AGE = 6 s; scenarios 0-6 s (+8 s beyond); existing limits only', () => {
    assert.equal(MAX_EXECUTION_SIGNAL_AGE_MS, 6000); assert.deepEqual([...DELAY_SCENARIOS_S], [0, 1, 2, 3, 4, 5, 6]); assert.deepEqual([...BEYOND_SCENARIOS_S], [8]); assert.deepEqual([...PROBE_DELAYS_S], [0, 1, 2, 3, 4, 5, 6, 8]);
    assert.deepEqual({ ...ENGINE_RULES }, { minRiskAtr: 0.5, overextendAtrMult: 2.5, minRR: 1.7 }); assert.deepEqual({ ...PRODUCTION_RULES }, { maxEntryDriftUsd: REAL_DEFAULTS.maxEntryDriftUsd, minEffectiveRr: REAL_DEFAULTS.minEffectiveRr, maxSpreadUsd: REAL_DEFAULTS.maxSpreadUsd }); assert.equal(RR, 1.70);
  });
  it('no application clock offset exists in the V16 decision path (no +1000 / +1230 / +2000 ms, no offset parameter)', () => {
    for (const f of ['timing.mjs', 'revalidate.mjs', 'probes.mjs']) { const code = readFileSync(join(V16, 'scripts', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
      assert.ok(!/offset/i.test(code), `${f} mentions an offset outside comments`); assert.ok(!/[+-]\s*(1000|1230|2000)\b(?!\s*\*)/.test(code.replace(/k \* 1000|delayS \* 1000|\/ 1000|\* 1000/g, '')), `${f} adds a fixed ms constant`); }
  });
  it('tracker: a tick is aged from the last poll that did not have it; the first tick after (re)start has no witnessed arrival -> age UNAVAILABLE', () => {
    let s = initTracker(); s = observePoll(s, { requestMono: 0, receiveMono: 5, receiveWallMs: 1e12, ok: true, tick: { time_msc: 1000, bid: 1, ask: 1.2 } });
    let q = quoteSnapshot(s); assert.equal(q.appeared_after_mono, null); assert.equal(checkTiming({ signal: { observed_mono: 0 }, quote: q, decision: { mono: 10 }, bars: { last_closed_open: 0, latest_open: 0 } }).primary, 'QUOTE_AGE_UNAVAILABLE');
    s = observePoll(s, { requestMono: 250, receiveMono: 255, ok: true, tick: { time_msc: 1000, bid: 1, ask: 1.2 } }); assert.equal(quoteSnapshot(s).first_seen_mono, 5, 'same tick keeps its first receipt');
    s = observePoll(s, { ok: false }); assert.equal(s.last_ok_request_mono, 250, 'a failed poll proves nothing');
    s = observePoll(s, { requestMono: 750, receiveMono: 760, ok: true, tick: { time_msc: 1600, bid: 1.1, ask: 1.3 } }); q = quoteSnapshot(s); assert.equal(q.appeared_after_mono, 250); assert.equal(q.first_seen_mono, 760);
    const t = checkTiming({ signal: { observed_mono: 700 }, quote: q, decision: { mono: 1000 }, bars: { last_closed_open: 0, latest_open: 0 } }); assert.equal(t.quote_age_ms, 750); assert.equal(t.quote_age_lower_ms, 240); assert.equal(t.signal_age_ms, 300); assert.ok(t.ok);
    s = observePoll(s, { requestMono: 1000, receiveMono: 1004, ok: true, tick: { time_msc: 1500, bid: 1, ask: 1.2 } }); assert.equal(quoteSnapshot(s).order_error, true, 'broker time went backwards');
  });
  it('clock drift is not latency: a PC wall clock 1230 ms behind the broker changes only the monitor, never the decision', () => {
    for (const sig of SIGS) for (const k of DELAY_SCENARIOS_S) { const a = run('UNCHANGED', k, sig), b = run('CLOCK_DRIFT_1230MS_MONITOR', k, sig); assert.equal(b.decision, a.decision); assert.equal(b.reason, a.reason); assert.ok(b.clock_monitor.wall_minus_broker_ms < 0); }
  });
});

describe('delay scenarios 0-6 s: tolerated when the original V8 conditions still hold', () => {
  it('0, 1, 2, 3, 4, 5 and 6 s: a still-valid signal is re-validated (ILLUSTRATIVE -> TRADE_ELIGIBLE; PRIMARY -> VALID_ENTRY + RISK_REJECTED)', () => {
    for (const sig of SIGS) for (const k of DELAY_SCENARIOS_S) for (const v of ['UNCHANGED', 'SMALL_MOVE_WITHIN_RULES']) {
      const i = run(v, k, sig), p = run(v, k, sig, 'PRIMARY');
      assert.equal(i.decision, 'TRADE_ELIGIBLE', `${sig.engine_action} ${v} ${k}s`); assert.equal(i.eligible_side, sig.engine_action); assert.ok(i.entry_revalidated);
      assert.equal(p.decision, 'WAIT_RISK_UNSAFE'); assert.equal(p.reason, 'RISK_PERCENTAGE_UNRESOLVED'); assert.ok(p.entry_revalidated, 'PRIMARY: valid entry, risk rejected');
      assert.ok(i.signal_age_ms <= 6000 && i.signal_age_ms >= 0); assert.deepEqual(invariantViolations(i), []); assert.deepEqual(invariantViolations(p), []);
    }
  });
  it('a 1-second delay is not an automatic rejection; the 6 s boundary is inclusive', () => { assert.equal(run('UNCHANGED', 1).decision, 'TRADE_ELIGIBLE'); const r = run('UNCHANGED', 6); assert.ok(r.signal_age_ms <= 6000); assert.equal(r.decision, 'TRADE_ELIGIBLE'); });
  it('> 6 s: the original signal is never carried forward (WAIT_SIGNAL_EXPIRED); only a newer bar with a valid entry is a NEW signal', () => {
    for (const sig of SIGS) { const r = run('UNCHANGED', 8, sig); assert.equal(r.decision, 'WAIT_SIGNAL_EXPIRED'); assert.equal(r.fresh_evaluation, 'NO_NEW_SIGNAL'); assert.ok(!r.entry_revalidated); }
    const inp = scenario('NEW_BAR_CLOSED', 8); const r = revalidate({ ...inp, configName: 'ILLUSTRATIVE_PCT_0_50_10K' }); assert.equal(r.decision, 'WAIT_SIGNAL_EXPIRED'); assert.equal(r.fresh_evaluation, 'NEW_SIGNAL_AVAILABLE');
  });
});

describe('revalidation: the decision depends on the state, not on the delay number', () => {
  const expect = { TRIGGER_GONE: 'WAIT_NO_TRIGGER', DIRECTION_CHANGED: 'WAIT_SIGNAL_CHANGED', LOCATION_OVEREXTENDED: 'WAIT_INVALID_LOCATION', SL_BREACHED: 'WAIT_INVALID_SL', SL_INSIDE_ENGINE_MIN_RISK: 'WAIT_INVALID_SL', RR_INVALID: 'WAIT_INVALID_RR', ENTRY_DRIFT_ABOVE_LIMIT: 'WAIT_BROKER_UNSAFE', SPREAD_ABOVE_LIMIT: 'WAIT_SAFETY_BREAKER', NEWS_BLOCK: 'WAIT_SAFETY_BREAKER', STRUCTURAL_SL_REVISED: 'WAIT_SIGNAL_CHANGED', NEW_BAR_CLOSED: 'WAIT_SIGNAL_CHANGED', RISK_REJECTED: 'WAIT_RISK_UNSAFE', BROKER_REJECTED: 'WAIT_BROKER_UNSAFE', BID_INVALID: 'WAIT_BROKER_UNSAFE' };
  it('signal invalidated / direction changed / trigger gone / location / SL / RR / drift / safety / risk / broker -> WAIT at every delay 0-6 s', () => {
    for (const sig of SIGS) for (const [v, st] of Object.entries(expect)) for (const k of DELAY_SCENARIOS_S) { const r = run(v, k, sig); assert.equal(r.decision, st, `${sig.engine_action} ${v} ${k}s -> ${r.decision} ${r.reason}`); assert.notEqual(r.decision, 'TRADE_ELIGIBLE'); }
  });
  it('no forced trade: across the whole grid TRADE_ELIGIBLE appears only for still-valid states and ages <= 6 s', () => {
    for (const sig of SIGS) for (const v of VARIANTS) for (const k of GRID_DELAYS_S) for (const cfg of Object.keys(CONFIGS)) { const r = run(v, k, sig, cfg); assert.deepEqual(invariantViolations(r), [], `${v} ${k} ${cfg}`);
      if (r.decision === 'TRADE_ELIGIBLE') { assert.ok(['UNCHANGED', 'SMALL_MOVE_WITHIN_RULES', 'CLOCK_DRIFT_1230MS_MONITOR'].includes(v), v); assert.ok(k <= 6); assert.equal(cfg, 'ILLUSTRATIVE_PCT_0_50_10K'); } }
  });
  it('trigger gone maps through the unchanged V14 gate (reason ORIGINAL_SIGNAL_INVALIDATED:*); a changed identity names what changed', () => {
    assert.match(run('TRIGGER_GONE', 3).reason, /^ORIGINAL_SIGNAL_INVALIDATED:/); assert.equal(run('DIRECTION_CHANGED', 3).reason, 'DIRECTION_CHANGED'); assert.equal(run('STRUCTURAL_SL_REVISED', 3).reason, 'STRUCTURAL_SL_CHANGED'); assert.equal(run('NEW_BAR_CLOSED', 3).reason, 'NEW_BAR_CLOSED');
  });
});

describe('execution price, structural SL, RR, risk firewall', () => {
  it('BUY executes at the current ASK, SELL at the current BID; never the mid or the old signal price', () => {
    const s = run('SMALL_MOVE_WITHIN_RULES', 4, SIGNAL_SELL), b = run('SMALL_MOVE_WITHIN_RULES', 4, SIGNAL_BUY);
    assert.equal(s.entry_price, s.bid); assert.equal(s.entry_price_source, 'BID'); assert.notEqual(s.entry_price, s.engine_entry);
    assert.equal(b.entry_price, b.ask); assert.equal(b.entry_price_source, 'ASK'); assert.notEqual(b.entry_price, b.engine_entry);
    assert.deepEqual(executionPrice('BUY', { bid: 1, ask: 2 }), { price: 2, source: 'ASK' }); assert.deepEqual(executionPrice('SELL', { bid: 1, ask: 2 }), { price: 1, source: 'BID' });
  });
  it('structural SL is never moved, widened or tightened by delay; RR = 1.70 from the execution price and that SL', () => {
    for (const sig of SIGS) for (const v of VARIANTS) for (const k of GRID_DELAYS_S) { const r = run(v, k, sig); assert.equal(r.sl, sig.candidate.stop_loss); assert.ok(r.firewall.ok);
      if (r.execution_geometry?.valid) { const risk = Math.abs(r.entry_price - r.sl); assert.ok(Math.abs(Math.abs(r.execution_geometry.tp_170 - r.entry_price) / risk - 1.70) < 1e-9); assert.equal(r.rr, 1.70); } }
  });
  it('existing-rule geometry: beyond SL, inside the engine minimum risk, overextended, drift, RR to the engine objective', () => {
    const c = SIGNAL_SELL.candidate, g = (price) => executionGeometry({ side: 'SELL', price, sl: c.stop_loss, anchor: c.anchor, atr: SIGNAL_SELL.atr_exact, engineEntry: c.entry, tp2: c.tp2_engine });
    assert.equal(g(c.stop_loss + 0.01).reason, 'PRICE_BEYOND_STRUCTURAL_STOP'); assert.equal(g(c.stop_loss - 1).reason, 'RISK_BELOW_ENGINE_MIN_AT_EXECUTION'); assert.equal(g(c.anchor - 2.6 * SIGNAL_SELL.atr_exact).reason, 'OVEREXTENDED_AT_EXECUTION');
    assert.equal(g(c.entry + 2.01).reason, 'ENTRY_DRIFT'); assert.match(g(c.entry - 1.8).reason, /RR/); assert.equal(g(c.entry).valid, true);
  });
  it('risk firewall: risk can only reject; the entry, SL and identity are unchanged; an unresolved risk % never approves', () => {
    const r = run('RISK_REJECTED', 3); assert.equal(r.decision, 'WAIT_RISK_UNSAFE'); assert.ok(r.entry_revalidated, 'VALID_ENTRY + RISK_REJECTED'); assert.deepEqual(r.original_identity, r.current_identity); assert.ok(r.firewall.ok);
    for (const v of VARIANTS) for (const k of GRID_DELAYS_S) assert.notEqual(run(v, k, SIGNAL_SELL, 'PRIMARY').decision, 'TRADE_ELIGIBLE');
  });
  it('broker rejection fails closed without retry or size change', () => { const r = run('BROKER_REJECTED', 2); assert.equal(r.decision, 'WAIT_BROKER_UNSAFE'); assert.equal(r.reason, 'REJECTED_BY_BROKER'); });
  it('duplicate signal: a second delivery after an eligible one is blocked by the existing exposure / duplicate rules', () => {
    const inp = scenario('UNCHANGED', 2); const a = revalidate({ ...inp, configName: 'ILLUSTRATIVE_PCT_0_50_10K' }); assert.equal(a.decision, 'TRADE_ELIGIBLE');
    const b = revalidate({ ...inp, configName: 'ILLUSTRATIVE_PCT_0_50_10K', state: a.next_state }); assert.notEqual(b.decision, 'TRADE_ELIGIBLE'); assert.match(`${b.decision}:${b.reason}`, /POSITION_OPEN|DUPLICATE/);
  });
});

describe('quote data and timestamps fail closed', () => {
  it('stale quote (> 6 s) and missing quote -> WAIT_STALE_DATA; a 1-5 s quote is not stale by itself', () => {
    assert.equal(run('STALE_QUOTE', 2).reason, 'QUOTE_AGE_ABOVE_EXECUTION_TOLERANCE'); assert.equal(run('MISSING_QUOTE', 2).reason, 'MISSING_QUOTE'); assert.equal(run('NO_WITNESSED_TICK', 2).reason, 'QUOTE_AGE_UNAVAILABLE');
    const inp = scenario('UNCHANGED', 6); inp.quote = { ...inp.quote, appeared_after_mono: inp.decision.mono - 5000, first_seen_mono: inp.decision.mono - 4800 }; assert.equal(revalidate({ ...inp, configName: 'ILLUSTRATIVE_PCT_0_50_10K' }).decision, 'TRADE_ELIGIBLE');
  });
  it('future / impossible timestamps -> CLOCK_OR_DATA_ERROR -> WAIT_STALE_DATA at every delay', () => {
    for (const v of ['QUOTE_RECEIVED_AFTER_DECISION', 'SIGNAL_AFTER_DECISION', 'QUOTE_AHEAD_OF_BROKER_BARS', 'QUOTE_PREDATES_BARS', 'OUT_OF_ORDER_TICK']) for (const k of GRID_DELAYS_S) { const r = run(v, k); assert.equal(r.decision, 'WAIT_STALE_DATA'); assert.match(r.reason, /^CLOCK_OR_DATA_ERROR:/); }
  });
  it('missing timestamps -> WAIT_STALE_DATA (signal, decision, quote time, receipt, bars)', () => {
    const base = scenario('UNCHANGED', 2); const R = (o) => revalidate({ ...base, ...o, configName: 'ILLUSTRATIVE_PCT_0_50_10K' });
    assert.equal(R({ signal: { observed_mono: null } }).reason, 'MISSING_TIMESTAMP:SIGNAL_OBSERVED'); assert.equal(R({ decision: { mono: undefined } }).reason, 'MISSING_TIMESTAMP:DECISION');
    assert.equal(R({ quote: { ...base.quote, quote_timestamp_ms: null } }).reason, 'MISSING_TIMESTAMP:QUOTE'); assert.equal(R({ quote: { ...base.quote, received_mono: NaN } }).reason, 'MISSING_TIMESTAMP:QUOTE_RECEIPT'); assert.equal(R({ bars: null }).reason, 'MISSING_TIMESTAMP:BARS');
  });
  it('bid / ask missing or invalid -> WAIT_BROKER_UNSAFE', () => {
    const base = scenario('UNCHANGED', 2); const R = (q) => revalidate({ ...base, quote: { ...base.quote, ...q }, configName: 'ILLUSTRATIVE_PCT_0_50_10K' });
    assert.equal(R({ bid: null }).reason, 'BID_UNAVAILABLE'); assert.equal(R({ ask: undefined }).reason, 'ASK_UNAVAILABLE'); assert.equal(R({ bid: -1 }).reason, 'BID_NOT_POSITIVE'); assert.equal(R({ ask: 0 }).reason, 'ASK_NOT_POSITIVE'); assert.equal(R({ ask: base.quote.bid - 0.1 }).reason, 'ASK_BELOW_BID_SPREAD_NEGATIVE');
  });
});

describe('replay, restart, no-lookahead (probe orchestrator)', () => {
  const fakeDeps = (variantAt = () => 'UNCHANGED') => { let m = 50_000; const recs = []; const sig = SIGNAL_SELL; return { recs, deps: { mono: () => m, wallMs: () => Date.UTC(2026, 9, 2, 12) + m, sleepUntil: async (t) => { if (t > m) m = t; },
    fetchContext: async () => { const k = Math.round((m + 600 - 50_000) / 1000); const s = scenario(variantAt(k), Math.max(0, k), sig); return { current: s.current, bars: s.bars, news: s.news, shock: s.shock }; },
    getQuote: () => { const k = Math.round((m - 50_000) / 1000); const q = scenario('UNCHANGED', Math.max(0, k), sig).quote; return { ...q, appeared_after_mono: m - 400, first_seen_mono: m - 250, received_mono: m - 120 }; }, spec: scenario('UNCHANGED', 0).spec, onRecord: (r) => recs.push(r) } }; };
  it('probes decide at k s after observation with inputs received before the instant; replay reproduces every decision', async () => {
    const { recs, deps } = fakeDeps(); await runProbes({ original: SIGNAL_SELL, signal: { observed_mono: 50_000, observed_wall_ms: 0, bar_time: SIGNAL_SELL.bar_time }, deps });
    assert.deepEqual(recs.map((r) => r.delay_s), [0, 1, 2, 3, 4, 5, 6, 8]);
    for (const r of recs) { const p = r.results.PRIMARY; assert.ok(r.inputs.quote.received_mono <= r.inputs.decision.mono, 'no lookahead'); assert.deepEqual(replayProbe(JSON.parse(JSON.stringify(r))), JSON.parse(JSON.stringify(r.results)), 'replay parity');
      if (r.delay_s <= 6) { assert.ok(p.signal_age_ms <= 6000); assert.equal(r.results.ILLUSTRATIVE_PCT_0_50_10K.decision, 'TRADE_ELIGIBLE'); } else assert.equal(p.decision, 'WAIT_SIGNAL_EXPIRED'); }
  });
  it('the same probe schedule with the trigger disappearing at 3 s turns WAIT from 3 s on (state, not delay)', async () => {
    const { recs, deps } = fakeDeps((k) => (k >= 3 ? 'TRIGGER_GONE' : 'UNCHANGED')); await runProbes({ original: SIGNAL_SELL, signal: { observed_mono: 50_000, observed_wall_ms: 0, bar_time: SIGNAL_SELL.bar_time }, deps });
    assert.deepEqual(recs.filter((r) => r.delay_s <= 6).map((r) => r.results.ILLUSTRATIVE_PCT_0_50_10K.decision), ['TRADE_ELIGIBLE', 'TRADE_ELIGIBLE', 'TRADE_ELIGIBLE', 'WAIT_NO_TRIGGER', 'WAIT_NO_TRIGGER', 'WAIT_NO_TRIGGER', 'WAIT_NO_TRIGGER']);
  });
  it('same input = same decision; restart (fresh tracker) cannot make an unwitnessed tick look fresh', () => {
    const inp = scenario('SMALL_MOVE_WITHIN_RULES', 5, SIGNAL_BUY); assert.equal(JSON.stringify(revalidate({ ...inp, configName: 'PRIMARY' })), JSON.stringify(revalidate({ ...inp, configName: 'PRIMARY' })));
    let s = initTracker(); s = observePoll(s, { requestMono: 10, receiveMono: 12, receiveWallMs: 0, ok: true, tick: { time_msc: (SIGNAL_SELL.bar_time + 310) * 1000, bid: 4134.85, ask: 4135.09 } });
    const r = revalidate({ ...scenario('UNCHANGED', 1), quote: quoteSnapshot(s), decision: { mono: 51_000, wallMs: 0 }, configName: 'ILLUSTRATIVE_PCT_0_50_10K' }); assert.equal(r.reason, 'QUOTE_AGE_UNAVAILABLE');
  });
  it('a contract of fields (owner §15 / §25) is present on every decision', () => {
    const r = run('UNCHANGED', 3); for (const k of ['symbol', 'timeframe', 'signal_timestamp', 'quote_timestamp_ms', 'decision_timestamp', 'signal_age_ms', 'signal_age_seconds', 'quote_age_ms', 'bid', 'ask', 'spread', 'entry_price', 'sl', 'rr', 'risk', 'decision', 'reason']) assert.ok(k in r, k);
    assert.equal(r.contract, CONTRACT); assert.ok(STATES.includes(r.decision));
  });
});

describe('runner integration (fake read-only reader, injected timing)', () => {
  let dir; before(() => { dir = mkdtempSync(join(tmpdir(), 'v16-runner-')); }); after(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
  it('every decision record carries the V16 block; forward-live V8 signals get 0-6 s and 8 s probes; nothing is executed', async (t) => {
    const lib = await import('../research/v8_forward_shadow/scripts/lib.mjs'); if (!existsSync(join(lib.V8_ENGINE_DIR, 'pipeline.js'))) { t.skip('frozen V8 engine copy not present'); return; }
    const { createForwardShadow } = await import('../research/v8_forward_shadow/scripts/runner.mjs');
    const ENG = { V8: await lib.loadEngine(lib.V8_ENGINE_DIR, { fixes: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] }), CONTROL: await lib.loadEngine(lib.CONTROL_ENGINE_DIR, { fixes: [] }) };
    const T0 = 1_700_000_000 - (1_700_000_000 % 3600); let s = 7 >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const b5 = []; let p = 4000; for (let i = 0; i < 6400; i++) { const o = p; const c = o + g() * 2.6 + Math.sin(i / 90) * 0.4; b5.push({ time: T0 + 300 * i, open: +o.toFixed(3), high: +(Math.max(o, c) + Math.abs(g()) * 1.2).toFixed(3), low: +(Math.min(o, c) - Math.abs(g()) * 1.2).toFixed(3), close: +c.toFixed(3) }); p = c; }
    const agg = (sec) => { const m = new Map(); for (const b of b5) { const t0 = b.time - (b.time % sec); const x = m.get(t0); if (!x) m.set(t0, { ...b, time: t0 }); else { x.high = Math.max(x.high, b.high); x.low = Math.min(x.low, b.low); x.close = b.close; } } return [...m.values()]; };
    const mkt = { '5m': b5, '15m': agg(900), '30m': agg(1800), '1H': agg(3600) }; const clock = { now: 0 }; let mono = 0;
    const reader = { rates: async (sym, tf, count) => ({ ok: true, bars: mkt[tf].filter((b) => b.time <= clock.now).slice(-count) }), tick: async () => { const last = mkt['5m'].filter((b) => b.time <= clock.now).at(-1); return { ok: true, tick: { time: clock.now, time_msc: clock.now * 1000 - 200, bid: last.close, ask: last.close + 0.24 }, received_ms: clock.now * 1000 }; } };
    const getQuote = () => { const last = mkt['5m'].filter((b) => b.time <= clock.now).at(-1); return { contract: CONTRACT, symbol: 'XAUUSDm', bid: last.close, ask: +(last.close + 0.24).toFixed(3), spread: 0.24, quote_timestamp_ms: clock.now * 1000 - 200, first_seen_mono: mono - 250, first_seen_wall_ms: clock.now * 1000 - 50, appeared_after_mono: mono - 400, received_mono: mono - 100, received_wall_ms: clock.now * 1000, order_error: false }; };
    const timing = { mono: () => mono, wallMs: () => clock.now * 1000, getQuote, sleepUntil: async (m) => { if (m > mono) mono = m; }, spec: scenario('UNCHANGED', 0).spec, probes: true };
    const fs = await createForwardShadow({ dir, reader, prod: null, newsEval: () => ({ state: 'NORMAL' }), now: () => clock.now, engines: ENG, timing });
    const start = b5[6100].time; for (let k = 0; k < 150; k++) { const bt = start + 300 * k; clock.now = bt + 300 + 20; mono += 300_000; await fs.cycle(); if (existsSync(join(dir, 'timing_probes.jsonl')) && k > 40) break; }
    const D = fs.decisions(); assert.ok(D.length > 0); for (const d of D) { assert.ok(d.v16 && d.v16.contract === CONTRACT, 'v16 block'); for (const f of ['signal_timestamp', 'quote_timestamp_ms', 'decision_timestamp', 'signal_age_seconds', 'bid', 'ask', 'spread', 'entry', 'sl', 'rr', 'final_decision', 'decision_reason']) assert.ok(f in d.v16, f); assert.equal(d.executed, false); }
    const sigs = D.filter((d) => d.engine === 'V8' && (d.engine_action === 'BUY' || d.engine_action === 'SELL')); assert.ok(sigs.length > 0, 'the synthetic market produced a V8 signal');
    for (const d of sigs) { assert.ok(d.v16.revalidated_by_v16); assert.ok(STATES.includes(d.v16.final_decision)); assert.notEqual(d.v16.final_decision, 'TRADE_ELIGIBLE', 'PRIMARY never approves'); }
    const probes = readFileSync(join(dir, 'timing_probes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); assert.ok(probes.length >= 8);
    for (const r of probes) { assert.equal(r.executed, false); assert.ok(r.inputs.quote.received_mono <= r.inputs.decision.mono); assert.deepEqual(replayProbe(r), r.results); for (const res of Object.values(r.results)) assert.deepEqual(invariantViolations(res), []); }
  });
});

describe('research boundaries', () => {
  it('no order / position code in V16; no trade-count target; zero trades valid', () => {
    for (const f of ['timing.mjs', 'revalidate.mjs', 'probes.mjs', 'scenarios.mjs']) { const code = readFileSync(join(V16, 'scripts', f), 'utf8'); assert.ok(!/order_send|order_check|positions_get|TRADE_ACTION|executeTrade|placeOrder/.test(code), f); assert.ok(!/\b300[- ](trade|signal)|1\/300/i.test(code), f); }
  });
  it('results (when present) are consistent with the pre-registered decision states', (t) => {
    const p = join(V16, 'results', 'v16_results.json'); if (!existsSync(p)) { t.skip('results not generated yet'); return; }
    const R = JSON.parse(readFileSync(p, 'utf8')); assert.ok(['EXECUTION_TIMING_VALIDATED', 'EXECUTION_TIMING_PARTIALLY_VALIDATED', 'EXECUTION_TIMING_INCONCLUSIVE', 'EXECUTION_TIMING_FAILED'].includes(R.decision.EXECUTION_TIMING_STATUS)); assert.equal(R.grid.invariant_violations, 0); assert.equal(R.grid.forced_trades, 0);
  });
});
