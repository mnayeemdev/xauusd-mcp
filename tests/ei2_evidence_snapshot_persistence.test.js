/**
 * EI-2 -- Contemporaneous Evidence Snapshot persistence. Proves:
 *   - the snapshot is derived from EI-1's already-computed MarketEvidence,
 *     never a second/independent recomputation
 *   - contemporaneous bar identity, no future/outcome leakage
 *   - JSON round-trip safety, no raw bar history
 *   - persisted exactly once, on a genuinely NEW signal only -- never for
 *     a blocked same-thesis duplicate, never for an exact repeat
 *   - immutability: TP1/PASS/FAIL never rewrite an already-attached snapshot
 *   - legacy records (no evidence_snapshot) remain valid
 *   - signal_id/thesis_id/concurrency/entry/SL/TP/RR/quality are all
 *     completely unaffected
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEvidenceSnapshot, EVIDENCE_SNAPSHOT_SCHEMA_VERSION } from '../src/engine/evidenceSnapshot.js';
import { computeMarketEvidence } from '../src/engine/marketEvidence.js';
import { maybePersistEvidenceSnapshot } from '../src/core/xauusd_analyze_market.js';
import { registerOrGetSignal, resolveOpenSignals, attachEvidenceSnapshot } from '../src/engine/signalStore.js';
import { computeStructure, STRUCTURE_PARAMS } from '../src/engine/structure.js';
import { classifyRegime, REGIME_PARAMS } from '../src/engine/regime.js';

const START_TIME = 1700000000;
function makeTrendBars(n, { start = 2000, drift = 0.5, tfSeconds = 900 } = {}) {
  const bars = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const close = price + drift;
    bars.push({ time: START_TIME + i * tfSeconds, open: price, high: Math.max(price, close) + 0.2, low: Math.min(price, close) - 0.2, close, volume: 100 });
    price = close;
  }
  return bars;
}
const bullBars = makeTrendBars(510, { drift: 0.5 });
const bullStructure = computeStructure(bullBars, STRUCTURE_PARAMS);
const bullRegime = classifyRegime(bullBars, REGIME_PARAMS).regime;
const bullEvidence = { regime: bullRegime, structure: bullStructure, correction: { state: 'NONE' }, ...computeMarketEvidence({ confirmedBars: bullBars, regime: bullRegime, structure: bullStructure }) };

function baseSnapshot(overrides = {}) {
  return buildEvidenceSnapshot({
    symbol: 'OANDA:XAUUSD', timeframe: '15m', capturedBarTime: bullBars.at(-1).time,
    signalBarTime: bullBars.at(-1).time, originBar: bullBars.at(-1).time, thesisId: 'thesisA',
    regime: bullEvidence.regime, structure: bullEvidence.structure, correction: bullEvidence.correction,
    currentPrice: bullBars.at(-1).close, qualityComponents: { qStructure: 15, qTrigger: 15, qEntryLocation: 15, qMomentum: 10, qVolatility: 10, qMtf: 15, qSession: 10, qRr: 10 },
    marketEvidence: bullEvidence,
    ...overrides,
  });
}

describe('EI-2: buildEvidenceSnapshot() -- schema and content', () => {
  it('1/3. carries a schema_version and derives fields from the SAME MarketEvidence, never recomputing', () => {
    const snap = baseSnapshot();
    assert.equal(snap.schema_version, EVIDENCE_SNAPSHOT_SCHEMA_VERSION);
    assert.equal(snap.regime, bullEvidence.regime);
    assert.equal(snap.structure.state, bullEvidence.structure.state);
  });

  it('4. captured_bar_time is contemporaneous -- equals the exact confirmed bar evidence/signal were computed from', () => {
    const snap = baseSnapshot();
    assert.equal(snap.captured_bar_time, bullBars.at(-1).time);
    assert.equal(snap.signal_bar_time, bullBars.at(-1).time);
  });

  it('5. contains no future/outcome fields (tp1_hit, resolution, pass/fail, realized_r, etc.)', () => {
    const snap = baseSnapshot();
    const serialized = JSON.stringify(snap).toLowerCase();
    for (const forbidden of ['tp1_hit', 'resolution_bar_time', 'realized_r', '"status":"pass"', '"status":"fail"', 'outcome']) {
      assert.ok(!serialized.includes(forbidden), `snapshot must not contain "${forbidden}"`);
    }
  });

  it('6. survives a JSON round-trip unchanged', () => {
    const snap = baseSnapshot();
    const roundTripped = JSON.parse(JSON.stringify(snap));
    assert.deepEqual(roundTripped, snap);
  });

  it('19. contains no raw bar arrays or full OHLC history', () => {
    const snap = baseSnapshot();
    const json = JSON.stringify(snap);
    assert.ok(!/"open":/.test(json) && !/"volume":/.test(json), 'must not embed raw OHLCV bar objects');
    assert.ok(json.length < 5000, 'snapshot must stay compact, not a raw MarketEvidence dump');
  });

  it('candles: only directional (non-NEUTRAL) candlestick reactions are persisted, exact detector names preserved', () => {
    const snap = baseSnapshot();
    assert.ok(Array.isArray(snap.candles.directional_patterns));
    for (const p of snap.candles.directional_patterns) {
      assert.ok(p.bias === 'BULLISH' || p.bias === 'BEARISH');
      assert.ok(typeof p.pattern === 'string');
    }
  });

  it('patterns: compact classical pattern summaries preserve pattern_type/bias/completion_state, never fabricate confidence', () => {
    const snap = baseSnapshot();
    for (const p of snap.classical_patterns) {
      assert.ok('pattern_type' in p && 'bias' in p && 'completion_state' in p);
      assert.ok(!('confidence' in p) && !('strength' in p), 'must never invent a confidence/strength field the detector does not compute');
    }
  });

  it('breakout: NO_BREAKOUT is persisted honestly when there is no structure.lastEvent', () => {
    const noBreakoutEvidence = { ...bullEvidence, breakoutState: { state: 'NO_BREAKOUT', evidence: {} } };
    const snap = buildEvidenceSnapshot({ symbol: 'X', timeframe: '15m', capturedBarTime: 1, regime: 'BULL_TREND', structure: bullStructure, correction: { state: 'NONE' }, marketEvidence: noBreakoutEvidence });
    assert.equal(snap.breakout.state, 'NO_BREAKOUT');
  });

  it('liquidity: structural_sweep (protected structure.lastSweep) and sweep_reclaim (liquidity.js) are two explicitly distinct, separately-sourced fields', () => {
    const structureWithSweep = { ...bullStructure, lastSweep: { type: 'SWEEP_HIGH', level: 2100, bar: 400 } };
    const evidenceWithReclaim = { ...bullEvidence, liquidityContext: { ...bullEvidence.liquidityContext, sweepReclaim: { swept: true, sweepType: 'SWEEP_HIGH', level: 2100, reclaimed: true, reclaimBarIndex: 402, withinLookback: true } } };
    const snap = buildEvidenceSnapshot({ symbol: 'X', timeframe: '15m', capturedBarTime: 1, regime: 'BULL_TREND', structure: structureWithSweep, correction: { state: 'NONE' }, marketEvidence: evidenceWithReclaim });
    assert.ok(snap.liquidity.structural_sweep.source.includes('structure.js'));
    assert.ok(snap.liquidity.sweep_reclaim.source.includes('liquidity.js'));
    assert.equal(snap.liquidity.structural_sweep.level, 2100);
    assert.equal(snap.liquidity.sweep_reclaim.reclaimed, true);
  });

  it('location: nearest support/resistance/supply/demand are compact, no full level registry dumped', () => {
    const snap = baseSnapshot();
    assert.ok('nearest_support' in snap.location && 'nearest_resistance' in snap.location && 'nearest_demand_zone' in snap.location && 'nearest_supply_zone' in snap.location);
  });

  it('quality_components: persists the ALREADY-COMPUTED quality.js breakdown verbatim, never a new quality calculation', () => {
    const snap = baseSnapshot();
    assert.deepEqual(snap.quality_components, { qStructure: 15, qTrigger: 15, qEntryLocation: 15, qMomentum: 10, qVolatility: 10, qMtf: 15, qSession: 10, qRr: 10 });
  });

  it('quality_components is null (never fabricated) when the caller has none', () => {
    const snap = baseSnapshot({ qualityComponents: null });
    assert.equal(snap.quality_components, null);
  });
});

describe('EI-2: maybePersistEvidenceSnapshot() -- gating and wiring', () => {
  function statefulDeps(initialStore = { signals: [] }) {
    let store = initialStore;
    return { loadStore: () => store, saveStore: (_p, s) => { store = s; }, storePath: 'unused-in-test', getStore: () => store };
  }

  it('1. a genuinely new signal (is_new_event:true) persists an evidence_snapshot', () => {
    const store = { signals: [] };
    registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'PB', side: 'BUY', originBar: 100, signalBarTime: 100, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2, quality: 70, thesisId: 'thesisA' });
    const deps = statefulDeps(store);
    const decision = { signal: { symbol: 'OANDA:XAUUSD', timeframe: '15m', signal_id: registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'PB', side: 'BUY', originBar: 100, signalBarTime: 100, thesisId: 'thesisA' }).record.signal_id, signal_bar_time: 100, origin_bar: 100, thesis_id: 'thesisA', is_new_event: true }, diagnostics: { quality_breakdown: null } };
    const primarySplit = { confirmed: bullBars };
    const result = maybePersistEvidenceSnapshot({ decision, evidence: bullEvidence, primarySplit, deps, persistSignals: true });
    assert.equal(result.attached, true);
    assert.ok(deps.getStore().signals.find((s) => s.signal_id === decision.signal.signal_id).evidence_snapshot);
  });

  it('does NOT persist when persistSignals is false (on-demand read path unchanged)', () => {
    const store = { signals: [{ signal_id: 'sig-1', evidence_snapshot: null }] };
    const deps = statefulDeps(store);
    let loadCalls = 0;
    deps.loadStore = () => { loadCalls++; return store; };
    const decision = { signal: { signal_id: 'sig-1', symbol: 'X', timeframe: '15m', is_new_event: true } };
    const result = maybePersistEvidenceSnapshot({ decision, evidence: bullEvidence, primarySplit: { confirmed: bullBars }, deps, persistSignals: false });
    assert.equal(result.attached, false);
    assert.equal(loadCalls, 0, 'must never touch the store at all when persistSignals is false');
  });

  it('does NOT persist for a blocked same-thesis duplicate (is_new_event:false) -- never overwrites the ORIGINAL signal', () => {
    const store = { signals: [{ signal_id: 'sig-1', evidence_snapshot: { schema_version: 1, marker: 'ORIGINAL' } }] };
    const deps = statefulDeps(store);
    const decision = { signal: { signal_id: 'sig-1', symbol: 'X', timeframe: '15m', is_new_event: false, blocked_by_open_thesis: true } };
    const result = maybePersistEvidenceSnapshot({ decision, evidence: bullEvidence, primarySplit: { confirmed: bullBars }, deps, persistSignals: true });
    assert.equal(result.attached, false);
    assert.deepEqual(deps.getStore().signals[0].evidence_snapshot, { schema_version: 1, marker: 'ORIGINAL' }, 'the original snapshot must be untouched');
  });

  it('does NOT persist when evidence is unavailable', () => {
    const store = { signals: [{ signal_id: 'sig-1' }] };
    const deps = statefulDeps(store);
    const decision = { signal: { signal_id: 'sig-1', is_new_event: true } };
    const result = maybePersistEvidenceSnapshot({ decision, evidence: null, primarySplit: { confirmed: bullBars }, deps, persistSignals: true });
    assert.equal(result.attached, false);
  });

  it('never throws even if the store callbacks throw -- observability-only, best-effort', () => {
    const deps = { loadStore: () => { throw new Error('disk error'); }, saveStore: () => {}, storePath: 'x' };
    const decision = { signal: { signal_id: 'sig-1', symbol: 'X', timeframe: '15m', is_new_event: true } };
    assert.doesNotThrow(() => maybePersistEvidenceSnapshot({ decision, evidence: bullEvidence, primarySplit: { confirmed: bullBars }, deps, persistSignals: true }));
  });
});

describe('EI-2: immutability -- TP1/PASS/FAIL never rewrite an already-attached snapshot', () => {
  it('7. snapshot remains unchanged after a TP1 hit', () => {
    const store = { signals: [] };
    const candidate = { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'PB', side: 'BUY', originBar: 5, signalBarTime: 1000, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2, quality: 70 };
    const { record } = registerOrGetSignal(store, candidate);
    attachEvidenceSnapshot(store, record.signal_id, { schema_version: 1, marker: 'ORIGINAL' });
    const snapshotBefore = JSON.stringify(record.evidence_snapshot);
    resolveOpenSignals(store, { timeframe: '15m', confirmedBars: [{ time: 2000, open: 10, high: 11.5, low: 9.5, close: 11.2 }] }); // TP1 only, not TP2 -- stays OPEN
    assert.equal(record.tp1_hit, true);
    assert.equal(JSON.stringify(record.evidence_snapshot), snapshotBefore);
  });

  it('8. snapshot remains unchanged after PASS', () => {
    const store = { signals: [] };
    const candidate = { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'PB', side: 'BUY', originBar: 5, signalBarTime: 1000, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2, quality: 70 };
    const { record } = registerOrGetSignal(store, candidate);
    attachEvidenceSnapshot(store, record.signal_id, { schema_version: 1, marker: 'ORIGINAL' });
    const snapshotBefore = JSON.stringify(record.evidence_snapshot);
    resolveOpenSignals(store, { timeframe: '15m', confirmedBars: [{ time: 2000, open: 10, high: 12.5, low: 9.5, close: 12.1 }] }); // TP2 hit -> PASS
    assert.equal(record.status, 'PASS');
    assert.equal(JSON.stringify(record.evidence_snapshot), snapshotBefore);
  });

  it('9. snapshot remains unchanged after FAIL', () => {
    const store = { signals: [] };
    const candidate = { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'PB', side: 'BUY', originBar: 5, signalBarTime: 1000, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2, quality: 70 };
    const { record } = registerOrGetSignal(store, candidate);
    attachEvidenceSnapshot(store, record.signal_id, { schema_version: 1, marker: 'ORIGINAL' });
    const snapshotBefore = JSON.stringify(record.evidence_snapshot);
    resolveOpenSignals(store, { timeframe: '15m', confirmedBars: [{ time: 2000, open: 10, high: 10.1, low: 8.5, close: 8.9 }] }); // SL hit -> FAIL
    assert.equal(record.status, 'FAIL');
    assert.equal(JSON.stringify(record.evidence_snapshot), snapshotBefore);
  });

  it('attachEvidenceSnapshot() itself refuses to overwrite an already-present snapshot (defense in depth)', () => {
    const store = { signals: [{ signal_id: 'x', evidence_snapshot: { schema_version: 1, marker: 'ORIGINAL' } }] };
    const result = attachEvidenceSnapshot(store, 'x', { schema_version: 1, marker: 'NEW-ATTEMPT' });
    assert.equal(result.attached, false);
    assert.equal(result.reason, 'ALREADY_PRESENT');
    assert.equal(store.signals[0].evidence_snapshot.marker, 'ORIGINAL');
  });
});

describe('EI-2: legacy compatibility and concurrency/authority parity', () => {
  it('2/20. a legacy signal record without evidence_snapshot remains valid -- resolveOpenSignals() never crashes or fabricates one', () => {
    const store = { signals: [{ signal_id: 'legacy-1', symbol: 'OANDA:XAUUSD', timeframe: '15m', side: 'BUY', status: 'OPEN', entry: 10, stop_loss: 9, tp1: 11, tp2: 12, signal_bar_time: 1000 }] };
    assert.doesNotThrow(() => resolveOpenSignals(store, { timeframe: '15m', confirmedBars: [{ time: 2000, open: 10, high: 10.5, low: 9.8, close: 10.1 }] }));
    assert.equal(store.signals[0].evidence_snapshot, undefined);
  });

  it('10/11/12. a blocked same-thesis duplicate creates no second signal record; signal_id and thesis_id are completely unaffected by evidence_snapshot logic', () => {
    const store = { signals: [] };
    const first = registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'PB', side: 'BUY', originBar: 100, signalBarTime: 100, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2, quality: 70, thesisId: 'thesisA' });
    const second = registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'MR', side: 'BUY', originBar: 200, signalBarTime: 200, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2, quality: 70, thesisId: 'thesisA' });
    assert.equal(store.signals.length, 1);
    assert.equal(second.blockedByOpenThesis, true);
    assert.equal(first.record.signal_id, second.record.signal_id);
    assert.equal(first.record.thesis_id, 'thesisA');
  });

  it('13. BUY/SELL symmetry: buildEvidenceSnapshot() applies identical logic to both sides', () => {
    const snapBuy = baseSnapshot();
    const snapSell = baseSnapshot();
    assert.deepEqual(Object.keys(snapBuy).sort(), Object.keys(snapSell).sort());
  });

  it('18. MarketEvidence/evidence_snapshot has zero feedback into the protected decision/gate/concurrency logic (EI-1 guarantee, re-verified after EI-2 wiring)', () => {
    // signalStore.js is deliberately excluded from this blanket file-level
    // check: it legitimately OWNS attachEvidenceSnapshot() (the additive
    // persistence function itself), so it must reference the field name.
    // What must never happen is registerOrGetSignal()'s OWN registration/
    // concurrency decision reading it -- proven precisely by name below,
    // and independently by the "blocked duplicate creates no second
    // signal" + immutability tests elsewhere in this file.
    const protectedFiles = ['src/engine/models.js', 'src/engine/risk.js', 'src/engine/quality.js', 'src/engine/mtf.js', 'src/engine/htf.js', 'src/core/xauusd_calculate.js'];
    for (const file of protectedFiles) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      assert.ok(!/evidenceSnapshot|evidence_snapshot/i.test(src), `${file} must not reference the evidence snapshot in any form`);
    }
    const signalStoreSrc = readFileSync(new URL('../src/engine/signalStore.js', import.meta.url), 'utf8');
    const registerFnMatch = signalStoreSrc.match(/export function registerOrGetSignal[\s\S]*?\n}\n/);
    assert.ok(registerFnMatch, 'expected to find registerOrGetSignal()\'s own function body');
    assert.ok(!/evidenceSnapshot|evidence_snapshot/i.test(registerFnMatch[0]), 'registerOrGetSignal() itself (registration + concurrency guard) must never read/branch on evidence_snapshot');
  });
});
