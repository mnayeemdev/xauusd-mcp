/**
 * Node-side client for mt5/mt5_bridge.py (JSON lines over stdio).
 *
 * Responsibilities: spawn the Python sidecar, correlate requests and
 * responses by id, enforce per-request timeouts, reject every in-flight
 * request if the sidecar dies, and lazily respawn it on the next request.
 * It carries NO trading policy -- see src/engine/mt5Policy.js and
 * src/engine/mt5Executor.js. Every method is injectable for tests
 * (spawnImpl), and no test ever spawns a real Python process.
 */
import { spawn as _spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const DEFAULT_BRIDGE_SCRIPT = fileURLToPath(new URL('../../mt5/mt5_bridge.py', import.meta.url));
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
export const DEFAULT_TRADE_TIMEOUT_MS = 45_000;

/** Resolves the Python launcher: env override, else `py -3` on Windows, else python3. */
export function resolvePythonCommand(env = process.env, platform = process.platform) {
  const override = env.XAUUSD_MT5_PYTHON;
  if (override && override.trim()) {
    const parts = override.trim().split(/\s+/);
    return { cmd: parts[0], args: parts.slice(1) };
  }
  return platform === 'win32' ? { cmd: 'py', args: ['-3'] } : { cmd: 'python3', args: [] };
}

export class Mt5BridgeError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

export class Mt5Bridge {
  constructor({ scriptPath = DEFAULT_BRIDGE_SCRIPT, python, env = process.env, spawnImpl = _spawn, log = () => {}, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, tradeTimeoutMs = DEFAULT_TRADE_TIMEOUT_MS } = {}) {
    this.scriptPath = scriptPath;
    this.python = python ?? resolvePythonCommand(env);
    this.env = env;
    this.spawnImpl = spawnImpl;
    this.log = log;
    this.requestTimeoutMs = requestTimeoutMs;
    this.tradeTimeoutMs = tradeTimeoutMs;
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.ready = null;
    this.restarts = 0;
    this.stopped = false;
  }

  get alive() { return !!this.child && this.child.exitCode === null && !this.child.killed; }

  start() {
    if (this.alive) return this.ready;
    if (this.stopped) throw new Mt5BridgeError('BRIDGE_STOPPED', 'bridge was stopped');
    const child = this.spawnImpl(this.python.cmd, [...this.python.args, '-u', this.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...this.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1', PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
    });
    this.child = child;
    this.restarts += 1;
    let resolveReady, rejectReady;
    this.ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
    const readyTimer = setTimeout(() => rejectReady(new Mt5BridgeError('BRIDGE_START_TIMEOUT', 'python bridge did not report ready in time')), this.requestTimeoutMs);
    this.ready.catch(() => {});

    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { this.log(`[mt5-bridge] non-JSON line ignored: ${line.slice(0, 200)}`); return; }
      if (msg.event === 'ready') { clearTimeout(readyTimer); resolveReady(msg); return; }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Mt5BridgeError(msg.error?.code ?? 'BRIDGE_ERROR', msg.error?.message ?? 'unknown bridge error', msg.error ?? {}));
    });
    if (child.stderr) {
      const el = createInterface({ input: child.stderr });
      el.on('line', (line) => this.log(`[mt5-bridge stderr] ${line}`));
    }
    child.on('error', (err) => {
      clearTimeout(readyTimer);
      rejectReady(new Mt5BridgeError('BRIDGE_SPAWN_FAILED', `could not start python bridge (${this.python.cmd}): ${err.message}`));
      this._failAll(new Mt5BridgeError('BRIDGE_SPAWN_FAILED', err.message));
    });
    child.on('exit', (code, signal) => {
      clearTimeout(readyTimer);
      rejectReady(new Mt5BridgeError('BRIDGE_EXITED', `python bridge exited (code ${code}, signal ${signal})`));
      this._failAll(new Mt5BridgeError('BRIDGE_DOWN', `python bridge exited (code ${code}, signal ${signal}) while requests were in flight`));
      this.child = null;
    });
    return this.ready;
  }

  _failAll(err) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  /**
   * Sends one command. Trade-changing commands (open/close) get the
   * longer timeout and are NEVER auto-retried by this layer -- a timeout
   * on `open` is ambiguous (the order may have filled) and must be
   * reconciled against broker history by the executor, never re-sent.
   */
  async request(cmd, params = {}, { timeoutMs } = {}) {
    if (this.stopped) throw new Mt5BridgeError('BRIDGE_STOPPED', 'bridge was stopped');
    if (!this.alive) await this.start();
    else await this.ready;
    const id = this.nextId++;
    const isTrade = cmd === 'open' || cmd === 'close';
    const ms = timeoutMs ?? (isTrade ? this.tradeTimeoutMs : this.requestTimeoutMs);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Mt5BridgeError(isTrade ? 'TRADE_REQUEST_TIMEOUT' : 'BRIDGE_TIMEOUT', `bridge command "${cmd}" timed out after ${ms}ms`));
      }, ms);
      this.pending.set(id, { resolve, reject, timer, cmd });
      try {
        this.child.stdin.write(JSON.stringify({ id, cmd, ...params }) + '\n');
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Mt5BridgeError('BRIDGE_WRITE_FAILED', err.message));
      }
    });
  }

  async stop() {
    this.stopped = true;
    const child = this.child;
    if (!child) return;
    try { child.stdin.write(JSON.stringify({ id: this.nextId++, cmd: 'shutdown' }) + '\n'); } catch { /* best-effort */ }
    await new Promise((resolve) => {
      const t = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } resolve(); }, 3000);
      child.once('exit', () => { clearTimeout(t); resolve(); });
    });
    this.child = null;
  }
}
