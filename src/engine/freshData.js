/**
 * Genuine bar-freshness verification for the single-chart CDP architecture.
 *
 * Switching the visible chart's resolution (chart.setResolution()) is
 * asynchronous inside TradingView: it unsubscribes the old series and
 * resubscribes/backfills the new one. Reading OHLCV immediately afterward
 * can race that process and silently return a cached snapshot for the
 * requested timeframe that never advances -- the exact symptom this module
 * exists to catch (see docs on peekLatest5mCandle in ../engine/watcher.js).
 *
 * These are pure helpers: no CDP calls, no chart mutation. They only judge
 * whether a bar that was already fetched is plausibly current, using
 * nothing but its own timestamp, the requested timeframe's known bar
 * duration, and a caller-supplied "now". No undocumented resolution
 * strings or APIs -- timeframe codes are the same ones already used
 * throughout src/core/chart.js and src/core/xauusd_calculate.js.
 */

const NAMED_RESOLUTION_SECONDS = { D: 86400, W: 604800, M: 2592000 };

/** Bar duration in seconds for a TradingView resolution code ('5', '60', 'D', ...). */
export function timeframeSeconds(timeframe) {
  const s = String(timeframe);
  if (NAMED_RESOLUTION_SECONDS[s] != null) return NAMED_RESOLUTION_SECONDS[s];
  const mins = parseInt(s, 10);
  return Number.isFinite(mins) && mins > 0 ? mins * 60 : null;
}

// A forming bar is only "fresh" if a new bar for this resolution could
// plausibly have started this recently: its own start time must not be
// older than one full bar duration, plus one bar of tolerance for feed/
// clock skew. A cached snapshot left over from a resolution switch that
// never really completed has a forming-bar time stuck in the past
// relative to "now" -- this rejects that regardless of bar count/shape.
const FRESHNESS_TOLERANCE_BARS = 1;

export function isBarFresh({ barTime, timeframe, nowSec }) {
  const secs = timeframeSeconds(timeframe);
  if (!secs || !Number.isFinite(barTime) || !Number.isFinite(nowSec)) return false;
  return nowSec - barTime <= secs * (FRESHNESS_TOLERANCE_BARS + 1);
}
