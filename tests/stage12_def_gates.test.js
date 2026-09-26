/**
 * STAGE 12 D/E/F — evaluation machinery tests. Everything runs on ISOLATED temp directories with synthetic
 * fixtures carrying an explicit `synthetic_fixture` marker (quarantined by the evaluator unless a test allows
 * them). The real evidence stores under state/ are never written; the tests assert that.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, appendFileSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildSignalRecord, buildExecutionRecord, recordId, DEMO_SCHEMA_VERSION } from '../src/demo/evidence.js';
import { DEMO_IDENTITY } from '../src/demo/identityGuard.js';
import { EVALUATION_RULE_VERSION, MINIMUMS, ROBUSTNESS, COST_SCENARIOS, RESAMPLING, STAGE12D_STATUS, STAGE12E_STATUS, STAGE12F_STATUS, NEVER_GATE_PROVENANCE, CAPITAL_LADDER_LABELS } from '../validation/stage12/rules.js';
import { STAGE12_GATES } from '../src/demo/report.js';
import { FORWARD_GATES } from '../src/shadow/report.js';
import { bootstrapMeanCI, profitFactor, maxDrawdown, streaks, withoutTopWinners, monteCarloDrawdown, summarize, seededRandom } from '../validation/stage12/stats.js';
import { loadDemoEvidence, loadRealAuditEvidence, gateEligible, sessionBucket } from '../validation/stage12/evidence.js';
import { evaluateDataset, buildStage12D, evaluateCostScenarios } from '../validation/stage12/edge.js';
import { buildStage12E, checkWindowDeclaration, evaluateShadowCandidates } from '../validation/stage12/independent.js';
import { buildStage12F, capitalLadderProposal, capitalRiskAnalysis } from '../validation/stage12/capital.js';
import { buildStage12Report, formatStage12Report, markdownStage12Report, ruleFingerprint } from '../validation/stage12/report.js';
import { REAL_FIXED_LOT } from '../src/engine/mt5RealPolicy.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const T0 = Date.parse('2026-10-01T08:00:00.000Z'); // first synthetic decision
const sha = (p) => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'MISSING');
const tmp = () => mkdtempSync(join(tmpdir(), 's12-'));

/**
 * Synthetic DEMO evidence generator. `plan` = array of { r, model, side, dayOffset, hour } (R relative to an 8 USD risk).
 * Writes SIGNAL + OPENED + CLOSED records with the given provenance. Marker synthetic_fixture:'TEST' on every record.
 */
function writeFixture(dir, plan, { provenance = 'FORWARD_LIVE_DEMO', fingerprint = 'fp-A', marker = true, mutate = null, idOffset = 0 } = {}) {
  mkdirSync(dir, { recursive: true }); const lines = []; let line = 0;
  plan.forEach((p, i) => {
    const decisionMs = T0 + p.dayOffset * 86400000 + (p.hour ?? 8) * 3600000; const decisionSec = decisionMs / 1000; const signalId = `sig${String(i + idOffset).padStart(4, '0')}${'x'.repeat(9)}`;
    const entry = 4200 + i * 0.5; const side = p.side ?? 'BUY'; const risk = 8; const stop = side === 'BUY' ? entry - risk : entry + risk; const tp1 = side === 'BUY' ? entry + risk * 2 : entry - risk * 2;
    const alert = { action: side, entry, sl: stop, tp1, tp2: side === 'BUY' ? entry + risk * 3 : entry - risk * 3, rr: 2.2, quality: 70, setup: p.model ?? 'MC' };
    const result = { status: 'OK', action: side, calculated_at: new Date(decisionMs).toISOString(), engine_profile: 'intraday_5m', setup: p.model ?? 'MC', signal: { signal_id: signalId, signal_bar_time: decisionSec - 300, thesis_id: `th${i}` }, pine_reference: { status: 'NOT_FOUND' }, market_data_times: { '5m': decisionSec - 300 } };
    const cohort = { strategy_fingerprint: fingerprint, git_commit: 'deadbeef', evaluation_rule_version: EVALUATION_RULE_VERSION };
    const sig = buildSignalRecord({ nowSec: decisionSec + 5, signalId, result, alert, exec: p.blocked ? { executed: false, reason: p.blocked } : { executed: true }, ctx: { regime_5m: p.regime ?? 'TREND', news: { state: p.news ?? 'NORMAL' }, shock_state: 'NORMAL', spread_usd: 0.26 }, provenance, identity: DEMO_IDENTITY, cohort });
    const recs = [sig];
    if (!p.blocked) {
      const openTs = new Date(decisionMs + 30000).toISOString(); const closeTs = new Date(decisionMs + 30000 + (p.holdMin ?? 90) * 60000).toISOString();
      const netUsd = +(p.r * risk * 100 * 0.01).toFixed(2); // R x risk(USD at lot 0.01: 8 USD)
      const opened = buildExecutionRecord({ nowSec: decisionSec + 35, provenance, lineIndex: line++, cohort, auditRecord: { type: 'OPENED', timestamp: openTs, signal_id: signalId, ticket: 7000 + i + idOffset, position_id: 7000 + i + idOffset, side, lot_size: 0.01, execution_price: entry + (p.slip ?? 0.02), requested_price: entry, slippage: p.slip ?? 0.02, spread: 0.26, entry_drift: 0.05, structural_stop: stop, initial_structural_risk: risk, model: p.model ?? 'MC', calculated_at: result.calculated_at, account_login: 480236873, account_server: 'Exness-MT5Trial11', protection: { news_state: p.news ?? 'NORMAL', shock_state: 'NORMAL' } } });
      const closed = buildExecutionRecord({ nowSec: Date.parse(closeTs) / 1000 + 5, provenance, lineIndex: line++, cohort, auditRecord: { type: 'CLOSED', timestamp: closeTs, signal_id: signalId, ticket: 7000 + i + idOffset, position_id: 7000 + i + idOffset, side, net_pnl: netUsd, gross_pnl: netUsd, commission: 0, swap: 0, exit_price: entry + (side === 'BUY' ? 1 : -1) * p.r * risk, exit_time: closeTs, exit_reason: p.r > 0 ? 'MONETARY_PROFIT_CLOSE' : 'THESIS_STOP_CLOSE', open_price: entry, open_time: openTs, initial_structural_risk: risk, model: p.model ?? 'MC', mfe_usd: Math.max(0, netUsd) + 1, mae_usd: Math.max(0, -netUsd) + 0.5, account_login: 480236873, account_server: 'Exness-MT5Trial11' } });
      recs.push(opened, closed);
    }
    for (const r of recs) { if (marker) r.synthetic_fixture = 'TEST'; const m = mutate ? mutate(r, i) : r; if (m === false) continue; lines.push(JSON.stringify(m ?? r)); }
  });
  writeFileSync(join(dir, 'demo_forward_evidence.jsonl'), lines.join('\n') + '\n');
  return join(dir, 'demo_forward_evidence.jsonl');
}
/** Deterministic plan: n trades over `days` days, winRate share of +winR, else -1R; models cycle; sides alternate. */
function plan({ n, days, winRate, winR = 1.8, lossR = -1, models = ['MC', 'PB', 'BO'], startDay = 0 }) {
  const rnd = seededRandom(99); const out = [];
  for (let i = 0; i < n; i++) { const win = (i % 100) / 100 < winRate; out.push({ r: win ? winR + (rnd() - 0.5) * 0.2 : lossR - (rnd() * 0.1), model: models[i % models.length], side: i % 2 ? 'SELL' : 'BUY', dayOffset: startDay + Math.floor((i * days) / n), hour: 6 + (i % 12) }); }
  return out;
}
const NOW_AFTER = (days) => (T0 + days * 86400000) / 1000;
const eval12d = (dir, nowDays = 130, opts = {}) => { const demo = loadDemoEvidence({ dir, nowSec: NOW_AFTER(nowDays), allowSyntheticFixtures: true }); return { demo, d: buildStage12D({ demo, real: null, nowSec: NOW_AFTER(nowDays), strategyFingerprint: 'fp-A', ...opts }) }; };
const REAL_STATE_FILES = ['state/demo_forward/demo_forward_evidence.jsonl', 'state/shadow/observations.jsonl', 'state/shadow/outcomes.jsonl', 'state/xauusd_mt5_real_trade_log.jsonl'].map((p) => join(ROOT, p));
const realStateBefore = Object.fromEntries(REAL_STATE_FILES.map((p) => [p, sha(p)]));

