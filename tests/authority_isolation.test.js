/**
 * AUTHORITY MAP + BROKER COMMAND SURFACE + REAL/DEMO/SHADOW ISOLATION --
 * machine-checkable regression (docs/XAUUSD_AUTHORITY_MAP.md,
 * docs/XAUUSD_BROKER_COMMAND_SURFACE.md). Static: reads source only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRealExecutorConfig, REAL_DEFAULTS, REAL_MAGIC, REAL_FIXED_LOT } from '../src/engine/mt5RealPolicy.js';
import { DEMO_PATHS } from '../src/demo/validator.js';
import { REAL_STATE_PATH, REAL_LOG_PATH, REAL_KILL_SWITCH_PATH } from '../src/engine/mt5RealPolicy.js';
import { DEFAULT_MT5_STATE_PATH, DEFAULT_MT5_LOG_PATH, DEFAULT_KILL_SWITCH_PATH } from '../src/engine/mt5Executor.js';
import { DEFAULT_STATE_PATH as WATCHER_STATE, DEFAULT_LOCK_PATH as WATCHER_LOCK } from '../src/engine/watcherState.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const rel = (p) => relative(ROOT, p).split('\\').join('/');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Transitive static import closure (static + dynamic import() of relative paths). */
function closure(entry) {
  const seen = new Map();
  const walk = (file, from) => {
    const r = rel(file); if (seen.has(r)) return; seen.set(r, from);
    let s; try { s = readFileSync(file, 'utf8'); } catch { return; }
    for (const m of s.matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g)) walk(resolve(dirname(file), m[1]), r);
    for (const m of s.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) walk(resolve(dirname(file), m[1]), r);
  };
  walk(resolve(ROOT, entry), 'ENTRY');
  return seen;
}
const BROKER_MODULES = ['src/engine/mt5Executor.js', 'src/engine/mt5Bridge.js'];
const reaches = (entry, targets = BROKER_MODULES) => { const c = closure(entry); return targets.filter((t) => c.has(t)); };
const walkFiles = (dir, pred, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (f === 'node_modules' || f === 'state' || f.startsWith('.')) continue; if (statSync(p).isDirectory()) walkFiles(p, pred, out); else if (pred(p)) out.push(p); } return out; };

