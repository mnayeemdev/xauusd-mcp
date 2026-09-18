/**
 * Deterministic gold-market session/time context (Part 9 of the XAUUSD MCP
 * analysis-engine upgrade). This is a NEW, separate classifier from
 * quality.js's classifySession() -- that function stays completely
 * untouched (it feeds the PROTECTED quality score with a simple fixed
 * UTC-hour bucket, and changing its behavior would silently retune a
 * protected trading parameter). This module is additive, informational
 * evidence only: it is never wired into quality/risk/regime scoring.
 *
 * DST handling: London (BST) and New York (EDT) session windows are
 * defined here in their OWN local standard-time hours and then shifted
 * one hour earlier in UTC while that market observes daylight saving --
 * computed deterministically from the actual transition rule for each
 * region (UK: last Sunday of March/October; US: second Sunday of March /
 * first Sunday of November), never a hardcoded date table.
 *
 * No lookahead: every function here only ever reads bars/timestamps the
 * caller passed in, never fabricates a "current" day/week bar.
 */

export const SESSION_PARAMS = {
  asiaStartHourUtc: 0,
  asiaEndHourUtc: 8,
  londonStartHourStd: 8, // GMT (winter) local London session open
  londonEndHourStd: 16, // GMT (winter) local London session close
  nyStartHourStd: 13, // EST (winter) local New York session open
  nyEndHourStd: 21, // EST (winter) local New York session close
  sessionExpansionRatio: 1.3, // current session range / previous session range >= this => SESSION_EXPANSION
  sessionSweepTolerancePct: 0.05, // % beyond the prior session extreme still counted as a sweep, not noise
};

function dateUtc(unixSeconds) {
  return new Date(unixSeconds * 1000);
}

/** The Nth (1-based) occurrence of `weekday` (0=Sun) in `month` (0-based) of `year`, as a UTC Date at 00:00. */
function nthWeekdayOfMonthUtc(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return new Date(Date.UTC(year, month, day));
}

/** The LAST occurrence of `weekday` in `month` (0-based) of `year`, as a UTC Date at 00:00. */
function lastWeekdayOfMonthUtc(year, month, weekday) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month, lastDay));
  const diff = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, lastDay - diff));
}

/**
 * UK British Summer Time: from 01:00 UTC on the last Sunday of March to
 * 01:00 UTC on the last Sunday of October.
 */
export function isLondonDst(unixSeconds) {
  const d = dateUtc(unixSeconds);
  const year = d.getUTCFullYear();
  const start = lastWeekdayOfMonthUtc(year, 2, 0); // March, Sunday
  start.setUTCHours(1, 0, 0, 0);
  const end = lastWeekdayOfMonthUtc(year, 9, 0); // October, Sunday
  end.setUTCHours(1, 0, 0, 0);
  return d.getTime() >= start.getTime() && d.getTime() < end.getTime();
}

/**
 * US Eastern Daylight Time: from 07:00 UTC on the second Sunday of March
 * (02:00 local EST -> clocks spring forward) to 06:00 UTC on the first
 * Sunday of November (02:00 local EDT -> clocks fall back).
 */
export function isNewYorkDst(unixSeconds) {
  const d = dateUtc(unixSeconds);
  const year = d.getUTCFullYear();
  const start = nthWeekdayOfMonthUtc(year, 2, 0, 2); // March, 2nd Sunday
  start.setUTCHours(7, 0, 0, 0);
  const end = nthWeekdayOfMonthUtc(year, 10, 0, 1); // November, 1st Sunday
  end.setUTCHours(6, 0, 0, 0);
  return d.getTime() >= start.getTime() && d.getTime() < end.getTime();
}

/**
 * Classifies a unix timestamp into the current gold-trading session,
 * shifting the London/New York UTC windows one hour earlier during their
 * respective DST periods (never shifting Asia, which is defined directly
 * in UTC and has no DST).
 */
export function classifyGoldSession(unixSeconds, params = SESSION_PARAMS) {
  const p = params;
  const d = dateUtc(unixSeconds);
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  const londonShift = isLondonDst(unixSeconds) ? 1 : 0;
  const nyShift = isNewYorkDst(unixSeconds) ? 1 : 0;
  const londonStart = p.londonStartHourStd - londonShift;
  const londonEnd = p.londonEndHourStd - londonShift;
  const nyStart = p.nyStartHourStd - nyShift;
  const nyEnd = p.nyEndHourStd - nyShift;

  const inLondon = hour >= londonStart && hour < londonEnd;
  const inNy = hour >= nyStart && hour < nyEnd;
  if (inLondon && inNy) return 'LONDON_NY_OVERLAP';
  if (inLondon) return 'LONDON';
  if (inNy) return 'NEW_YORK';
  if (hour >= p.asiaStartHourUtc && hour < p.asiaEndHourUtc) return 'ASIA';
  return 'OTHER';
}

/** Session key groups bars into same-day, same-session segments (none of the fixed UTC windows above cross UTC midnight). */
function sessionKey(unixSeconds, session) {
  const d = dateUtc(unixSeconds);
  const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return `${session}|${dateStr}`;
}

