/**
 * READ-ONLY MT5 market-data feed client (mt5/mt5_feed_reader.py): a separate
 * python reader process that only reads rates/ticks (rates, tick, select,
 * ping, quit). No trading command exists in this protocol (static-tested).
 *
 * Shared by the Stage 12 DEMO validator feed adapter and the read-only
 * pre-market health report (src/ops/premarketHealth.js --live). It never
 * touches a trading bridge, a lock or any executor state.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const DEFAULT_FEED_SCRIPT = fileURLToPath(new URL('../../mt5/mt5_feed_reader.py', import.meta.url));
export const FEED_COMMANDS = Object.freeze(['rates', 'tick', 'select', 'ping', 'quit']);
export const FEED_SYMBOL = 'XAUUSDm';

export function createFeedReader({ python = 'python', script = DEFAULT_FEED_SCRIPT, env = { ...process.env, OPENBLAS_NUM_THREADS: '1' }, timeoutMs = 20_000, log = () => {}, tag = 'feed' } = {}) {
  let child = null, rl = null, hello = null, seq = 0; const pending = new Map();
  async function start() {
    child = spawn(python, ['-u', script], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    child.stderr.on('data', (d) => log(`[${tag}] ${String(d).trim()}`));
    rl = createInterface({ input: child.stdout });
    hello = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('FEED_HELLO_TIMEOUT')), timeoutMs * 3); rl.once('line', (line) => { clearTimeout(t); try { const h = JSON.parse(line); h.ok ? res(h) : rej(new Error(h.error)); } catch (e) { rej(e); } }); });
    rl.on('line', (line) => { let m; try { m = JSON.parse(line); } catch { return; } const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.t); p.res(m); } });
    child.on('exit', (code) => { log(`[${tag}] exited ${code}`); for (const p of pending.values()) { clearTimeout(p.t); p.rej(new Error('FEED_EXITED')); } pending.clear(); child = null; });
    return hello;
  }
  function request(cmd, params = {}) {
    if (!FEED_COMMANDS.includes(cmd)) return Promise.reject(new Error(`FEED_CMD_NOT_ALLOWED:${cmd}`)); if (!child) return Promise.reject(new Error('FEED_NOT_RUNNING'));
    const id = ++seq; return new Promise((res, rej) => { const t = setTimeout(() => { pending.delete(id); rej(new Error(`FEED_TIMEOUT:${cmd}`)); }, timeoutMs); pending.set(id, { res, rej, t }); child.stdin.write(JSON.stringify({ id, cmd, ...params }) + '\n'); });
  }
  async function stop() { if (!child) return; try { await request('quit'); } catch { /* ignore */ } try { child.kill(); } catch { /* ignore */ } child = null; }
  return { start, stop, request, hello: () => hello, alive: () => !!child, rates: (symbol, tf, count) => request('rates', { symbol, tf, count }), tick: (symbol) => request('tick', { symbol }), ping: () => request('ping') };
}
