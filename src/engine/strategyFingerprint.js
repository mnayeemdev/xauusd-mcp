/**
 * PRODUCTION STRATEGY FINGERPRINT -- deterministic mutation detector. PURE.
 *
 * The XAUUSD production strategy is FROZEN (weekend pre-market freeze,
 * 2026-09-26). This module hashes the exact set of source files that can
 * change a production decision (market data -> engine -> signal -> safety
 * gates -> executor -> position management -> exit) plus the resolved REAL
 * execution configuration, so that any future edit to that surface is caught
 * by tests/strategy_fingerprint.test.js against the frozen registry in
 * src/engine/strategy.frozen.json.
 *
 * A fingerprint mismatch is NOT an error in itself: it means the strategy
 * surface changed and the change must be deliberate, reviewed and re-frozen
 * (`node src/engine/strategyFingerprint.js --freeze`). It is never proof of
 * profitability and it grants no trading authority.
 *
 * Presentation, visualisation, notifier, CLI routing, chart transport and the
 * research, Stage 11C observer and Stage 12 validator modules are deliberately OUTSIDE the surface: they can
 * not change a BUY/SELL/WAIT decision or an order.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { INTRADAY_PARAMS } from './intraday/params.js';
import { SHOCK_PARAMS } from './marketShock.js';
import { NEWS_RISK_PARAMS } from './newsRisk.js';
import { ENGINE_PROFILES } from './engineProfile.js';
import { resolveRealExecutorConfig } from './mt5RealPolicy.js';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const FROZEN_PATH = fileURLToPath(new URL('./strategy.frozen.json', import.meta.url));
export const PRODUCTION_ENGINE_PROFILE = ENGINE_PROFILES.INTRADAY_5M;

/** Every file whose content can alter a production decision or order. Sorted, repo-relative. */
export const STRATEGY_SURFACE_FILES = Object.freeze([
  'mt5/mt5_bridge_real.py',
  'src/core/master_contract.js',
  'src/core/xauusd_analyze_market.js',
  'src/core/xauusd_calculate.js',
  'src/engine/anticipation.js',
  'src/engine/anticipationStore.js',
  'src/engine/breakout.js',
  'src/engine/candlesticks.js',
  'src/engine/cdpLock.js',
  'src/engine/confluence.js',
  'src/engine/correction.js',
  'src/engine/engineProfile.js',
  'src/engine/freshData.js',
  'src/engine/htf.js',
  'src/engine/intraday/bias.js',
  'src/engine/intraday/models5m.js',
  'src/engine/intraday/params.js',
  'src/engine/intraday/pipeline5m.js',
  'src/engine/intraday/risk5m.js',
  'src/engine/levels.js',
  'src/engine/liquidity.js',
  'src/engine/marketEvidence.js',
  'src/engine/marketShock.js',
  'src/engine/math.js',
  'src/engine/models.js',
  'src/engine/mt5Bridge.js',
  'src/engine/mt5CapitalPolicy.js',
  'src/engine/mt5Executor.js',
  'src/engine/mt5Policy.js',
  'src/engine/mt5RealPolicy.js',
  'src/engine/mt5RealScaling.js',
  'src/engine/mt5TradeManagement.js',
  'src/engine/mtf.js',
  'src/engine/newsCalendar.js',
  'src/engine/newsMonitor.js',
  'src/engine/newsRisk.js',
  'src/engine/opportunityPlanner.js',
  'src/engine/patterns.js',
  'src/engine/pipeline.js',
  'src/engine/protectionGuards.js',
  'src/engine/quality.js',
  'src/engine/regime.js',
  'src/engine/risk.js',
  'src/engine/session.js',
  'src/engine/signalStore.js',
  'src/engine/strategies/eligibility.js',
  'src/engine/structure.js',
  'src/engine/volatility.js',
  'src/engine/watcher.js',
  'src/engine/watcherState.js',
]);

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const normalize = (s) => s.replace(/\r\n/g, '\n');

/** Canonical JSON: sorted keys, functions/undefined dropped, so the hash is order-independent. */
export function canonicalJson(value) {
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return typeof v === 'function' || v === undefined ? null : v;
    if (Array.isArray(v)) return v.map(walk);
    const out = {};
    for (const k of Object.keys(v).sort()) { if (typeof v[k] === 'function' || v[k] === undefined) continue; out[k] = walk(v[k]); }
    return out;
  };
  return JSON.stringify(walk(value));
}

export function hashFile(relPath, root = REPO_ROOT) {
  const p = resolve(root, relPath);
  if (!existsSync(p)) return { path: relPath, sha256: null, missing: true };
  return { path: relPath, sha256: sha256(normalize(readFileSync(p, 'utf8'))) };
}

/** Resolved REAL configuration with an EMPTY environment = the code defaults (env-independent). */
export function defaultConfigSnapshot() {
  const cfg = resolveRealExecutorConfig({});
  return { engine_profile: PRODUCTION_ENGINE_PROFILE, real_config: cfg, intraday_params: INTRADAY_PARAMS, shock_params: SHOCK_PARAMS, news_risk_params: NEWS_RISK_PARAMS };
}

