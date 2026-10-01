/**
 * V8 FORWARD SHADOW VALIDATION (2026-10-01) -- deterministic tests. MEASURE ONLY; execution authority NONE.
 * Pure library (WAIT taxonomy, D1-D6 oracles, safety stage, hypothetical outcome, forensics, missed-setup classes) and the
 * runner end-to-end on a seeded synthetic multi-timeframe market through a fake read-only reader (no MT5, no CDP).
 * The V8 engine is built at test time in a temp directory from the V8 correction definitions.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORRECTIONS, ENGINE_FILES } from '../research/core_pattern_audit_v8/scripts/corrections.mjs';
import { WAIT_CATEGORIES, waitCategory, oracleStructure, oracleSweep, regressionChecks, safetyStage, labelOutcome, wrongDirectionClass, moveEventAt, classifyMissed, loadEngine, CONTROL_ENGINE_DIR, decisionId, verifyFrozenV8Engine } from '../research/v8_forward_shadow/scripts/lib.mjs';
import { createForwardShadow } from '../research/v8_forward_shadow/scripts/runner.mjs';
import { analyse, renderReports } from '../research/v8_forward_shadow/scripts/report.mjs';
import { computeStructure, STRUCTURE_PARAMS } from '../src/engine/structure.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
let TMP, ENGINES, V8STRUCT;
before(async () => {
  TMP = mkdtempSync(join(tmpdir(), 'v8f-engine-'));
  for (const f of ENGINE_FILES) { let t = readFileSync(join(ROOT, 'src', f), 'utf8'); for (const c of CORRECTIONS.filter((x) => x.file === f)) for (const e of c.edits) t = t.replace(e.old, () => e.new); const d = join(TMP, f); mkdirSync(dirname(d), { recursive: true }); writeFileSync(d, t); }
  ENGINES = { V8: await loadEngine(join(TMP, 'engine'), { fixes: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] }), CONTROL: await loadEngine(CONTROL_ENGINE_DIR, { fixes: [] }) };
  const s8 = await import(pathToFileURL(join(TMP, 'engine', 'structure.js')).href); V8STRUCT = (b) => s8.computeStructure(b, STRUCTURE_PARAMS);
});
after(() => { if (TMP) rmSync(TMP, { recursive: true, force: true }); });
const T0 = 1_700_000_000 - (1_700_000_000 % 3600);
const closesToBars = (c) => c.map((x, i) => ({ time: T0 + 300 * i, open: x, high: x + 0.2, low: x - 0.2, close: x }));
const flipFixture = () => { const c = []; for (let i = 0; i <= 12; i++) c.push(98 + Math.sin(i) * 0.3); for (let i = 13; i <= 22; i++) c.push(98 - (i - 12) * 0.3); for (let i = 23; i <= 30; i++) c.push(95 + (i - 22) * 0.625); c.push(99.6, 99.3, 99.1, 99.2, 99.5, 100.6, 101.0, 101.5); for (let k = 1; k <= 14; k++) c.push(101.5 - k * 0.55); return closesToBars(c); };

describe('WAIT reason taxonomy', () => {
  it('every production wait reason maps to one of the 15 allowed categories, with an exact detail', () => {
    for (const wr of ['INSUFFICIENT_DATA', 'BIAS_UNAVAILABLE', 'DATA_UNAVAILABLE_STALE', 'VOLATILITY_INSUFFICIENT', 'OVEREXTENDED', 'INVALID_GEOMETRY', 'RR_NOT_ACCEPTABLE', 'NO_GOOD_ENTRY', 'ENTRY_CONFLICT', 'HTF_CONFLICT', 'CHOP', 'NO_ELIGIBLE_STRATEGY']) { const w = waitCategory({ engineWr: wr, regime: 'TRANSITION', bias: { direction: 'NEUTRAL', regime: 'TRANSITION', eligible_models: ['BO', 'SR'] }, st: { BUY: { MC: 0, PB: 0, BO: 0, SR: 0, MR: 0 }, SELL: { MC: 0, PB: 0, BO: 0, SR: 0, MR: 0 } }, quality: { score: 60, threshold: 70, threshold_basis: 'neutral_bias_unsupported', breakdown: { qStructure: 5, qTrigger: 0, qSession: 2 } }, conflict: '30m two-factor', stale: '15m' }); assert.ok(WAIT_CATEGORIES.includes(w.category), wr); assert.ok(w.detail && w.detail.length > 3, wr); }
  });
  it('the quality gate is never a bare "low quality": score, threshold, basis and the weakest components are named', () => {
    const w = waitCategory({ engineWr: 'NO_GOOD_ENTRY', quality: { score: 61, threshold: 65, threshold_basis: 'directional_bias', breakdown: { qStructure: 5, qTrigger: 15, qSession: 2, qRr: 0 } } });
    assert.equal(w.category, 'OTHER_GOVERNED_REASON'); assert.match(w.detail, /QUALITY_GATE: score 61 < threshold 65 \(directional_bias\); weakest: qRr=0/);
  });
  it('NO_ELIGIBLE_STRATEGY is resolved to MODEL_NOT_ELIGIBLE / NO_TRIGGER / NO_SETUP / NO_PATTERN from the stages', () => {
    const z = { MC: 0, PB: 0, BO: 0, SR: 0, MR: 0 }; const bull = { direction: 'BULLISH', regime: 'BULL_TREND', eligible_models: ['MC', 'PB', 'BO', 'SR'] };
    assert.equal(waitCategory({ engineWr: 'NO_ELIGIBLE_STRATEGY', bias: bull, st: { BUY: z, SELL: { ...z, BO: 3 } } }).category, 'MODEL_NOT_ELIGIBLE');
    assert.equal(waitCategory({ engineWr: 'NO_ELIGIBLE_STRATEGY', bias: bull, st: { BUY: { ...z, PB: 2 }, SELL: z } }).category, 'NO_TRIGGER');
    assert.equal(waitCategory({ engineWr: 'NO_ELIGIBLE_STRATEGY', bias: bull, st: { BUY: { ...z, MC: 1 }, SELL: z } }).category, 'NO_SETUP');
    assert.equal(waitCategory({ engineWr: 'NO_ELIGIBLE_STRATEGY', bias: bull, st: { BUY: z, SELL: { ...z, MC: 2 } } }).category, 'NO_PATTERN');
    assert.match(waitCategory({ engineWr: 'NO_ELIGIBLE_STRATEGY', bias: bull, st: { BUY: { ...z, BO: 3 }, SELL: z } }).detail, /^STAGE_INCONSISTENT/);
  });
});

describe('D1-D6 regression oracles', () => {
  it('D1/D2 oracles: production structure on the D1 fixture is a VIOLATION, the corrected engine is OK', () => {
    const bars = flipFixture(); const o = oracleStructure(bars); assert.equal(o.state, 'BEARISH'); assert.equal(o.lastEvent.bar, 51);
    const asDecision = (s) => ({ engine_action: 'WAIT', structure5: { state: s.state, last_event: s.lastEvent ? { type: s.lastEvent.type, direction: s.lastEvent.direction, bar_time: bars[s.lastEvent.bar].time, level: s.lastEvent.level } : null, last_sweep: s.lastSweep ? { type: s.lastSweep.type, bar_time: bars[s.lastSweep.bar].time, level: s.lastSweep.level } : null } });
    assert.equal(regressionChecks(asDecision(computeStructure(bars, STRUCTURE_PARAMS)), { '5m': bars }).D1, 'VIOLATION');
    assert.equal(regressionChecks(asDecision(V8STRUCT(bars)), { '5m': bars }).D1, 'OK');
    const sw = oracleSweep(bars); assert.ok(sw === null || Number.isInteger(sw.bar));
  });
  it('D3 / D4 / D5 / D6 checks on setups', () => {
    const base = { engine_action: 'BUY', structure5: null, input_stale: null, stages: { pb_depth_atr: { BUY: 0.8 } } };
    assert.equal(regressionChecks({ ...base, candidate: { model: 'PB', side: 'BUY', entry: 100, rr_engine_unrounded: 2 } }, { '5m': [] }).D3, 'VIOLATION');
    assert.equal(regressionChecks({ ...base, candidate: { model: 'MR', side: 'SELL', entry: 103, midpoint: 105, rr_engine_unrounded: 2 } }, { '5m': [] }).D4, 'VIOLATION');
    assert.equal(regressionChecks({ ...base, candidate: { model: 'BO', side: 'BUY', entry: 100, rr_engine_unrounded: 1.696 } }, { '5m': [] }).D5, 'VIOLATION');
    assert.equal(regressionChecks({ ...base, input_stale: '15m', candidate: { model: 'BO', side: 'BUY', entry: 100, rr_engine_unrounded: 2 } }, { '5m': [] }).D6, 'VIOLATION');
    assert.equal(regressionChecks({ engine_action: 'WAIT', engine_wait_reason: 'DATA_UNAVAILABLE_STALE', input_stale: '15m' }, { '5m': [] }).D6, 'OK');
  });
});

describe('execution-safety stage (shadow, production limits)', () => {
  const cand = { entry: 4000 };
  it('spread, News V2, volatility shock, missing tick and margin', () => {
    assert.equal(safetyStage({ spread: 0.7, news: { state: 'NORMAL' }, shock: { state: 'NORMAL' }, candidate: cand }).block.category, 'SPREAD_BLOCK');
    assert.equal(safetyStage({ spread: 0.3, news: { state: 'PRE_NEWS' }, shock: { state: 'NORMAL' }, candidate: cand }).block.category, 'NEWS_BLOCK');
    assert.equal(safetyStage({ spread: 0.3, news: { state: 'DATA_UNAVAILABLE' }, shock: { state: 'NORMAL' }, candidate: cand }).block.category, 'NEWS_BLOCK');
    assert.equal(safetyStage({ spread: 0.3, news: { state: 'NORMAL' }, shock: { state: 'VOLATILITY_SHOCK' }, candidate: cand }).block.category, 'VOLATILITY_BLOCK');
    assert.equal(safetyStage({ spread: null, news: { state: 'NORMAL' }, shock: { state: 'NORMAL' }, candidate: cand }).block.category, 'DATA_UNAVAILABLE');
    const ok = safetyStage({ spread: 0.3, news: { state: 'NORMAL' }, shock: { state: 'NORMAL' }, candidate: cand }); assert.equal(ok.block, null); assert.equal(ok.checks.broker_ok_demo_10k, true);
  });
});

describe('hypothetical outcome (HYPOTHETICAL_NOT_EXECUTED) and forensics', () => {
  const path = (closes) => closes.map((c, i) => ({ time: T0 + 300 * i, open: c, high: c + 0.3, low: c - 0.3, close: c }));
  it('1.70R target reached: labelled, not executed, stress worse than normal; unresolved paths are not labelled', () => {
    const bars = path([100, 100.5, 101, 102, 103, 104, 105, 103, 101, 99, 97.5, 97]); const cand = { side: 'BUY', entry: 100, stop_loss: 98, tp2_engine: 106 };
    const o = labelOutcome(bars, 0, cand); assert.equal(o.label, 'HYPOTHETICAL_NOT_EXECUTED'); assert.equal(o.executed, false); assert.equal(o.fix170_normal.exit, 'TP'); assert.ok(o.fix170_stress.r < o.fix170_normal.r); assert.equal(o.open_normal.milestones['1.7'], true);
    assert.equal(labelOutcome(path([100, 100.5, 101, 102, 103, 104, 105]), 0, cand), null, 'open path still running: not labelled');
  });
  it('wrong-direction classification: valid losing trade vs data / timing / setup errors', () => {
    const d = { candidate: { model: 'BO', side: 'BUY', entry: 100, stop_loss: 98, bars_from_origin: 2, overextension_atr: 0.5 }, bias: { direction: 'NEUTRAL' }, stages: { BUY: '00300', SELL: '00000' }, regression: { D1: 'OK', D2: 'OK', D3: 'NA', D4: 'NA', D5: 'OK', D6: 'OK' }, latency_sec: 20, data_integrity: { a: 'PASS' } };
    assert.equal(wrongDirectionClass(d).cls, 'VALID_LOSING_TRADE');
    assert.equal(wrongDirectionClass({ ...d, input_stale: '15m' }).cls, 'DATA_ERROR');
    assert.equal(wrongDirectionClass({ ...d, latency_sec: 400 }).cls, 'TIMING_ERROR');
    assert.equal(wrongDirectionClass({ ...d, regression: { ...d.regression, D1: 'VIOLATION' } }).cls, 'PATTERN_ERROR');
    assert.equal(wrongDirectionClass({ ...d, candidate: { ...d.candidate, model: 'PB' }, stages: { BUY: '03000', SELL: '00000' }, regression: { ...d.regression, D3: 'VIOLATION' } }).cls, 'SETUP_ERROR');
    assert.equal(wrongDirectionClass({ ...d, candidate: { ...d.candidate, model: 'MC' }, stages: { BUY: '30000', SELL: '00000' } }).cls, 'DIRECTION_ERROR');
  });
});

describe('move events and missed-setup classes', () => {
  it('a 3-ATR move is found; detection, late, governed block, incorrect block and uncertain are separated', () => {
    const c = []; for (let i = 0; i < 30; i++) c.push(100 + Math.sin(i) * 0.2); for (let i = 1; i <= 10; i++) c.push(100 + i * 0.8); const bars = c.map((x, i) => ({ time: T0 + 300 * i, open: x, high: x + 0.25, low: x - 0.25, close: x }));
    const ev = moveEventAt(bars, 29); assert.equal(ev.dir, 'BUY');
    const times = []; for (let q = 23; q <= 35; q++) times.push(bars[q].time); const onset = bars[29].time;
    const mk = (over) => new Map([[onset, { bar_time: onset, stages: { BUY: '00300', SELL: '00000' }, ...over }]]);
    assert.equal(classifyMissed(ev, mk({ shadow_signal: true, candidate: { side: 'BUY' } }), times, onset).cls, 'DETECTED_CORRECTLY');
    assert.equal(classifyMissed(ev, new Map([[bars[31].time, { bar_time: bars[31].time, shadow_signal: true, candidate: { side: 'BUY' } }]]), times, onset).cls, 'DETECTED_LATE');
    assert.equal(classifyMissed(ev, mk({ wait_category: 'CONTEXT_CONFLICT' }), times, onset).cls, 'BLOCKED_CORRECTLY');
    assert.equal(classifyMissed(ev, mk({ wait_category: 'CONTEXT_CONFLICT', regression: { D1: 'VIOLATION' } }), times, onset).cls, 'BLOCKED_INCORRECTLY');
    assert.equal(classifyMissed(ev, new Map([[onset, { bar_time: onset, stages: { BUY: '00000', SELL: '00000' }, wait_category: 'NO_PATTERN' }]]), times, onset).cls, 'UNCERTAIN');
  });
});

// ---------------- runner end-to-end on a seeded synthetic market ----------------
function market(n5) { let s = 20261001 >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()); const b5 = []; let p = 4000; for (let i = 0; i < n5; i++) { const o = p; const c = o + gauss() * 2.6 + Math.sin(i / 90) * 0.4; const h = Math.max(o, c) + Math.abs(gauss()) * 1.2; const l = Math.min(o, c) - Math.abs(gauss()) * 1.2; b5.push({ time: T0 + 300 * i, open: +o.toFixed(3), high: +h.toFixed(3), low: +l.toFixed(3), close: +c.toFixed(3) }); p = c; } const agg = (sec) => { const m = new Map(); for (const b of b5) { const t = b.time - (b.time % sec); const x = m.get(t); if (!x) m.set(t, { ...b, time: t }); else { x.high = Math.max(x.high, b.high); x.low = Math.min(x.low, b.low); x.close = b.close; } } return [...m.values()]; }; return { '5m': b5, '15m': agg(900), '30m': agg(1800), '1H': agg(3600) }; }
function fakeReader(mkt, clock, { failAt = null, freeze15At = null } = {}) { return { rates: async (sym, tf, count) => { if (failAt && clock.now >= failAt[0] && clock.now < failAt[1] && tf === '15m') throw new Error('feed down'); const cut = freeze15At && tf === '15m' && clock.now >= freeze15At ? freeze15At : clock.now; const bars = mkt[tf].filter((b) => b.time <= cut).slice(-count); return { ok: true, bars }; }, tick: async () => { const last = mkt['5m'].filter((b) => b.time <= clock.now).at(-1); return { ok: true, tick: { time: clock.now, bid: last.close - 0.12, ask: last.close + 0.12 } }; } }; }

describe('forward runner: shadow decisions, restart, integrity, stale data, replay parity (fake read-only reader)', () => {
  it('records one decision per engine per completed bar, never executes, survives a restart without duplicates, fails closed on stale 15m', async () => {
    const mkt = market(6600); const dir = mkdtempSync(join(tmpdir(), 'v8f-state-')); const clock = { now: 0 }; const startBar = mkt['5m'][6400].time;
    const prod = { calendar: () => ({ events: [], source: 'test' }), lastProtection: () => null }; const newsEval = () => ({ state: 'NORMAL' });
    const freeze15At = mkt['5m'][6440].time; // the 15m feed stops updating here (stale snapshot scenario)
    let fs = await createForwardShadow({ dir, reader: fakeReader(mkt, clock, { freeze15At }), prod, newsEval, now: () => clock.now, engines: ENGINES });
    for (let k = 0; k < 60; k++) { const bt = startBar + 300 * k; clock.now = bt + 300 + 3; await fs.cycle(); clock.now = bt + 300 + 20; await fs.cycle(); if (k === 30) fs = await createForwardShadow({ dir, reader: fakeReader(mkt, clock, { freeze15At }), prod, newsEval, now: () => clock.now, engines: ENGINES }); }
    clock.now += 120; await fs.cycle();
    const D = fs.decisions(); const ids = new Set(D.map((d) => d.id)); assert.equal(ids.size, D.length, 'unique decision ids');
    assert.equal(D.filter((d) => d.engine === 'V8').length, 60); assert.equal(D.filter((d) => d.engine === 'CONTROL').length, 60);
    for (const d of D) { assert.equal(d.executed, false); assert.equal(d.execution_authority, 'NONE'); if (d.action === 'WAIT') assert.ok(WAIT_CATEGORIES.includes(d.wait_category), `${d.engine} ${d.wait_category}`); assert.equal(d.provenance, 'FORWARD_LIVE'); assert.ok(d.input_hashes?.['5m']); }
    const fresh = D.filter((d) => d.bar_time < freeze15At - 3600); assert.ok(fresh.every((d) => Object.values(d.data_integrity).every((v) => v === 'PASS')));
    const staleV8 = D.filter((d) => d.engine === 'V8' && d.bar_time > freeze15At + 3600); assert.ok(staleV8.length > 0 && staleV8.every((d) => d.action === 'WAIT' && d.wait_category === 'STALE_DATA'));
    const staleCtl = D.filter((d) => d.engine === 'CONTROL' && d.bar_time > freeze15At + 3600); assert.ok(staleCtl.every((d) => d.input_stale === '15m' && d.wait_category !== 'STALE_DATA'));
    assert.ok(D.filter((d) => d.engine === 'V8').every((d) => d.regression?.D6 !== 'VIOLATION'));
    const par = [...fs.parity().values()]; assert.ok(par.length > 0); assert.ok(par.every((p) => p.inputs_equal && p.match), JSON.stringify(par.filter((p) => !p.match).slice(0, 2)));
    assert.equal(decisionId('V8', startBar), D.find((d) => d.engine === 'V8' && d.bar_time === startBar).id);
    const out = mkdtempSync(join(tmpdir(), 'v8f-rep-')); const r = renderReports({ dir, outDir: out }); assert.equal(r.reports, 16); assert.equal(r.demo, 'NO'); assert.ok(existsSync(join(out, 'DEMO_VALIDATION_GATE.md'))); assert.match(readFileSync(join(out, 'V8_FORWARD_SHADOW_REPORT.md'), 'utf8'), /INTERIM — NOT FINAL/);
    const a = analyse(dir); assert.equal(a.conclusion, 'INCONCLUSIVE');
    rmSync(dir, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true });
  });
  it('a failed fetch records DATA_UNAVAILABLE for both engines (never guessed)', async () => {
    const mkt = market(6500); const dir = mkdtempSync(join(tmpdir(), 'v8f-fail-')); const clock = { now: 0 }; const bt = mkt['5m'][6400].time;
    const fs = await createForwardShadow({ dir, reader: fakeReader(mkt, clock, { failAt: [bt + 300, bt + 600] }), prod: null, newsEval: null, now: () => clock.now, engines: ENGINES });
    clock.now = bt + 300 + 20; await fs.cycle(); const D = fs.decisions(); assert.equal(D.length, 2); assert.ok(D.every((d) => d.wait_category === 'DATA_UNAVAILABLE' && /fetch failed/.test(d.wait_detail)));
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('frozen engine and shadow-only execution', () => {
  it('the live runner refuses a modified V8 engine (manifest check) when the regenerable engines exist', { skip: !existsSync(join(ROOT, 'research', 'core_pattern_audit_v8', 'engines', 'ALL')) }, () => { assert.ok(verifyFrozenV8Engine().files >= 14); });
  it('no executor, bridge, watcher, policy or order code anywhere in the forward shadow; the reader protocol is read-only', () => {
    for (const f of ['lib.mjs', 'runner.mjs', 'report.mjs']) { const s = readFileSync(join(ROOT, 'research', 'v8_forward_shadow', 'scripts', f), 'utf8'); for (const bad of ['mt5Executor', 'mt5Bridge', 'mt5RealPolicy', 'mt5Policy', 'watcher.js', 'order_send', "request('open'", "request('close'", "request('modify'", 'positions_close']) assert.ok(!s.includes(bad), `${f}: ${bad}`); }
    const r = readFileSync(join(ROOT, 'src', 'shadow', 'mt5Reader.js'), 'utf8'); assert.match(r, /READER_COMMANDS = Object.freeze\(\['rates', 'tick', 'select', 'ping', 'quit', 'book'\]\)/);
  });
});
