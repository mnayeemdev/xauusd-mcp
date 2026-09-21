/**
 * src/engine/opportunityOutcomeResolver.js -- Stage 7 Step 2 forward-only
 * Opportunity Outcome Resolver. Proves: future-leakage impossibility,
 * TP1/TP2/invalidation race resolution (both orderings), same-bar
 * ambiguity handling, BUY/SELL symmetry, idempotency/no-duplicate-rows,
 * terminal immutability, zero mutation of the source Ledger row, and that
 * candidate_rr (including an extreme narrow-zone value) is measured
 * verbatim, never recomputed or filtered.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveOpportunityOutcome, recordOpportunityOutcome, computeOutcomeSourceId,
  OUTCOME_STORE_SCHEMA_VERSION,
} from '../src/engine/opportunityOutcomeResolver.js';

const T0 = 1_700_000_000; // the observation's own confirmed_bar_time
const STEP = 900; // 15m bars

function bar(t, { open = 100, high = 100, low = 100, close = 100 } = {}) {
  return { time: t, open, high, low, close };
}

function bullishObservation(overrides = {}) {
  return {
    opportunity_id: 'opp-bull-1',
    symbol: 'OANDA:XAUUSD',
    source_timeframe: '15m',
    direction: 'BULLISH',
    confirmed_bar_time: T0,
    opportunity_state: 'CONFIRMATION_PENDING',
    candidate_entry_zone: { lower: 98, upper: 100 },
    provisional_invalidation: { level: 95, condition: 'confirmed close below 95' },
    candidate_tp1: 110,
    candidate_tp2: 120,
    candidate_rr: 3,
    blocking_conditions: ['RR_NOT_ACCEPTABLE'],
    ...overrides,
  };
}

function bearishObservation(overrides = {}) {
  return {
    opportunity_id: 'opp-bear-1',
    symbol: 'OANDA:XAUUSD',
    source_timeframe: '15m',
    direction: 'BEARISH',
    confirmed_bar_time: T0,
    opportunity_state: 'CONFIRMATION_PENDING',
    candidate_entry_zone: { lower: 100, upper: 102 },
    provisional_invalidation: { level: 105, condition: 'confirmed close above 105' },
    candidate_tp1: 90,
    candidate_tp2: 80,
    candidate_rr: 3,
    blocking_conditions: [],
    ...overrides,
  };
}

function memoryDeps(nowIso = '2025-01-01T00:00:00.000Z') {
  let store = { schema_version: OUTCOME_STORE_SCHEMA_VERSION, outcomes: {} };
  const log = [];
  return {
    _deps: {
      loadStore: () => store,
      saveStore: (_p, s) => { store = s; },
      appendLogLine: (_p, record) => { log.push(record); },
      now: () => new Date(nowIso),
    },
    getStore: () => store,
    getLog: () => log,
  };
}

describe('opportunityOutcomeResolver: future leakage is structurally impossible', () => {
  it('a bar AT or BEFORE confirmed_bar_time that would trivially satisfy TP1/invalidation is never used', () => {
    const observation = bullishObservation();
    const confirmedBars = [
      bar(T0 - STEP, { high: 500, low: 500 }), // would touch TP1/TP2 if ever considered -- must be ignored (strictly before)
      bar(T0, { high: 500, low: 500 }),        // the observation bar itself -- must ALSO be excluded (not strictly after)
    ];
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars });
    assert.equal(resolved.status, 'PENDING');
    assert.equal(resolved.bars_scanned, 0);
    assert.equal(resolved.tp1, null);
  });

  it('only bars with time > confirmed_bar_time ever contribute to bars_scanned', () => {
    const observation = bullishObservation();
    const confirmedBars = [
      bar(T0 - STEP), bar(T0), // ignored
      bar(T0 + STEP), bar(T0 + 2 * STEP), // counted
    ];
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars });
    assert.equal(resolved.bars_scanned, 2);
  });
});

describe('opportunityOutcomeResolver: TP1/invalidation race -- BULLISH (BUY candidate)', () => {
  it('TP1 reached, invalidation never touched -- tp1 recorded, invalidation stays null', () => {
    const observation = bullishObservation();
    const confirmedBars = [bar(T0 + STEP, { high: 111, low: 105 })];
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars }, { maxHorizonBars: 500 });
    assert.equal(resolved.tp1.touched, true);
    assert.equal(resolved.tp1.bar_time, T0 + STEP);
    assert.equal(resolved.invalidation, null);
    assert.equal(resolved.status, 'PENDING'); // TP2/invalidation-after-TP1 race still open, horizon not exhausted
  });

  it('invalidation reached BEFORE TP1 -- status INVALIDATED_BEFORE_TP1, tp1 stays null', () => {
    const observation = bullishObservation();
    const confirmedBars = [bar(T0 + STEP, { high: 100, low: 94 })]; // touches invalidation (95), not TP1 (110)
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars });
    assert.equal(resolved.status, 'INVALIDATED_BEFORE_TP1');
    assert.equal(resolved.tp1, null);
    assert.equal(resolved.invalidation.touched, true);
    assert.equal(resolved.invalidation.stage, 'BEFORE_TP1');
  });

  it('TP1 then later TP2 -- both recorded with correct bar times', () => {
    const observation = bullishObservation();
    const confirmedBars = [
      bar(T0 + STEP, { high: 111, low: 105 }),       // TP1 only
      bar(T0 + 2 * STEP, { high: 121, low: 115 }),   // TP2 only
    ];
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars });
    assert.equal(resolved.status, 'TP1_THEN_TP2');
    assert.equal(resolved.tp1.bar_time, T0 + STEP);
    assert.equal(resolved.tp2.bar_time, T0 + 2 * STEP);
    assert.equal(resolved.invalidation, null);
  });

  it('TP1 then LATER invalidation is represented truthfully, without rewriting the TP1 event', () => {
    const observation = bullishObservation();
    const confirmedBars = [
      bar(T0 + STEP, { high: 111, low: 105 }),      // TP1 only
      bar(T0 + 2 * STEP, { high: 100, low: 94 }),   // invalidation only, AFTER TP1
    ];
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars });
    assert.equal(resolved.status, 'TP1_THEN_INVALIDATED');
    assert.equal(resolved.tp1.touched, true);
    assert.equal(resolved.tp1.bar_time, T0 + STEP); // TP1's own recorded fact is untouched
    assert.equal(resolved.invalidation.touched, true);
    assert.equal(resolved.invalidation.stage, 'AFTER_TP1');
    assert.equal(resolved.invalidation.bar_time, T0 + 2 * STEP);
  });

  it('same bar touches BOTH TP1 and invalidation -- AMBIGUOUS_SAME_BAR, no order guessed', () => {
    const observation = bullishObservation();
    const confirmedBars = [bar(T0 + STEP, { high: 111, low: 94 })]; // spans both levels in one bar
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars });
    assert.equal(resolved.status, 'AMBIGUOUS_SAME_BAR');
    assert.equal(resolved.ambiguous_event.stage, 'TP1_VS_INVALIDATION');
    assert.equal(resolved.ambiguous_event.bar_time, T0 + STEP);
    assert.equal(resolved.tp1, null);
    assert.equal(resolved.invalidation, null);
  });

  it('TP1 resolved on an earlier bar; a LATER bar touches BOTH TP2 and invalidation -- AMBIGUOUS_SAME_BAR at the TP2 stage, TP1 preserved', () => {
    const observation = bullishObservation();
    const confirmedBars = [
      bar(T0 + STEP, { high: 111, low: 105 }),        // TP1 only
      bar(T0 + 2 * STEP, { high: 121, low: 94 }),     // spans TP2 (120) and invalidation (95)
    ];
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars });
    assert.equal(resolved.status, 'AMBIGUOUS_SAME_BAR');
    assert.equal(resolved.ambiguous_event.stage, 'TP2_VS_INVALIDATION');
    assert.ok(resolved.tp1); // TP1 fact is never erased by a later-stage ambiguity
    assert.equal(resolved.tp2, null);
    assert.equal(resolved.invalidation, null);
  });

  it('horizon exhaustion with nothing ever touched -- only when the window PROVES contiguity back to the observation (an anchor bar is present)', () => {
    const observation = bullishObservation();
    const confirmedBars = [bar(T0), bar(T0 + STEP, { high: 101, low: 99 })]; // anchor bar (time<=T0) + one clean forward bar
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars }, { maxHorizonBars: 1 });
    assert.equal(resolved.data_sufficient_for_horizon, true);
    assert.equal(resolved.status, 'HORIZON_EXHAUSTED_NO_TOUCH');
    assert.equal(resolved.terminal, true);
  });

  it('horizon exhaustion after TP1 alone -- also requires the anchor proof', () => {
    const observation = bullishObservation();
    const confirmedBars = [bar(T0), bar(T0 + STEP, { high: 111, low: 105 })]; // anchor bar + TP1-only forward bar
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars }, { maxHorizonBars: 1 });
    assert.equal(resolved.status, 'TP1_HORIZON_EXHAUSTED');
    assert.equal(resolved.terminal, true);
  });

  it('not enough forward bars yet -- stays PENDING, never manufactures a result', () => {
    const observation = bullishObservation();
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars: [] });
    assert.equal(resolved.status, 'PENDING');
    assert.equal(resolved.terminal, false);
  });
});

describe('opportunityOutcomeResolver: same-bar semantics (Item 3 hardening)', () => {
  it('TP1 and TP2 touched in the SAME bar, WITHOUT invalidation -- deterministically TP1_THEN_TP2, no ambiguity', () => {
    const observation = bullishObservation();
    const confirmedBars = [bar(T0 + STEP, { high: 121, low: 105 })]; // spans both TP1 (110) and TP2 (120), not invalidation (95)
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars });
    assert.equal(resolved.status, 'TP1_THEN_TP2');
    assert.equal(resolved.tp1.bar_time, T0 + STEP);
    assert.equal(resolved.tp2.bar_time, T0 + STEP);
    assert.equal(resolved.invalidation, null);
    assert.equal(resolved.ambiguous_event, null);
  });

  it('TP1, TP2, AND invalidation all touched in the SAME bar -- still AMBIGUOUS_SAME_BAR, no order guessed among any of them', () => {
    const observation = bullishObservation();
    const confirmedBars = [bar(T0 + STEP, { high: 121, low: 94 })]; // spans TP1, TP2, AND invalidation in one bar
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars });
    assert.equal(resolved.status, 'AMBIGUOUS_SAME_BAR');
    assert.equal(resolved.ambiguous_event.stage, 'TP1_VS_INVALIDATION');
    assert.equal(resolved.tp1, null);
    assert.equal(resolved.tp2, null);
    assert.equal(resolved.invalidation, null);
  });
});

describe('opportunityOutcomeResolver: BUY/SELL (BULLISH/BEARISH) symmetry -- BEARISH (SELL candidate)', () => {
  it('mirrors every BULLISH scenario with inverted level logic', () => {
    const observation = bearishObservation();

    // TP1 only (price falls to 90, not yet to invalidation 105 or TP2 80).
    let resolved = resolveOpportunityOutcome({ observation, confirmedBars: [bar(T0 + STEP, { high: 95, low: 89 })] });
    assert.equal(resolved.tp1.touched, true);
    assert.equal(resolved.invalidation, null);

    // Invalidation before TP1 (price rises to 106).
    resolved = resolveOpportunityOutcome({ observation, confirmedBars: [bar(T0 + STEP, { high: 106, low: 101 })] });
    assert.equal(resolved.status, 'INVALIDATED_BEFORE_TP1');

    // TP1 then TP2.
    resolved = resolveOpportunityOutcome({
      observation,
      confirmedBars: [bar(T0 + STEP, { high: 95, low: 89 }), bar(T0 + 2 * STEP, { high: 85, low: 79 })],
    });
    assert.equal(resolved.status, 'TP1_THEN_TP2');

    // Same-bar ambiguity: one bar spans both TP1 (90) and invalidation (105).
    resolved = resolveOpportunityOutcome({ observation, confirmedBars: [bar(T0 + STEP, { high: 106, low: 89 })] });
    assert.equal(resolved.status, 'AMBIGUOUS_SAME_BAR');
    assert.equal(resolved.ambiguous_event.stage, 'TP1_VS_INVALIDATION');
  });

  it('an observation with a direction other than BULLISH/BEARISH cannot be resolved -- returns null, never a fabricated result', () => {
    const observation = bullishObservation({ direction: 'SIDEWAYS' });
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars: [bar(T0 + STEP, { high: 500, low: 500 })] });
    assert.equal(resolved, null);
  });
});

describe('opportunityOutcomeResolver: candidate_rr is measured verbatim, never recomputed or filtered', () => {
  it('an extreme narrow-zone candidate_rr (e.g. 188.87) passes through unchanged, with a correctly small zone_width_atr_multiple', () => {
    const observation = bullishObservation({
      candidate_entry_zone: { lower: 4340.81, upper: 4341.12 },
      candidate_tp1: 4399.67,
      candidate_tp2: 4399.67,
      provisional_invalidation: { level: 4340.81, condition: 'confirmed close below 4340.81' },
      candidate_rr: 188.87,
    });
    // 15 bars of ATR context (true range ~2 each) ending at the observation bar, then one quiet forward bar.
    const context = [];
    for (let i = 14; i >= 1; i--) context.push(bar(T0 - i * STEP, { high: 4342, low: 4340, close: 4341 }));
    context.push(bar(T0, { high: 4342, low: 4340, close: 4341 }));
    const confirmedBars = [...context, bar(T0 + STEP, { high: 4341.5, low: 4340.9 })];

    const resolved = resolveOpportunityOutcome({ observation, confirmedBars });
    assert.equal(resolved.status, 'PENDING'); // never filtered/dropped -- just not yet resolved
    assert.ok(Number.isFinite(resolved.zone_width_atr_multiple));
    assert.ok(resolved.zone_width_atr_multiple < 1, 'a few-cent-wide zone should be a small fraction of ATR');

    // The recorded outcome carries candidate_rr verbatim -- the resolver never recomputes it.
    const { _deps, getLog } = memoryDeps();
    recordOpportunityOutcome({ observation, confirmedBars, _deps });
    assert.equal(getLog()[0].candidate_rr, 188.87);
  });

  it('source audit: the resolver never assigns a computed value to candidate_rr -- only ever copies observation.candidate_rr', () => {
    const src = readFileSync(new URL('../src/engine/opportunityOutcomeResolver.js', import.meta.url), 'utf8');
    const assignments = src.match(/candidate_rr\s*:/g) ?? [];
    assert.ok(assignments.length > 0);
    assert.ok(!/candidate_rr\s*[:=]\s*(round2|reward|risk)/i.test(src));
  });
});

describe('opportunityOutcomeResolver: horizon data-sufficiency hardening (Item 1/4)', () => {
  it('a short forward dataset (far fewer bars than maxHorizonBars) does NOT cause horizon exhaustion -- stays PENDING', () => {
    const observation = bullishObservation();
    const confirmedBars = [bar(T0), bar(T0 + STEP, { high: 101, low: 99 }), bar(T0 + 2 * STEP, { high: 101, low: 99 })];
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars }); // default maxHorizonBars: 500
    assert.equal(resolved.status, 'PENDING');
    assert.equal(resolved.bars_scanned, 2);
  });

  it('rolling-window truncation cannot manufacture a terminal HORIZON_EXHAUSTED state -- a window with NO anchor bar never counts toward the horizon, even if it numerically has "enough" bars', () => {
    const observation = bullishObservation();
    // Simulates an observation whose own bar has rolled entirely off a
    // caller's rolling window: every supplied bar's time is already
    // strictly AFTER the observation, with nothing at-or-before it to
    // prove the scan is a gap-free continuation.
    const confirmedBars = [];
    for (let i = 1; i <= 5; i++) confirmedBars.push(bar(T0 + i * STEP, { high: 101, low: 99 }));
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars }, { maxHorizonBars: 5 });
    assert.equal(resolved.data_sufficient_for_horizon, false);
    assert.equal(resolved.status, 'PENDING', 'must remain PENDING (state A), never falsely HORIZON_EXHAUSTED (state B)');
  });

  it('once an anchor bar IS present, the same bar count correctly reaches HORIZON_EXHAUSTED', () => {
    const observation = bullishObservation();
    const confirmedBars = [bar(T0)];
    for (let i = 1; i <= 5; i++) confirmedBars.push(bar(T0 + i * STEP, { high: 101, low: 99 }));
    const resolved = resolveOpportunityOutcome({ observation, confirmedBars }, { maxHorizonBars: 5 });
    assert.equal(resolved.data_sufficient_for_horizon, true);
    assert.equal(resolved.status, 'HORIZON_EXHAUSTED_NO_TOUCH');
  });

  it('repeated watcher cycles progressively advance a PENDING observation toward HORIZON_EXHAUSTED, without ever double-counting or skipping a bar', () => {
    const observation = bullishObservation();
    const { _deps, getStore } = memoryDeps();
    const params = { maxHorizonBars: 3 };
    const allBars = [bar(T0)];
    for (let i = 1; i <= 3; i++) allBars.push(bar(T0 + i * STEP, { high: 101, low: 99 }));

    // Cycle 1: only the anchor + first new bar are "currently available".
    let result = recordOpportunityOutcome({ observation, confirmedBars: allBars.slice(0, 2), _deps }, params);
    assert.equal(result.record.status, 'PENDING');
    assert.equal(result.record.bars_scanned, 1);

    // Cycle 2: the window grows by one more real bar (a fresh watcher poll).
    result = recordOpportunityOutcome({ observation, confirmedBars: allBars.slice(0, 3), _deps }, params);
    assert.equal(result.record.bars_scanned, 2);

    // Cycle 3: the final bar arrives, reaching the (test) horizon of 3.
    result = recordOpportunityOutcome({ observation, confirmedBars: allBars.slice(0, 4), _deps }, params);
    assert.equal(result.recorded, true);
    assert.equal(result.record.status, 'HORIZON_EXHAUSTED_NO_TOUCH');
    assert.equal(result.record.bars_scanned, 3);

    // Cycle 4: terminal -- further (even re-supplied) bars change nothing.
    const outcomeId = computeOutcomeSourceId(observation);
    const before = JSON.stringify(getStore().outcomes[outcomeId]);
    recordOpportunityOutcome({ observation, confirmedBars: allBars, _deps }, params);
    assert.equal(JSON.stringify(getStore().outcomes[outcomeId]), before);
  });

  it('re-supplying an overlapping/identical window across cycles never double-counts a bar', () => {
    const observation = bullishObservation();
    const { _deps } = memoryDeps();
    const bars = [bar(T0), bar(T0 + STEP, { high: 101, low: 99 })];
    recordOpportunityOutcome({ observation, confirmedBars: bars, _deps });
    const second = recordOpportunityOutcome({ observation, confirmedBars: bars, _deps }); // identical window again
    assert.equal(second.reason, 'NO_STATUS_CHANGE');
    // bars_scanned in the (unchanged) store record is still 1, not 2.
    assert.equal(second.record.bars_scanned, 1);
  });
});

describe('opportunityOutcomeResolver: recordOpportunityOutcome -- idempotency, immutability, no mutation of the source row', () => {
  it('the source observation object is never mutated', () => {
    const observation = bullishObservation();
    const before = JSON.stringify(observation);
    const { _deps } = memoryDeps();
    recordOpportunityOutcome({ observation, confirmedBars: [bar(T0 + STEP, { high: 111, low: 105 })], _deps });
    assert.equal(JSON.stringify(observation), before);
  });

  it('identical repeated resolution (same bars, still PENDING) does not create a duplicate log row', () => {
    const observation = bullishObservation();
    const { _deps, getLog } = memoryDeps();
    const bars = [bar(T0 + STEP, { high: 111, low: 105 })];
    const first = recordOpportunityOutcome({ observation, confirmedBars: bars, _deps });
    const second = recordOpportunityOutcome({ observation, confirmedBars: bars, _deps });
    assert.equal(first.recorded, true);
    assert.equal(second.recorded, false);
    assert.equal(second.reason, 'NO_STATUS_CHANGE');
    assert.equal(getLog().length, 1);
  });

  it('once terminal, a later call with different (even contradictory) bars never rewrites the stored result', () => {
    const observation = bullishObservation();
    const { _deps, getLog, getStore } = memoryDeps();
    const terminalBars = [
      bar(T0 + STEP, { high: 111, low: 105 }),
      bar(T0 + 2 * STEP, { high: 121, low: 115 }),
    ];
    recordOpportunityOutcome({ observation, confirmedBars: terminalBars, _deps });
    const outcomeSourceId = computeOutcomeSourceId(observation);
    assert.equal(getStore().outcomes[outcomeSourceId].status, 'TP1_THEN_TP2');
    const snapshotLogLength = getLog().length;

    // A later call with bars that would, if freshly evaluated, look completely different (empty -> PENDING).
    const second = recordOpportunityOutcome({ observation, confirmedBars: [], _deps });
    assert.equal(second.recorded, false);
    assert.equal(second.reason, 'ALREADY_TERMINAL');
    assert.equal(getStore().outcomes[outcomeSourceId].status, 'TP1_THEN_TP2');
    assert.equal(getLog().length, snapshotLogLength);
  });

  it('a genuine status transition (PENDING -> terminal, as more bars become available) appends exactly one new row', () => {
    const observation = bullishObservation();
    const { _deps, getLog } = memoryDeps();
    recordOpportunityOutcome({ observation, confirmedBars: [], _deps }); // PENDING, 1st row
    recordOpportunityOutcome({ observation, confirmedBars: [], _deps }); // still PENDING, no new row
    recordOpportunityOutcome({ observation, confirmedBars: [bar(T0 + STEP, { high: 100, low: 94 })], _deps }); // INVALIDATED_BEFORE_TP1
    assert.equal(getLog().length, 2);
    assert.equal(getLog()[1].transition, 'PENDING -> INVALIDATED_BEFORE_TP1');
  });

  it('different observations (different opportunity_state at the same opportunity_id) get independent outcome identities', () => {
    const first = bullishObservation({ opportunity_state: 'DEVELOPING' });
    const second = bullishObservation({ opportunity_state: 'ARMED', confirmed_bar_time: T0 + 5 * STEP });
    assert.notEqual(computeOutcomeSourceId(first), computeOutcomeSourceId(second));
  });

  it('missing required fields fails safely without recording anything', () => {
    const { _deps, getLog } = memoryDeps();
    const result = recordOpportunityOutcome({ observation: { opportunity_id: 'x' }, confirmedBars: [], _deps });
    assert.equal(result.recorded, false);
    assert.equal(result.reason, 'MISSING_INPUT');
    assert.deepEqual(getLog(), []);
  });
});

describe('opportunityOutcomeResolver: source audit -- no Ledger/Stage3/CDP/broker/Pine writes or references', () => {
  it('never imports a Ledger WRITE function, never imports anticipationStore.js, never references a broker/CDP/Pine call', () => {
    const src = readFileSync(new URL('../src/engine/opportunityOutcomeResolver.js', import.meta.url), 'utf8');
    assert.ok(!/saveLedgerStore|appendLedgerLogLine/.test(src), 'must never write to the Opportunity Ledger');
    assert.ok(!/anticipationStore\.js/.test(src), 'must never touch Stage 3');
    assert.ok(!/from ['"].*xauusd_calculate\.js['"]/.test(src), 'must never call calculateEntry()');
    assert.ok(!/getChartApi|connection\.js/.test(src), 'must never open a CDP connection');
    assert.ok(!/broker|placeOrder|executeOrder|sendOrder/i.test(src), 'must never place a broker order');
    assert.ok(!/\.pine\b/i.test(src), 'must never reference a Pine source file');
    // Read-only reuse of the Ledger's own log loader is the one, explicit, documented exception.
    assert.ok(/loadLedgerLog/.test(src));
  });
});
