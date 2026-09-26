/**
 * STAGE 12 market-data feed for the DEMO validator: a separate READ-ONLY python reader process
 * (mt5/mt5_feed_reader.py) that only reads rates/ticks, plus the dependency adapters that let the UNCHANGED
 * production engine (calculateEntry / analyzeMarket via their injectable deps) and the UNCHANGED watcher
 * cycle run on Exness XAUUSDm bars instead of the TradingView chart. No chart is touched, no lock is shared
 * with the production watcher, and no trading command exists in this protocol.
 */
import { isBarFresh } from '../engine/freshData.js';
import { createFeedReader as _createFeedReader, FEED_COMMANDS, FEED_SYMBOL, DEFAULT_FEED_SCRIPT } from '../engine/mt5FeedReader.js';

export { FEED_COMMANDS, FEED_SYMBOL, DEFAULT_FEED_SCRIPT };
export const ENGINE_TIMEFRAMES = Object.freeze(['5', '15', '30', '60', '120', '240', '480', 'D', 'W', 'M']);

/** The shared READ-ONLY reader (src/engine/mt5FeedReader.js), tagged for the validator log. */
export function createFeedReader(opts = {}) { return _createFeedReader({ tag: 'demo-feed', ...opts }); }

/**
 * Engine/watcher dependency adapters over the feed. `sweep()` fetches all ten engine timeframes once per
 * cycle (500 bars each, the same OHLCV_REQUEST_COUNT the chart path uses); the adapters then serve the
 * cached bars to calculateEntry()'s setTimeframe()/getOhlcv() sweep, so one cycle sees one consistent
 * snapshot. Timestamps are the broker's UTC bar-open times, the same convention the engine expects.
 */
export function createEngineFeedDeps({ feed, symbol = FEED_SYMBOL, storePath, cdpLockPath = null, now = () => new Date(), env = process.env }) {
  // The engine's symbol guard approves OANDA:XAUUSD-style aliases by default; the broker symbol XAUUSDm is added as an
  // explicit alias for THIS process only (src/xauusd_guard.js reads XAUUSD_ALLOWED_SYMBOLS from the injected env).
  const engineEnv = { ...env, XAUUSD_ALLOWED_SYMBOLS: [env.XAUUSD_ALLOWED_SYMBOLS, symbol].filter(Boolean).join(',') };
  let byTf = {}; let current = '5';
  async function sweep() { const next = {}; for (const tf of ENGINE_TIMEFRAMES) { const r = await feed.rates(symbol, tf, 500); if (!r.ok) throw new Error(`FEED_RATES_FAILED:${tf}:${r.error}`); next[tf] = r.bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })); } byTf = next; return next; }
  const deps = {
    getState: async () => ({ success: true, symbol, resolution: current }),
    setTimeframe: async ({ timeframe }) => { current = String(timeframe); return { success: true }; },
    getOhlcv: async ({ count } = {}) => { const bars = byTf[current]; if (!bars) throw new Error(`FEED_NO_BARS_FOR_TF:${current}`); return { bars: count ? bars.slice(-count) : bars }; },
    withCdpLock: (_path, fn) => fn(), cdpLockPath: cdpLockPath ?? 'unused-by-demo-feed', storePath, env: engineEnv, now,
    // The engine's optional Pine reference comparison reads the TradingView chart by default (CDP). The validator
    // must never touch the chart, so the reference is reported as not found; the decision path is unchanged
    // (the comparison is observability, never a gate that changes BUY/SELL geometry).
    getMasterState: async () => ({ status: 'NOT_FOUND', reason: 'DEMO_VALIDATOR_NO_CHART_ACCESS' }),
  };
  /** Watcher-style 5m peek: latest CONFIRMED 5m bar from a fresh read, or an error when the feed is stale (market closed / feed failure). */
  async function peekLatest5mCandle() {
    const r = await feed.rates(symbol, '5', 3); if (!r.ok || !r.bars || r.bars.length < 2) { const e = new Error(`could not obtain 5m bars from the feed: ${r.error ?? 'insufficient bars'}`); e.code = 'STALE_5M_DATA'; throw e; }
    const forming = r.bars.at(-1), confirmed = r.bars.at(-2); const nowSec = now().getTime() / 1000;
    if (forming.time - confirmed.time !== 300) { const e = new Error(`bar spacing ${forming.time - confirmed.time}s is not a 5m series`); e.code = 'STALE_5M_DATA'; throw e; }
    if (!isBarFresh({ barTime: forming.time, timeframe: '5', nowSec })) { const e = new Error(`stale 5m data: forming bar age ~${Math.round(nowSec - forming.time)}s exceeds freshness tolerance -- refusing to use it for new-candle detection`); e.code = 'STALE_5M_DATA'; throw e; }
    return { time: confirmed.time };
  }
  async function isReachable() { try { const p = await feed.ping(); return !!p.ok && p.connected !== false; } catch { return false; } }
  return { deps, sweep, peekLatest5mCandle, isReachable, bars: () => byTf };
}
