/**
 * V15 QUOTE DATA INTEGRITY (2026-10-02) -- deterministic tests (RESEARCH ONLY; no order code; never guesses a value).
 * Fresh / stale / delayed quote, missing timestamp / age / offset, negative age, future timestamp, out-of-order, duplicate, bid / ask
 * missing or invalid, negative spread, clock drift, side-of-market entry price, legacy data never fabricated, the live-gate wrapper
 * (fail closed, executable geometry, entry drift), restart, replay, same-input same-decision, no-lookahead, runner / reader contract.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuote, validateQuote, legacyQuote, entryPrice, estimateServerOffsetMs, UNAVAILABLE, CONTRACT, TECHNICAL_SCENARIOS_MS } from '../research/quote_integrity_v15/scripts/quote.mjs';
import { decideWithQuote, PRODUCTION_MAX_QUOTE_AGE_MS } from '../research/quote_integrity_v15/scripts/live_gate.mjs';
import { fromReplayRow, initGate, PRODUCTION_BREAKERS } from '../research/trade_gate_v14/scripts/gate.mjs';
import { REAL_DEFAULTS } from '../src/engine/mt5RealPolicy.js';
import { QUOTE_MAX_AGE_MS, QUOTE_SERVER_UTC_OFFSET_MS } from '../research/v8_forward_shadow/scripts/runner.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)); const V15 = join(ROOT, 'research', 'quote_integrity_v15');
const SPEC = Object.freeze({ symbol: 'XAUUSDm', contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, point: 0.001, digits: 3, stops_level_points: 0, freeze_level_points: 0, leverage: 200, margin_call_pct: 60, currency_profit: 'USD', account_currency: 'USD', platform_tick_value: null });
const T = 1790960000000; // ms
const tick = (o = {}) => ({ time: Math.floor((o.time_msc ?? T) / 1000), time_msc: T, bid: 4000.0, ask: 4000.24, flags: 6, ...o });
const Q = (o = {}, t = {}) => buildQuote({ symbol: 'XAUUSDm', tick: tick(t), receivedMs: T + 150, decisionMs: T + 200, serverUtcOffsetMs: 0, offsetSource: 'test', ...o });
const V = (q, o = {}) => validateQuote(q, { maxAgeMs: PRODUCTION_MAX_QUOTE_AGE_MS, ...o });
const row = (o = {}) => ({ i: 1000, t: T / 1000 - 300, act: 'BUY', mdl: 'BO', cs: 'BUY', wr: null, stB: '00300', stS: '00000', b15: 'BULLISH', trig: 'BOB', anc: 3998, g: { e: 4000, sl: 3995, tp2: 4010, rr: 2, ra: 1.0, src: 'candidate_anchor' }, ...o });
const PCT = { riskModel: { model: 'PCT', riskPct: 0.005 }, breakers: null, conflictResolution: 'EXISTING_PRIORITY', spec: SPEC };
const PRIMARY = { riskModel: 'UNRESOLVED', breakers: PRODUCTION_BREAKERS, conflictResolution: 'EXISTING_PRIORITY', spec: SPEC };

describe('quote contract and age', () => {
  it('fresh quote: every contract field present; age = decision - quote (broker clock = UTC); BUY uses ask, SELL bid, never mid', () => {
    const q = Q(); for (const k of ['contract', 'symbol', 'decision_timestamp_ms', 'bid', 'ask', 'mid', 'quote_timestamp_ms', 'quote_age_ms', 'spread', 'tick_sequence', 'data_source', 'data_received_timestamp_ms', 'clock']) assert.ok(k in q, k);
    assert.equal(q.contract, CONTRACT); assert.equal(q.quote_age_ms, 200); assert.equal(q.spread, 0.24); assert.equal(q.spread_points, 240); assert.equal(q.tick_sequence, UNAVAILABLE); assert.deepEqual(V(q).status, 'VALID');
    assert.deepEqual(entryPrice('BUY', q), { price: 4000.24, source: 'ASK' }); assert.deepEqual(entryPrice('SELL', q), { price: 4000, source: 'BID' }); assert.notEqual(entryPrice('BUY', q).price, q.mid);
  });
  it('a non-UTC broker clock is converted explicitly by the offset (no silent mixing)', () => { const q = Q({ serverUtcOffsetMs: 3 * 3600_000 }, { time_msc: T + 3 * 3600_000 }); assert.equal(q.quote_age_ms, 200); assert.equal(estimateServerOffsetMs([{ quote_timestamp_ms: T + 3 * 3600_000 + 40, received_ms: T + 120 }, { quote_timestamp_ms: T + 3 * 3600_000, received_ms: T + 300 }]), 3 * 3600_000); });
  it('stale / delayed quote: age above the production limit (90 s) -> STALE -> WAIT_STALE_DATA', () => { assert.equal(PRODUCTION_MAX_QUOTE_AGE_MS, REAL_DEFAULTS.maxQuoteAgeSec * 1000); const v = V(Q({ decisionMs: T + 120_000, receivedMs: T + 119_900 })); assert.deepEqual([v.status, v.primary, v.gate_state], ['STALE', 'STALE_QUOTE', 'WAIT_STALE_DATA']); });
  it('technical scenarios are measurement settings only: a quote passing 90 s may fail 100 ms', () => { assert.deepEqual([...TECHNICAL_SCENARIOS_MS], [100, 250, 500, 1000, 2000, 5000]); const q = Q({ decisionMs: T + 700, receivedMs: T + 650 }); assert.equal(V(q).status, 'VALID'); assert.equal(V(q, { maxAgeMs: 500 }).status, 'STALE'); });
});

describe('fail closed (never repaired, never guessed)', () => {
  const cases = [
    ['missing quote timestamp', Q({}, { time_msc: undefined }), 'QUOTE_TIMESTAMP_UNAVAILABLE', 'WAIT_STALE_DATA'],
    ['missing quote age (no clock offset)', Q({ serverUtcOffsetMs: null }), 'CLOCK_OFFSET_UNAVAILABLE', 'WAIT_STALE_DATA'],
    ['missing decision timestamp', Q({ decisionMs: null }), 'DECISION_TIMESTAMP_UNAVAILABLE', 'WAIT_STALE_DATA'],
    ['future quote timestamp (after receipt)', Q({}, { time_msc: T + 1000 }), 'CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT', 'WAIT_STALE_DATA'],
    ['decision before receipt', Q({ decisionMs: T + 100 }), 'DECISION_BEFORE_RECEIPT', 'WAIT_STALE_DATA'],
    ['bid missing', Q({}, { bid: undefined }), 'BID_UNAVAILABLE', 'WAIT_BROKER_UNSAFE'], ['ask missing', Q({}, { ask: null }), 'ASK_UNAVAILABLE', 'WAIT_BROKER_UNSAFE'],
    ['invalid bid', Q({}, { bid: 0 }), 'BID_NOT_POSITIVE', 'WAIT_BROKER_UNSAFE'], ['invalid ask', Q({}, { ask: -1 }), 'ASK_NOT_POSITIVE', 'WAIT_BROKER_UNSAFE'],
    ['negative spread (ask below bid)', Q({}, { bid: 4000.3, ask: 4000.0 }), 'ASK_BELOW_BID', 'WAIT_BROKER_UNSAFE'],
  ];
  for (const [name, q, reason, state] of cases) it(name, () => { const v = V(q); assert.notEqual(v.status, 'VALID'); assert.equal(v.primary, reason); assert.equal(v.gate_state, state); });
  it('negative quote age is CLOCK_OR_DATA_ERROR (never clamped to 0)', () => { const q = Q({ receivedMs: T + 2000, decisionMs: T + 2000 }, { time_msc: T + 2500 }); assert.ok(q.quote_age_ms < 0); assert.ok(V(q).reasons.includes('CLOCK_OR_DATA_ERROR:NEGATIVE_AGE')); assert.equal(q.quote_age_ms, -500); });
  it('out-of-order and replayed ticks are rejected; an exact duplicate is labelled (age keeps growing)', () => { const p = Q(); const older = Q({}, { time_msc: T - 50 }); assert.equal(V(older, { prev: p }).primary, 'OUT_OF_ORDER'); const dup = Q({ decisionMs: T + 900, receivedMs: T + 850 }); const v = V(dup, { prev: p }); assert.equal(v.duplicate, true); assert.equal(v.status, 'VALID'); assert.equal(v.quote_age_ms, 900); });
  it('clock drift: a PC clock lagging the broker by 1.2 s makes every age negative -> fail closed; a synchronized clock passes', () => { const lag = 1200; const ticks = Array.from({ length: 20 }, (_, k) => T + k * 400); const lagging = ticks.map((t) => V(buildQuote({ symbol: 'XAUUSDm', tick: tick({ time_msc: t }), receivedMs: t + 120 - lag, decisionMs: t + 130 - lag, serverUtcOffsetMs: 0 }))); assert.ok(lagging.every((v) => v.status === 'INVALID_QUOTE' && v.gate_state === 'WAIT_STALE_DATA')); const synced = ticks.map((t) => V(buildQuote({ symbol: 'XAUUSDm', tick: tick({ time_msc: t }), receivedMs: t + 120, decisionMs: t + 130, serverUtcOffsetMs: 0 }))); assert.ok(synced.every((v) => v.status === 'VALID')); });
  it('historical / legacy data: quote age is UNAVAILABLE and never reconstructed from candle timestamps', () => { const l = legacyQuote({ source: 'V8_REPLAY_ROW (candles only)' }); assert.equal(l.status, 'LEGACY_DATA'); assert.equal(l.quote_age_ms, UNAVAILABLE); assert.equal(l.quote_timestamp_ms, UNAVAILABLE); assert.equal(V(l).primary, 'QUOTE_TIMESTAMP_UNAVAILABLE'); const src = readFileSync(join(V15, 'scripts', 'quote.mjs'), 'utf8'); assert.ok(!/bar_time|row\.t\b|candle/.test(src.replace(/candle timestamps|Candle timestamps|candles only/g, '')), 'no candle time used as quote time'); });
});

describe('live-gate wrapper (unchanged V14 gate; quote integrity first)', () => {
  it('valid entry + invalid or missing quote -> WAIT_STALE_DATA / WAIT_BROKER_UNSAFE, risk data INCOMPLETE, nothing opened', () => {
    const a = decideWithQuote(initGate(), fromReplayRow(row()), legacyQuote({ source: 'test' }), PCT); assert.deepEqual([a.record.decision, a.record.reason, a.record.risk_validation], ['WAIT_STALE_DATA', 'QUOTE:QUOTE_TIMESTAMP_UNAVAILABLE', 'FAIL']); assert.equal(a.state.position, null);
    const b = decideWithQuote(initGate(), fromReplayRow(row()), Q({}, { bid: 0 }), PCT); assert.equal(b.record.decision, 'WAIT_BROKER_UNSAFE');
  });
  it('valid fresh quote: the illustrative risk path can reach TRADE_ELIGIBLE, with the quote age recorded; PRIMARY stays RISK_REJECTED', () => {
    const e = decideWithQuote(initGate(), fromReplayRow(row()), Q(), PCT).record; assert.equal(e.decision, 'TRADE_ELIGIBLE'); assert.equal(e.quote_check.status, 'VALID'); assert.equal(typeof e.quote.quote_age_ms, 'number'); assert.equal(e.execution_price.side_source, 'ASK');
    const p = decideWithQuote(initGate(), fromReplayRow(row()), Q(), PRIMARY).record; assert.deepEqual([p.decision, p.reason], ['WAIT_RISK_UNSAFE', 'RISK_PERCENTAGE_UNRESOLVED']);
  });
  it('executable geometry at the side price (existing production recheck): beyond the structural stop -> WAIT_INVALID_SL; effective RR below 1.70 -> WAIT_INVALID_RR; the SL is never moved', () => {
    const beyond = decideWithQuote(initGate(), fromReplayRow(row()), Q({}, { bid: 3994.0, ask: 3994.24 }), PCT).record; assert.equal(beyond.decision, 'WAIT_INVALID_SL'); assert.match(beyond.reason, /PRICE_BEYOND_STRUCTURAL_STOP/);
    const rr = decideWithQuote(initGate(), fromReplayRow(row()), Q({}, { bid: 4001.6, ask: 4001.84 }), PCT).record; assert.equal(rr.decision, 'WAIT_INVALID_RR'); assert.equal(row().g.sl, 3995);
  });
  it('entry drift above the production limit (2.0 USD) -> WAIT_BROKER_UNSAFE', () => { const r = decideWithQuote(initGate(), fromReplayRow(row({ g: { e: 4000, sl: 3990, tp2: 4030, rr: 3, ra: 2, src: 'candidate_anchor' } })), Q({}, { bid: 3997.5, ask: 3997.74 }), PCT).record; assert.deepEqual([r.decision, r.reason], ['WAIT_BROKER_UNSAFE', 'ENTRY_DRIFT']); });
  it('same input + same state = same decision; restart from a serialized state resumes identically; no lookahead (later quotes never change earlier decisions)', () => {
    const go = (qs) => { let st = initGate(); let prev = null; return qs.map((q, k) => { const o = decideWithQuote(st, fromReplayRow(row({ i: 1000 + k * 300, t: T / 1000 - 300 + k * 90000, anc: 3998 - k * 0.1 })), q, PCT, { prev }); st = o.state; prev = o.accepted_quote; return o.record.decision + ':' + o.record.reason; }); };
    const qs = [Q(), Q({ decisionMs: T + 120_000, receivedMs: T + 119_900 }), Q({}, { time_msc: T + 5000 })]; const full = go(qs); assert.deepEqual(go(qs), full); assert.deepEqual(go(qs.slice(0, 2)), full.slice(0, 2));
    const st0 = initGate(); const one = decideWithQuote(st0, fromReplayRow(row()), Q(), PCT); const restored = JSON.parse(JSON.stringify(one.state)); const nx = fromReplayRow(row({ i: 2000, t: T / 1000 + 90000, anc: 3997 })); assert.deepEqual(decideWithQuote(restored, nx, Q({ decisionMs: T + 90_000_200, receivedMs: T + 90_000_150 }, { time_msc: T + 90_000_000 }), PCT).record, decideWithQuote(one.state, nx, Q({ decisionMs: T + 90_000_200, receivedMs: T + 90_000_150 }, { time_msc: T + 90_000_000 }), PCT).record);
  });
});

describe('forward-shadow runner and reader contract', () => {
  it('runner writes the quote contract with the existing production freshness limit and the calibrated broker offset', () => { assert.equal(QUOTE_MAX_AGE_MS, REAL_DEFAULTS.maxQuoteAgeSec * 1000); assert.equal(QUOTE_SERVER_UTC_OFFSET_MS, 0); const s = readFileSync(join(ROOT, 'research', 'v8_forward_shadow', 'scripts', 'runner.mjs'), 'utf8'); assert.match(s, /quote_contract: QUOTE_CONTRACT, quote,/); assert.match(s, /buildQuote\(/); });
  it('reader: tick adds time_msc, flags and the receive time; still read-only (no trading call)', () => { const s = readFileSync(join(ROOT, 'mt5', 'mt5_shadow_reader.py'), 'utf8'); assert.match(s, /"time_msc": int\(t\.time_msc\)/); assert.match(s, /"received_ms": int\(rcv \* 1000\)/); assert.ok(!/order_send|order_check|TRADE_ACTION|positions_get|mt5\.login\(/.test(s)); });
  it('no execution code in V15 scripts', () => { for (const f of ['quote.mjs', 'live_gate.mjs', 'live_capture.mjs', 'v15_study.mjs', 'write_reports.mjs']) { const p = join(V15, 'scripts', f); if (!existsSync(p)) continue; const s = readFileSync(p, 'utf8'); for (const bad of ['mt5Executor', 'mt5Bridge', 'order_send', "request('open'", 'REAL_ACCOUNT', 'REAL_ARM', 'positions_get']) assert.ok(!s.includes(bad), `${f}: ${bad}`); } });
  it('study results (local, skipped when absent): no fabricated quote age, nothing eligible without a valid quote age, deterministic replay', { skip: !existsSync(join(V15, 'results', 'v15_results.json')) }, () => {
    const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex'); const r = JSON.parse(readFileSync(join(V15, 'results', 'v15_results.json'), 'utf8')); assert.equal(r.prereg_sha, sha(join(V15, 'V15_PREREGISTRATION.md')));
    assert.equal(r.decision.criteria.fabricated_historical_quote_age, 0); assert.equal(r.decision.criteria.eligible_without_quote_age, 0); assert.equal(r.live_capture.replay_deterministic, true); assert.equal(r.live_capture.replay_matches_capture_summary, true); assert.equal(r.live_capture.restart_equals_uninterrupted, true);
    for (const S of ['DEV', 'HOLD']) for (const c of Object.values(r.historical[S])) assert.equal(c.trade_eligible, 0);
    assert.ok(['DATA_INTEGRITY_VALIDATED', 'DATA_INTEGRITY_PARTIALLY_VALIDATED', 'DATA_INTEGRITY_INCONCLUSIVE', 'DATA_INTEGRITY_FAILED'].includes(r.decision.DATA_INTEGRITY_STATUS));
  });
});
