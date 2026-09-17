/**
 * Pine P7 — optimization-machinery and provenance audit.
 *
 * These tests validate that the P7 research process was disciplined and
 * that its artifacts are internally consistent -- they do NOT assert
 * anything about trading profitability. A weak or negative candidate
 * result must never fail these tests; only a process/integrity defect
 * (an omitted candidate, a mutated frozen file, a fabricated OOS claim,
 * a display/resource parameter treated as a trading candidate) should.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const PINE_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master.pine', import.meta.url));
const STRATEGY_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master_Strategy.pine', import.meta.url));
const BASELINE_PATH = fileURLToPath(new URL('../validation/p7_baseline_parameters.json', import.meta.url));
const CANDIDATES_PATH = fileURLToPath(new URL('../validation/p7_candidates.json', import.meta.url));
const RESULTS_PATH = fileURLToPath(new URL('../validation/p7_results.json', import.meta.url));
const P7_DOC_PATH = fileURLToPath(new URL('../docs/PINE_P7.md', import.meta.url));

const P6_FREEZE_INDICATOR_SHA256 = '6c4dbba9105db1f75a07682408a8d91f34929d594cf8ddf7eaaea0defa57d3b6';
const P6_FREEZE_STRATEGY_SHA256 = '947b6852d3ae60fc236854c0b6604b7af15f355a58340d5b5eca79db37797911';

function sha256(path) {
  return crypto.createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('P7 §5/§29: frozen Pine hash must remain byte-identical to P6/P5 (no candidate ever touched the source file)', () => {
  it('indicator hash matches the frozen baseline exactly', () => {
    assert.equal(sha256(PINE_PATH), P6_FREEZE_INDICATOR_SHA256);
  });
  it('strategy hash matches the frozen baseline exactly', () => {
    assert.equal(sha256(STRATEGY_PATH), P6_FREEZE_STRATEGY_SHA256);
  });
});

describe('P7 §1: baseline parameter snapshot is well-formed and predeclared', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

  it('every selected parameter has a baseline and exactly two candidates', () => {
    for (const p of baseline.parameters) {
      assert.ok(typeof p.baseline === 'number', `${p.name} must have a numeric baseline`);
      assert.equal(p.candidates.length, 2, `${p.name} must declare exactly two candidate values`);
      assert.ok(!p.candidates.includes(p.baseline), `${p.name} candidates must differ from baseline`);
    }
  });

  it('no selected parameter is a display/debug/P5-resource parameter', () => {
    const forbidden = ['debugMode', 'p5ShowStatsTable', 'p5ShowRecentSignals', 'p5MaxTrackedSignals', 'p5MaxOpenSignals', 'p5RecentSignalsCount'];
    const selectedNames = baseline.parameters.map((p) => p.name);
    for (const name of forbidden) {
      assert.ok(!selectedNames.includes(name), `${name} must never be an optimization candidate`);
    }
  });

  it('sample floor is defined as 50% of each timeframe P6 baseline closed count', () => {
    const b = baseline.p6_baseline_full_window;
    assert.equal(baseline.sample_floor_rule['5m_floor'], Math.floor((b['5m'].pass + b['5m'].fail) * 0.5));
    assert.equal(baseline.sample_floor_rule['15m_floor'], Math.floor((b['15m'].pass + b['15m'].fail) * 0.5));
    assert.equal(baseline.sample_floor_rule['30m_floor'], Math.floor((b['30m'].pass + b['30m'].fail) * 0.5));
  });
});

describe('P7 §16: candidate ledger retains every tested candidate, including losers', () => {
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8'));

  it('one-factor sensitivity covers both candidates for every selected parameter', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    const tested = candidates.one_factor_sensitivity_15m.map((c) => `${c.param}=${c.value}`);
    for (const p of baseline.parameters) {
      for (const v of p.candidates) {
        assert.ok(tested.includes(`${p.name}=${v}`), `missing one-factor test for ${p.name}=${v}`);
      }
    }
  });

  it('a losing candidate (C2) is present and explicitly not omitted', () => {
    const c2 = candidates.combination_search_15m.find((c) => c.id === 'C2');
    assert.ok(c2, 'C2 must be present in the ledger');
    assert.equal(c2.verdict, 'REJECTED');
    const baselineCumR = 19.67;
    assert.ok(c2.cumulative_R < baselineCumR, 'C2 must genuinely underperform baseline, proving losers are not filtered out');
  });

  it('a candidate rejected only after cross-timeframe testing (N1) is present with its rejection reason', () => {
    const n1 = candidates.combination_search_15m.find((c) => c.id === 'N1');
    assert.ok(n1);
    assert.match(n1.verdict, /REJECTED/);
    assert.match(n1.notes, /5m/);
  });

  it('every combination candidate has a deterministic, unique ID', () => {
    const ids = candidates.combination_search_15m.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('P7 §8: sample-retention arithmetic is correct', () => {
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8'));
  const baselineClosed15m = 70;

  it('sample_retention_pct is closed-candidate / P6-baseline-closed, to within rounding', () => {
    for (const c of candidates.combination_search_15m) {
      if (c.sample_retention_pct == null) continue;
      const closed = c.closed ?? (c.pass + c.fail);
      const expected = +((closed / baselineClosed15m) * 100).toFixed(1);
      assert.ok(Math.abs(expected - c.sample_retention_pct) < 0.2, `${c.id}: retention mismatch`);
    }
  });
});

describe('P7 §19: OOS terminology is never applied to a candidate result', () => {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8'));
  const p7doc = readFileSync(P7_DOC_PATH, 'utf8');

  it('p7_results.json never labels a candidate figure as OOS/production-validated', () => {
    const text = JSON.stringify(results);
    assert.ok(!/\bOOS PASS\b|OOS VALIDATED|(?<!NOT )production.validated|guaranteed/i.test(text));
  });
  it('p7_candidates.json never labels a candidate figure as OOS/production-validated', () => {
    const text = JSON.stringify(candidates);
    assert.ok(!/\bOOS PASS\b|OOS VALIDATED|(?<!NOT )production.validated|guaranteed/i.test(text));
  });
  it('docs/PINE_P7.md explicitly states no genuine OOS baseline exists', () => {
    assert.match(p7doc, /NO GENUINE OOS BASELINE EXISTS/);
  });
  it('the selected candidate is labeled only as a P7 RESEARCH CANDIDATE, not BEST/WINNER/PRODUCTION READY', () => {
    assert.match(p7doc, /P7 RESEARCH CANDIDATE/);
    assert.ok(!/\bBEST CANDIDATE\b|\bWINNER\b|PRODUCTION READY/i.test(p7doc));
  });
});

describe('P7 §24/§32: no contract or version mutation for a pure parameter candidate', () => {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  const source = readFileSync(PINE_PATH, 'utf8');

  it('results declare no CONTRACT_VERSION or INDICATOR_VERSION change', () => {
    assert.equal(results.selected_research_candidate.contract_version_changed, false);
    assert.equal(results.selected_research_candidate.indicator_version_changed, false);
    assert.equal(results.selected_research_candidate.pine_source_modified, false);
  });
  it('the frozen source CONTRACT_VERSION is still exactly 1 and INDICATOR_VERSION still 0.4.0', () => {
    assert.ok(/CONTRACT_VERSION\s*=\s*1\b/.test(source));
    assert.ok(/INDICATOR_VERSION\s*=\s*"0\.4\.0"/.test(source));
  });
});

describe('P7 review gate: global candidate identity and count integrity', () => {
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8'));
  const of = candidates.one_factor_sensitivity_15m;
  const combo = candidates.combination_search_15m;

  it('candidate IDs are unique across the ENTIRE ledger (one-factor + combination combined), not just within one array', () => {
    const allIds = [...of.map((c) => c.id), ...combo.map((c) => c.id)];
    assert.equal(new Set(allIds).size, allIds.length, 'duplicate candidate ID found across the combined ledger');
  });

  it('exactly 10 one-factor and 6 combination/neighborhood candidates exist (16 total, matching the reported count)', () => {
    assert.equal(of.length, 10);
    assert.equal(combo.length, 6);
  });

  it('cross_timeframe_selected_candidate is a per-timeframe OBSERVATION of C4, not additional searched candidate configurations', () => {
    assert.ok(!Array.isArray(candidates.cross_timeframe_selected_candidate));
    assert.ok(!('id' in candidates.cross_timeframe_selected_candidate), 'the cross-timeframe block must never carry its own candidate ID');
  });

  it('every candidate record satisfies signals = PASS + FAIL + OPEN', () => {
    for (const c of [...of, ...combo]) {
      const open = c.open ?? 0;
      assert.equal(c.pass + c.fail + open, c.signals, `${c.id}: signals must equal pass+fail+open`);
    }
  });

  it('every candidate record satisfies PASS rate = PASS / (PASS + FAIL), OPEN excluded', () => {
    for (const c of [...of, ...combo]) {
      const expected = +((c.pass / (c.pass + c.fail)) * 100).toFixed(1);
      assert.ok(Math.abs(expected - c.pass_rate_pct) < 0.05, `${c.id}: pass_rate_pct mismatch`);
    }
  });

  it('C4 (the selected candidate) overrides exactly minRR and corrResolveConfirmBars, nothing else', () => {
    const c4 = combo.find((c) => c.id === 'C4');
    assert.deepEqual(Object.keys(c4.params).sort(), ['corrResolveConfirmBars', 'minRR']);
    assert.equal(c4.params.minRR, 1.7);
    assert.equal(c4.params.corrResolveConfirmBars, 3);
  });
});

describe('P7 review gate: sample-floor cross-reference must never go stale', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));

  it('p7_results.json sample_floor_checks floors exactly match p7_baseline_parameters.json sample_floor_rule for every timeframe', () => {
    const floorMap = { '5m': '5m_floor', '15m': '15m_floor', '30m': '30m_floor' };
    for (const tf of ['5m', '15m', '30m']) {
      assert.equal(
        results.sample_floor_checks[tf].floor,
        baseline.sample_floor_rule[floorMap[tf]],
        `${tf}: sample_floor_checks.floor is stale relative to the authoritative sample_floor_rule`
      );
    }
  });
});

describe('P7 review gate: cross-file agreement between p7_results.json, p7_candidates.json, and p7_baseline_parameters.json', () => {
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8'));
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

  it('P6-row figures in p7_results.json match p7_baseline_parameters.json for every timeframe', () => {
    for (const tf of ['5m', '15m', '30m']) {
      const r = results.p6_vs_p7_comparison[tf];
      const b = baseline.p6_baseline_full_window[tf];
      for (const k of ['signals', 'pass', 'fail', 'open', 'cumulative_R']) {
        assert.equal(r[k], b[k], `${tf}.${k}: p7_results.json P6 row disagrees with p7_baseline_parameters.json`);
      }
    }
  });

  it('P7-row figures in p7_results.json match p7_candidates.json cross_timeframe_selected_candidate for every timeframe', () => {
    for (const tf of ['5m', '15m', '30m']) {
      const r = results.p6_vs_p7_comparison[`${tf}_p7`];
      const x = candidates.cross_timeframe_selected_candidate[tf];
      for (const k of ['signals', 'pass', 'fail', 'open', 'cumulative_R']) {
        assert.equal(r[k], x[k], `${tf}.${k}: p7_results.json P7 row disagrees with p7_candidates.json cross-timeframe observation`);
      }
    }
  });
});

describe('P7 §21: objective comparison retains P6-vs-P7 rows for all three timeframes independently', () => {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));

  it('P6 and P7 rows exist for 5m, 15m, and 30m, never pooled into one figure', () => {
    for (const tf of ['5m', '15m', '30m']) {
      assert.ok(results.p6_vs_p7_comparison[tf], `${tf} P6 row missing`);
      assert.ok(results.p6_vs_p7_comparison[`${tf}_p7`], `${tf} P7 row missing`);
    }
  });
  it('no timeframe P7 result is worse than its P6 baseline cumulative R (the selected candidate never regresses)', () => {
    for (const tf of ['5m', '15m', '30m']) {
      const before = results.p6_vs_p7_comparison[tf].cumulative_R;
      const after = results.p6_vs_p7_comparison[`${tf}_p7`].cumulative_R;
      assert.ok(after >= before - 0.01, `${tf}: P7 must not regress below P6 baseline`);
    }
  });
});
