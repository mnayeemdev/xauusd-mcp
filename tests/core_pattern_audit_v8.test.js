/**
 * V8 CORE PATTERN EXECUTION AUDIT (2026-10-01) -- deterministic tests. RESEARCH ONLY: production files are read, never
 * modified. The corrected engine is built at test time in a temporary directory from
 * research/core_pattern_audit_v8/scripts/corrections.mjs (the same minimal edits the research replay used).
 * Each defect test asserts BOTH the production behaviour (the defect, documented) and the corrected behaviour.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORRECTIONS, ENGINE_FILES } from '../research/core_pattern_audit_v8/scripts/corrections.mjs';
import { computeStructure, findPivots, STRUCTURE_PARAMS } from '../src/engine/structure.js';
import { ema } from '../src/engine/math.js';
import * as PM from '../src/engine/intraday/models5m.js';
import { computeIntradayRisk } from '../src/engine/intraday/risk5m.js';
import { combineIntraday } from '../src/engine/intraday/pipeline5m.js';
import { eligibleModelsFor, sideAllowedByBias } from '../src/engine/intraday/bias.js';
import { INTRADAY_PARAMS as P } from '../src/engine/intraday/params.js';
import { calculateEntry } from '../src/core/xauusd_calculate.js';
import { registerOrGetSignal, loadStore, saveStore } from '../src/engine/signalStore.js';
import { canReenter } from '../src/engine/capitalHarvest/positionManager.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RES = join(ROOT, 'research', 'core_pattern_audit_v8', 'results');
let TMP; let V8 = {}; let V8CORE = null;
function applyAll(text, file) { let out = text; for (const c of CORRECTIONS.filter((x) => x.file === file)) for (const e of c.edits) { assert.equal(out.split(e.old).length - 1, 1, `${c.id} anchor in ${file}`); out = out.replace(e.old, () => e.new); } return out; }
before(async () => {
  TMP = mkdtempSync(join(tmpdir(), 'v8-engine-'));
  for (const f of ENGINE_FILES) { const dest = join(TMP, f); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, applyAll(readFileSync(join(ROOT, 'src', f), 'utf8'), f)); }
  const src = (p) => pathToFileURL(join(ROOT, 'src', p)).href;
  const core = applyAll(readFileSync(join(ROOT, 'src', 'core', 'xauusd_calculate.js'), 'utf8'), 'core/xauusd_calculate.js').replace(/from '(\.\.?\/[^']+)'/g, (_, f) => {
    if (f.startsWith('./')) return `from '${src(`core/${f.slice(2)}`)}'`;
    if (f.startsWith('../engine/') && ENGINE_FILES.includes(f.slice(3))) return `from '${f}'`;
    return `from '${src(f.slice(3))}'`;
  });
  mkdirSync(join(TMP, 'core'), { recursive: true }); writeFileSync(join(TMP, 'core', 'xauusd_calculate.js'), core);
  const imp = (p) => import(pathToFileURL(join(TMP, p)).href);
  V8 = { structure: await imp('engine/structure.js'), models: await imp('engine/intraday/models5m.js'), risk: await imp('engine/intraday/risk5m.js') };
  V8CORE = await imp('core/xauusd_calculate.js');
});
after(() => { if (TMP) rmSync(TMP, { recursive: true, force: true }); });

const T0 = 1_700_000_000;
const closesToBars = (c) => c.map((x, i) => ({ time: T0 + 300 * i, open: x, high: x + 0.2, low: x - 0.2, close: x }));
const NEUTRAL = (extra = {}) => ({ status: 'OK', direction: 'NEUTRAL', regime: 'TRANSITION', eligible_models: ['MC', 'PB', 'BO', 'SR', 'MR'], structure: {}, fresh_opposing_choch: null, ...extra });
const mirrorBar = (b, K) => ({ ...b, open: K - b.open, high: K - b.low, low: K - b.high, close: K - b.close });

describe('V8 corrections are research-only and apply to the unchanged production source', () => {
  it('every correction anchor occurs exactly once in production and production carries no V8 edit', () => {
    for (const c of CORRECTIONS) { const text = readFileSync(join(ROOT, 'src', c.file), 'utf8'); assert.ok(!text.includes('V8 D'), `${c.file} already patched`); for (const e of c.edits) assert.equal(text.split(e.old).length - 1, 1, `${c.id}`); }
    assert.deepEqual(CORRECTIONS.map((c) => c.id), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
  });
});

describe('candle structure: rejection candle (SR) needs shape AND location, BUY/SELL symmetric', () => {
  const atrVal = 2; const level = 100;
  const buyBar = { time: T0, open: 100.9, high: 101.3, low: 99.8, close: 101.2 }; // lower wick 1.1 of range 1.5 (73 %), close in the top third
  const ctx = (bar, structure) => ({ bars: [bar, bar], structure: { state: null, ...structure }, atrVal, bias: NEUTRAL() });
  it('BUY rejection at the 5m swing low -> SR BUY with the stop beyond the wick; the mirrored candle at the mirrored swing high -> SR SELL', () => {
    const c = PM.evaluateStructureRejection(ctx(buyBar, { lastSwingLow: { price: level } })); assert.equal(c.model, 'SR'); assert.equal(c.side, 'BUY'); assert.equal(c.slAnchor, 99.8);
    const K = 200; const s = PM.evaluateStructureRejection(ctx(mirrorBar(buyBar, K), { lastSwingHigh: { price: K - level } })); assert.equal(s.side, 'SELL'); assert.equal(s.slAnchor, K - 99.8);
  });
  it('the same candle away from any level stays WAIT; a long wick that closes mid-bar is not a rejection', () => {
    assert.equal(PM.evaluateStructureRejection(ctx(buyBar, { lastSwingLow: { price: 95 } })), null);
    assert.equal(PM.evaluateStructureRejection(ctx({ ...buyBar, close: 100.6, open: 100.7 }, { lastSwingLow: { price: level } })), null);
  });
});

describe('structure: pivots, confirmation latency, BOS / CHoCH chronology (D1)', () => {
  const fixtureFlip = () => { const c = []; for (let i = 0; i <= 12; i++) c.push(98 + Math.sin(i) * 0.3); for (let i = 13; i <= 22; i++) c.push(98 - (i - 12) * 0.3); for (let i = 23; i <= 30; i++) c.push(95 + (i - 22) * 0.625); c.push(99.6, 99.3, 99.1, 99.2, 99.5, 100.6, 101.0, 101.5); for (let k = 1; k <= 14; k++) c.push(101.5 - k * 0.55); return closesToBars(c); };
  it('a pivot is reported only once pivotRightBars (5) confirmed bars exist after it -- never from future bars', () => {
    const c = []; for (let i = 0; i < 20; i++) c.push(100 + (i <= 10 ? i : 20 - i)); const bars = closesToBars(c);
    assert.ok(!findPivots(bars.slice(0, 15), 5, 5).some((p) => p.index === 10), '4 right bars: not yet a pivot');
    assert.ok(findPivots(bars.slice(0, 16), 5, 5).some((p) => p.index === 10 && p.type === 'high'), '5 right bars: confirmed');
    for (let n = 12; n <= bars.length; n++) for (const p of computeStructure(bars.slice(0, n), STRUCTURE_PARAMS).pivots ?? []) assert.ok(p.index <= n - 6);
  });
  it('PRODUCTION (D1 defect): after a close below the 94.8 swing low the structure still reads BULLISH (last event = an older CHoCH)', () => {
    const s = computeStructure(fixtureFlip(), STRUCTURE_PARAMS); assert.equal(s.state, 'BULLISH'); assert.equal(s.lastEvent.bar, 36);
  });
  it('CORRECTED: breaks are walked in time order -> BEARISH, last event = the bar-51 break of 94.8; BOS / CHoCH labels follow the running direction', () => {
    const s = V8.structure.computeStructure(fixtureFlip(), STRUCTURE_PARAMS); assert.equal(s.state, 'BEARISH'); assert.equal(s.lastEvent.bar, 51); assert.equal(s.lastEvent.type, 'CHOCH'); assert.ok(Math.abs(s.lastEvent.level - 94.8) < 1e-9);
    const c = []; for (let i = 0; i <= 10; i++) c.push(100 + i * 0.5); for (let i = 11; i <= 22; i++) c.push(105 - (i - 10) * 0.8); for (let i = 23; i <= 27; i++) c.push(96 + (i - 23) * 0.3); for (let i = 28; i <= 30; i++) c.push(95.5 - (i - 27) * 0.6); for (let i = 31; i <= 45; i++) c.push(94 + (i - 30) * 0.8); for (let i = 46; i <= 52; i++) c.push(106.5 + (i - 45) * 0.1);
    const prod = computeStructure(closesToBars(c), STRUCTURE_PARAMS), fix = V8.structure.computeStructure(closesToBars(c), STRUCTURE_PARAMS);
    assert.equal(prod.lastEvent.type, 'CHOCH'); assert.equal(prod.lastEvent.bar, 35);
    assert.equal(fix.lastEvent.type, 'BOS'); assert.equal(fix.lastEvent.bar, 45); assert.ok(Math.abs(fix.lastEvent.level - 105.2) < 1e-9); assert.equal(fix.state, 'BULLISH');
  });
  it('CORRECTED structure is mirror-symmetric on the D1 fixture (BEARISH <-> BULLISH)', () => {
    const bars = fixtureFlip(); const m = bars.map((b) => mirrorBar(b, 200));
    assert.equal(V8.structure.computeStructure(m, STRUCTURE_PARAMS).state, 'BULLISH');
  });
});

describe('liquidity sweep recency (D2)', () => {
  const sweepFixture = () => { const bars = []; const add = (o, h, l, c) => bars.push({ time: T0 + 300 * bars.length, open: o, high: h, low: l, close: c }); const lin = (a, b, n) => { for (let k = 1; k <= n; k++) { const c = a + (b - a) * k / n; add(c - 0.05, c + 0.2, c - 0.2, c); } };
    add(100, 100.2, 99.8, 100); lin(100, 105, 10); lin(105, 100, 10); lin(100, 103, 10); lin(103, 102, 4); lin(102, 102.5, 3); add(102.6, 103.5, 102.4, 102.8); lin(102.8, 104.0, 11); add(104.0, 105.4, 103.9, 104.6); return bars; };
  it('PRODUCTION returns a 9-bar-old sweep of the newer pivot; CORRECTED returns the current bar sweeping the 105.2 high', () => {
    const bars = sweepFixture(); const i = bars.length - 1;
    const p = computeStructure(bars, STRUCTURE_PARAMS).lastSweep; assert.equal(p.bar, 41); assert.ok(i - p.bar > P.mrSweepMaxAgeBars);
    const f = V8.structure.computeStructure(bars, STRUCTURE_PARAMS).lastSweep; assert.equal(f.bar, 50); assert.equal(f.type, 'SWEEP_HIGH'); assert.ok(Math.abs(f.level - 105.2) < 1e-9);
  });
});

describe('breakout + retest + reclaim (BO): level, confirmation, retest, invalidation, lateness, BUY/SELL', () => {
  const base = (closes, extra = {}) => { const bars = closes.map((c, i) => ({ time: T0 + 300 * i, open: c, high: c + 0.3, low: c - 0.3, close: c, ...(extra[i] ?? {}) })); return bars; };
  const ctx = (bars, ev, regime = 'TRANSITION') => ({ bars, regime, structure: { state: ev.direction, lastEvent: ev }, atrVal: 2, bias: NEUTRAL() });
  const ev = { type: 'BOS', direction: 'BULLISH', bar: 2, level: 100 };
  it('a confirmed close above the level, a retest within 0.3 ATR and a reclaim close -> BO BUY; stop anchor = the retest low', () => {
    const bars = base([99, 99.5, 101, 100.8, 101.5], { 3: { low: 100.3 } }); const c = PM.evaluateBreakoutRetest(ctx(bars, ev)); assert.equal(c.side, 'BUY'); assert.equal(c.anchor, 100); assert.equal(c.slAnchor, 100.3); assert.equal(c.originBar, 2);
  });
  it('no retest -> WAIT; retest but the current close is back below the level -> WAIT; more than 10 bars after the break -> WAIT; CHOP regime -> WAIT', () => {
    assert.equal(PM.evaluateBreakoutRetest(ctx(base([99, 99.5, 101, 102, 103, 104]), ev)), null);
    assert.equal(PM.evaluateBreakoutRetest(ctx(base([99, 99.5, 101, 100.2, 99.7]), ev)), null);
    const late = base([99, 99.5, 101, ...Array(10).fill(102), 100.1, 101], { 13: { low: 100.1 } }); assert.equal(PM.evaluateBreakoutRetest(ctx(late, ev)), null);
    assert.equal(PM.evaluateBreakoutRetest(ctx(base([99, 99.5, 101, 100.8, 101.5], { 3: { low: 100.3 } }), ev, 'CHOP_UNCERTAIN')), null);
  });
  it('mirrored chart -> BO SELL with the mirrored stop', () => {
    const K = 200; const bars = base([99, 99.5, 101, 100.8, 101.5], { 3: { low: 100.3 } }).map((b) => mirrorBar(b, K)); const c = PM.evaluateBreakoutRetest(ctx(bars, { type: 'BOS', direction: 'BEARISH', bar: 2, level: K - 100 })); assert.equal(c.side, 'SELL'); assert.ok(Math.abs(c.slAnchor - (K - 100.3)) < 1e-9);
  });
});

describe('momentum continuation (MC)', () => {
  it('3 progressing closes above EMA20 with expanding ATR and a fresh close above the prior swing -> MC BUY; contracting ATR -> WAIT; NEUTRAL bias -> WAIT', () => {
    const closes = [100, 100.1, 100.2, 100.3, 100.4, 101.0, 101.6, 102.3]; const bars = closes.map((c, i) => ({ time: T0 + 300 * i, open: c - 0.1, high: c + 0.2, low: c - 0.3, close: c })); const ema20 = closes.map(() => 100.5);
    const structure = { lastSwingHigh: { price: 101.2, index: 3 } }; const bias = { status: 'OK', direction: 'BULLISH', eligible_models: ['MC', 'PB', 'BO', 'SR'] };
    const c = PM.evaluateMomentumContinuation({ bars, structure, atrRatio: 1.2, ema20, bias }); assert.equal(c.model, 'MC'); assert.equal(c.side, 'BUY'); assert.equal(c.originBar, 6);
    assert.equal(PM.evaluateMomentumContinuation({ bars, structure, atrRatio: 0.9, ema20, bias }), null);
    assert.equal(PM.evaluateMomentumContinuation({ bars, structure, atrRatio: 1.2, ema20, bias: { ...bias, direction: 'NEUTRAL' } }), null);
  });
});

describe('pullback continuation (PB, D3): depth of the pullback, not the remaining distance', () => {
  const pbBars = (tail) => { const closes = []; for (let k = 0; k < 50; k++) closes.push(100 + 0.1 * k); closes.push(...tail); return closes.map((c, i) => ({ time: T0 + 300 * i, open: i ? closes[i - 1] : c, high: Math.max(c, i ? closes[i - 1] : c) + 0.4, low: Math.min(c, i ? closes[i - 1] : c) - 0.4, close: c })); };
  const bias = { status: 'OK', direction: 'BULLISH', eligible_models: ['MC', 'PB', 'BO', 'SR'] };
  const run = (mod, tail) => { const bars = pbBars(tail); return mod.evaluatePullbackContinuation({ bars, ema20: ema(bars.map((b) => b.close), 20), bias }); };
  it('a 2.6-ATR pullback resolved by two closes back above EMA20: PRODUCTION misses it, CORRECTED recognises PB BUY with the stop at the pullback low', () => {
    const tail = [104.3, 103.6, 103.0, 102.8, 104.0, 104.6]; assert.equal(run(PM, tail), null);
    const c = run(V8.models, tail); assert.equal(c.side, 'BUY'); const bars = pbBars(tail); const low = Math.min(...bars.slice(-6).map((b) => b.low)); assert.equal(c.slAnchor, low);
  });
  it('a single close back above EMA20 is not yet a resolution in either engine', () => {
    const tail = [104.3, 103.6, 103.0, 102.6, 103.4, 103.75]; assert.equal(run(PM, tail), null); assert.equal(run(V8.models, tail), null);
  });
});

describe('mean reversion location (MR, D4)', () => {
  const ctxMR = (close) => { const bars = []; for (let i = 0; i < 6; i++) bars.push({ time: T0 + 300 * i, open: close, high: close + 0.5, low: close - 0.5, close }); return { bars, regime: 'RANGE', structure: { state: null, lastSweep: { type: 'SWEEP_HIGH', bar: 5, level: close + 0.2 } }, bias: { status: 'OK', direction: 'NEUTRAL', regime: 'RANGE', eligible_models: ['BO', 'SR', 'MR'], structure: { rangeHigh: 110, rangeLow: 100 } }, m30Regime: 'RANGE' }; };
  it('a SELL sweep below the 15m range midpoint: PRODUCTION trades MR SELL toward a target ABOVE the entry; CORRECTED stays WAIT', () => {
    const p = PM.evaluateMeanReversion(ctxMR(103)); assert.equal(p.side, 'SELL'); assert.ok(p.objectiveOverride > 103);
    assert.equal(V8.models.evaluateMeanReversion(ctxMR(103)), null);
  });
  it('a SELL sweep above the midpoint is MR SELL in both engines, target = midpoint 105', () => {
    for (const mod of [PM, V8.models]) { const c = mod.evaluateMeanReversion(ctxMR(108)); assert.equal(c.side, 'SELL'); assert.equal(c.objectiveOverride, 105); }
  });
});

describe('structural SL, TP and RR (D5); BUY and SELL; fractional prices', () => {
  const bars = (close) => [{ time: T0, open: close, high: close + 0.5, low: close - 0.5, close }];
  const geo = (mod, side, close, anchor, objective) => mod.computeIntradayRisk({ candidate: { model: 'BO', side, anchor, slAnchor: anchor }, bars: bars(close), atrVal: 4, structure5: { pivots: [{ type: side === 'BUY' ? 'high' : 'low', price: objective }] }, structure15: null }, P);
  it('BUY: SL = anchor - 0.25 ATR, TP1 = entry + 1R, TP2 = the structural objective, RR exact', () => {
    const g = geo({ computeIntradayRisk }, 'BUY', 3999.457, 3996.123, 4010.111); assert.equal(g.gate, 'OK'); assert.equal(g.stop_loss, 3995.12); const risk = 3999.457 - (3996.123 - 1); assert.ok(Math.abs(g.tp1 - (3999.457 + risk)) < 0.006); assert.equal(g.tp2, 4010.11); assert.equal(g.rr, +((4010.111 - 3999.457) / risk).toFixed(2));
  });
  it('SELL mirrors BUY exactly', () => {
    const b = geo({ computeIntradayRisk }, 'BUY', 3999.457, 3996.123, 4010.111); const K = 8000; const s = geo({ computeIntradayRisk }, 'SELL', K - 3999.457, K - 3996.123, K - 4010.111);
    assert.ok(Math.abs(s.stop_loss - (K - b.stop_loss)) <= 0.011); assert.ok(Math.abs(s.tp2 - (K - b.tp2)) <= 0.011); assert.equal(s.rr, b.rr);
  });
  it('min risk 0.5 ATR, wrong-side fallback 1.5 ATR, default TP2 = 2R without objectives, cap 3R', () => {
    const tight = computeIntradayRisk({ candidate: { side: 'BUY', anchor: 100, slAnchor: 100 }, bars: bars(100.5), atrVal: 4, structure5: { pivots: [] } }, P); assert.equal(tight.sl_source, 'candidate_anchor+min_risk'); assert.ok(Math.abs((100.5 - tight.stop_loss) - 2) < 0.006);
    const wrong = computeIntradayRisk({ candidate: { side: 'BUY', anchor: 100, slAnchor: 102 }, bars: bars(100.5), atrVal: 4, structure5: { pivots: [] } }, P); assert.equal(wrong.sl_source, 'atr_fallback'); assert.equal(wrong.objective.source, 'default_r_multiple'); assert.equal(wrong.rr, 2);
    const far = computeIntradayRisk({ candidate: { side: 'BUY', anchor: 99, slAnchor: 99 }, bars: bars(100), atrVal: 4, structure5: { pivots: [{ type: 'high', price: 120 }] } }, P); assert.equal(far.rr, 3); assert.equal(far.objective.capped, true);
  });
  it('PRODUCTION accepts an objective at 1.696 R because the RR is rounded before the 1.70 gate; CORRECTED rejects it; exactly 1.70 R passes both', () => {
    const mk = (mod, r) => mod.computeIntradayRisk({ candidate: { side: 'BUY', anchor: 99, slAnchor: 99 }, bars: [{ time: T0, open: 100, high: 100.1, low: 99.9, close: 100 }], atrVal: 2, structure5: { pivots: [{ type: 'high', price: 100 + r * 1.5 }] } }, P);
    assert.equal(mk({ computeIntradayRisk }, 1.696).gate, 'OK'); assert.equal(mk({ computeIntradayRisk }, 1.696).rr, 1.7);
    assert.equal(mk(V8.risk, 1.696).gate, 'RR_NOT_ACCEPTABLE');
    assert.equal(mk({ computeIntradayRisk }, 1.7).gate, 'OK'); assert.equal(mk(V8.risk, 1.7).gate, 'OK');
  });
});

describe('model eligibility, context conflicts, BUY / SELL / WAIT', () => {
  it('15m regime -> eligible model sets (documented mapping)', () => {
    assert.deepEqual(eligibleModelsFor({ regime: 'BULL_TREND', direction: 'BULLISH' }), ['MC', 'PB', 'BO', 'SR']);
    assert.deepEqual(eligibleModelsFor({ regime: 'RANGE', direction: 'NEUTRAL' }), ['BO', 'SR', 'MR']);
    assert.deepEqual(eligibleModelsFor({ regime: 'TRANSITION', direction: 'NEUTRAL' }), ['BO', 'SR']);
    assert.deepEqual(eligibleModelsFor({ regime: 'COMPRESSION', direction: 'NEUTRAL' }), ['BO']);
    assert.deepEqual(eligibleModelsFor({ regime: 'CHOP_UNCERTAIN', direction: 'NEUTRAL' }), []);
    assert.equal(sideAllowedByBias({ status: 'OK', direction: 'BULLISH' }, 'SELL'), false); assert.equal(sideAllowedByBias({ status: 'OK', direction: 'NEUTRAL' }, 'SELL'), true);
  });
  const intra = (side, model = 'BO') => ({ status: 'OK', model, decision: { action: side, entry: 1, stop_loss: 0, tp1: 2, tp2: 3, rr: 3 }, quality: { score: 80 }, regime: 'TRANSITION' });
  it('fresh opposing 15m CHoCH -> ENTRY_CONFLICT; 30m regime AND structure opposed -> ENTRY_CONFLICT; 30m regime only -> allowed', () => {
    assert.equal(combineIntraday({ intraday: intra('BUY'), bias: { status: 'OK', direction: 'NEUTRAL', fresh_opposing_choch: { direction: 'BEARISH', bars_ago: 1 } } }).wait_reason, 'ENTRY_CONFLICT');
    assert.equal(combineIntraday({ intraday: intra('BUY'), bias: { status: 'OK', direction: 'NEUTRAL' }, m30: { status: 'OK', regime: 'BEAR_TREND', structure: { state: 'BEARISH' } } }).wait_reason, 'ENTRY_CONFLICT');
    assert.equal(combineIntraday({ intraday: intra('BUY'), bias: { status: 'OK', direction: 'NEUTRAL' }, m30: { status: 'OK', regime: 'BEAR_TREND', structure: { state: 'BULLISH' } } }).action, 'BUY');
  });
  it('1H opposed: vetoes MR and unaligned trades (HTF_CONFLICT) but not an aligned continuation', () => {
    const h1 = { status: 'OK', regime: 'BEAR_TREND' };
    assert.equal(combineIntraday({ intraday: intra('BUY', 'MR'), bias: { status: 'OK', direction: 'NEUTRAL' }, ctx1H: h1 }).wait_reason, 'HTF_CONFLICT');
    assert.equal(combineIntraday({ intraday: intra('BUY'), bias: { status: 'OK', direction: 'NEUTRAL' }, ctx1H: h1 }).wait_reason, 'HTF_CONFLICT');
    assert.equal(combineIntraday({ intraday: intra('BUY', 'MC'), bias: { status: 'OK', direction: 'BULLISH' }, ctx1H: h1 }).action, 'BUY');
    assert.equal(combineIntraday({ intraday: { ...intra('BUY'), decision: { action: 'WAIT', wait_reason: 'NO_ELIGIBLE_STRATEGY' } }, bias: { status: 'OK', direction: 'NEUTRAL' } }).action, 'WAIT');
  });
});

describe('live orchestrator: timing, forming bar, data failure, stale data (D6)', () => {
  const FX = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'xauusd_intraday_session_2026-09-25.json'), 'utf8'));
  const TFSEC = { 5: 300, 15: 900, 30: 1800, 60: 3600, 240: 14400 };
  const deps = ({ forming = 1.5, shift = 0, staleTf = null, fail = null, invalid = null } = {}) => { let tf = '5'; return {
    getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '5' }), setTimeframe: async ({ timeframe }) => { tf = String(timeframe); },
    getOhlcv: async () => { if (fail === tf) throw new Error('feed down'); const src = FX.bars[tf]; if (!src) throw new Error('timeframe not in fixture'); const sec = TFSEC[tf]; const last = src.at(-1); const bars = [...src, { time: last.time + sec, open: last.close, high: last.close * forming, low: last.close / forming, close: last.close, volume: 1 }].map((b) => ({ ...b, time: b.time + shift - (staleTf === tf ? 4 * 3600 : 0) })); if (invalid === tf) bars[10] = { ...bars[10], high: bars[10].low - 1 }; return { bars }; },
    getMasterState: async () => ({}), loadStore: () => ({ signals: [] }), saveStore: () => {}, storePath: join(tmpdir(), 'v8-never-written.json'), cdpLockPath: join(tmpdir(), 'v8-no-lock'), withCdpLock: async (_p, fn) => fn(), env: { XAUUSD_ENGINE_PROFILE: 'intraday_5m' } }; };
  const run = (mod, o) => mod.calculateEntry({ enablePineComparison: false, engineProfile: 'intraday_5m', _deps: deps(o) });
  const key = (r) => JSON.stringify({ a: r.action, w: r.reason, e: r.entry, sl: r.sl, tp2: r.tp2, m: r.setup });
  it('the forming bar is never used: wildly different forming bars on every timeframe give the identical decision', async () => {
    assert.equal(key(await run({ calculateEntry }, { forming: 1.5 })), key(await run({ calculateEntry }, { forming: 1.001 })));
  });
  it('the decision bar is the last CONFIRMED 5m bar', async () => {
    const r = await run({ calculateEntry }); assert.equal(r.status, 'OK'); assert.equal(r.market_data_times['5m'], FX.bars['5'].at(-1).time);
  });
  it('missing or invalid 5m / 15m data fails closed to DATA_UNAVAILABLE with the reason recorded (never a pattern WAIT); missing 1H only drops that context', async () => {
    const a = await run({ calculateEntry }, { fail: '5' }); assert.equal(a.status, 'DATA_UNAVAILABLE'); assert.ok(a.errors.some((e) => e.startsWith('5m')));
    const b = await run({ calculateEntry }, { invalid: '15' }); assert.equal(b.status, 'DATA_UNAVAILABLE'); assert.ok(b.errors.some((e) => e.includes('invalid OHLC')));
    const c = await run({ calculateEntry }, { fail: '60' }); assert.equal(c.status, 'OK');
  });
  it('PRODUCTION (D6 defect) decides on a 15m snapshot 4 h old; CORRECTED fails closed with the stale reason; fresh data is OK in both', async () => {
    const now = Math.floor(Date.now() / 1000); const shift = now - (FX.bars['5'].at(-1).time + 300 + 30);
    const prod = await run({ calculateEntry }, { shift, staleTf: '15' }); assert.equal(prod.status, 'OK');
    const fix = await run(V8CORE, { shift, staleTf: '15' }); assert.equal(fix.status, 'DATA_UNAVAILABLE'); assert.ok(fix.errors.some((e) => e.startsWith('15m: stale data')));
    assert.equal((await run(V8CORE, { shift })).status, 'OK'); assert.equal((await run({ calculateEntry }, { shift })).status, 'OK');
  });
});

describe('duplicates, restart and stale signals', () => {
  it('the same signal registers once; a restart (store saved and reloaded) does not create a second record', () => {
    const dir = mkdtempSync(join(tmpdir(), 'v8-store-')); const p = join(dir, 'store.json');
    const cand = { symbol: 'OANDA:XAUUSD', timeframe: '5m', model: 'BO', side: 'BUY', originBar: T0, signalBarTime: T0 + 600, entry: 100, stop_loss: 98, tp1: 102, tp2: 104, rr: 2, quality: 70, thesisId: 'th1' };
    const s = loadStore(p); assert.equal(registerOrGetSignal(s, cand).isNew, true); assert.equal(registerOrGetSignal(s, cand).isNew, false); saveStore(p, s);
    const s2 = loadStore(p); const again = registerOrGetSignal(s2, cand); assert.equal(again.isNew, false); assert.equal(s2.signals.length, 1);
    const sameThesis = registerOrGetSignal(s2, { ...cand, signalBarTime: T0 + 900 }); assert.equal(sameThesis.isNew, false); assert.equal(sameThesis.blockedByOpenThesis, true);
    rmSync(dir, { recursive: true, force: true });
  });
  it('re-entry rules: never on the same or an earlier candle; the same setup within 12 bars is stale; revenge guard after a loss', () => {
    assert.equal(canReenter({ signal: { i: 10, model: 'BO', side: 'BUY', anchor: 1 }, exitBar: 10, lastTrade: null, lastExitWasLoss: false }).reason, 'SAME_OR_EARLIER_CANDLE');
    assert.equal(canReenter({ signal: { i: 20, model: 'BO', side: 'BUY', anchor: 1 }, exitBar: 15, lastTrade: { i: 12, model: 'BO', side: 'BUY', anchor: 1 }, lastExitWasLoss: false }).reason, 'STALE_SAME_SETUP');
    assert.equal(canReenter({ signal: { i: 17, model: 'PB', side: 'BUY', anchor: 2 }, exitBar: 15, lastTrade: { i: 12, model: 'BO', side: 'BUY', anchor: 1 }, lastExitWasLoss: true }).reason, 'REVENGE_GUARD');
    assert.equal(canReenter({ signal: { i: 30, model: 'PB', side: 'SELL', anchor: 2 }, exitBar: 15, lastTrade: { i: 12, model: 'BO', side: 'BUY', anchor: 1 }, lastExitWasLoss: true }).ok, true);
  });
});

describe('replay parity and symmetry evidence (local research results; skipped when the regenerable results are absent)', () => {
  const full = join(RES, 'v8_results_FULL.json');
  it('research replay = Edge Lab replay on every bar; CONTROL reproduces V7; unchanged copy identical; stage logic = production models', { skip: !existsSync(full) }, () => {
    const r = JSON.parse(readFileSync(full, 'utf8')); assert.ok(Object.values(r.fidelity.control_vs_lab.mismatches).every((x) => x === 0)); assert.equal(r.fidelity.control_vs_lab.missing, 0); assert.equal(r.fidelity.copy_vs_control.identical, r.fidelity.copy_vs_control.compared);
    for (const o of Object.values(r.fidelity.stage_parity)) for (const s of Object.values(o)) assert.equal(s.mismatch, 0);
    assert.ok(Object.values(r.control_reproduces_v7).every((x) => x.pass)); assert.equal(r.decision.DEMO_ELIGIBLE, 'NO');
  });
  it('live orchestrator (garbage forming bar) = research replay on the sample', { skip: !existsSync(join(RES, 'live_parity.json')) }, () => {
    const r = JSON.parse(readFileSync(join(RES, 'live_parity.json'), 'utf8')); assert.equal(r.pass, true); assert.ok(r.sample_bars > 1000);
  });
  it('with the price-relative terms neutralised the corrected engine mirrors every sampled decision', { skip: !existsSync(join(RES, 'symmetry.json')) }, () => {
    const r = JSON.parse(readFileSync(join(RES, 'symmetry.json'), 'utf8')); if (r.engines.SYMPROBE_ALL) assert.equal(r.engines.SYMPROBE_ALL.symmetry_rate, 1);
  });
});

describe('no execution path', () => {
  it('the V8 research scripts import no executor, bridge, watcher, policy or order code', () => {
    const dir = join(ROOT, 'research', 'core_pattern_audit_v8', 'scripts');
    for (const f of ['corrections.mjs', 'build_engines.mjs', 'v8_replay.mjs', 'v8_study.mjs', 'v8_live_parity.mjs', 'v8_symmetry.mjs', 'v8_live_production_parity.mjs', 'v8_symmetry_residual.mjs']) { const s = readFileSync(join(dir, f), 'utf8'); for (const bad of ['mt5Executor', 'mt5Bridge', 'mt5RealPolicy', 'watcher.js', 'order_send', "request('open'"]) assert.ok(!s.includes(bad), `${f}: ${bad}`); }
  });
});
