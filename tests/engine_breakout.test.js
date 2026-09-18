/**
 * src/engine/breakout.js -- breakout/retest lifecycle classification.
 * Hand-crafted fixtures built directly as { lastEvent } structure shapes
 * (mirrors computeStructure()'s real output shape) so exact bar-index
 * geometry around the breakout is fully controlled.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBreakoutState, BREAKOUT_PARAMS } from '../src/engine/breakout.js';

const T0 = 1700000000;
function flatBars(n, price = 2000, range = 1) {
  const bars = [];
  for (let i = 0; i < n; i++) bars.push({ time: T0 + i * 900, open: price, high: price + range, low: price - range, close: price, volume: 100 });
  return bars;
}

describe('engine/breakout: classifyBreakoutState', () => {
  it('reports NO_BREAKOUT when structure has no lastEvent', () => {
    const result = classifyBreakoutState({ bars: flatBars(5), structure: {}, atrVal: 1 });
    assert.equal(result.state, 'NO_BREAKOUT');
  });

  it('BREAKOUT_FORMING on the exact bar the event occurred', () => {
    const bars = flatBars(10, 2000, 1);
    bars[9] = { ...bars[9], close: 2010, open: 2000, high: 2011, low: 1999 }; // breakout bar itself, no bars after yet
    const structure = { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 9, level: 2005 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 4 });
    assert.equal(result.state, 'BREAKOUT_FORMING');
  });

  it('BREAKOUT_RETEST_PENDING while holding beyond the level with no retest yet, within the window', () => {
    const bars = flatBars(9, 2000, 1);
    bars[8] = { ...bars[8], close: 2010, open: 2000, high: 2011, low: 1999 }; // event bar (index 8)
    for (let k = 0; k < 3; k++) bars.push({ time: T0 + (9 + k) * 900, open: 2010, high: 2012, low: 2009, close: 2011, volume: 100 });
    const structure = { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 8, level: 2005 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 4 });
    assert.equal(result.state, 'BREAKOUT_RETEST_PENDING');
    assert.equal(result.evidence.retested, false);
  });

  it('RETEST_TESTING when price has touched back near the level but not resolved either way', () => {
    const bars = flatBars(8, 2000, 1);
    bars[7] = { ...bars[7], close: 2010, open: 2000, high: 2011, low: 1999 }; // event bar, level 2005
    bars.push({ time: T0 + 8 * 900, open: 2010, high: 2010.5, low: 2005.1, close: 2005.2, volume: 100 }); // pulls back to the level
    const structure = { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 7, level: 2005 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 1 });
    assert.equal(result.evidence.retested, true);
    assert.equal(result.state, 'RETEST_TESTING');
  });

  it('RETEST_HOLD when price retests and closes back beyond the level afterward', () => {
    const bars = flatBars(7, 2000, 1);
    bars[6] = { ...bars[6], close: 2010, open: 2000, high: 2011, low: 1999 }; // event bar, level 2005
    bars.push({ time: T0 + 7 * 900, open: 2010, high: 2010.5, low: 2005.1, close: 2005.5, volume: 100 }); // retest touch
    bars.push({ time: T0 + 8 * 900, open: 2005.5, high: 2012, low: 2005, close: 2011, volume: 100 }); // holds beyond
    const structure = { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 6, level: 2005 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 1 });
    assert.equal(result.state, 'RETEST_HOLD');
  });

  it('FAILED_BREAKOUT when a retest is followed by a close back through the level', () => {
    const bars = flatBars(7, 2000, 1);
    bars[6] = { ...bars[6], close: 2010, open: 2000, high: 2011, low: 1999 }; // event bar, level 2005
    bars.push({ time: T0 + 7 * 900, open: 2010, high: 2010.5, low: 2005.1, close: 2005.5, volume: 100 }); // retest touch
    bars.push({ time: T0 + 8 * 900, open: 2005.5, high: 2005.6, low: 1998, close: 1999, volume: 100 }); // fails back through
    const structure = { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 6, level: 2005 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 1 });
    assert.equal(result.state, 'FAILED_BREAKOUT');
  });

  it('FALSE_BREAKOUT when price reverses back through the level quickly with no retest ever occurring', () => {
    const bars = flatBars(7, 2000, 1);
    bars[6] = { ...bars[6], close: 2010, open: 2000, high: 2011, low: 1999 }; // event bar, level 2005
    bars.push({ time: T0 + 7 * 900, open: 2010, high: 2010.2, low: 1998, close: 1999, volume: 100 }); // reverses straight through, 1 bar later, never touched 2005 zone first (jumps clean over it)
    const structure = { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 6, level: 2005 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 1 });
    assert.equal(result.evidence.retested, false);
    assert.equal(result.state, 'FALSE_BREAKOUT');
  });

  it('BREAKOUT_RECLAIMED when price eventually reverses back through the level well after the false-breakout window, with no retest', () => {
    const bars = flatBars(6, 2000, 1);
    bars[5] = { ...bars[5], close: 2010, open: 2000, high: 2011, low: 1999 }; // event bar, level 2005
    for (let k = 0; k < 6; k++) bars.push({ time: T0 + (6 + k) * 900, open: 2010, high: 2012, low: 2009, close: 2011, volume: 100 }); // holds well beyond retest window
    bars.push({ time: T0 + 12 * 900, open: 2011, high: 2011.5, low: 1998, close: 1999, volume: 100 }); // reverses through much later, still never retested
    const structure = { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 5, level: 2005 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 1 });
    assert.equal(result.evidence.retested, false);
    assert.equal(result.state, 'BREAKOUT_RECLAIMED');
  });

  it('OVEREXTENDED_BREAKOUT when price has run far beyond the level in ATR terms with no retest', () => {
    const bars = flatBars(6, 2000, 1);
    bars[5] = { ...bars[5], close: 2010, open: 2000, high: 2011, low: 1999 }; // event bar, level 2005
    bars.push({ time: T0 + 6 * 900, open: 2010, high: 2100, low: 2009, close: 2095, volume: 100 }); // rockets far away, ATR=1 -> ~90x ATR from level
    const structure = { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 5, level: 2005 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 1 });
    assert.equal(result.state, 'OVEREXTENDED_BREAKOUT');
  });

  it('BREAKOUT_CONFIRMED once well past the retest window with no retest and no overextension', () => {
    const bars = flatBars(5, 2000, 1);
    bars[4] = { ...bars[4], close: 2010, open: 2000, high: 2011, low: 1999 }; // event bar, level 2005
    for (let k = 0; k < BREAKOUT_PARAMS.retestMaxBars + 2; k++) bars.push({ time: T0 + (5 + k) * 900, open: 2010, high: 2011, low: 2009.5, close: 2010.2, volume: 100 });
    const structure = { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 4, level: 2005 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 4 });
    assert.equal(result.state, 'BREAKOUT_CONFIRMED');
  });

  it('mirrors correctly for a BEARISH breakout direction', () => {
    const bars = flatBars(9, 2000, 1);
    bars[8] = { ...bars[8], close: 1990, open: 2000, high: 2001, low: 1989 }; // bearish event bar, level 1995
    for (let k = 0; k < 3; k++) bars.push({ time: T0 + (9 + k) * 900, open: 1990, high: 1991, low: 1988, close: 1989, volume: 100 });
    const structure = { lastEvent: { type: 'BOS', direction: 'BEARISH', bar: 8, level: 1995 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 4 });
    assert.equal(result.state, 'BREAKOUT_RETEST_PENDING');
  });

  it('flags strong displacement and pre-breakout compression when evidenced', () => {
    // 20 bars of normal (wider) range establish the baseline, then 10
    // bars of tight range right before the breakout show genuine
    // CONTRACTION relative to that baseline, then one large displacement candle.
    const bars = [];
    for (let i = 0; i < 20; i++) bars.push({ time: T0 + i * 900, open: 2000, high: 2001, low: 1999, close: 2000, volume: 100 }); // normal/wider baseline range
    for (let i = 20; i < 30; i++) bars.push({ time: T0 + i * 900, open: 2000, high: 2000.1, low: 1999.9, close: 2000, volume: 100 }); // tight compression right before the breakout
    bars.push({ time: T0 + 30 * 900, open: 2000, high: 2020, low: 1999.5, close: 2019, volume: 100 }); // strong displacement breakout, body 19 >> ATR
    const structure = { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 30, level: 2000.2 } };
    const result = classifyBreakoutState({ bars, structure, atrVal: 0.4 });
    assert.equal(result.evidence.strong_displacement, true);
    assert.equal(result.evidence.compressed_before_breakout, true);
  });

  it('does not throw on missing/insufficient bars', () => {
    const result = classifyBreakoutState({ bars: [], structure: { lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 0, level: 100 } }, atrVal: 1 });
    assert.equal(result.state, 'NO_BREAKOUT');
  });
});