/**
 * Groups confirmed intraday bars into session segments and returns the
 * CURRENT segment (containing the last confirmed bar), the PREVIOUS
 * segment (the one immediately before it chronologically), and
 * breakout/sweep/expansion evidence comparing the two. `confirmedBars`
 * should be a reasonably fine intraday timeframe (5m/15m/30m) so session
 * boundaries are resolved with useful granularity.
 */
export function computeSessionContext(confirmedBars, params = SESSION_PARAMS) {
  const p = params;
  if (!Array.isArray(confirmedBars) || confirmedBars.length === 0) {
    return { current: null, previous: null, breakout: null, sweep: null, expansion: null };
  }

  const segments = new Map(); // key -> { session, bars: [] }
  for (const b of confirmedBars) {
    const session = classifyGoldSession(b.time, p);
    if (session === 'OTHER') continue;
    const key = sessionKey(b.time, session);
    if (!segments.has(key)) segments.set(key, { session, bars: [] });
    segments.get(key).bars.push(b);
  }
  const ordered = [...segments.values()].sort((a, b) => a.bars[0].time - b.bars[0].time);
  if (ordered.length === 0) return { current: null, previous: null, breakout: null, sweep: null, expansion: null };

  function summarize(seg) {
    const highs = seg.bars.map((b) => b.high);
    const lows = seg.bars.map((b) => b.low);
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    return {
      session: seg.session,
      high, low, range: high - low,
      start_time: seg.bars[0].time,
      end_time: seg.bars[seg.bars.length - 1].time,
      last_close: seg.bars[seg.bars.length - 1].close,
    };
  }

  const current = summarize(ordered[ordered.length - 1]);
  const previous = ordered.length >= 2 ? summarize(ordered[ordered.length - 2]) : null;

  let breakout = null;
  let sweep = null;
  let expansion = null;
  if (previous) {
    const tol = previous.high * (p.sessionSweepTolerancePct / 100);
    const brokeUp = current.high > previous.high;
    const brokeDown = current.low < previous.low;
    breakout = brokeUp && brokeDown ? 'BOTH' : brokeUp ? 'UP' : brokeDown ? 'DOWN' : 'NONE';

    const sweptHighRejected = current.high > previous.high + tol && current.last_close <= previous.high;
    const sweptLowRejected = current.low < previous.low - tol && current.last_close >= previous.low;
    sweep = sweptHighRejected ? 'SWEEP_HIGH' : sweptLowRejected ? 'SWEEP_LOW' : 'NONE';

    expansion = previous.range > 0 && current.range / previous.range >= p.sessionExpansionRatio ? 'EXPANSION' : 'NONE';
  }

  return { current, previous, breakout, sweep, expansion };
}

function round2(n) { return n === null || n === undefined ? null : Math.round(n * 100) / 100; }

/**
 * Previous-day/week high/low/range from CONFIRMED daily/weekly bars
 * (oldest-first; the caller has already excluded the still-forming bar
 * upstream, same convention as the rest of the engine). `currentDayBar` /
 * `currentWeekBar` are the corresponding FORMING bars, if the caller has
 * them -- real, already-elapsed intrabar data, not fabricated lookahead
 * -- used only to report where price currently sits within that bar's
 * own realized range so far. When not supplied, the range-position field
 * is honestly reported as null rather than guessed from the prior period.
 */
export function computeDailyWeeklyContext({ dailyBars, weeklyBars, currentDayBar = null, currentWeekBar = null, currentPrice = null }) {
  const result = {
    previousDayHigh: null, previousDayLow: null, previousDayRange: null, currentDayRangePosition: null,
    previousWeekHigh: null, previousWeekLow: null, previousWeekRange: null, currentWeekRangePosition: null,
  };

  if (Array.isArray(dailyBars) && dailyBars.length > 0) {
    const prevDay = dailyBars[dailyBars.length - 1];
    result.previousDayHigh = prevDay.high;
    result.previousDayLow = prevDay.low;
    result.previousDayRange = round2(prevDay.high - prevDay.low);
    if (currentDayBar && Number.isFinite(currentPrice) && currentDayBar.high > currentDayBar.low) {
      result.currentDayRangePosition = round2(((currentPrice - currentDayBar.low) / (currentDayBar.high - currentDayBar.low)) * 100);
    }
  }

  if (Array.isArray(weeklyBars) && weeklyBars.length > 0) {
    const prevWeek = weeklyBars[weeklyBars.length - 1];
    result.previousWeekHigh = prevWeek.high;
    result.previousWeekLow = prevWeek.low;
    result.previousWeekRange = round2(prevWeek.high - prevWeek.low);
    if (currentWeekBar && Number.isFinite(currentPrice) && currentWeekBar.high > currentWeekBar.low) {
      result.currentWeekRangePosition = round2(((currentPrice - currentWeekBar.low) / (currentWeekBar.high - currentWeekBar.low)) * 100);
    }
  }

  return result;
}
