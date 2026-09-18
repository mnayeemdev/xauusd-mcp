/**
 * src/engine/session.js -- DST-aware gold session classification and
 * session/day/week range context. Deterministic unit tests using
 * well-known real-world DST transition dates as independent ground truth
 * (2024: UK BST 31 Mar - 27 Oct; US EDT 10 Mar - 3 Nov), not derived from
 * the implementation itself.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLondonDst, isNewYorkDst, classifyGoldSession,
  computeSessionContext, computeDailyWeeklyContext,
} from '../src/engine/session.js';

function utcSec(y, m, d, h = 0, min = 0) {
  return Date.UTC(y, m - 1, d, h, min) / 1000;
}

describe('engine/session: DST transition correctness (2024 real-world reference dates)', () => {
  it('London: BST starts 01:00 UTC on 31 Mar 2024', () => {
    assert.equal(isLondonDst(utcSec(2024, 3, 31, 0, 59)), false);
    assert.equal(isLondonDst(utcSec(2024, 3, 31, 1, 0)), true);
  });
  it('London: BST ends 01:00 UTC on 27 Oct 2024', () => {
    assert.equal(isLondonDst(utcSec(2024, 10, 27, 0, 59)), true);
    assert.equal(isLondonDst(utcSec(2024, 10, 27, 1, 0)), false);
  });
  it('New York: EDT starts 07:00 UTC on 10 Mar 2024', () => {
    assert.equal(isNewYorkDst(utcSec(2024, 3, 10, 6, 59)), false);
    assert.equal(isNewYorkDst(utcSec(2024, 3, 10, 7, 0)), true);
  });
  it('New York: EDT ends 06:00 UTC on 3 Nov 2024', () => {
    assert.equal(isNewYorkDst(utcSec(2024, 11, 3, 5, 59)), true);
    assert.equal(isNewYorkDst(utcSec(2024, 11, 3, 6, 0)), false);
  });
  it('neither DST is active in mid-January', () => {
    assert.equal(isLondonDst(utcSec(2024, 1, 15, 12, 0)), false);
    assert.equal(isNewYorkDst(utcSec(2024, 1, 15, 12, 0)), false);
  });
  it('both DSTs are active in mid-July', () => {
    assert.equal(isLondonDst(utcSec(2024, 7, 15, 12, 0)), true);
    assert.equal(isNewYorkDst(utcSec(2024, 7, 15, 12, 0)), true);
  });
});

describe('engine/session: classifyGoldSession (winter, no DST -- 15 Jan 2024)', () => {
  it('00:00-08:00 UTC is ASIA', () => {
    assert.equal(classifyGoldSession(utcSec(2024, 1, 15, 2, 0)), 'ASIA');
    assert.equal(classifyGoldSession(utcSec(2024, 1, 15, 7, 59)), 'ASIA');
  });
  it('08:00 UTC is exactly LONDON open (winter)', () => {
    assert.equal(classifyGoldSession(utcSec(2024, 1, 15, 8, 0)), 'LONDON');
  });
  it('13:00-16:00 UTC is the LONDON/NY overlap (winter)', () => {
    assert.equal(classifyGoldSession(utcSec(2024, 1, 15, 13, 0)), 'LONDON_NY_OVERLAP');
    assert.equal(classifyGoldSession(utcSec(2024, 1, 15, 15, 59)), 'LONDON_NY_OVERLAP');
  });
  it('17:00 UTC (after London close, before NY close) is NEW_YORK (winter)', () => {
    assert.equal(classifyGoldSession(utcSec(2024, 1, 15, 17, 0)), 'NEW_YORK');
  });
  it('22:00 UTC (after NY close, before Asia open) is OTHER (winter)', () => {
    assert.equal(classifyGoldSession(utcSec(2024, 1, 15, 22, 0)), 'OTHER');
  });
});

describe('engine/session: classifyGoldSession shifts one hour earlier in UTC during DST (15 Jul 2024)', () => {
  it('London opens at 07:00 UTC during BST, not 08:00', () => {
    assert.equal(classifyGoldSession(utcSec(2024, 7, 15, 6, 59)), 'ASIA');
    assert.equal(classifyGoldSession(utcSec(2024, 7, 15, 7, 0)), 'LONDON');
  });
  it('NY opens at 12:00 UTC during EDT, not 13:00', () => {
    assert.equal(classifyGoldSession(utcSec(2024, 7, 15, 12, 0)), 'LONDON_NY_OVERLAP');
  });
  it('overlap window shifts to 12:00-15:00 UTC during summer DST', () => {
    assert.equal(classifyGoldSession(utcSec(2024, 7, 15, 14, 59)), 'LONDON_NY_OVERLAP');
    assert.equal(classifyGoldSession(utcSec(2024, 7, 15, 15, 0)), 'NEW_YORK');
  });
  it('NY closes at 20:00 UTC during EDT, not 21:00', () => {
    assert.equal(classifyGoldSession(utcSec(2024, 7, 15, 19, 59)), 'NEW_YORK');
    assert.equal(classifyGoldSession(utcSec(2024, 7, 15, 20, 0)), 'OTHER');
  });
});

function bar(time, high, low, close, open = close) {
  return { time, open, high, low, close, volume: 100 };
}

describe('engine/session: computeSessionContext', () => {
  it('returns nulls for empty input', () => {
    const ctx = computeSessionContext([]);
    assert.equal(ctx.current, null);
    assert.equal(ctx.previous, null);
  });

  it('groups bars into ASIA then LONDON segments and detects an upside breakout', () => {
    const bars = [
      bar(utcSec(2024, 1, 15, 1, 0), 2010, 2000, 2005),
      bar(utcSec(2024, 1, 15, 3, 0), 2015, 2002, 2008), // Asia session high 2015, low 2000
      bar(utcSec(2024, 1, 15, 9, 0), 2020, 2009, 2018),
      bar(utcSec(2024, 1, 15, 11, 0), 2030, 2017, 2028), // London session high 2030 > Asia high 2015 -> UP breakout
    ];
    const ctx = computeSessionContext(bars);
    assert.equal(ctx.previous.session, 'ASIA');
    assert.equal(ctx.previous.high, 2015);
    assert.equal(ctx.previous.low, 2000);
    assert.equal(ctx.current.session, 'LONDON');
    assert.equal(ctx.current.high, 2030);
    assert.equal(ctx.breakout, 'UP');
  });

  it('detects a session sweep: current session pokes above previous high but closes back under it', () => {
    const bars = [
      bar(utcSec(2024, 1, 15, 1, 0), 2010, 2000, 2005), // Asia high 2010
      bar(utcSec(2024, 1, 15, 9, 0), 2013, 2004, 2006), // London wicks 2013 (clears tolerance above 2010) but closes at 2006 (<=2010) -> sweep
    ];
    const ctx = computeSessionContext(bars);
    assert.equal(ctx.sweep, 'SWEEP_HIGH');
    assert.equal(ctx.breakout, 'UP'); // high did technically exceed, both fields are independently reported
  });

  it('flags SESSION_EXPANSION when the current session range is materially larger than the previous one', () => {
    const bars = [
      bar(utcSec(2024, 1, 15, 1, 0), 2002, 2000, 2001), // Asia range 2
      bar(utcSec(2024, 1, 15, 9, 0), 2040, 2000, 2030), // London range 40 -- large expansion
    ];
    const ctx = computeSessionContext(bars);
    assert.equal(ctx.expansion, 'EXPANSION');
  });

  it('does not fabricate a previous session when only one segment exists', () => {
    const bars = [bar(utcSec(2024, 1, 15, 1, 0), 2010, 2000, 2005)];
    const ctx = computeSessionContext(bars);
    assert.equal(ctx.current.session, 'ASIA');
    assert.equal(ctx.previous, null);
    assert.equal(ctx.breakout, null);
  });
});

describe('engine/session: computeDailyWeeklyContext', () => {
  it('reports previous day/week high-low-range from confirmed bars', () => {
    const dailyBars = [bar(utcSec(2024, 1, 10), 2100, 2080, 2090), bar(utcSec(2024, 1, 11), 2120, 2085, 2110)];
    const weeklyBars = [bar(utcSec(2024, 1, 1), 2200, 2050, 2100)];
    const ctx = computeDailyWeeklyContext({ dailyBars, weeklyBars });
    assert.equal(ctx.previousDayHigh, 2120);
    assert.equal(ctx.previousDayLow, 2085);
    assert.equal(ctx.previousDayRange, 35);
    assert.equal(ctx.previousWeekHigh, 2200);
    assert.equal(ctx.previousWeekLow, 2050);
    assert.equal(ctx.currentDayRangePosition, null); // no currentDayBar supplied -- must not be fabricated
  });

  it('computes current-day range position only when a real forming-bar is supplied, never guessed', () => {
    const dailyBars = [bar(utcSec(2024, 1, 10), 2100, 2080, 2090)];
    const currentDayBar = bar(utcSec(2024, 1, 11), 2150, 2100, 2130);
    const ctx = computeDailyWeeklyContext({ dailyBars, weeklyBars: [], currentDayBar, currentPrice: 2125 });
    // (2125 - 2100) / (2150 - 2100) * 100 = 50
    assert.equal(ctx.currentDayRangePosition, 50);
  });

  it('handles missing daily/weekly data without throwing', () => {
    const ctx = computeDailyWeeklyContext({ dailyBars: [], weeklyBars: [] });
    assert.equal(ctx.previousDayHigh, null);
    assert.equal(ctx.previousWeekHigh, null);
  });
});