/**
 * Compute the fingerprint. `env` (optional) additionally yields the RUNTIME
 * configuration fingerprint (env overrides applied), which is reported, never
 * pinned: the frozen registry pins code + code defaults only.
 */
export function computeStrategyFingerprint({ root = REPO_ROOT, env = null } = {}) {
  const files = STRATEGY_SURFACE_FILES.map((f) => hashFile(f, root));
  const code_fingerprint = sha256(files.map((f) => `${f.path}\n${f.sha256 ?? 'MISSING'}\n`).join(''));
  const defaults = defaultConfigSnapshot();
  const config_fingerprint = sha256(canonicalJson(defaults));
  const out = { schema_version: 'strategy-fingerprint-1.0', engine_profile: PRODUCTION_ENGINE_PROFILE, file_count: files.length, missing_files: files.filter((f) => f.missing).map((f) => f.path), code_fingerprint, config_fingerprint, strategy_fingerprint: sha256(`${code_fingerprint}\n${config_fingerprint}\n`), files };
  if (env) {
    try { out.runtime_config_fingerprint = sha256(canonicalJson({ ...defaults, real_config: resolveRealExecutorConfig(env) })); out.runtime_config_matches_defaults = out.runtime_config_fingerprint === config_fingerprint; } catch (err) { out.runtime_config_error = err.message; }
  }
  return out;
}

export function loadFrozen(path = FROZEN_PATH) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Compare the live tree with the frozen registry. Returns { ok, changed, missing, added, frozen, current }. */
export function verifyStrategyFingerprint({ root = REPO_ROOT, frozenPath = FROZEN_PATH } = {}) {
  const frozen = loadFrozen(frozenPath);
  const current = computeStrategyFingerprint({ root });
  if (!frozen) return { ok: false, reason: 'FROZEN_REGISTRY_MISSING', frozen: null, current };
  const fmap = new Map(frozen.files.map((f) => [f.path, f.sha256]));
  const changed = current.files.filter((f) => fmap.has(f.path) && fmap.get(f.path) !== f.sha256).map((f) => f.path);
  const added = current.files.filter((f) => !fmap.has(f.path)).map((f) => f.path);
  const removed = [...fmap.keys()].filter((p) => !current.files.some((f) => f.path === p));
  const configChanged = frozen.config_fingerprint !== current.config_fingerprint;
  const ok = changed.length === 0 && added.length === 0 && removed.length === 0 && !configChanged && frozen.strategy_fingerprint === current.strategy_fingerprint;
  return { ok, reason: ok ? null : 'STRATEGY_SURFACE_CHANGED', changed, added, removed, config_changed: configChanged, frozen: { version: frozen.version, frozen_at: frozen.frozen_at, strategy_fingerprint: frozen.strategy_fingerprint, code_fingerprint: frozen.code_fingerprint, config_fingerprint: frozen.config_fingerprint }, current: { strategy_fingerprint: current.strategy_fingerprint, code_fingerprint: current.code_fingerprint, config_fingerprint: current.config_fingerprint } };
}

/** Write a new frozen registry (deliberate re-freeze only; atomic write). */
export function freezeStrategyFingerprint({ version, commit = null, note = null, root = REPO_ROOT, frozenPath = FROZEN_PATH, now = new Date() } = {}) {
  if (!version) throw new Error('freeze requires a version label');
  const fp = computeStrategyFingerprint({ root });
  if (fp.missing_files.length) throw new Error(`cannot freeze: missing files ${fp.missing_files.join(', ')}`);
  const payload = { schema_version: fp.schema_version, version, frozen_at: now.toISOString(), commit, note, engine_profile: fp.engine_profile, strategy_fingerprint: fp.strategy_fingerprint, code_fingerprint: fp.code_fingerprint, config_fingerprint: fp.config_fingerprint, file_count: fp.file_count, files: fp.files };
  const tmp = `${frozenPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 1) + '\n');
  renameSync(tmp, frozenPath);
  return payload;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (args.includes('--freeze')) {
    const out = freezeStrategyFingerprint({ version: arg('--version') ?? `PROD_STRATEGY_${new Date().toISOString().slice(0, 10)}`, commit: arg('--commit'), note: arg('--note') });
    console.log(JSON.stringify({ frozen: true, version: out.version, strategy_fingerprint: out.strategy_fingerprint, files: out.file_count }, null, 2));
  } else if (args.includes('--verify')) {
    const v = verifyStrategyFingerprint();
    console.log(JSON.stringify(v, null, 2));
    process.exitCode = v.ok ? 0 : 2;
  } else {
    const fp = computeStrategyFingerprint({ env: process.env });
    console.log(JSON.stringify(args.includes('--files') ? fp : { ...fp, files: undefined }, null, 2));
  }
}
