/**
 * src/engine/visualization.js -- Stage 4 drawing-intent schema
 * (infrastructure only, no market-mapping logic yet). Proves the schema
 * is validated against the REAL supported primitives, never fabricates a
 * partially-built intent, and carries no decision-making logic.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDrawingIntent, makeDrawingIntent, SUPPORTED_PRIMITIVES, EXAMPLE_ROLES } from '../src/engine/visualization.js';

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('visualization: source audit -- no decision/CDP dependency', () => {
  it('never imports the decision engine, anticipation, confluence, or CDP primitives in actual code', () => {
    const code = stripComments(readFileSync(new URL('../src/engine/visualization.js', import.meta.url), 'utf8'));
    assert.ok(!/import[\s\S]*?xauusd_calculate/.test(code));
    assert.ok(!/from ['"].*anticipation\.js['"]/.test(code));
    assert.ok(!/from ['"].*confluence\.js['"]/.test(code));
    assert.ok(!/evaluate\(/.test(code));
  });
});

describe('visualization: SUPPORTED_PRIMITIVES matches the real drawing tool schema', () => {
  it('matches exactly the shape types draw_shape actually documents', () => {
    // Cross-checked against src/tools/drawing.js's own tool description:
    // "horizontal_line, vertical_line, trend_line, rectangle, text".
    assert.deepEqual([...SUPPORTED_PRIMITIVES].sort(), ['horizontal_line', 'rectangle', 'text', 'trend_line', 'vertical_line'].sort());
  });
});

describe('visualization: validateDrawingIntent', () => {
  const base = { role: 'nearest_support', primitive: 'horizontal_line', point: { time: 1700000000, price: 2000 }, symbol: 'OANDA:XAUUSD', timeframe: '15m' };

  it('accepts a valid single-point intent', () => {
    assert.equal(validateDrawingIntent(base).valid, true);
  });

  it('rejects a missing role', () => {
    const { valid, errors } = validateDrawingIntent({ ...base, role: '' });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('role')));
  });

  it('rejects an unsupported primitive', () => {
    const { valid, errors } = validateDrawingIntent({ ...base, primitive: 'ellipse' });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('primitive')));
  });

  it('rejects a non-finite point', () => {
    assert.equal(validateDrawingIntent({ ...base, point: { time: 'x', price: 2000 } }).valid, false);
    assert.equal(validateDrawingIntent({ ...base, point: null }).valid, false);
  });

  it('requires point2 for two-point primitives (trend_line, rectangle)', () => {
    assert.equal(validateDrawingIntent({ ...base, primitive: 'trend_line' }).valid, false);
    assert.equal(validateDrawingIntent({ ...base, primitive: 'trend_line', point2: { time: 1700000900, price: 2010 } }).valid, true);
    assert.equal(validateDrawingIntent({ ...base, primitive: 'rectangle' }).valid, false);
    assert.equal(validateDrawingIntent({ ...base, primitive: 'rectangle', point2: { time: 1700000900, price: 2010 } }).valid, true);
  });

  it('rejects point2 on a single-point primitive', () => {
    assert.equal(validateDrawingIntent({ ...base, point2: { time: 1700000900, price: 2010 } }).valid, false);
  });

  it('requires symbol and timeframe', () => {
    assert.equal(validateDrawingIntent({ ...base, symbol: '' }).valid, false);
    assert.equal(validateDrawingIntent({ ...base, timeframe: '' }).valid, false);
  });
});

describe('visualization: makeDrawingIntent', () => {
  it('builds a normalized intent from valid inputs', () => {
    const intent = makeDrawingIntent({ role: 'nearest_support', primitive: 'horizontal_line', point: { time: 1, price: 2000 }, symbol: 'OANDA:XAUUSD', timeframe: '15m', source: 'levels.js:nearestSupport' });
    assert.ok(intent);
    assert.equal(intent.role, 'nearest_support');
    assert.equal(intent.source, 'levels.js:nearestSupport');
  });

  it('returns null (never a partially-built intent) for invalid inputs', () => {
    assert.equal(makeDrawingIntent({ role: '', primitive: 'horizontal_line', point: { time: 1, price: 2000 }, symbol: 'OANDA:XAUUSD', timeframe: '15m' }), null);
  });

  it('never fabricates a role, price, or point -- output matches input exactly', () => {
    const point = { time: 1700000000, price: 2015.5 };
    const intent = makeDrawingIntent({ role: 'primary_trigger', primitive: 'horizontal_line', point, symbol: 'OANDA:XAUUSD', timeframe: '15m' });
    assert.deepEqual(intent.point, point);
  });
});

describe('visualization: EXAMPLE_ROLES is illustrative, not a closed enum', () => {
  it('a role outside EXAMPLE_ROLES still validates -- Stage 5 can introduce new roles freely', () => {
    const { valid } = validateDrawingIntent({ role: 'a_brand_new_role_stage5_might_invent', primitive: 'text', point: { time: 1, price: 2000 }, text: 'hi', symbol: 'OANDA:XAUUSD', timeframe: '15m' });
    assert.equal(valid, true);
    assert.equal(EXAMPLE_ROLES.includes('a_brand_new_role_stage5_might_invent'), false);
  });
});
