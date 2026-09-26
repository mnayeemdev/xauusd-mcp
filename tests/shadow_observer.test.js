/**
 * FORWARD SHADOW EVIDENCE (Stage 11C) -- src/shadow/*. Observation only; no network, no MT5, no orders.
 * Covers: schema, append-only store, dedup, restart safety, confirmed-candle requirement, stale feed,
 * cross-asset causality, no lookahead, delayed outcome labeling, candidate immutability, provenance,
 * replay never counts as forward, no order path, read-only production view, observer integration,
 * production config untouched.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION, PROVENANCE, outcomeId, validateObservation, validateOutcome, FRESHNESS_WINDOW_SEC } from '../src/shadow/schema.js';
import { CANDIDATES, candidateById, definitionHash, verifyFrozenRegistry, registryHashes } from '../src/shadow/candidates.js';
import { completedBars, provenanceFor, crossAssetSnapshot, evaluateSilverLead, buildCandleObservation, labelOutcome } from '../src/shadow/core.js';
import { createEvidenceStore } from '../src/shadow/store.js';
import { createShadowObserver, OUTCOME_PLAN, CROSS_SYMBOLS } from '../src/shadow/observer.js';
import { READER_COMMANDS, createMt5Reader } from '../src/shadow/mt5Reader.js';
import { createProductionReader } from '../src/shadow/production.js';
import { evaluateCandidate, FORWARD_GATES, STATUSES, buildReport } from '../src/shadow/report.js';
import { resolveRealExecutorConfig } from '../src/engine/mt5RealPolicy.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const T0 = 1790337600; // 2026-09-25T12:00:00Z (a 15m boundary)
const bars = (tf, count, endExclusive, price = 4000, range = 1) => Array.from({ length: count }, (_, i) => { const t = endExclusive - (count - i) * tf; return { time: t, open: price, high: price + range / 2, low: price - range / 2, close: price, volume: 100 }; });
function memFs() { const files = {}; return { files, deps: { append: (p, line) => { files[p] = (files[p] ?? '') + line; }, read: (p) => files[p] ?? '', mkdir: () => {}, write: (p, s) => { files[p] = s; } } }; }
const tmp = () => { const d = join(tmpdir(), `shadow_test_${process.pid}_${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); return d; };
function fakeReader({ bars5, bars15, tick, cross = {} }) { const calls = []; return { calls, rates: async (sym, tf) => { calls.push(['rates', sym, tf]); if (sym === 'XAUUSDm') return { ok: true, bars: tf === '5m' ? bars5 : tf === '15m' ? bars15 : bars(tf === '30m' ? 1800 : 3600, 40, bars5.at(-1).time + 300) }; return { ok: !!cross[sym], bars: cross[sym] ?? null }; }, tick: async () => ({ ok: true, tick }) }; }
function fakeProd({ snapshot = null, signals = [], exec = { status: 'UNKNOWN' }, events = [], calendar = null } = {}) { const reads = []; return { reads, snapshotForBar: () => { reads.push('snapshotForBar'); return snapshot; }, newSignals: (known) => { reads.push('newSignals'); return signals.filter((s) => !known.has(s.signal_id)); }, executionStatus: () => { reads.push('executionStatus'); return exec; }, lastProtection: () => { reads.push('lastProtection'); return null; }, protectionEvents: (since) => { reads.push('protectionEvents'); return events.filter((e) => !since || e.timestamp > since); }, calendar: () => { reads.push('calendar'); return calendar; } }; }
const good = (over = {}) => buildCandleObservation({ nowSec: T0 + 400, barTime: T0, bars5: bars(300, 30, T0 + 300), bars15: bars(900, 30, T0 + 300), bars30: [], bars60: [], tick: { time: T0 + 395, bid: 4000, ask: 4000.26 }, provenance: 'TEST', ...over });

describe('A. schema: strict identity, provenance vocabulary, anti-lookahead fields', () => {
  it('a well-formed observation validates; version, kind, provenance, id mismatch and future cross-asset bars are rejected', () => {
    assert.deepEqual(validateObservation(good()), { ok: true, errors: [] });
    assert.deepEqual(PROVENANCE, ['FORWARD_LIVE', 'BACKFILL', 'HISTORICAL_REPLAY', 'TEST']); assert.equal(SCHEMA_VERSION, 'shadow-1.0');
    assert.ok(validateObservation({ ...good(), schema_version: 'x' }).errors.includes('SCHEMA_VERSION')); assert.ok(validateObservation({ ...good(), provenance: 'LIVE' }).errors.includes('PROVENANCE')); assert.ok(validateObservation({ ...good(), bar_time: T0 + 300 }).errors.includes('OBSERVATION_ID_MISMATCH'));
    const o = good(); o.cross_asset = { DXYm: { available: true, bar_time: T0 + 300, bar_close_time: T0 + 1200 } }; assert.ok(validateObservation(o).errors.includes('CROSS_ASSET_FUTURE:DXYm'));
  });
  it('FORWARD_LIVE requires creation within the freshness window after the decision time; later creation must be BACKFILL', () => {
    const o = { ...good(), provenance: 'FORWARD_LIVE', created_at_utc: new Date((T0 + 300 + FRESHNESS_WINDOW_SEC + 1) * 1000).toISOString() }; assert.ok(validateObservation(o).errors.includes('FORWARD_LIVE_FRESHNESS'));
    assert.equal(validateObservation({ ...o, provenance: 'BACKFILL' }).ok, true);
  });
  it('outcome records carry their own id, horizon end and last bar used; labeling before the horizon end is invalid', () => {
    const obs = good(); const r = labelOutcome({ observation: obs, horizonKey: 'h12', horizonBars: 12, tfSec: 300, bars: bars(300, 40, T0 + 300 + 13 * 300), nowSec: T0 + 300 + 13 * 300, side: 'BUY', atr: 1, provenance: 'TEST' });
    assert.equal(validateOutcome(r).ok, true); assert.equal(r.outcome_id, outcomeId(obs.observation_id, 'h12')); assert.equal(r.horizon_end_time, T0 + 300 + 12 * 300); assert.ok(r.last_bar_time_used <= r.horizon_end_time - 300);
    assert.ok(validateOutcome({ ...r, labeled_at_utc: new Date((r.horizon_end_time - 1) * 1000).toISOString() }).errors.includes('LABELED_BEFORE_HORIZON')); assert.ok(validateOutcome({ ...r, last_bar_time_used: r.horizon_end_time + 300 }).errors.includes('LAST_BAR_TIME_USED'));
  });
});

describe('B-D. store: append-only, duplicate suppression, restart safety', () => {
  it('appends exactly one newline-terminated JSON line per record, never rewrites, rejects duplicates/invalid records and outcomes for unknown observations; exposes no update/delete', () => {
    const { files, deps } = memFs(); const st = createEvidenceStore({ dir: 'mem', deps }); const o = good();
    assert.deepEqual(st.appendObservation(o), { ok: true }); assert.equal(st.appendObservation(o).reason, 'DUPLICATE'); assert.equal(st.appendObservation({ ...o, provenance: 'BAD' }).reason, 'INVALID');
    assert.equal(files[join('mem', 'observations.jsonl')].split('\n').filter(Boolean).length, 1); assert.ok(files[join('mem', 'observations.jsonl')].endsWith('\n'));
    const r = labelOutcome({ observation: o, horizonKey: 'h12', horizonBars: 12, tfSec: 300, bars: bars(300, 40, T0 + 300 + 13 * 300), nowSec: T0 + 300 + 13 * 300, provenance: 'TEST' }); assert.deepEqual(st.appendOutcome(r), { ok: true }); assert.equal(st.appendOutcome(r).reason, 'DUPLICATE'); assert.equal(st.appendOutcome({ ...r, observation_id: 'a'.repeat(20), outcome_id: outcomeId('a'.repeat(20), 'h12') }).reason, 'UNKNOWN_OBSERVATION');
    assert.equal(st.update, undefined); assert.equal(st.delete, undefined); assert.equal(st.rewrite, undefined);
  });
  it('restart: a new store over the same files rebuilds the index (duplicates still rejected); a malformed trailing line is skipped and counted, never repaired', () => {
    const { files, deps } = memFs(); const st = createEvidenceStore({ dir: 'mem', deps }); const o = good(); st.appendObservation(o);
    files[join('mem', 'observations.jsonl')] += '{"schema_version":"shadow-1.0","record":"obs';
    const st2 = createEvidenceStore({ dir: 'mem', deps }); assert.equal(st2.appendObservation(o).reason, 'DUPLICATE'); assert.equal(st2.stats().malformed_lines, 1); assert.equal(st2.stats().observations, 1); assert.equal(st2.readAll('observations').length, 1);
    assert.ok(files[join('mem', 'observations.jsonl')].includes('"record":"obs'), 'the partial line is left untouched');
  });
});

describe('E-H. confirmed candles only, stale feed, cross-asset causality, no lookahead', () => {
  it('a forming 5m candle can never become an observation; completedBars drops bars whose close is after now', () => {
    const b = bars(300, 10, T0 + 300); assert.equal(completedBars(b, 300, T0 + 299).length, 9); assert.equal(completedBars(b, 300, T0 + 300).length, 10);
    assert.throws(() => buildCandleObservation({ nowSec: T0 + 299, barTime: T0, bars5: b, bars15: [], bars30: [], bars60: [], tick: null, provenance: 'TEST' }), /BAR_NOT_COMPLETED_OR_MISSING|FORMING_CANDLE/);
  });
  it('provenance from timing: FORWARD_LIVE only within 15 min of the close, BACKFILL up to 24 h, nothing beyond; a stale feed is recorded as STALE, not hidden', () => {
    assert.equal(provenanceFor({ barCloseSec: T0, nowSec: T0 + 900 }), 'FORWARD_LIVE'); assert.equal(provenanceFor({ barCloseSec: T0, nowSec: T0 + 901 }), 'BACKFILL'); assert.equal(provenanceFor({ barCloseSec: T0, nowSec: T0 + 86401 }), null); assert.equal(provenanceFor({ barCloseSec: T0, nowSec: T0 - 1 }), null);
    assert.equal(provenanceFor({ barCloseSec: T0, nowSec: T0, mode: 'REPLAY' }), 'HISTORICAL_REPLAY'); assert.equal(provenanceFor({ barCloseSec: T0, nowSec: T0, mode: 'TEST' }), 'TEST');
    const o = good({ tick: { time: T0 + 100, bid: 1, ask: 1.2 } }); assert.equal(o.market.feed_state, 'STALE'); assert.equal(o.market.feed_age_sec, 300);
  });
  it('cross-asset: only a bar complete at the decision time is used; a newer bar is ignored; missing data is recorded as unavailable, never forward-filled', () => {
    const dec = T0 + 900; const b = [...bars(900, 100, dec, 30), { time: dec, open: 30, high: 31, low: 29, close: 25, volume: 1 }];
    const x = crossAssetSnapshot('XAGUSDm', b, dec); assert.equal(x.available, true); assert.equal(x.bar_time, dec - 900); assert.equal(x.close, 30, 'the bar starting at the decision time is forming and excluded');
    assert.equal(crossAssetSnapshot('DXYm', bars(900, 100, dec - 3600, 100), dec).available, false); assert.equal(crossAssetSnapshot('DXYm', null, dec).available, false);
  });
  it('SC1 trigger uses only silver bars closing at or before the decision time: a future crash bar cannot trigger; a completed crash bar does', () => {
    const c = candidateById('SC1_SILVER_LEAD_v1'); const dec = T0 + 900; const calm = bars(900, 120, dec, 30, 0.1).map((b, i) => ({ ...b, close: 30 + Math.sin(i) * 0.05 }));
    assert.equal(evaluateSilverLead(c, [...calm, { time: dec, open: 30, high: 30, low: 20, close: 20, volume: 1 }], dec).triggered, false, 'the crash bar starting at the decision time is still forming');
    const crash = [...calm.slice(0, -1), { ...calm.at(-1), close: 29 }]; const ev = evaluateSilverLead(c, crash, dec); assert.equal(ev.triggered, true); assert.ok(ev.z <= -1.5); assert.equal(ev.bar_time, dec - 900);
    assert.equal(evaluateSilverLead(c, calm.slice(-20), dec).reason, 'INSUFFICIENT_HISTORY'); assert.equal(evaluateSilverLead(c, calm, dec + 300).reason, 'NO_BAR_CLOSING_AT_DECISION_TIME');
  });
  it('outcome labeling: null before the horizon has elapsed; uses only bars inside (decision, horizon end]; incomplete paths are reported, not filled; geometry uses first touch', () => {
    const o = good(); const path = bars(300, 60, T0 + 300 + 60 * 300, 4000).map((b, i) => ({ ...b, close: 4000 + i, high: 4000 + i + 0.5, low: 4000 + i - 0.5 }));
    assert.equal(labelOutcome({ observation: o, horizonKey: 'h12', horizonBars: 12, tfSec: 300, bars: path, nowSec: T0 + 300 + 12 * 300 - 1, provenance: 'TEST' }), null);
    const r = labelOutcome({ observation: o, horizonKey: 'h12', horizonBars: 12, tfSec: 300, bars: path, nowSec: T0 + 300 + 12 * 300, side: 'BUY', atr: 2, provenance: 'TEST' }); assert.equal(r.status, 'LABELED'); assert.equal(r.last_bar_time_used, T0 + 300 + 11 * 300); assert.ok(r.high < 4013, 'bars after the horizon never enter the path');
    const gap = path.filter((b) => b.time < T0 + 300 + 5 * 300); const inc = labelOutcome({ observation: o, horizonKey: 'h12', horizonBars: 12, tfSec: 300, bars: gap, nowSec: T0 + 300 + 12 * 300, provenance: 'TEST' }); assert.equal(inc.status, 'INCOMPLETE_PATH'); assert.equal(inc.bars_found, 5);
    const geo = labelOutcome({ observation: o, horizonKey: 'h48', horizonBars: 48, tfSec: 300, bars: path, nowSec: T0 + 300 + 48 * 300, side: 'BUY', refPrice: 4000, geometry: { entry: 4000, stop_loss: 3995, tp1: 4010 }, provenance: 'TEST' }); assert.equal(geo.geometry.touch, 'TP1'); assert.equal(geo.geometry.r_multiple, 2);
  });
});

describe('J-L. candidate registry immutability, provenance, replay never counts as forward', () => {
  it('the frozen registry verifies; a modified definition or an unfrozen candidate is refused; definitions are frozen objects with no execution fields', () => {
    assert.equal(verifyFrozenRegistry().ok, true); assert.deepEqual(Object.keys(registryHashes()), ['SC1_SILVER_LEAD_v1', 'SC2_PRODUCTION_SIGNAL_v1']);
    const c = candidateById('SC1_SILVER_LEAD_v1'); assert.equal(c.trigger.z_threshold, -1.5); assert.equal(c.hypothesis_side, 'SELL'); assert.ok(Object.isFrozen(c));
    assert.notEqual(definitionHash({ ...c, trigger: { ...c.trigger, z_threshold: -1.0 } }), definitionHash(c));
    const d = tmp(); const f = join(d, 'frozen.json');
    writeFileSync(f, JSON.stringify({ frozen_at: 'x', hashes: { ...registryHashes(), SC1_SILVER_LEAD_v1: 'deadbeef' } })); assert.throws(() => verifyFrozenRegistry(f), /CANDIDATE_MODIFIED:SC1_SILVER_LEAD_v1/);
    writeFileSync(f, JSON.stringify({ frozen_at: 'x', hashes: { SC1_SILVER_LEAD_v1: registryHashes().SC1_SILVER_LEAD_v1 } })); assert.throws(() => verifyFrozenRegistry(f), /UNFROZEN_CANDIDATE:SC2_PRODUCTION_SIGNAL_v1/); rmSync(d, { recursive: true, force: true });
    for (const cand of CANDIDATES) { assert.equal(cand.status, 'MEASURE_ONLY'); for (const k of ['execution', 'order', 'lot', 'volume', 'action']) assert.equal(k in cand, false, k); }
    assert.deepEqual(STATUSES, ['COLLECTING', 'INSUFFICIENT_FORWARD_EVIDENCE', 'PROMISING_UNPROVEN', 'FAILED_FORWARD_GATE', 'ELIGIBLE_FOR_INDEPENDENT_VALIDATION']); assert.equal(STATUSES.includes('PRODUCTION_APPROVED'), false);
    assert.equal(FORWARD_GATES.SC1_SILVER_LEAD_v1.min_observations, 150); assert.equal(FORWARD_GATES.SC2_PRODUCTION_SIGNAL_v1.min_observations, 100);
  });
  it('REPLAY mode writes HISTORICAL_REPLAY records; the report counts zero forward observations for them and stays COLLECTING', async () => {
    const dir = tmp(); const now = T0 + 300 + 600; const bars5 = bars(300, 40, T0 + 300 + 300); const rd = fakeReader({ bars5, bars15: bars(900, 30, T0 + 300), tick: { time: now - 1, bid: 4000, ask: 4000.26 } });
    const ob = createShadowObserver({ dir, reader: rd, prod: fakeProd(), now: () => now, mode: 'REPLAY', log: () => {} }); await ob.cycle();
    const recs = ob.store.readAll('observations'); assert.ok(recs.length >= 1); assert.ok(recs.every((r) => r.provenance === 'HISTORICAL_REPLAY'));
    const rep = evaluateCandidate('SC1_SILVER_LEAD_v1', recs, [], { nowSec: now }); assert.equal(rep.forward_observations, 0); assert.equal(rep.status, 'COLLECTING');
    const full = buildReport({ dir, nowSec: now }); assert.equal(full.forward_live.observations, 0); assert.ok(full.historical.observations >= 1); rmSync(dir, { recursive: true, force: true });
  });
});

describe('Observer integration (fake reader + fake production files): live cycles, dedup across restarts, triggers, signals, news events, delayed outcomes', () => {
  const silverCrash = (dec) => { const calm = bars(900, 120, dec, 30, 0.1).map((b, i) => ({ ...b, close: 30 + Math.sin(i) * 0.05 })); return [...calm.slice(0, -1), { ...calm.at(-1), close: 29 }]; };
  it('one FORWARD_LIVE candle observation per completed bar (after the 2-min production window), backfill beyond 15 min, a second cycle and a restarted observer add nothing', async () => {
    const dir = tmp(); const barT = T0; let now = T0 + 300 + 130; const bars5 = bars(300, 40, barT + 300 + 300); const rd = fakeReader({ bars5, bars15: bars(900, 30, T0 + 300), tick: { time: now - 1, bid: 4000, ask: 4000.26 } }); const prod = fakeProd({ snapshot: { action: 'WAIT', wait_reason: 'NO_ELIGIBLE_STRATEGY', regime_5m: 'COMPRESSION' } });
    const ob = createShadowObserver({ dir, reader: rd, prod, now: () => now, log: () => {} }); await ob.cycle();
    const recs = ob.store.readAll('observations'); const live = recs.filter((r) => r.provenance === 'FORWARD_LIVE'); const back = recs.filter((r) => r.provenance === 'BACKFILL');
    assert.equal(live.length, 3, 'bars whose close lies within [now-15min, now-2min]'); assert.equal(Math.max(...live.map((r) => r.bar_time)), barT); assert.ok(live.every((r) => r.production.action === 'WAIT')); assert.ok(back.length >= 1, 'older completed bars within 24 h are BACKFILL'); assert.ok(back.every((r) => r.bar_time < barT - 600));
    assert.equal(recs.some((r) => r.bar_time === barT + 300), false, 'the forming bar is never observed');
    const before = recs.length; now += 60; await ob.cycle(); assert.equal(ob.store.readAll('observations').length, before, 'second cycle: nothing new to observe');
    const ob2 = createShadowObserver({ dir, reader: rd, prod, now: () => now + 60, log: () => {} }); await ob2.cycle(); assert.equal(ob2.store.readAll('observations').length, before, 'restart: index rebuilt from disk, no duplicates'); assert.equal(ob2.status().counts.duplicates, 0);
    assert.ok(prod.reads.every((r) => ['snapshotForBar', 'newSignals', 'executionStatus', 'lastProtection', 'protectionEvents', 'calendar'].includes(r)), 'production is only read');
    rmSync(dir, { recursive: true, force: true });
  });
  it('SC1 trigger observation appears only at a 15m boundary with a completed silver crash bar; PRODUCTION_SIGNAL and NEWS_V2_EVENT observations are recorded with execution status and provenance', async () => {
    const dir = tmp(); const dec = T0 + 900; const barT = dec - 300; const now = dec + 130; const bars5 = bars(300, 40, dec + 300); const rd = fakeReader({ bars5, bars15: bars(900, 120, dec), tick: { time: now - 1, bid: 4000, ask: 4000.26 }, cross: { XAGUSDm: silverCrash(dec), DXYm: bars(900, 120, dec, 100), USTECm: null } });
    const sig = { signal_id: 'sig1', side: 'BUY', model: 'BO', quality: 72, rr: 2.2, entry: 4000, stop_loss: 3995, tp1: 4011, tp2: 4020, thesis_id: 't1', signal_bar_time: barT, created_at: new Date((dec + 10) * 1000).toISOString(), symbol: 'OANDA:XAUUSD' };
    const events = [{ timestamp: new Date((dec + 5) * 1000).toISOString(), type: 'NEWS_STATE_CHANGED', from: 'NORMAL', to: 'PRE_NEWS', reason: 'PRE_NEWS:CPI m/m', protection: { news_tier: 'B' } }];
    const prod = fakeProd({ signals: [sig], exec: { status: 'SKIPPED:NEWS_ENTRY_BLOCK', guard: 'news' }, events });
    const ob = createShadowObserver({ dir, reader: rd, prod, now: () => now, log: () => {} }); await ob.cycle();
    const recs = ob.store.readAll('observations'); const trig = recs.filter((r) => r.type === 'CANDIDATE_TRIGGER'); const ps = recs.filter((r) => r.type === 'PRODUCTION_SIGNAL'); const ne = recs.filter((r) => r.type === 'NEWS_V2_EVENT');
    assert.equal(trig.length, 1); assert.equal(trig[0].candidate_id, 'SC1_SILVER_LEAD_v1'); assert.equal(trig[0].hypothesis_side, 'SELL'); assert.equal(trig[0].execution_authority, 'NONE'); assert.equal(trig[0].decision_time_utc, new Date(dec * 1000).toISOString()); assert.equal(trig[0].provenance, 'FORWARD_LIVE');
    assert.equal(ps.length, 1); assert.equal(ps[0].payload.execution.status, 'SKIPPED:NEWS_ENTRY_BLOCK'); assert.equal(ps[0].hypothesis_side, 'BUY'); assert.equal(ps[0].execution_authority, 'NONE');
    assert.equal(ne.length, 1); assert.equal(ne[0].payload.to, 'PRE_NEWS'); assert.equal(ne[0].provenance, 'FORWARD_LIVE');
    const candle = recs.find((r) => r.type === 'CANDLE_5M' && r.bar_time === barT); assert.equal(candle.cross_asset.USTECm.available, false, 'missing cross-asset series recorded as unavailable'); assert.equal(candle.cross_asset.XAGUSDm.available, true);
    // outcomes: nothing before the horizon; after enough bars the pre-declared horizons are labeled once, append-only
    await ob.cycle(); assert.equal(ob.store.readAll('outcomes').filter((r) => r.observation_id === trig[0].observation_id || r.observation_id === ps[0].observation_id).length, 0, 'no outcome before the horizon elapsed (older BACKFILL candles may already be labelable)');
    const end = dec + 18 * 900; const later = end + 60; const decl = (tf, count) => Array.from({ length: count }, (_, i) => { const t = end - (count - i) * tf; const step = tf === 300 ? 0.2 : 0.6; const c = 4000 - i * step; return { time: t, open: c + step, high: c + step + 0.5, low: c - 0.5, close: c, volume: 1 }; });
    const rd2 = fakeReader({ bars5: decl(300, 400), bars15: decl(900, 200), tick: { time: later - 1, bid: 3990, ask: 3990.26 }, cross: { XAGUSDm: silverCrash(dec), DXYm: null, USTECm: null } });
    const ob2 = createShadowObserver({ dir, reader: rd2, prod: fakeProd(), now: () => later, log: () => {} }); await ob2.cycle();
    const outs = ob2.store.readAll('outcomes'); const t = outs.filter((r) => r.observation_id === trig[0].observation_id); assert.equal(t.length, 3); assert.deepEqual(t.map((r) => r.horizon).sort(), ['h16', 'h4', 'h8']); assert.ok(t.every((r) => r.status === 'LABELED' && r.provenance === 'FORWARD_LIVE' && r.side_signed_move_usd > 0), 'gold fell after the silver crash: SELL-signed move positive'); assert.ok(t.find((r) => r.horizon === 'h16').side_signed_move_usd > t.find((r) => r.horizon === 'h4').side_signed_move_usd);
    const s = outs.filter((r) => r.observation_id === ps[0].observation_id); assert.equal(s.length, 3); assert.equal(s.find((r) => r.horizon === 'h48').geometry.touch, 'SL');
    const n = outs.length; await ob2.cycle(); assert.equal(ob2.store.readAll('outcomes').length, n, 'outcomes are never re-labeled');
    assert.deepEqual(Object.keys(OUTCOME_PLAN), ['CANDLE_5M', 'SC1_SILVER_LEAD_v1', 'SC2_PRODUCTION_SIGNAL_v1']); assert.deepEqual([...CROSS_SYMBOLS], ['DXYm', 'XAGUSDm', 'USTECm']);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('M-N. no order path; production view is read-only', () => {
  const src = (p) => readFileSync(join(ROOT, p), 'utf8');
  it('no shadow module imports the engine, watcher, executor, policy or bridge (transitively); the python reader has no trade function; the reader protocol is a closed read-only list', () => {
    const forbidden = ['mt5Executor', 'mt5Bridge', 'mt5Policy', 'mt5RealPolicy', 'mt5RealScaling', 'mt5CapitalPolicy', 'watcher.js', 'xauusd_calculate', 'xauusd_analyze_market', 'signalStore', 'newsMonitor', 'protectionGuards', 'marketShock'];
    const files = ['schema.js', 'candidates.js', 'core.js', 'store.js', 'production.js', 'mt5Reader.js', 'observer.js', 'report.js'];
    for (const f of files) { const s = src(`src/shadow/${f}`); const imports = [...s.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]); for (const imp of imports) for (const bad of forbidden) assert.ok(!imp.includes(bad), `${f} imports ${imp}`); assert.ok(!/order_send|\.request\('open'|'close'|'modify'|order\(/.test(s), `${f} contains an order-like call`); }
    const py = src('mt5/mt5_shadow_reader.py'); for (const bad of ['order_send', 'order_check', 'order_calc', 'positions_close', 'TRADE_ACTION', 'Close(', 'Buy(', 'Sell(']) assert.ok(!py.includes(bad), `reader contains ${bad}`);
    assert.deepEqual([...READER_COMMANDS], ['rates', 'tick', 'select', 'ping', 'quit']);
    const r = createMt5Reader({ python: 'nonexistent-python-binary' }); return assert.rejects(r.request('order', {}), /READER_CMD_NOT_ALLOWED|READER_NOT_RUNNING/);
  });
  it('the production reader only reads production files (no write API, no fs write imports) and the observer writes only under its own directory', () => {
    const s = src('src/shadow/production.js'); assert.ok(!/writeFileSync|appendFileSync|openSync|renameSync|unlinkSync/.test(s)); const pr = createProductionReader({ waitLog: 'x', signalStore: 'y', auditLog: 'z', calendarSnapshot: 'w' }); assert.deepEqual(Object.keys(pr).filter((k) => k !== 'files').sort(), ['calendar', 'executionStatus', 'lastProtection', 'newSignals', 'protectionEvents', 'snapshotForBar']);
    const o = src('src/shadow/observer.js'); assert.ok(o.includes("state/shadow")); assert.ok(!/xauusd_mt5_real_executor_state|xauusd_watcher_state|xauusd_watcher\.lock/.test(o.replace(/PROD_FILES[^;]*;/s, '')), 'the observer never names a production state file as a write target');
    const storeSrc = src('src/shadow/store.js'); assert.ok(storeSrc.includes('join(dir,'), 'store paths are derived from its own directory only');
  });
});

describe('O-P. production untouched: engine output cannot depend on the observer; REAL config unchanged', () => {
  it('no production module imports anything from src/shadow (the dependency is one-directional)', () => {
    const walk = (d) => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
    const prodFiles = walk('src').filter((f) => !f.startsWith('src/shadow/') && f.endsWith('.js'));
    for (const f of prodFiles) assert.ok(!readFileSync(join(ROOT, f), 'utf8').includes('/shadow/'), `${f} references src/shadow`);
    assert.ok(!existsSync(join(ROOT, 'src/cli/commands/shadow.js')), 'no CLI entry was added to the production CLI');
  });
  it('REAL configuration defaults are unchanged by this stage: lot 0.01, breaker 2, RR 1.7, thesis exit, no sizing, News V2 tiers and extension off', () => {
    const c = resolveRealExecutorConfig({});
    assert.equal(c.lotSize, 0.01); assert.equal(c.exactLot, 0.01); assert.equal(c.maxLotSize, 0.01); assert.equal(c.sizingMode, 'fixed_user_lot'); assert.equal(c.computeSizing, undefined); assert.equal(c.maxConsecutiveLosses, 2); assert.equal(c.minEffectiveRr, 1.7); assert.equal(c.thesisExit, true); assert.equal(c.profitTargetUsd, 30); assert.equal(c.maximumLossUsd, -50);
    assert.equal(c.newsProtection, true); assert.equal(c.newsTierBCooldownMin, 55); assert.equal(c.newsTierAPostMin, 150); assert.equal(c.newsNormalizationMaxExtensionMin, 0); assert.equal(c.newsDataUnavailablePolicy, 'BLOCK');
  });
});