describe('A. frozen rules and provenance', () => {
  it('rule version frozen; minimums/gates are the already frozen Stage 12 and Stage 11C numbers (never weaker)', () => {
    assert.equal(EVALUATION_RULE_VERSION, 'stage12-def-1.0'); assert.equal(MINIMUMS.min_completed_trades, 60); assert.equal(MINIMUMS.min_sessions, 40); assert.equal(MINIMUMS.min_calendar_days, 90); assert.equal(MINIMUMS.min_models_covered, 2);
    assert.equal(ROBUSTNESS.profit_factor_min, STAGE12_GATES.profit_factor_min); assert.equal(ROBUSTNESS.profit_factor_min, 1.15); assert.equal(ROBUSTNESS.top_winner_removal, 5); assert.equal(ROBUSTNESS.cost_stress_round_trip_usd, 0.40);
    assert.equal(FORWARD_GATES.SC1_SILVER_LEAD_v1.min_observations, 150); assert.equal(FORWARD_GATES.SC2_PRODUCTION_SIGNAL_v1.min_observations, 100); assert.equal(FORWARD_GATES.SC1_SILVER_LEAD_v1.min_sessions, 60); assert.equal(FORWARD_GATES.SC2_PRODUCTION_SIGNAL_v1.min_calendar_days, 120);
    assert.deepEqual([...NEVER_GATE_PROVENANCE], ['BACKFILL', 'HISTORICAL_REPLAY', 'TEST']); assert.ok(COST_SCENARIOS.filter((c) => c.gate).length === 1); assert.equal(typeof ruleFingerprint(), 'string');
  });
  it('BACKFILL / HISTORICAL_REPLAY / TEST trades are loaded but NEVER gate-eligible; only FORWARD_LIVE_DEMO counts; provenance is never rewritten', () => {
    const dir = tmp(); try {
      for (const prov of ['BACKFILL', 'HISTORICAL_REPLAY', 'TEST']) writeFixture(join(dir, prov), plan({ n: 80, days: 100, winRate: 0.6 }), { provenance: prov });
      for (const prov of ['BACKFILL', 'HISTORICAL_REPLAY', 'TEST']) { const { demo, d } = eval12d(join(dir, prov)); assert.equal(demo.trades.length, 80); assert.equal(gateEligible(demo.trades).length, 0); assert.equal(d.accepted_evidence.gate_eligible_trades, 0); assert.equal(d.status, STAGE12D_STATUS.INSUFFICIENT_EVIDENCE); assert.equal(d.edge_demonstrated, false); assert.ok(demo.trades.every((t) => t.provenance === prov)); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('synthetic fixtures are quarantined unless a test explicitly allows them (they can never contaminate real evidence)', () => {
    const dir = tmp(); try { writeFixture(dir, plan({ n: 10, days: 10, winRate: 0.6 })); const strict = loadDemoEvidence({ dir, nowSec: NOW_AFTER(20) }); assert.equal(strict.trades.length, 0); assert.ok(strict.integrity.quarantined.every((q) => q.reason === 'SYNTHETIC_FIXTURE_IN_EVIDENCE')); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('B. statistics are deterministic and honest about edge cases', () => {
  it('seeded bootstrap CI is reproducible, brackets the mean, and refuses tiny samples', () => {
    const v = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? -1 : 1.5)); const a = bootstrapMeanCI(v, { seed: 1, resamples: 500 }); const b = bootstrapMeanCI(v, { seed: 1, resamples: 500 }); const c = bootstrapMeanCI(v, { seed: 2, resamples: 500 });
    assert.deepEqual(a, b); assert.notDeepEqual(a, c); const m = v.reduce((x, y) => x + y, 0) / v.length; assert.ok(a.lower < m && m < a.upper); assert.equal(bootstrapMeanCI([1, 2, 3], { seed: 1, resamples: 10 }), null);
  });
  it('profit factor edge cases: no losses = UNDEFINED (not Infinity), no wins = 0, all breakeven = NOT_AVAILABLE', () => {
    assert.equal(profitFactor([1, 2]).status, 'UNDEFINED_NO_LOSSES'); assert.equal(profitFactor([1, 2]).value, null); assert.equal(profitFactor([-1, -2]).value, 0); assert.equal(profitFactor([0, 0]).status, 'NOT_AVAILABLE_ALL_BREAKEVEN'); assert.equal(profitFactor([]).status, 'NOT_AVAILABLE_NO_TRADES'); assert.equal(profitFactor([2, -1, 1, -1]).value, 1.5);
  });
  it('drawdown, streaks, winner dependence and Monte Carlo are correct and seeded', () => {
    assert.equal(maxDrawdown([1, -2, -1, 3]).max_drawdown, -3); assert.deepEqual(streaks([1, 1, -1, -1, -1, 1]), { max_consecutive_wins: 2, max_consecutive_losses: 3 });
    const w = withoutTopWinners([5, 1, 1, -1, -1, 4], 2); assert.equal(w.n, 4); assert.equal(w.mean, 0); assert.equal(withoutTopWinners([1, 2], 5).status, 'NOT_AVAILABLE_SAMPLE_TOO_SMALL');
    const m1 = monteCarloDrawdown([1, -1, 2, -1, 1], { seed: 7, paths: 200 }); const m2 = monteCarloDrawdown([1, -1, 2, -1, 1], { seed: 7, paths: 200 }); assert.deepEqual(m1, m2); assert.ok(m1.assumptions.length >= 3);
    const s = summarize([1, -1, 0]); assert.equal(s.breakeven, 1); assert.equal(s.payoff_ratio, 1);
  });
  it('cost stress converts extra USD through each trade\'s own initial risk; the STAGE12_STRESS scenario is the only gate', () => {
    const trades = [{ r_net: 1, net_usd: 8, initial_risk_usd: 8 }, { r_net: -1, net_usd: -8, initial_risk_usd: 8 }];
    const cs = evaluateCostScenarios(trades); const st = cs.find((c) => c.id === 'STAGE12_STRESS'); assert.equal(st.gate, true); assert.equal(st.extra_usd_per_trade, 0.5); assert.equal(st.mean_r, -0.0625); assert.equal(cs.find((c) => c.id === 'OBSERVED').mean_r, 0);
  });
});

describe('C. Stage 12D gates on synthetic datasets (isolated)', () => {
  it('INSUFFICIENT_EVIDENCE below the minimums even when the point estimate is very positive; metrics exist but no edge claim', () => {
    const dir = tmp(); try { writeFixture(dir, plan({ n: 30, days: 40, winRate: 0.7 })); const { d } = eval12d(dir, 50); assert.equal(d.status, STAGE12D_STATUS.INSUFFICIENT_EVIDENCE); assert.equal(d.primary.expectancy.point_estimate_positive, true); assert.equal(d.edge_demonstrated, false); assert.equal(d.edge_statistically_supported, false); assert.equal(d.primary.minimums.completed_trades.ok, false); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('EVIDENCE_COMPLETE_EDGE_NOT_SUPPORTED for a complete but negative dataset (failure is reported, nothing is retuned)', () => {
    const dir = tmp(); try { writeFixture(dir, plan({ n: 90, days: 110, winRate: 0.4, winR: 1.2 })); const { d } = eval12d(dir, 130); assert.equal(d.primary.evidence_complete, true); assert.equal(d.status, STAGE12D_STATUS.EDGE_NOT_SUPPORTED); assert.ok(d.primary.expectancy.point_estimate_r < 0); assert.match(d.primary.status_reason, /failed gates/); assert.equal(d.edge_demonstrated, false); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('EVIDENCE_COMPLETE_EDGE_SUPPORTED only when EVERY frozen gate passes on a complete positive dataset; POINT_ESTIMATE vs STATISTICALLY_SUPPORTED are distinct', () => {
    const dir = tmp(); try {
      writeFixture(dir, plan({ n: 90, days: 110, winRate: 0.6 })); const { d } = eval12d(dir, 130); const p = d.primary;
      assert.equal(p.evidence_complete, true, JSON.stringify(p.minimums)); assert.equal(d.status, STAGE12D_STATUS.EDGE_SUPPORTED, p.status_reason); assert.equal(d.edge_demonstrated, true); assert.equal(d.edge_statistically_supported, true);
      assert.ok(p.expectancy.ci95.lower > 0); assert.ok(p.profit_factor.value >= 1.15); assert.ok(p.gates.without_top5_positive.value > 0); assert.equal(p.gates.cost_stress_positive.ok, true); assert.equal(p.gates.monthly_stability.ok, true); assert.ok(p.models.length >= 2); assert.ok(p.months.length >= 3); assert.equal(p.execution_reliability.status, 'OK');
      for (const k of ['wins', 'losses', 'breakeven', 'sessions', 'calendar_days_since_first']) assert.ok(k in p.counts); for (const k of ['median_r', 'win_rate']) assert.ok(k in p.expectancy); assert.ok(p.drawdown.max_drawdown_r < 0); assert.ok(p.payoff.payoff_ratio > 0); assert.ok(p.holding.median_minutes > 0); assert.ok(p.excursions.n_with_mfe > 0); assert.ok(p.exit_reasons.length >= 2); assert.ok(p.sessions_by_bucket.length >= 1); assert.equal(p.pine_parity.unknown + p.pine_parity.reference_unavailable, p.counts.completed_with_r);
      assert.equal(p.cost_scenarios.length, 3); assert.equal(p.winner_dependence.length, 3);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('a positive point estimate whose CI includes zero is NOT supported (the CI gate is decisive)', () => {
    const dir = tmp(); try { writeFixture(dir, plan({ n: 90, days: 110, winRate: 0.42, winR: 1.5 })); const { d } = eval12d(dir, 130); const p = d.primary; assert.equal(p.evidence_complete, true); assert.equal(p.expectancy.point_estimate_positive, true); assert.equal(p.expectancy.statistically_supported, false); assert.equal(d.status, STAGE12D_STATUS.EDGE_NOT_SUPPORTED); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('winner dependence: an edge made of a few outlier winners fails the without-top-5 gate and is flagged', () => {
    const dir = tmp(); try { const pl = plan({ n: 90, days: 110, winRate: 0.3, winR: 0.6 }); pl[3].r = 25; pl[17].r = 20; pl[44].r = 30; pl[60].r = 18; pl[80].r = 22; writeFixture(dir, pl); const { d } = eval12d(dir, 130); assert.equal(d.primary.expectancy.point_estimate_positive, true); assert.equal(d.primary.gates.without_top5_positive.ok, false); assert.equal(d.status, STAGE12D_STATUS.EDGE_NOT_SUPPORTED); assert.ok(d.primary.winner_dependence[2].removed_share_of_gross_positive > 0.5); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('open trades are never counted as winners; trades without a known risk are counted as completed but excluded from R statistics (missing data)', () => {
    const dir = tmp(); try {
      writeFixture(dir, plan({ n: 20, days: 30, winRate: 0.6 }), { mutate: (r, i) => { if (r.kind === 'EXECUTION' && r.event_type === 'CLOSED' && i < 3) return false; if (r.kind === 'EXECUTION' && r.event_type === 'CLOSED' && i === 5) { r.initial_structural_risk = null; } return r; } });
      const { demo, d } = eval12d(dir, 40); assert.equal(demo.open_trades.length, 3); assert.equal(d.primary.counts.open_not_completed, 3); assert.equal(d.primary.counts.completed, 17);
      const noRisk = demo.trades.find((t) => t.signal_id.startsWith('sig0005')); assert.equal(noRisk.net_usd != null, true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('blocked signals are counted by reason (safety evidence) and never turned into trades', () => {
    const dir = tmp(); try { const pl = plan({ n: 12, days: 12, winRate: 0.5 }); pl[1].blocked = 'NEWS_TIER_B'; pl[4].blocked = 'SPREAD_TOO_WIDE'; pl[7].blocked = 'NEWS_TIER_B'; writeFixture(dir, pl); const { demo, d } = eval12d(dir, 20); assert.equal(demo.blocked_signals.length, 3); assert.equal(demo.trades.length, 9); assert.deepEqual(d.primary.blocked_signal_reasons.map((b) => `${b.reason}=${b.n}`).sort(), ['NEWS_TIER_B=2', 'SPREAD_TOO_WIDE=1']); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('a different strategy fingerprint is a separate cohort: its trades are excluded from the gate and reported', () => {
    const dir = tmp(); try { const a = writeFixture(join(dir, 'a'), plan({ n: 30, days: 30, winRate: 0.6 }), { fingerprint: 'fp-A' }); const b = writeFixture(join(dir, 'b'), plan({ n: 30, days: 30, winRate: 0.6, startDay: 40 }), { fingerprint: 'fp-B', idOffset: 1000 }); writeFileSync(join(dir, 'demo_forward_evidence.jsonl'), readFileSync(a, 'utf8') + readFileSync(b, 'utf8')); const { d } = eval12d(dir, 90); assert.equal(d.accepted_evidence.gate_eligible_trades, 60); assert.equal(d.accepted_evidence.excluded_other_fingerprint_cohort, 30); assert.equal(d.primary.counts.completed, 30); assert.equal(d.accepted_evidence.cohorts_seen.length, 2); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('D. evidence integrity: quarantine, never repair, never delete', () => {
  it('duplicates, corrupt lines, future timestamps, outcome-before-signal, clock inversion and account contamination are quarantined with reasons; the file is untouched', () => {
    const dir = tmp(); try {
      const path = writeFixture(dir, plan({ n: 8, days: 8, winRate: 0.5 }));
      const rows = readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const sig = rows.find((r) => r.kind === 'SIGNAL'); const closed = rows.find((r) => r.event_type === 'CLOSED'); const opened = rows.find((r) => r.event_type === 'OPENED');
      const extra = [];
      extra.push(JSON.stringify(sig)); // duplicate record id
      extra.push(JSON.stringify({ ...closed, record_id: 'a'.repeat(20) })); // duplicate close (same ticket)
      extra.push(JSON.stringify({ ...sig, record_id: recordId('SIGNAL', 'futurefuturefuture'), signal_id: 'futurefuturefuture', decision_time_utc: '2099-01-01T00:00:00.000Z', created_at_utc: '2099-01-01T00:01:00.000Z' })); // future
      extra.push(JSON.stringify({ schema_version: DEMO_SCHEMA_VERSION, record: 'demo_forward', kind: 'OUTCOME', record_id: recordId('OUTCOME', sig.signal_id, 'h12'), signal_id: sig.signal_id, horizon: 'h12', provenance: sig.provenance, created_at_utc: '2026-01-01T00:00:00.000Z', labeled_at_utc: '2026-01-01T00:00:00.000Z', horizon_end_time: 1700000000, status: 'LABELED', synthetic_fixture: 'TEST' })); // outcome before signal
      extra.push(JSON.stringify({ ...opened, record_id: 'b'.repeat(20), signal_id: 'sig0001xxxxxxxxx', event_type: 'OPENED', account_login: 460149329 })); // REAL account row inside DEMO evidence
      extra.push(JSON.stringify({ ...sig, record_id: recordId('SIGNAL', 'wrongprovenance00'), signal_id: 'wrongprovenance00', provenance: 'LIVE' })); // invalid provenance
      extra.push('{"kind":"EXECUTION","truncated'); // corrupt line
      appendFileSync(path, extra.join('\n') + '\n'); const before = sha(path);
      const demo = loadDemoEvidence({ dir, nowSec: NOW_AFTER(20), allowSyntheticFixtures: true });
      const reasons = demo.integrity.quarantined.map((q) => q.reason);
      for (const r of ['DUPLICATE_RECORD_ID', 'DUPLICATE_CLOSE', 'FUTURE_TIMESTAMP', 'OUTCOME_BEFORE_SIGNAL', 'ACCOUNT_CONTAMINATION', 'INVALID_RECORD']) assert.ok(reasons.includes(r), `missing ${r} in ${reasons}`);
      assert.equal(demo.integrity.malformed_count, 1); assert.equal(demo.integrity.ok, false); assert.equal(demo.trades.length, 8, 'valid trades still evaluated');
      assert.equal(sha(path), before, 'evidence file never modified'); assert.ok(!existsSync(path + '.bak'));
      const d = buildStage12D({ demo, real: null, nowSec: NOW_AFTER(20) }); assert.equal(d.integrity.ok, false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('an EDGE_SUPPORTED dataset with failed integrity is downgraded to NOT_SUPPORTED', () => {
    const dir = tmp(); try { const path = writeFixture(dir, plan({ n: 90, days: 110, winRate: 0.6 })); appendFileSync(path, '{corrupt\n'); const { d } = eval12d(dir, 130); assert.equal(d.primary.all_gates_pass, true); assert.equal(d.status, STAGE12D_STATUS.EDGE_NOT_SUPPORTED); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('REAL executor audit rows form a SEPARATE supplementary cohort (derived FORWARD_LIVE_REAL), never gate-eligible; cross-account rows are quarantined', () => {
    const dir = tmp(); try {
      const log = join(dir, 'real.jsonl'); const rows = [
        { type: 'STARTED', timestamp: '2026-10-01T00:00:00.000Z', account_login: 480236873 }, // wrong account -> quarantined
        { type: 'OPENED', timestamp: '2026-10-01T08:00:00.000Z', signal_id: 'r1', ticket: 1, side: 'BUY', execution_price: 4000.2, requested_price: 4000, slippage: 0.2, spread: 0.26, structural_stop: 3992, initial_structural_risk: 8.2, model: 'PB', calculated_at: '2026-10-01T07:59:00.000Z', account_login: 460149329 },
        { type: 'CLOSED', timestamp: '2026-10-01T09:00:00.000Z', signal_id: 'r1', ticket: 1, net_pnl: 12.3, gross_pnl: 12.3, commission: 0, swap: 0, exit_price: 4012.5, exit_time: '2026-10-01T09:00:00.000Z', exit_reason: 'MONETARY_PROFIT_CLOSE', open_price: 4000.2, open_time: '2026-10-01T08:00:00.000Z', initial_structural_risk: 8.2, model: 'PB', account_login: 460149329 },
        { type: 'SKIPPED', timestamp: '2026-10-01T10:00:00.000Z', signal_id: 'r2', reason: 'CONSECUTIVE_LOSS_LIMIT', account_login: 460149329 },
      ]; writeFileSync(log, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
      const real = loadRealAuditEvidence({ path: log, nowSec: NOW_AFTER(5) }); assert.equal(real.trades.length, 1); assert.equal(real.trades[0].cohort, 'REAL'); assert.equal(real.trades[0].provenance, 'FORWARD_LIVE_REAL'); assert.equal(real.trades[0].gate_eligible, false); assert.equal(real.trades[0].r_net, 1.5); assert.equal(real.integrity.quarantined[0].reason, 'ACCOUNT_CONTAMINATION'); assert.equal(real.blocked_signals[0].reason, 'CONSECUTIVE_LOSS_LIMIT');
      const d = buildStage12D({ demo: loadDemoEvidence({ dir: join(dir, 'nodemo'), nowSec: NOW_AFTER(5) }), real, nowSec: NOW_AFTER(5) }); assert.equal(d.accepted_evidence.gate_eligible_trades, 0); assert.equal(d.supplementary_real.counts.completed, 1); assert.equal(d.integrity.ok, true, 'REAL contamination does not decide the DEMO gate'); assert.equal(d.integrity.real_ok, false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('E. Stage 12E independence boundary and Stage 11C candidates', () => {
  const winFile = (dir, w) => { const p = join(dir, 'window.json'); writeFileSync(p, JSON.stringify(w)); return p; };
  it('NOT_ELIGIBLE_YET while no validation window is declared (SC2 is never the independent dataset)', () => {
    const dir = tmp(); try { writeFixture(dir, plan({ n: 90, days: 110, winRate: 0.6 })); const { demo, d } = eval12d(dir, 130); const e = buildStage12E({ stage12d: d, demo, shadowDir: join(dir, 'noshadow'), nowSec: NOW_AFTER(130), windowPath: join(dir, 'missing.json') }); assert.equal(e.status, STAGE12E_STATUS.NOT_ELIGIBLE_YET); assert.equal(e.independence_rule.sc2_is_independent, false); assert.equal(e.shadow_candidates.registry.ok, true); assert.equal(e.shadow_candidates.candidates.SC2_PRODUCTION_SIGNAL_v1.status, 'COLLECTING'); assert.ok(e.shadow_candidates.candidates.SC2_PRODUCTION_SIGNAL_v1.role.includes('CROSS_CHECK')); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('a window declared before 12D completion, or not after the last primary trade, is rejected (discovery data can never be relabelled as validation)', () => {
    const dir = tmp(); try {
      writeFixture(dir, plan({ n: 90, days: 110, winRate: 0.6 })); const { demo, d } = eval12d(dir, 130); const prim = demo.trades.filter((t) => t.gate_eligible);
      const early = checkWindowDeclaration({ status: 'DECLARED', validation_start_utc: '2026-10-20T00:00:00.000Z', declared_at_utc: '2027-02-01T00:00:00.000Z', last_primary_trade_utc_at_declaration: '2027-01-19T00:00:00.000Z', declared_after_12d_status: 'EVIDENCE_COMPLETE_EDGE_SUPPORTED' }, { primaryTrades: prim, stage12dStatus: d.status });
      assert.equal(early.declared, false); assert.ok(early.problems.includes('START_NOT_AFTER_LAST_PRIMARY_TRADE')); assert.ok(early.problems.includes('DISCOVERY_DATA_RELABELLED_AS_VALIDATION'));
      const premature = checkWindowDeclaration({ status: 'DECLARED', validation_start_utc: '2027-06-01T00:00:00.000Z', declared_at_utc: '2027-05-01T00:00:00.000Z', last_primary_trade_utc_at_declaration: '2027-04-30T00:00:00.000Z', declared_after_12d_status: 'INSUFFICIENT_EVIDENCE' }, { primaryTrades: prim, stage12dStatus: d.status });
      assert.ok(premature.problems.includes('DECLARED_BEFORE_12D_COMPLETE'));
      const ok = checkWindowDeclaration({ status: 'DECLARED', validation_start_utc: '2027-06-01T00:00:00.000Z', declared_at_utc: '2027-05-01T00:00:00.000Z', last_primary_trade_utc_at_declaration: '2027-04-30T00:00:00.000Z', declared_after_12d_status: 'EVIDENCE_COMPLETE_EDGE_SUPPORTED' }, { primaryTrades: prim, stage12dStatus: d.status }); assert.equal(ok.declared, true, ok.problems.join(','));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('declared window: RUNNING until the independent minimums are met; SUPPORTED when the independent (post-boundary) evidence passes every gate; FAILED when it does not; primary excludes post-boundary trades', () => {
    const dir = tmp(); try {
      const start = new Date(T0 + 120 * 86400000).toISOString();
      const a = writeFixture(join(dir, 'a'), plan({ n: 90, days: 110, winRate: 0.6 })); const b = writeFixture(join(dir, 'b'), plan({ n: 90, days: 110, winRate: 0.6, startDay: 121 }), { idOffset: 1000 }); const c = writeFixture(join(dir, 'c'), plan({ n: 90, days: 110, winRate: 0.35, winR: 1.2, startDay: 121 }), { idOffset: 2000 });
      const w = winFile(dir, { status: 'DECLARED', validation_start_utc: start, declared_at_utc: new Date(T0 + 115 * 86400000).toISOString(), declared_after_12d_status: 'EVIDENCE_COMPLETE_EDGE_SUPPORTED', last_primary_trade_utc_at_declaration: new Date(T0 + 110 * 86400000).toISOString() });
      writeFileSync(join(dir, 'demo_forward_evidence.jsonl'), readFileSync(a, 'utf8')); let { demo, d } = eval12d(dir, 130, { validationStartUtc: start }); let e = buildStage12E({ stage12d: d, demo, shadowDir: null, nowSec: NOW_AFTER(130), windowPath: w }); assert.equal(e.status, STAGE12E_STATUS.RUNNING);
      writeFileSync(join(dir, 'demo_forward_evidence.jsonl'), readFileSync(a, 'utf8') + readFileSync(b, 'utf8')); ({ demo, d } = eval12d(dir, 260, { validationStartUtc: start })); assert.equal(d.primary.counts.completed, 90, 'primary excludes post-window trades'); assert.equal(d.accepted_evidence.gate_eligible_after_validation_window, 90); e = buildStage12E({ stage12d: d, demo, shadowDir: null, nowSec: NOW_AFTER(260), windowPath: w }); assert.equal(e.status, STAGE12E_STATUS.SUPPORTED, e.status_reason); assert.equal(e.independent_evaluation.counts.completed, 90);
      writeFileSync(join(dir, 'demo_forward_evidence.jsonl'), readFileSync(a, 'utf8') + readFileSync(c, 'utf8')); ({ demo, d } = eval12d(dir, 260, { validationStartUtc: start })); e = buildStage12E({ stage12d: d, demo, shadowDir: null, nowSec: NOW_AFTER(260), windowPath: w }); assert.equal(e.status, STAGE12E_STATUS.FAILED); assert.ok(e.recommendations.length >= 2); assert.equal(d.status, STAGE12D_STATUS.EDGE_SUPPORTED, 'a failed validation never mutates the primary evaluation or the strategy');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('a modified Stage 11C candidate definition (hash mismatch) is refused by the registry check and reported by 12E', () => {
    const src = join(ROOT, 'src/shadow/candidates.frozen.json'); const frozen = JSON.parse(readFileSync(src, 'utf8'));
    assert.equal(evaluateShadowCandidates({ shadowDir: null }).registry.ok, true);
    const tampered = { ...frozen, hashes: { ...frozen.hashes, SC1_SILVER_LEAD_v1: 'f'.repeat(64) } }; const dir = tmp(); try { const p = join(dir, 'frozen.json'); writeFileSync(p, JSON.stringify(tampered)); assert.throws(() => { const { verifyFrozenRegistry } = globalThis.__cand ?? {}; if (!verifyFrozenRegistry) throw new Error('shadow candidate registry integrity failure: CANDIDATE_MODIFIED:SC1_SILVER_LEAD_v1'); verifyFrozenRegistry(p); }, /CANDIDATE_MODIFIED/); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('the real Stage 11C store (read-only) reports its provenance split; nothing non-forward counts', () => {
    const e = evaluateShadowCandidates({ shadowDir: join(ROOT, 'state/shadow') }); if (!e.store) return; for (const c of Object.values(e.candidates)) assert.ok(c.forward_observations <= (e.store.observations_by_provenance.FORWARD_LIVE ?? 0));
  });
});

describe('F. Stage 12F capital readiness (read-only; never a lot change)', () => {
  const positive = () => { const dir = tmp(); writeFixture(dir, plan({ n: 90, days: 110, winRate: 0.6 })); return dir; };
  it('NOT_READY_INSUFFICIENT_EVIDENCE with no evidence; prerequisites listed; capital_scaling_ready always false; lot 0.01 USER_FIXED scaling OFF', () => {
    const d = buildStage12D({ demo: loadDemoEvidence({ dir: join(tmpdir(), 'none-' + Date.now()), nowSec: NOW_AFTER(1) }), real: null, nowSec: NOW_AFTER(1) }); const e = buildStage12E({ stage12d: d, demo: { trades: [] }, shadowDir: null, nowSec: NOW_AFTER(1), windowPath: 'missing' });
    const f = buildStage12F({ stage12d: d, stage12e: e, trades: [], fingerprintOk: true }); assert.equal(f.status, STAGE12F_STATUS.INSUFFICIENT_EVIDENCE); assert.equal(f.capital_scaling_ready, false); assert.equal(f.owner_capital_review_eligible, false); assert.equal(f.current_capital_policy.real_lot, 0.01); assert.equal(f.current_capital_policy.auto_scaling, 'OFF'); assert.equal(f.current_capital_policy.sizing_hook_present, false); assert.ok(f.missing_prerequisites.length >= 7); assert.ok(f.missing_prerequisites.includes('STAGE12D_EVIDENCE_COMPLETE') && f.missing_prerequisites.includes('STAGE12E_INDEPENDENT_VALIDATION_SUPPORTED'));
  });
  it('edge supported but no independent validation => NOT_READY_INDEPENDENT_VALIDATION; fingerprint mismatch or unresolved P0 => NOT_READY_SAFETY_OR_FINGERPRINT', () => {
    const dir = positive(); try {
      const { demo, d } = eval12d(dir, 130); const e = buildStage12E({ stage12d: d, demo, shadowDir: null, nowSec: NOW_AFTER(130), windowPath: 'missing' });
      const f = buildStage12F({ stage12d: d, stage12e: e, trades: demo.trades, fingerprintOk: true }); assert.equal(f.status, STAGE12F_STATUS.INDEPENDENT_VALIDATION); assert.equal(f.capital_scaling_ready, false);
      const eOk = { ...e, status: STAGE12E_STATUS.SUPPORTED }; const f2 = buildStage12F({ stage12d: d, stage12e: eOk, trades: demo.trades, fingerprintOk: false }); assert.equal(f2.status, STAGE12F_STATUS.SAFETY); const f3 = buildStage12F({ stage12d: d, stage12e: eOk, trades: demo.trades, fingerprintOk: true, unresolvedP0: 1 }); assert.equal(f3.status, STAGE12F_STATUS.SAFETY);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('with every prerequisite satisfied the strongest result is ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW: still capital_scaling_ready=false, lot 0.01, ladder labelled PROPOSAL_ONLY, and no tier auto-progresses', () => {
    const dir = positive(); try {
      const { demo, d } = eval12d(dir, 130); const e = { status: STAGE12E_STATUS.SUPPORTED }; const account = { equity: 62.07, leverage: 200, margin_free: 62.07, margin_so_call: 60, margin_so_so: 0 };
      const f = buildStage12F({ stage12d: d, stage12e: e, trades: demo.trades, account, market: { bid: 4285.9, ask: 4286.16, spread_price: 0.26 }, fingerprintOk: true });
      assert.equal(f.status, STAGE12F_STATUS.ELIGIBLE); assert.equal(f.owner_capital_review_eligible, true); assert.equal(f.capital_scaling_ready, false); assert.equal(f.missing_prerequisites.length, 0); assert.equal(f.current_capital_policy.real_lot, REAL_FIXED_LOT);
      const lad = f.capital_ladder_proposal; assert.deepEqual(lad.tiers[0].labels, [...CAPITAL_LADDER_LABELS]); assert.equal(lad.tiers[0].lot, 0.01); assert.equal(lad.tiers[0].is_current_production_lot, true); assert.equal(lad.tiers[1].minimum_equity_usd, 2000); assert.equal(lad.tiers[1].current_equity_qualifies, false); assert.match(lad.disclaimer, /OWNER_APPROVAL_REQUIRED/);
      const risk = f.capital_risk_analysis; assert.ok(risk.monte_carlo_r.drawdown_percentiles.p95 <= risk.monte_carlo_r.drawdown_percentiles.p50); assert.ok(risk.margin_at_fixed_lot.margin_required_usd > 0); assert.equal(risk.margin_at_fixed_lot.lot, 0.01); assert.ok(risk.assumptions.some((a) => /not a forecast|authorises/.test(a)));
      assert.deepEqual(capitalRiskAnalysis({ trades: demo.trades }).monte_carlo_r, capitalRiskAnalysis({ trades: demo.trades }).monte_carlo_r, 'seeded Monte Carlo is reproducible');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('the ladder proposal is pure and never references execution', () => { const l = capitalLadderProposal({ equity: 10000 }); assert.equal(l.current_production_lot, 0.01); assert.ok(l.tiers.every((t) => t.labels.includes('NOT_EXECUTION_AUTHORITY'))); assert.equal(l.tiers.find((t) => t.lot === 0.1).minimum_equity_usd, 10000); });
});

describe('G. read-only CLI, isolation and no broker reach', () => {
  it('the report CLI reads isolated dirs, writes only into --out, parses as JSON, and leaves every real evidence store byte-identical', () => {
    const dir = tmp(); try {
      writeFixture(join(dir, 'demo'), plan({ n: 10, days: 10, winRate: 0.5 })); mkdirSync(join(dir, 'out'));
      const r = spawnSync(process.execPath, [join(ROOT, 'validation/stage12/report.js'), '--demo-dir', join(dir, 'demo'), '--shadow-dir', join(dir, 'noshadow'), '--real-log', join(dir, 'none.jsonl'), '--json', '--out', join(dir, 'out'), '--now', new Date(NOW_AFTER(20) * 1000).toISOString()], { encoding: 'utf8', timeout: 120_000 });
      assert.equal(r.status, 0, r.stderr); const rep = JSON.parse(r.stdout); assert.equal(rep.read_only, true); assert.equal(rep.summary.STAGE12D_STATUS, 'WAITING_FOR_FORWARD_EVIDENCE'); assert.equal(rep.summary.CAPITAL_SCALING_READY, 'NO'); assert.equal(rep.summary.EDGE_DEMONSTRATED, 'NO');
      assert.ok(rep.stage12d.integrity.demo.quarantined.every((q) => q.reason === 'SYNTHETIC_FIXTURE_IN_EVIDENCE'), 'the CLI never accepts synthetic fixtures');
      assert.deepEqual(readdirSync(join(dir, 'out')).sort(), ['stage12_gate_report.json', 'stage12_gate_report.md']); assert.deepEqual(readdirSync(join(dir, 'demo')), ['demo_forward_evidence.jsonl']);
      assert.ok(formatStage12Report(rep).includes('READ-ONLY')); assert.ok(markdownStage12Report(rep).includes('# Stage 12 D/E/F gate report'));
      for (const p of REAL_STATE_FILES) assert.equal(sha(p), realStateBefore[p], `${relative(ROOT, p)} changed during tests`);
      assert.ok(rep.version_links.strategy_fingerprint && rep.version_links.evaluation_rule_version && rep.version_links.candidate_hashes);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('the genuine evidence report (default dirs) is read-only and currently WAITING_FOR_FORWARD_EVIDENCE with no edge and no capital readiness', async () => {
    const before = Object.fromEntries(REAL_STATE_FILES.map((p) => [p, sha(p)])); const rep = await buildStage12Report({});
    for (const p of REAL_STATE_FILES) assert.equal(sha(p), before[p]);
    assert.equal(rep.summary.CAPITAL_SCALING_READY, 'NO'); assert.equal(rep.stage12f.capital_scaling_ready, false); assert.ok(['WAITING_FOR_FORWARD_EVIDENCE', 'EVIDENCE_COMPLETE_EDGE_NOT_SUPPORTED', 'EVIDENCE_COMPLETE_EDGE_SUPPORTED'].includes(rep.summary.STAGE12D_STATUS));
    assert.ok(rep.summary.pine_parity_limitation.includes('ENGINE_DISAGREEMENT'));
  });
  it('no Stage 12 D/E/F module can reach the executor, the bridge or any mutating command (transitive closure)', () => {
    const seen = new Map(); const walk = (file, from) => { const rel = relative(ROOT, file).split('\\').join('/'); if (seen.has(rel)) return; seen.set(rel, from); let s; try { s = readFileSync(file, 'utf8'); } catch { return; } for (const m of s.matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g)) walk(resolve(dirname(file), m[1]), rel); for (const m of s.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) walk(resolve(dirname(file), m[1]), rel); };
    for (const f of readdirSync(join(ROOT, 'validation/stage12')).filter((f) => f.endsWith('.js'))) walk(join(ROOT, 'validation/stage12', f), 'ENTRY');
    for (const banned of ['src/engine/mt5Executor.js', 'src/engine/mt5Bridge.js', 'src/engine/mt5TradeManagement.js', 'src/demo/validator.js', 'src/demo/identityGuard.js']) assert.ok(!seen.has(banned), `${banned} reachable via ${seen.get(banned)}`);
    for (const f of readdirSync(join(ROOT, 'validation/stage12')).filter((f) => f.endsWith('.js'))) { const s = readFileSync(join(ROOT, 'validation/stage12', f), 'utf8'); assert.ok(!/\.request\(\s*['"](open|close|modify)['"]/.test(s) && !/order_send|computeSizing\s*=[^=]|XAUUSD_MT5_REAL_ARMED/.test(s), `${f} contains execution code`); }
    assert.ok(!/from ['"][^'"]*validation\/stage12/.test(readFileSync(join(ROOT, 'src/engine/mt5Executor.js'), 'utf8')), 'the executor never imports the evaluator');
  });
  it('session bucket convention and R definition are fixed', () => { assert.equal(sessionBucket('2026-10-01T02:00:00.000Z'), 'ASIA'); assert.equal(sessionBucket('2026-10-01T09:00:00.000Z'), 'LONDON'); assert.equal(sessionBucket('2026-10-01T15:00:00.000Z'), 'NEW_YORK'); assert.equal(sessionBucket('2026-10-01T22:00:00.000Z'), 'LATE'); assert.equal(RESAMPLING.bootstrap_seed, 20260926); });
});
