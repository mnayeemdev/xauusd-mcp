/**
 * STAGE 12 market-data feed for the DEMO validator: a separate READ-ONLY python reader process
 * (mt5/mt5_feed_reader.py) that only reads rates/ticks, plus the dependency adapters that let the UNCHANGED
 * production engine (calculateEntry / analyzeMarket via their injectable deps) and the UNCHANGED watcher
 * cycle run on Exness XAUUSDm bars instead of the TradingView chart. No chart is touched, no lock is shared
 * with the production watcher, and no trading command exists in this protocol.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { isBarFresh } from '../engine/freshData.js';

export const DEFAULT_FEED_SCRIPT = fileURLToPath(new URL('../../mt5/mt5_feed_reader.py', import.meta.url));
export const FEED_COMMANDS = Object.freeze(['rates', 'tick', 'select', 'ping', 'quit']);
export const ENGINE_TIMEFRAMES = Object.freeze(['5', '15', '30', '60', '120', '240', '480', 'D', 'W', 'M']);
export const FEED_SYMBOL = 'XAUUSDm';

export function createFeedReader({ python = 'python', script = DEFAULT_FEED_SCRIPT, env = { ...process.env, OPENBLAS_NUM_THREADS: '1' }, timeoutMs = 20_000, log = () => {} } = {}) {
  let child = null, rl = null, hello = null, seq = 0; const pending = new Map();
  async function start() {
    child = spawn(python, ['-u', script], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.on('data', (d) => log(`[demo-feed] ${String(d).trim()}`));
    rl = createInterface({ input: child.stdout });
    hello = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('FEED_HELLO_TIMEOUT')), timeoutMs * 3); rl.once('line', (line) => { clearTimeout(t); try { const h = JSON.parse(line); h.ok ? res(h) : rej(new Error(h.error)); } catch (e) { rej(e); } }); });
    rl.on('line', (line) => { let m; try { m = JSON.parse(line); } catch { return; } const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.t); p.res(m); } });
    child.on('exit', (code) => { log(`[demo-feed] exited ${code}`); for (const p of pending.values()) { clearTimeout(p.t); p.rej(new Error('FEED_EXITED')); } pending.clear(); child = null; });
    return hello;
  }
  function request(cmd, params = {}) {
    if (!FEED_COMMANDS.includes(cmd)) return Promise.reject(new Error(`FEED_CMD_NOT_ALLOWED:${cmd}`)); if (!child) return Promise.reject(new Error('FEED_NOT_RUNNING'));
    const id = ++seq; return new Promise((res, rej) => { const t = setTimeout(() => { pending.delete(id); rej(new Error(`FEED_TIMEOUT:${cmd}`)); }, timeoutMs); pending.set(id, { res, rej, t }); child.stdin.write(JSON.stringify({ id, cmd, ...params }) + '\n'); });
  }
  async function stop() { if (!child) return; try { await request('quit'); } catch { /* ignore */ } try { child.kill(); } catch { /* ignore */ } child = null; }
  return { start, stop, request, hello: () => hello, alive: () => !!child, rates: (symbol, tf, count) => request('rates', { symbol, tf, count }), tick: (symbol) => request('tick', { symbol }), ping: () => request('ping') };
}

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
