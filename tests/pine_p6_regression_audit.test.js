/**
 * Pine P6 — regression/integrity audit: proves P6 did not touch frozen
 * trading semantics, the frozen Pine hash is unchanged, CONTRACT_VERSION
 * remains 1, and the P6 validation artifacts (manifest/results) are
 * internally consistent and reproducible.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const PINE_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master.pine', import.meta.url));
const STRATEGY_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master_Strategy.pine', import.meta.url));
const MANIFEST_PATH = fileURLToPath(new URL('../validation/p6_manifest.json', import.meta.url));
const RESULTS_PATH = fileURLToPath(new URL('../validation/p6_results.json', import.meta.url));

const P5_FREEZE_INDICATOR_SHA256 = '6c4dbba9105db1f75a07682408a8d91f34929d594cf8ddf7eaaea0defa57d3b6';
const P5_FREEZE_STRATEGY_SHA256 = '947b6852d3ae60fc236854c0b6604b7af15f355a58340d5b5eca79db37797911';

function sha256(path) {
  return crypto.createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('P6 §28/§29: frozen Pine hash must remain byte-identical to the P5 freeze', () => {
  it('indicator hash matches the P5 freeze value exactly', () => {
    assert.equal(sha256(PINE_PATH), P5_FREEZE_INDICATOR_SHA256, 'P6 must not modify the frozen indicator — see the P6 spec\'s "P6 must not become P7" boundary');
  });
  it('strategy hash matches the P5 freeze value exactly', () => {
    assert.equal(sha256(STRATEGY_PATH), P5_FREEZE_STRATEGY_SHA256, 'P6 must not modify the frozen strategy');
  });
});

describe('P6 §28: CONTRACT_VERSION and INDICATOR_VERSION remain unchanged', () => {
  const source = readFileSync(PINE_PATH, 'utf8');
  it('CONTRACT_VERSION is 1', () => {
    assert.ok(/CONTRACT_VERSION\s*=\s*1\b/.test(source));
  });
  it('INDICATOR_VERSION is 0.4.0 (the P5 freeze version, unchanged by P6)', () => {
    assert.ok(/INDICATOR_VERSION\s*=\s*"0\.4\.0"/.test(source));
  });
});

describe('P6 §22: no contract-table ambiguity introduced', () => {
  const source = readFileSync(PINE_PATH, 'utf8');
  it('exactly one table carries the CONTRACT_VERSION anchor (the authoritative contract table)', () => {
    const anchorMatches = [...source.matchAll(/f_row\(contractTable, 0,\s*"CONTRACT_VERSION"/g)];
    assert.equal(anchorMatches.length, 1);
  });
  it('the P5 stats/recent-signals tables still carry no CONTRACT_VERSION row (re-confirmed, P6 did not add one)', () => {
    const p5Start = source.indexOf('P5 — STATISTICS TABLE');
    const p5Code = source.slice(p5Start).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/"CONTRACT_VERSION"/.test(p5Code));
  });
});

describe('P6 §21: validation manifest/results are present, well-formed, and internally consistent', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));

  it('manifest declares symbol OANDA:XAUUSD and no substitute provider', () => {
    assert.equal(manifest.symbol, 'OANDA:XAUUSD');
    assert.ok(!/binance|coinbase|ftx|bybit/i.test(JSON.stringify(manifest)), 'no substitute crypto/other provider may appear');
  });

  it('manifest declares all three required timeframes with bar counts and date ranges', () => {
    for (const tf of ['5m', '15m', '30m']) {
      assert.ok(manifest.timeframes[tf], `manifest must declare ${tf}`);
      assert.ok(manifest.timeframes[tf].total_bars_loaded > 0);
      assert.ok(manifest.timeframes[tf].first_bar_time_utc);
      assert.ok(manifest.timeframes[tf].last_bar_time_utc);
    }
  });

  it('results.full_window total = pass + fail + open for every timeframe (the core P6 invariant)', () => {
    for (const tf of ['5m', '15m', '30m']) {
      const r = results.full_window[tf];
      assert.equal(r.total_signals, r.pass + r.fail + r.open, `${tf}: total must equal pass+fail+open`);
      assert.equal(r.closed, r.pass + r.fail, `${tf}: closed must equal pass+fail`);
    }
  });

  it('results.full_window model_breakdown per-timeframe totals sum to the timeframe total_signals', () => {
    for (const tf of ['5m', '15m', '30m']) {
      const r = results.full_window[tf];
      const sum = Object.values(r.model_breakdown).reduce((s, m) => s + m.total, 0);
      assert.equal(sum, r.total_signals, `${tf}: model breakdown must sum to total_signals`);
    }
  });

  it('results.full_window regime_breakdown per-timeframe totals sum to the timeframe total_signals', () => {
    for (const tf of ['5m', '15m', '30m']) {
      const r = results.full_window[tf];
      const sum = Object.values(r.regime_breakdown).reduce((s, m) => s + m.total, 0);
      assert.equal(sum, r.total_signals, `${tf}: regime breakdown must sum to total_signals`);
    }
  });

  it('results.full_window session_breakdown per-timeframe totals sum to the timeframe total_signals', () => {
    for (const tf of ['5m', '15m', '30m']) {
      const r = results.full_window[tf];
      const sum = Object.values(r.session_breakdown).reduce((s, m) => s + m.total, 0);
      assert.equal(sum, r.total_signals, `${tf}: session breakdown must sum to total_signals`);
    }
  });

  it('results.full_window buy_sell_breakdown totals sum to total_signals and match buy/sell fields', () => {
    for (const tf of ['5m', '15m', '30m']) {
      const r = results.full_window[tf];
      const bs = r.buy_sell_breakdown;
      assert.equal(bs.BUY.total, r.buy);
      assert.equal(bs.SELL.total, r.sell);
      assert.equal(bs.BUY.total + bs.SELL.total, r.total_signals);
    }
  });

  it('no PASS-rate figure was computed with OPEN included in the denominator (spot check against the raw pass/fail counts)', () => {
    for (const tf of ['5m', '15m', '30m']) {
      const r = results.full_window[tf];
      const expected = +((r.pass / (r.pass + r.fail)) * 100).toFixed(1);
      assert.equal(r.pass_rate_pct, expected);
    }
  });

  it('the bootstrap field explicitly states insufficient sample rather than fabricating a result', () => {
    assert.ok(/NOT PERFORMED/.test(results.bootstrap));
    assert.ok(/INSUFFICIENT SAMPLE/.test(results.bootstrap));
  });

  it('manifest explicitly documents the IS/OOS partition limitation rather than silently omitting it', () => {
    assert.ok(/known_limitation/.test(JSON.stringify(manifest)));
    assert.ok(/70\/30|IS\/OOS|prefix/i.test(manifest.known_limitation));
  });
});

describe('P6 §16: reload/prefix-stability — result reported and internally consistent', () => {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  it('reload_prefix_stability section exists and reports identical figures across independent fresh reloads', () => {
    assert.ok(results.reload_prefix_stability);
    assert.ok(/IDENTICAL/.test(results.reload_prefix_stability.result));
  });
});
