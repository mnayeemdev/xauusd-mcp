/**
 * Node client for the READ-ONLY MT5 reader (mt5/mt5_shadow_reader.py). Separate python process, separate
 * terminal session from the REAL bridge; it can request rates, ticks, symbol selection and the read-only market book only.
 * There is no order or position command in the protocol (tests scan both files).
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const DEFAULT_READER_SCRIPT = fileURLToPath(new URL('../../mt5/mt5_shadow_reader.py', import.meta.url));
export const READER_COMMANDS = Object.freeze(['rates', 'tick', 'select', 'ping', 'quit', 'book']); // 'book' = read-only market depth (2026-10-01, DOM measure-only)

export function createMt5Reader({ python = 'python', script = DEFAULT_READER_SCRIPT, env = { ...process.env, OPENBLAS_NUM_THREADS: '1' }, timeoutMs = 20_000, log = () => {} } = {}) {
  let child = null, rl = null, hello = null, seq = 0; const pending = new Map();
  async function start() {
    child = spawn(python, ['-u', script], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.on('data', (d) => log(`[shadow-reader] ${String(d).trim()}`));
    rl = createInterface({ input: child.stdout });
    const helloP = new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('READER_HELLO_TIMEOUT')), timeoutMs * 3); rl.once('line', (line) => { clearTimeout(t); try { const h = JSON.parse(line); if (!h.ok) rej(new Error(h.error)); else res(h); } catch (e) { rej(e); } }); });
    hello = await helloP;
    rl.on('line', (line) => { let msg; try { msg = JSON.parse(line); } catch { return; } const p = pending.get(msg.id); if (p) { pending.delete(msg.id); clearTimeout(p.t); p.res(msg); } });
    child.on('exit', (code) => { log(`[shadow-reader] exited ${code}`); for (const p of pending.values()) { clearTimeout(p.t); p.rej(new Error('READER_EXITED')); } pending.clear(); child = null; });
    return hello;
  }
  function request(cmd, params = {}) {
    if (!READER_COMMANDS.includes(cmd)) return Promise.reject(new Error(`READER_CMD_NOT_ALLOWED:${cmd}`));
    if (!child) return Promise.reject(new Error('READER_NOT_RUNNING'));
    const id = ++seq; return new Promise((res, rej) => { const t = setTimeout(() => { pending.delete(id); rej(new Error(`READER_TIMEOUT:${cmd}`)); }, timeoutMs); pending.set(id, { res, rej, t }); child.stdin.write(JSON.stringify({ id, cmd, ...params }) + '\n'); });
  }
  async function stop() { if (!child) return; try { await request('quit'); } catch { /* ignore */ } try { child.kill(); } catch { /* ignore */ } child = null; }
  return { start, stop, request, hello: () => hello, alive: () => !!child, rates: (symbol, tf, count) => request('rates', { symbol, tf, count }), tick: (symbol) => request('tick', { symbol }), select: (symbol) => request('select', { symbol }), ping: () => request('ping'), book: (symbol) => request('book', { symbol }) };
}