describe('AUTHORITY MAP: exactly one production trading route', () => {
  it('Stage 11C shadow modules never reach the executor or the bridge (transitively)', () => {
    for (const e of ['src/shadow/observer.js', 'src/shadow/report.js', 'src/shadow/core.js', 'src/shadow/production.js', 'src/shadow/mt5Reader.js']) assert.deepEqual(reaches(e), [], `${e} reaches ${reaches(e)}`);
  });
  it('the MCP server, its tools and src/core never reach the executor or the bridge (transitively)', () => {
    const entries = ['src/server.js', ...readdirSync(join(ROOT, 'src/tools')).map((f) => `src/tools/${f}`), ...readdirSync(join(ROOT, 'src/core')).filter((f) => f.endsWith('.js')).map((f) => `src/core/${f}`)];
    for (const e of entries) assert.deepEqual(reaches(e), [], `${e} reaches ${reaches(e)}`);
  });
  it('research/validation scripts never reach the executor or the bridge (transitively)', () => {
    const scripts = walkFiles(join(ROOT, 'validation'), (p) => /\.(mjs|js)$/.test(p)).map(rel);
    assert.ok(scripts.length > 0);
    for (const e of scripts) assert.deepEqual(reaches(e), [], `${e} reaches ${reaches(e)}`);
  });
  it('the Stage 12 DEMO validator reaches the executor ONLY through its own entry, and never the REAL bridge script', () => {
    const c = closure('src/demo/validator.js');
    assert.ok(c.has('src/engine/mt5Executor.js'));
    for (const f of ['identityGuard.js', 'config.js', 'evidence.js', 'feed.js', 'validator.js', 'report.js']) assert.ok(!/mt5_bridge_real|460149329|Exness-MT5Real51/.test(src(`src/demo/${f}`)), `${f} references REAL`);
  });
  it('mutating bridge commands are issued ONLY by src/engine/mt5Executor.js (and forwarded by the DEMO identity guard proxy)', () => {
    const files = walkFiles(join(ROOT, 'src'), (p) => p.endsWith('.js')).map(rel);
    const offenders = files.filter((f) => f !== 'src/engine/mt5Executor.js' && /\.request\(\s*['"](open|close|modify)['"]/.test(src(f)));
    assert.deepEqual(offenders, [], `mutating bridge commands outside the executor: ${offenders}`);
    assert.ok((src('src/engine/mt5Executor.js').match(/\.request\(\s*['"]open['"]/g) ?? []).length === 1, 'exactly one order-open call site');
    assert.ok((src('src/engine/mt5Executor.js').match(/\.request\(\s*['"]close['"]/g) ?? []).length === 1, 'exactly one order-close call site (closeNow)');
  });
  it('order_send exists ONLY in the two trading bridges; readers/feeds have no trading API at all', () => {
    const py = readdirSync(join(ROOT, 'mt5')).filter((f) => f.endsWith('.py'));
    const withSend = py.filter((f) => /order_send|order_check|TRADE_ACTION/.test(src(`mt5/${f}`)));
    assert.deepEqual(withSend.sort(), ['mt5_bridge.py', 'mt5_bridge_real.py']);
    for (const f of ['mt5_feed_reader.py', 'mt5_shadow_reader.py']) assert.ok(!/order_send|order_check|TRADE_ACTION|positions_get|mt5\.login\(/.test(src(`mt5/${f}`)), `${f} has trading/login calls`);
    for (const f of py) assert.ok(!/mt5\.login\(|password\s*[=:]|passwd/i.test(src(`mt5/${f}`)), `${f} handles credentials`);
  });
  it('the python bridges enforce magic allowlist, fail-closed None handling, ambiguous retcodes, post-send exception and stop-removal refusal', () => {
    for (const f of ['mt5/mt5_bridge_real.py', 'mt5/mt5_bridge.py']) {
      const s = src(f);
      for (const needle of ['ALLOWED_MAGICS', 'def require_magic', 'SUCCESS_RETCODES = {10009}', 'AMBIGUOUS_RETCODES = {10008, 10012}', 'POSITIONS_UNAVAILABLE', 'HISTORY_UNAVAILABLE', 'ORDER_STATE_AMBIGUOUS', 'CLOSE_STATE_AMBIGUOUS', 'POST_SEND_EXCEPTION', 'MODIFY_INVALID_SL', 'MODIFY_NOOP', 'def _reinitialize']) assert.ok(s.includes(needle), `${f} lacks ${needle}`);
      assert.ok(!/if pos is None:\s*\n\s*pos = \(\)/.test(s) && !/if deals is None:\s*\n\s*deals = \(\)/.test(s), `${f} still maps None to empty`);
    }
    assert.ok(src('mt5/mt5_bridge_real.py').includes('ALLOWED_MAGICS = {88052001}'));
    assert.ok(src('mt5/mt5_bridge_real.py').includes('REQUIRED_EXACT_VOLUME = 0.01'));
  });
  it('news modules have ZERO directional authority (no BUY/SELL/side output) and capital docs have no code hooks', () => {
    for (const f of ['src/engine/newsRisk.js', 'src/engine/newsCalendar.js', 'src/engine/newsMonitor.js']) {
      const code = src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.ok(!/['"](BUY|SELL)['"]/.test(code), `${f} emits a direction literal`);
      assert.ok(!/\bside\s*:/.test(code) && !/\bdirection\s*:/.test(code), `${f} emits side/direction`);
    }
    const hooks = walkFiles(join(ROOT, 'src'), (p) => p.endsWith('.js')).filter((p) => /CAPITAL_GROWTH|CAPITAL_SCALING_READINESS/.test(readFileSync(p, 'utf8')));
    assert.deepEqual(hooks, []);
  });
  it('REAL lot/scaling/identity authority is code-locked: 0.01 exact, no sizing hook, env cannot move it', () => {
    const cfg = resolveRealExecutorConfig({});
    assert.equal(cfg.exactLot, REAL_FIXED_LOT); assert.equal(cfg.lotSize, 0.01); assert.equal(cfg.maxLotSize, 0.01); assert.equal(cfg.sizingMode, 'fixed_user_lot'); assert.equal(cfg.computeSizing, undefined); assert.equal(cfg.magic, REAL_MAGIC);
    assert.equal(cfg.maxConsecutiveLosses, 2); assert.equal(cfg.minEffectiveRr, 1.7); assert.equal(cfg.thesisExit, true); assert.equal(cfg.dailyLossLimitUsd, null); assert.equal(cfg.newsProtection, true); assert.equal(cfg.newsRiskParams.normalizationMaxExtensionMin, 0);
    for (const env of [{ XAUUSD_MT5_REAL_LOT_SIZE: '0.02' }, { XAUUSD_MT5_REAL_MAX_LOT_SIZE: '0.05' }, { XAUUSD_MT5_REAL_MAGIC: '1' }, { XAUUSD_MT5_REAL_LOGIN: '1' }, { XAUUSD_MT5_REAL_SERVER: 'Exness-MT5Trial11' }, { XAUUSD_NEWS_PROTECTION: 'off' }, { XAUUSD_MT5_REAL_MAX_CONSECUTIVE_LOSSES: '0' }]) assert.throws(() => resolveRealExecutorConfig(env), `env ${JSON.stringify(env)} must be rejected`);
    assert.equal(Object.isFrozen(REAL_DEFAULTS), true);
    assert.ok(!('computeSizing' in REAL_DEFAULTS));
  });
  it('the dormant scaling module is reachable only through the reporting-only capital snapshot, never through a config hook', () => {
    assert.ok(!/from ['"]\.\/mt5RealScaling\.js['"]|computeDynamicSizing\(/.test(src('src/engine/mt5RealPolicy.js')), 'REAL policy must not import the scaling module');
    assert.ok(/enabled_scaling: false/.test(src('src/engine/mt5CapitalPolicy.js')));
    const importers = walkFiles(join(ROOT, 'src'), (p) => p.endsWith('.js')).map(rel).filter((f) => /from ['"][^'"]*mt5RealScaling\.js['"]/.test(src(f)) && f !== 'src/engine/mt5RealScaling.js');
    assert.deepEqual(importers, ['src/engine/mt5CapitalPolicy.js']);
  });
});

describe('ISOLATION: REAL / legacy DEMO / Stage 12 DEMO / SHADOW never share mutable state', () => {
  it('state, log, kill switch, lock and signal store paths are pairwise distinct', () => {
    const real = [REAL_STATE_PATH, REAL_LOG_PATH, REAL_KILL_SWITCH_PATH];
    const demoLegacy = [DEFAULT_MT5_STATE_PATH, DEFAULT_MT5_LOG_PATH, DEFAULT_KILL_SWITCH_PATH];
    const demo12 = [DEMO_PATHS.executorState, DEMO_PATHS.executorLog, DEMO_PATHS.killSwitch, DEMO_PATHS.lock, DEMO_PATHS.watcherState, DEMO_PATHS.watcherLock, DEMO_PATHS.signalStore];
    const all = [...real, ...demoLegacy, ...demo12, WATCHER_STATE, WATCHER_LOCK].map((p) => p.split('\\').join('/').toLowerCase());
    assert.equal(new Set(all).size, all.length, `duplicate runtime path: ${all}`);
    for (const p of demo12) assert.ok(/state[\\/]demo_forward[\\/]/.test(p), `${p} outside state/demo_forward`);
    for (const p of real) assert.ok(/xauusd_mt5_real_/.test(p));
    assert.ok(!/demo_forward|shadow/.test(REAL_STATE_PATH));
  });
  it('the shadow observer only READS production artefacts and writes under state/shadow', () => {
    const s = src('src/shadow/observer.js') + src('src/shadow/store.js') + src('src/shadow/production.js');
    assert.ok(!/xauusd_mt5_real_executor_state|writeFileSync\([^)]*validation\//.test(s));
    assert.ok(/state\/shadow|SHADOW_DIR/.test(s));
  });
  it('magic numbers: REAL 88052001, legacy DEMO 88051501, Stage 12 DEMO 88051512 -- all distinct', () => {
    const demo12 = Number(src('src/demo/config.js').match(/DEMO_MAGIC_STAGE12 = (\d+)/)[1]);
    const legacy = Number(src('src/engine/mt5Policy.js').match(/magic:\s*(\d+)/)[1]);
    assert.equal(new Set([REAL_MAGIC, legacy, demo12]).size, 3);
    assert.equal(REAL_MAGIC, 88052001); assert.equal(demo12, 88051512); assert.equal(legacy, 88051501);
  });
});

describe('CLI process-start safety (static)', () => {
  const cli = src('src/cli/commands/xauusd.js');
  it('the watcher lock is acquired BEFORE any broker executor is built/started, and released on start failure', () => {
    const lockAt = cli.indexOf('const lock = acquireLock(WATCHER_LOCK_PATH)');
    const startAt = cli.indexOf('await executor.start()');
    assert.ok(lockAt > 0 && startAt > lockAt, 'acquireLock must precede executor.start()');
    assert.ok(cli.includes('releaseLock(WATCHER_LOCK_PATH);\n          throw err;'), 'lock released when executor start throws');
  });
  it('status/close commands refuse to start a second executor while the watcher is live', () => {
    for (const c of ['mt5-status', 'mt5-real-status', 'mt5-real-close', 'mt5-close']) assert.ok(cli.includes(`refuseIfWatcherLive('${c}')`), `${c} lacks the guard`);
  });
  it('--mt5-real requires the intraday_5m engine profile; on-demand reads use the ephemeral signal store', () => {
    assert.ok(/opts\['mt5-real'\] && engineProfile !== ENGINE_PROFILES\.INTRADAY_5M/.test(cli));
    assert.ok((cli.match(/EPHEMERAL_STORE_DEPS/g) ?? []).length >= 3);
    assert.ok(/loadStore: \(\) => \(\{ signals: \[\] \}\)/.test(src('src/tools/xauusd.js')), 'MCP calculate tool must not persist signals');
  });
  it('the DEMO validator --check refuses to run against a live validator', () => {
    assert.ok(/check && existsSync\(DEMO_PATHS\.lock\)/.test(src('src/demo/validator.js')));
  });
});
