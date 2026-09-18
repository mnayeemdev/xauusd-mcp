/**
 * src/wait.js: waitForChartReady() resolution-switch verification.
 *
 * Root-cause regression coverage for the live 5m-staleness bug: this
 * function accepted an `expectedTf` parameter since its introduction but
 * never checked it, so setTimeframe() (src/core/chart.js) could report
 * "ready" before TradingView had actually finished switching the chart's
 * resolution, letting getOhlcv() read a stale/previous-resolution series
 * immediately afterward. These tests exercise the fix directly against a
 * mocked evaluate() -- no real CDP/TradingView connection.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { waitForChartReady } from '../src/wait.js';

function mockEvaluate(states) {
  let i = 0;
  return async () => {
    const s = states[Math.min(i, states.length - 1)];
    i++;
    return s;
  };
}

const readyState = (resolution) => ({ isLoading: false, barCount: 42, currentSymbol: 'OANDA:XAUUSD', currentResolution: resolution });

describe('waitForChartReady: resolution verification (expectedTf)', () => {
  it('reports ready once the chart resolution already matches and the bar count is stable', async () => {
    const evaluate = mockEvaluate([readyState('5'), readyState('5'), readyState('5')]);
    const ready = await waitForChartReady(null, '5', 2000, { _deps: { evaluate } });
    assert.equal(ready, true);
  });

  it('keeps waiting while the chart is still on the OLD resolution, then reports ready once it actually switches', async () => {
    const evaluate = mockEvaluate([
      readyState('15'), readyState('15'), // still on the old resolution -- must not report ready
      readyState('5'), readyState('5'), readyState('5'), // switch lands
    ]);
    const ready = await waitForChartReady(null, '5', 3000, { _deps: { evaluate } });
    assert.equal(ready, true);
  });

  it('times out (returns false) if the resolution never actually switches -- this is the exact bug this fix closes', async () => {
    const evaluate = mockEvaluate([readyState('15')]); // stuck on 15m the whole time
    const ready = await waitForChartReady(null, '5', 500, { _deps: { evaluate } });
    assert.equal(ready, false);
  });

  it('does not require a resolution match when expectedTf is not provided (symbol-switch callers unaffected)', async () => {
    const evaluate = mockEvaluate([readyState('15'), readyState('15')]);
    const ready = await waitForChartReady('OANDA:XAUUSD', null, 2000, { _deps: { evaluate } });
    assert.equal(ready, true);
  });

  it('a read that fails to determine currentResolution does not permanently block readiness (defensive, matches existing symbol-check style)', async () => {
    const evaluate = mockEvaluate([
      { isLoading: false, barCount: 10, currentSymbol: '', currentResolution: '' },
      { isLoading: false, barCount: 10, currentSymbol: '', currentResolution: '' },
    ]);
    const ready = await waitForChartReady(null, '5', 2000, { _deps: { evaluate } });
    assert.equal(ready, true);
  });
});
