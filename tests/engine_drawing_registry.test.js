/**
 * src/engine/drawingRegistry.js -- Stage 4 ownership registry primitives.
 * Proves: safe load/save (including malformed input), atomic writes,
 * deterministic keying scoped to (symbol, timeframe, role[, index]), and
 * that this module makes no CDP/TradingView call of any kind.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadRegistry, saveRegistry, buildRegistryKey, scopedKeys, computeIntentSignature, REGISTRY_SCHEMA_VERSION,
} from '../src/engine/drawingRegistry.js';

/** Strips block/line comments so a source-audit regex checks actual CODE, never prose in a doc comment explaining what the module does NOT do. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('drawingRegistry: source audit -- no CDP/TradingView call anywhere', () => {
  it('never imports connection.js or core/drawing.js, and never calls a CDP/removal primitive in actual code', () => {
    const code = stripComments(readFileSync(new URL('../src/engine/drawingRegistry.js', import.meta.url), 'utf8'));
    assert.ok(!/evaluate\(/.test(code));
    assert.ok(!/removeAllShapes/.test(code));
    assert.ok(!/clearAll/.test(code));
    assert.ok(!/draw_clear/.test(code));
    assert.ok(!/from ['"].*connection\.js['"]/.test(code));
    assert.ok(!/from ['"].*core\/drawing\.js['"]/.test(code));
  });
});

describe('drawingRegistry: load/save safety', () => {
  it('missing registry file initializes safely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-registry-'));
    try {
      const path = join(dir, 'does-not-exist.json');
      assert.deepEqual(loadRegistry(path), { schema_version: REGISTRY_SCHEMA_VERSION, entries: {} });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('malformed registry file fails safely, never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-registry-'));
    try {
      const path = join(dir, 'corrupt.json');
      writeFileSync(path, '{ not valid json [[[');
      assert.deepEqual(loadRegistry(path), { schema_version: REGISTRY_SCHEMA_VERSION, entries: {} });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('valid JSON but wrong shape also fails safely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-registry-'));
    try {
      const path = join(dir, 'wrong-shape.json');
      writeFileSync(path, JSON.stringify([1, 2, 3]));
      assert.deepEqual(loadRegistry(path), { schema_version: REGISTRY_SCHEMA_VERSION, entries: {} });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('saveRegistry writes atomically -- round-trips and leaves no leftover .tmp file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-registry-'));
    try {
      const path = join(dir, 'registry.json');
      saveRegistry(path, { entries: { k1: { role: 'structure_primary', entity_id: 'e1' } } });
      const reloaded = loadRegistry(path);
      assert.equal(reloaded.entries.k1.entity_id, 'e1');
      const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp-'));
      assert.deepEqual(leftovers, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('registry survives a reload cycle unchanged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-registry-'));
    try {
      const path = join(dir, 'registry.json');
      const original = { entries: { a: { role: 'nearest_support', entity_id: 'e1' }, b: { role: 'nearest_resistance', entity_id: 'e2' } } };
      saveRegistry(path, original);
      const reloaded1 = loadRegistry(path);
      saveRegistry(path, reloaded1);
      const reloaded2 = loadRegistry(path);
      assert.deepEqual(reloaded2, reloaded1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('drawingRegistry: key building', () => {
  it('is deterministic and scoped by symbol/timeframe/role/index', () => {
    const k1 = buildRegistryKey({ symbol: 'OANDA:XAUUSD', timeframe: '15m', role: 'structure_primary' });
    const k2 = buildRegistryKey({ symbol: 'OANDA:XAUUSD', timeframe: '15m', role: 'structure_primary' });
    assert.equal(k1, k2);
  });

  it('a different role, symbol, timeframe, or index produces a different key', () => {
    const base = { symbol: 'OANDA:XAUUSD', timeframe: '15m', role: 'structure_primary' };
    const k = buildRegistryKey(base);
    assert.notEqual(k, buildRegistryKey({ ...base, role: 'nearest_support' }));
    assert.notEqual(k, buildRegistryKey({ ...base, symbol: 'OANDA:EURUSD' }));
    assert.notEqual(k, buildRegistryKey({ ...base, timeframe: '5m' }));
    assert.notEqual(k, buildRegistryKey({ ...base, index: 1 }));
  });

  it('scopedKeys returns only entries for the exact (symbol, timeframe) pair, never another scope', () => {
    const registry = {
      entries: {
        [buildRegistryKey({ symbol: 'OANDA:XAUUSD', timeframe: '15m', role: 'a' })]: {},
        [buildRegistryKey({ symbol: 'OANDA:XAUUSD', timeframe: '15m', role: 'b' })]: {},
        [buildRegistryKey({ symbol: 'OANDA:XAUUSD', timeframe: '5m', role: 'a' })]: {},
        [buildRegistryKey({ symbol: 'OANDA:EURUSD', timeframe: '15m', role: 'a' })]: {},
      },
    };
    const keys = scopedKeys(registry, { symbol: 'OANDA:XAUUSD', timeframe: '15m' });
    assert.equal(keys.length, 2);
    assert.ok(keys.every((k) => k.startsWith('OANDA:XAUUSD|15m|')));
  });
});

describe('drawingRegistry: intent signature', () => {
  it('is stable for the identical intent content', () => {
    const intent = { primitive: 'horizontal_line', point: { time: 1, price: 2000 }, point2: null, text: null, overrides: null };
    assert.equal(computeIntentSignature(intent), computeIntentSignature({ ...intent }));
  });

  it('changes when the drawn content changes', () => {
    const intent = { primitive: 'horizontal_line', point: { time: 1, price: 2000 }, point2: null, text: null, overrides: null };
    const changed = { ...intent, point: { time: 1, price: 2010 } };
    assert.notEqual(computeIntentSignature(intent), computeIntentSignature(changed));
  });
});
