/**
 * PRODUCTION STRATEGY FREEZE -- the strategy surface must equal the frozen
 * registry (src/engine/strategy.frozen.json). A failure here means the
 * production decision/execution surface changed: review the change and, only
 * if deliberate, re-freeze with `node src/engine/strategyFingerprint.js --freeze`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { STRATEGY_SURFACE_FILES, computeStrategyFingerprint, verifyStrategyFingerprint, freezeStrategyFingerprint, canonicalJson, loadFrozen, FROZEN_PATH, REPO_ROOT, PRODUCTION_ENGINE_PROFILE } from '../src/engine/strategyFingerprint.js';

describe('strategy fingerprint: frozen production surface', () => {
  it('the frozen registry exists and the live tree matches it exactly (code + code-default config)', () => {
    const v = verifyStrategyFingerprint();
    assert.equal(v.ok, true, `STRATEGY SURFACE CHANGED: ${JSON.stringify({ reason: v.reason, changed: v.changed, added: v.added, removed: v.removed, config_changed: v.config_changed })}`);
    assert.equal(v.frozen.strategy_fingerprint, v.current.strategy_fingerprint);
    assert.equal(loadFrozen().engine_profile, 'intraday_5m'); assert.equal(PRODUCTION_ENGINE_PROFILE, 'intraday_5m');
  });
  it('the surface list is sorted, unique, and every file exists', () => {
    assert.deepEqual([...STRATEGY_SURFACE_FILES], [...new Set(STRATEGY_SURFACE_FILES)].sort());
    for (const f of STRATEGY_SURFACE_FILES) assert.ok(existsSync(join(REPO_ROOT, f)), `${f} missing`);
    for (const must of ['src/core/xauusd_calculate.js', 'src/engine/intraday/pipeline5m.js', 'src/engine/mt5Executor.js', 'src/engine/mt5RealPolicy.js', 'src/engine/newsRisk.js', 'src/engine/marketShock.js', 'src/engine/mt5TradeManagement.js', 'src/engine/watcher.js', 'mt5/mt5_bridge_real.py']) assert.ok(STRATEGY_SURFACE_FILES.includes(must), `${must} must be in the surface`);
    for (const never of ['src/engine/notifier.js', 'src/core/presentation.js', 'src/engine/marketVisualization.js', 'src/shadow/observer.js', 'src/demo/validator.js']) assert.ok(!STRATEGY_SURFACE_FILES.includes(never), `${never} is not strategy surface`);
  });
  it('canonicalJson is key-order independent and drops functions', () => {
    assert.equal(canonicalJson({ b: 1, a: { d: [1, 2], c: () => 1 } }), '{"a":{"d":[1,2]},"b":1}');
    assert.equal(canonicalJson({ z: 1, y: 2 }), '{"y":2,"z":1}');
  });
  it('a one-byte change in ANY surface file changes the code fingerprint and is reported by path; a missing file is reported', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fp-'));
    try {
      for (const f of STRATEGY_SURFACE_FILES) { mkdirSync(dirname(join(tmp, f)), { recursive: true }); cpSync(join(REPO_ROOT, f), join(tmp, f)); }
      const frozenPath = join(tmp, 'frozen.json');
      const base = freezeStrategyFingerprint({ version: 'T', root: tmp, frozenPath });
      assert.equal(verifyStrategyFingerprint({ root: tmp, frozenPath }).ok, true);
      const target = 'src/engine/intraday/params.js';
      writeFileSync(join(tmp, target), `${readFileSync(join(tmp, target), 'utf8')}\n// mutated\n`);
      const v = verifyStrategyFingerprint({ root: tmp, frozenPath });
      assert.equal(v.ok, false); assert.deepEqual(v.changed, [target]); assert.notEqual(v.current.code_fingerprint, base.code_fingerprint);
      rmSync(join(tmp, 'src/engine/mt5TradeManagement.js'));
      const fp = computeStrategyFingerprint({ root: tmp });
      assert.deepEqual(fp.missing_files, ['src/engine/mt5TradeManagement.js']);
      assert.throws(() => freezeStrategyFingerprint({ version: 'T2', root: tmp, frozenPath }), /missing files/);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
  it('the runtime config fingerprint equals the frozen defaults with an empty env and differs when env overrides a tunable', () => {
    const a = computeStrategyFingerprint({ env: {} }); const b = computeStrategyFingerprint({ env: { XAUUSD_NEWS_TIER_B_COOLDOWN_MIN: '60' } });
    assert.equal(a.runtime_config_matches_defaults, true); assert.equal(b.runtime_config_matches_defaults, false); assert.equal(a.config_fingerprint, b.config_fingerprint, 'the pinned config fingerprint is env-independent');
    assert.ok(existsSync(FROZEN_PATH));
  });
});
