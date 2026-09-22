/**
 * Signal lifecycle audit -> TP1 tracking (src/engine/signalStore.js) +
 * trader-facing ACTIVE/TP1-HIT card wording (src/engine/marketVisualization.js).
 *
 * Audit finding this implements: entry is a MARKET FILL at the confirming
 * bar's own close (risk.js's `entry = bars[i].close`) -- there is no
 * post-confirmation "entry pending" state, so a persisted OPEN record is
 * already an ACTIVE trade. TP1 is additive/non-terminal: only SL -> FAIL
 * and TP2 -> PASS remain terminal, exactly as before. Proves:
 *   - OPEN before TP1, TP1 hit -> remains OPEN, recorded once (idempotent)
 *   - TP1 -> later TP2 -> PASS; TP1 -> later SL -> FAIL (both directions)
 *   - same-bar TP1+TP2 safely records tp1_hit (geometric, no hindsight)
 *   - same-bar TP1+SL does NOT record tp1_hit (genuinely ambiguous)
 *   - TP1 alone never creates PASS
 *   - terminal PASS/FAIL remain immutable; repeated resolver runs are idempotent
 *   - pre-existing records without tp1_hit fields are handled safely
 *   - the confirmed-trade card shows "<SIDE> ACTIVE" before TP1 and
 *     "<SIDE> ACTIVE / TP1 HIT / TP2 Pending" after
 *   - a terminal (PASS/FAIL) record no longer appears as the ACTIVE card
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerOrGetSignal, resolveOpenSignals } from '../src/engine/signalStore.js';
import { buildSignalOnlyIntents } from '../src/engine/marketVisualization.js';

const SIGNAL_BAR = 1700000000;
const TF_SECONDS = 900; // 15m
const TF = '15m';

function bar(offsetBars, { open, high, low, close }) {
  return { time: SIGNAL_BAR + offsetBars * TF_SECONDS, open, high, low, close };
}

function freshStore() {
  return { signals: [] };
}

function registerBuy(store, overrides = {}) {
  return registerOrGetSignal(store, {
    symbol: 'OANDA:XAUUSD', timeframe: TF, model: 'TC', side: 'BUY', originBar: SIGNAL_BAR, signalBarTime: SIGNAL_BAR,
    entry: 2000, stop_loss: 1990, tp1: 2010, tp2: 2020, rr: 2, quality: 78, ...overrides,
  }).record;
}

function registerSell(store, overrides = {}) {
  return registerOrGetSignal(store, {
    symbol: 'OANDA:XAUUSD', timeframe: TF, model: 'TC', side: 'SELL', originBar: SIGNAL_BAR, signalBarTime: SIGNAL_BAR,
    entry: 2000, stop_loss: 2010, tp1: 1990, tp2: 1980, rr: 2, quality: 78, ...overrides,
  }).record;
}

describe('Signal lifecycle: TP1 tracking, BUY', () => {
  it('OPEN before TP1 -- no bars reach TP1, record untouched', () => {
    const store = freshStore();
    const record = registerBuy(store);
    const bars = [bar(1, { open: 2000, high: 2005, low: 1998, close: 2003 })];
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'OPEN');
    assert.equal(record.tp1_hit, false);
    assert.equal(record.tp1_hit_bar_time, null);
  });

  it('TP1 hit -> remains OPEN, recorded once (idempotent across repeated resolver runs)', () => {
    const store = freshStore();
    const record = registerBuy(store);
    const tp1Bar = bar(1, { open: 2000, high: 2012, low: 1999, close: 2010 });
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: [tp1Bar] });
    assert.equal(record.status, 'OPEN');
    assert.equal(record.tp1_hit, true);
    assert.equal(record.tp1_hit_bar_time, tp1Bar.time);

    // Repeated run with the SAME bars must not change anything (idempotent).
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: [tp1Bar] });
    assert.equal(record.status, 'OPEN');
    assert.equal(record.tp1_hit_bar_time, tp1Bar.time);

    // A later, unrelated bar must never overwrite the FIRST recorded tp1_hit_bar_time.
    const laterBar = bar(2, { open: 2010, high: 2013, low: 2008, close: 2011 });
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: [tp1Bar, laterBar] });
    assert.equal(record.tp1_hit_bar_time, tp1Bar.time);
  });

  it('TP1 -> later TP2 -> PASS (tp1_hit survives into the terminal record)', () => {
    const store = freshStore();
    const record = registerBuy(store);
    const bars = [
      bar(1, { open: 2000, high: 2012, low: 1999, close: 2010 }), // TP1
      bar(2, { open: 2010, high: 2015, low: 2008, close: 2012 }), // nothing
      bar(3, { open: 2012, high: 2022, low: 2011, close: 2021 }), // TP2
    ];
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'PASS');
    assert.equal(record.tp1_hit, true);
    assert.equal(record.tp1_hit_bar_time, bars[0].time);
    assert.equal(record.resolution_bar_time, bars[2].time);
  });

  it('TP1 -> later SL -> FAIL (tp1_hit survives into the terminal record)', () => {
    const store = freshStore();
    const record = registerBuy(store);
    const bars = [
      bar(1, { open: 2000, high: 2012, low: 1999, close: 2010 }), // TP1
      bar(2, { open: 2010, high: 2011, low: 1985, close: 1988 }), // SL
    ];
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'FAIL');
    assert.equal(record.tp1_hit, true);
    assert.equal(record.realized_r, -1); // TP1 never changes FAIL's existing realized_r semantics
  });

  it('same-bar TP1+TP2 safely records tp1_hit -- geometrically implied, no hindsight needed', () => {
    const store = freshStore();
    const record = registerBuy(store);
    const bars = [bar(1, { open: 2000, high: 2025, low: 1999, close: 2020 })]; // clears both TP1 and TP2
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'PASS');
    assert.equal(record.tp1_hit, true);
  });

  it('same-bar TP1+SL does NOT record tp1_hit -- genuinely ambiguous, existing conservative FAIL unchanged', () => {
    const store = freshStore();
    const record = registerBuy(store);
    const bars = [bar(1, { open: 2000, high: 2012, low: 1985, close: 1990 })]; // clears TP1 (high) and SL (low), TP2 not reached
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'FAIL');
    assert.equal(record.tp1_hit, false); // ambiguous -- never recorded
  });

  it('TP1 alone never creates PASS -- record stays OPEN indefinitely without a TP2/SL cross', () => {
    const store = freshStore();
    const record = registerBuy(store);
    const bars = Array.from({ length: 20 }, (_, i) => bar(i + 1, { open: 2010, high: 2012, low: 2009, close: 2011 }));
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'OPEN');
    assert.equal(record.tp1_hit, true);
  });
});

describe('Signal lifecycle: TP1 tracking, SELL (symmetric)', () => {
  it('OPEN before TP1', () => {
    const store = freshStore();
    const record = registerSell(store);
    const bars = [bar(1, { open: 2000, high: 2003, low: 1996, close: 1998 })];
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'OPEN');
    assert.equal(record.tp1_hit, false);
  });

  it('TP1 hit -> remains OPEN, recorded once', () => {
    const store = freshStore();
    const record = registerSell(store);
    const tp1Bar = bar(1, { open: 2000, high: 2001, low: 1988, close: 1990 });
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: [tp1Bar] });
    assert.equal(record.status, 'OPEN');
    assert.equal(record.tp1_hit, true);
    assert.equal(record.tp1_hit_bar_time, tp1Bar.time);
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: [tp1Bar] });
    assert.equal(record.tp1_hit_bar_time, tp1Bar.time); // idempotent
  });

  it('TP1 -> later TP2 -> PASS', () => {
    const store = freshStore();
    const record = registerSell(store);
    const bars = [
      bar(1, { open: 2000, high: 2001, low: 1988, close: 1990 }), // TP1
      bar(2, { open: 1990, high: 1992, low: 1979, close: 1981 }), // TP2
    ];
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'PASS');
    assert.equal(record.tp1_hit, true);
  });

  it('TP1 -> later SL -> FAIL', () => {
    const store = freshStore();
    const record = registerSell(store);
    const bars = [
      bar(1, { open: 2000, high: 2001, low: 1988, close: 1990 }), // TP1
      bar(2, { open: 1990, high: 2012, low: 1989, close: 2011 }), // SL
    ];
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'FAIL');
    assert.equal(record.tp1_hit, true);
  });

  it('same-bar TP1+TP2 safely records tp1_hit', () => {
    const store = freshStore();
    const record = registerSell(store);
    const bars = [bar(1, { open: 2000, high: 2001, low: 1975, close: 1980 })];
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'PASS');
    assert.equal(record.tp1_hit, true);
  });

  it('same-bar TP1+SL does NOT record tp1_hit', () => {
    const store = freshStore();
    const record = registerSell(store);
    const bars = [bar(1, { open: 2000, high: 2012, low: 1988, close: 2005 })];
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.status, 'FAIL');
    assert.equal(record.tp1_hit, false);
  });
});

describe('Signal lifecycle: safety/backward-compatibility', () => {
  it('a pre-existing record without tp1_hit/tp1_hit_bar_time fields is normalized safely, never corrupted', () => {
    const store = { signals: [{
      signal_id: 'legacy1', symbol: 'OANDA:XAUUSD', timeframe: TF, model: 'PB', side: 'SELL',
      origin_bar: SIGNAL_BAR, signal_bar_time: SIGNAL_BAR, entry: 4320.37, stop_loss: 4350.17, tp1: 4290.56, tp2: 4260.76, rr: 2, quality: 72,
      status: 'OPEN', created_at: '2026-01-01T00:00:00.000Z', resolution_bar_time: null, realized_r: null,
      // tp1_hit / tp1_hit_bar_time deliberately ABSENT -- simulates the real pre-existing live record.
    }] };
    const record = store.signals[0];
    const bars = [bar(1, { open: 4320, high: 4325, low: 4318, close: 4322 })]; // no crossing at all
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(record.tp1_hit, false);
    assert.equal(record.tp1_hit_bar_time, null);
    // Every authoritative field is untouched.
    assert.equal(record.entry, 4320.37);
    assert.equal(record.stop_loss, 4350.17);
    assert.equal(record.tp1, 4290.56);
    assert.equal(record.tp2, 4260.76);
    assert.equal(record.rr, 2);
    assert.equal(record.side, 'SELL');
    assert.equal(record.signal_bar_time, SIGNAL_BAR);
  });

  it('terminal PASS/FAIL records remain immutable and are never re-evaluated by a later resolver run', () => {
    const store = freshStore();
    const record = registerBuy(store);
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: [bar(1, { open: 2000, high: 2025, low: 1999, close: 2020 })] });
    assert.equal(record.status, 'PASS');
    const snapshot = { ...record };
    // Feed bars that WOULD flip it to FAIL if it were (incorrectly) re-evaluated.
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: [bar(2, { open: 2020, high: 2021, low: 1980, close: 1981 })] });
    assert.deepEqual(record, snapshot);
  });

  it('repeated resolver runs across multiple registered records are fully idempotent', () => {
    const store = freshStore();
    const r1 = registerBuy(store, { originBar: SIGNAL_BAR, signalBarTime: SIGNAL_BAR });
    const r2 = registerSell(store, { originBar: SIGNAL_BAR + 1, signalBarTime: SIGNAL_BAR + 1 });
    // A clean, unambiguous TP1-only touch for BOTH records (neither SL is threatened).
    const bars = [bar(1, { open: 2000, high: 2012, low: 1995, close: 2005 })];
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    const snap1 = JSON.stringify(store);
    resolveOpenSignals(store, { timeframe: TF, confirmedBars: bars });
    assert.equal(JSON.stringify(store), snap1);
    assert.ok(r1.tp1_hit); // BUY tp1=2010, high=2012 -- clean hit
    assert.equal(r2.tp1_hit, false); // SELL tp1=1990, low=1995 -- not reached (sanity, no accidental cross-contamination)
  });
});

describe('Signal lifecycle: trader-facing card wording', () => {
  const TF15 = '15m';
  const NOW = SIGNAL_BAR;
  function baseDecision(overrides = {}) {
    return {
      schema_version: '1.1.0', status: 'OK', action: 'WAIT', reason: null, symbol: 'OANDA:XAUUSD',
      timeframes: { [TF15]: { last_confirmed_bar_time: NOW } }, market_data_times: { [TF15]: NOW },
      diagnostics: { source_timeframe: TF15 }, setup: null, entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null,
      ...overrides,
    };
  }

  it('shows "<SIDE> ACTIVE" (never "pending") before TP1 is hit', () => {
    const openSignal = { signal_id: 's1', symbol: 'OANDA:XAUUSD', timeframe: TF15, side: 'SELL', entry: 4320.37, stop_loss: 4350.17, tp1: 4290.56, tp2: 4260.76, rr: 2, status: 'OPEN', tp1_hit: false, tp1_hit_bar_time: null };
    const intents = buildSignalOnlyIntents({ decision: baseDecision(), evidence: null, anticipation: null, openSignal, symbol: 'OANDA:XAUUSD', timeframe: TF15 });
    const card = intents.find((i) => i.role === 'trade_card');
    assert.equal(card.text, 'SELL ACTIVE\nEntry 4320.37\nSL 4350.17\nTP1 4290.56\nTP2 4260.76\nRR 2');
    assert.ok(!card.text.toUpperCase().includes('PENDING ENTRY'));
  });

  it('shows "TP1 HIT / TP2 Pending" once tp1_hit is recorded, geometry unchanged', () => {
    const openSignal = { signal_id: 's1', symbol: 'OANDA:XAUUSD', timeframe: TF15, side: 'SELL', entry: 4320.37, stop_loss: 4350.17, tp1: 4290.56, tp2: 4260.76, rr: 2, status: 'OPEN', tp1_hit: true, tp1_hit_bar_time: NOW + 900 };
    const intents = buildSignalOnlyIntents({ decision: baseDecision(), evidence: null, anticipation: null, openSignal, symbol: 'OANDA:XAUUSD', timeframe: TF15 });
    const card = intents.find((i) => i.role === 'trade_card');
    assert.equal(card.text, 'SELL ACTIVE\nTP1 HIT\nTP2 Pending\nEntry 4320.37\nSL 4350.17\nTP1 4290.56\nTP2 4260.76\nRR 2');
    // The analytical lines are unchanged regardless of TP1 status.
    assert.equal(intents.find((i) => i.role === 'trade_entry').text, 'ENTRY 4320.37');
    assert.equal(intents.find((i) => i.role === 'trade_sl').text, 'SL 4350.17');
  });

  it('BUY equivalent shows "BUY ACTIVE" / "TP1 HIT / TP2 Pending"', () => {
    const openSignal = { signal_id: 's2', symbol: 'OANDA:XAUUSD', timeframe: TF15, side: 'BUY', entry: 2000, stop_loss: 1990, tp1: 2010, tp2: 2020, rr: 2, status: 'OPEN', tp1_hit: true, tp1_hit_bar_time: NOW + 900 };
    const intents = buildSignalOnlyIntents({ decision: baseDecision(), evidence: null, anticipation: null, openSignal, symbol: 'OANDA:XAUUSD', timeframe: TF15 });
    const card = intents.find((i) => i.role === 'trade_card');
    assert.equal(card.text, 'BUY ACTIVE\nTP1 HIT\nTP2 Pending\nEntry 2000\nSL 1990\nTP1 2010\nTP2 2020\nRR 2');
  });

  it('a terminal record is never selected as the ACTIVE card (findMostRecentOpenSignal-equivalent: caller passes null once terminal)', () => {
    // The orchestrator (xauusd_visualize_market.js) only ever passes an
    // OPEN record as `openSignal` -- once terminal, the caller passes null,
    // and the WAIT/WATCH box renders instead. This proves the card function
    // itself never claims ACTIVE status without an open record.
    const intents = buildSignalOnlyIntents({ decision: baseDecision(), evidence: { sessionContext: { current: { last_close: 2000 } } }, anticipation: null, openSignal: null, symbol: 'OANDA:XAUUSD', timeframe: TF15 });
    assert.equal(intents.find((i) => i.role === 'trade_card'), undefined);
    const box = intents.find((i) => i.role === 'status_box');
    assert.equal(box.text, 'XAUUSD\nWAIT\nNo Opportunity');
  });
});
