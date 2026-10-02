/**
 * V14 TRADE GATE -- chronological replay driver (RESEARCH ONLY; HYPOTHETICAL_NOT_EXECUTED; no order code).
 * Spec: ../V14_PREREGISTRATION.md (hash asserted). Runs the gate bar by bar over the V8 corrected-core replay rows (DEV, HOLD) for
 * the PRIMARY (risk UNRESOLVED) and two ILLUSTRATIVE configurations, checks invariants, determinism, restart, no-lookahead and
 * V11 parity, and runs the gate read-only over the live V8 forward-shadow records. Writes results/ and full audit logs.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { simulateTrade } from '../../capital_harvest_v9/scripts/harvest.mjs';
import { loadContext } from '../../risk_capital_v10/scripts/sim.mjs';
import { loadPlatformSpec, entryFromRow } from '../../entry_risk_integration_v11/scripts/integrate.mjs';
import { assessRealLot } from '../../../src/engine/mt5RealPolicy.js';
import { STATES, PRODUCTION_BREAKERS, fromReplayRow, fromShadowRecord, initGate, decideGate, applyClose, invariantViolations } from './gate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const OUT = join(ROOT, 'results'); const AUD = join(OUT, 'audit'); const SAMP = join(OUT, 'audit_samples'); for (const d of [OUT, AUD, SAMP]) mkdirSync(d, { recursive: true });
const sha = (s) => createHash('sha256').update(s).digest('hex'); const shaFile = (p) => sha(readFileSync(p));
if (shaFile(join(ROOT, 'V14_PREREGISTRATION.md')) !== readFileSync(join(ROOT, 'V14_PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0]) throw new Error('V14_PREREGISTRATION hash mismatch');
const { bars: B, F } = loadContext(); const SPEC = loadPlatformSpec(join(REPO, 'state', 'xauusd_mt5_real_trade_log.jsonl')); const NORMAL = { spread: 0.24, slip: 0.10 };
const CONFIGS = {
  PRIMARY: { riskModel: 'UNRESOLVED', breakers: PRODUCTION_BREAKERS, conflictResolution: 'EXISTING_PRIORITY', spec: SPEC },
  ILLUSTRATIVE_PCT_0_50_10K: { riskModel: { model: 'PCT', riskPct: 0.005 }, breakers: null, conflictResolution: 'EXISTING_PRIORITY', spec: SPEC },
  ILLUSTRATIVE_CURRENT_10K: { riskModel: { model: 'CURRENT' }, breakers: PRODUCTION_BREAKERS, conflictResolution: 'EXISTING_PRIORITY', spec: SPEC, assessCurrent: assessRealLot },
};
const loadRows = (S) => readFileSync(join(REPO, 'research', 'core_pattern_audit_v8', 'results', 'rows', `ALL_${S}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => a.i - b.i);
const count = (xs, f) => xs.reduce((g, x) => { const k = f(x); g[k] = (g[k] ?? 0) + 1; return g; }, {});

/** Chronological gate replay. The driver plays the market: a hypothetical position closes at its simulated exit bar, and the close is
 *  applied to the gate state only once that bar is in the past (decision at bar i sees closes with exitBar < i). */
function replay(rows, cfg, { from = 0, upto = null, start = null } = {}) {
  let st = start ? JSON.parse(JSON.stringify(start.state)) : initGate({ equity: 10000 }); let pending = start ? start.pending : null; const recs = []; const trades = [];
  for (let k = from; k < (upto ?? rows.length); k++) { const row = rows[k];
    if (pending && pending.exitBar < row.i) { st = applyClose(st, { exitT: pending.exitT, exitBar: pending.exitBar, pnlUsd: pending.pnlUsd, cfg }); pending = null; }
    const out = decideGate(st, fromReplayRow(row), cfg); st = out.state; const rec = out.record; recs.push(rec);
    if (rec.decision === 'TRADE_ELIGIBLE') { const e = entryFromRow(row); const o = simulateTrade(B, F, e, { kind: 'BASELINE' }, NORMAL);
      if (o.status === 'NO_DATA' || o.status === 'INVALID') { rec.outcome = 'NO_DATA'; pending = { exitBar: Infinity, exitT: Infinity, pnlUsd: 0 }; } else { const pnlUsd = o.pnl_usd * rec.lots * SPEC.contract_size; pending = { exitBar: o.exitBar, exitT: B[o.exitBar].time + 300, pnlUsd }; trades.push({ id: e.id, i: e.i, exitBar: o.exitBar, pnlUsd, lots: rec.lots }); } } }
  if (upto != null) return { recs, trades, state: st, pending };
  if (pending && Number.isFinite(pending.exitBar)) st = applyClose(st, { exitT: pending.exitT, exitBar: pending.exitBar, pnlUsd: pending.pnlUsd, cfg });
  return { recs, trades, endEquity: Math.round(st.ctrl.equity * 100) / 100, state: st };
}
function summary(recs) { const by = count(recs, (r) => r.decision); return { decisions: recs.length, by_state: Object.fromEntries(STATES.map((s) => [s, by[s] ?? 0])), by_reason: count(recs, (r) => `${r.decision}:${r.reason}`), engine_signals: recs.filter((r) => r.engine_action === 'BUY' || r.engine_action === 'SELL').length, valid_entries: recs.filter((r) => r.valid_entry).length, risk_rejected_valid_entries: recs.filter((r) => r.valid_entry && r.decision === 'WAIT_RISK_UNSAFE').length, broker_rejections: by.WAIT_BROKER_UNSAFE ?? 0, safety_rejections: by.WAIT_SAFETY_BREAKER ?? 0, strategy_conflicts: recs.filter((r) => r.conflict).length, conflicts_resolved_by_existing_priority: recs.filter((r) => r.conflict && r.conflict.resolution !== 'NONE').length, trade_eligible: by.TRADE_ELIGIBLE ?? 0, discrepancies: count(recs.filter((r) => r.discrepancy), (r) => r.discrepancy), invariant_violations: recs.flatMap((r) => invariantViolations(r).map((v) => `${r.bar_time}:${v}`)) }; }

const res = { generated_utc: new Date().toISOString(), prereg_sha: shaFile(join(ROOT, 'V14_PREREGISTRATION.md')), gate_sha: shaFile(join(HERE, 'gate.mjs')), study_sha: shaFile(join(HERE, 'v14_study.mjs')), splits: {} }; const hashes = {};
const v11 = JSON.parse(readFileSync(join(REPO, 'research', 'entry_risk_integration_v11', 'results', 'v11_results_FULL.json'), 'utf8'));
for (const S of ['DEV', 'HOLD']) { const rows = loadRows(S); res.splits[S] = { rows: rows.length, configs: {} };
  for (const [name, cfg] of Object.entries(CONFIGS)) { const r = replay(rows, cfg); const sm = summary(r.recs); sm.hypothetical_trades_with_outcome = r.trades.length; sm.end_equity_10k = r.endEquity; res.splits[S].configs[name] = sm;
    const text = r.recs.map((x) => JSON.stringify(x)).join('\n') + '\n'; hashes[`${S}_${name}`] = sha(text);
    if (name === 'PRIMARY') { writeFileSync(join(AUD, `audit_${S}_PRIMARY.jsonl`), text); writeFileSync(join(SAMP, `audit_${S}_PRIMARY_first300.jsonl`), r.recs.slice(0, 300).map((x) => JSON.stringify(x)).join('\n') + '\n'); }
    else writeFileSync(join(AUD, `audit_${S}_${name}_entries.jsonl`), r.recs.filter((x) => x.valid_entry || x.engine_action !== 'WAIT').map((x) => JSON.stringify(x)).join('\n') + '\n');
    writeFileSync(join(SAMP, `audit_${S}_${name}_examples.jsonl`), STATES.flatMap((s2) => r.recs.filter((x) => x.decision === s2).slice(0, 3)).map((x) => JSON.stringify(x)).join('\n') + '\n');
    if (name === 'ILLUSTRATIVE_PCT_0_50_10K') { const x = v11.splits[S].grid[10000]['PCT_0.005'].normal; res.splits[S].v11_parity = { gate_trades: r.trades.length, v11_trades: x.trades, gate_end_equity: r.endEquity, v11_end_equity: x.end, same: r.trades.length === x.trades && r.endEquity === x.end }; }
    if (name !== 'PRIMARY') { // no-lookahead of the position lifecycle: the exit is unknown one bar before it happens and known at it
      let bad = 0; for (const t of r.trades) { const e = entryFromRow(rows.find((x) => x.i === t.i)); const before = simulateTrade(B, F, e, { kind: 'BASELINE' }, NORMAL, { endIdx: t.exitBar - 1 }); const at = simulateTrade(B, F, e, { kind: 'BASELINE' }, NORMAL, { endIdx: t.exitBar }); if (t.exitBar - 1 > t.i && before.exit && before.status !== 'NO_DATA' && before.exitBar < t.exitBar) bad++; if (at.exitBar !== t.exitBar) bad++; }
      res.splits[S].configs[name].lifecycle_lookahead_violations = bad; } } }
// ---------------- replay checks (HOLD) ----------------
const HOLD = loadRows('HOLD'); const C = CONFIGS.ILLUSTRATIVE_CURRENT_10K; const h = (recs) => sha(JSON.stringify(recs));
const a = replay(HOLD, CONFIGS.PRIMARY), b = replay(HOLD, CONFIGS.PRIMARY); const c1 = replay(HOLD, C), c2 = replay(HOLD, C);
const half = Math.floor(HOLD.length / 2); const first = replay(HOLD, C, { upto: half }); const snap = JSON.parse(JSON.stringify({ state: first.state, pending: first.pending })); const rest = replay(HOLD, C, { from: half, start: snap });
const prefix = replay(HOLD.slice(0, 20000), CONFIGS.PRIMARY);
const dupState = (() => { const g0 = initGate(); const o1 = decideGate(g0, fromReplayRow(HOLD[100]), CONFIGS.PRIMARY); const o2 = decideGate(o1.state, fromReplayRow(HOLD[100]), CONFIGS.PRIMARY); const o3 = decideGate(o1.state, fromReplayRow(HOLD[99]), CONFIGS.PRIMARY); return { first: o1.record.decision, repeat: `${o2.record.decision}:${o2.record.reason}`, older: `${o3.record.decision}:${o3.record.reason}` }; })();
res.replay = { deterministic_primary: h(a.recs) === h(b.recs), deterministic_current: h(c1.recs) === h(c2.recs), restart_equals_uninterrupted: h([...first.recs, ...rest.recs]) === h(c1.recs), restart_split_at: half, prefix_stable_no_lookahead: h(prefix.recs) === h(a.recs.slice(0, 20000)), duplicate_and_out_of_order: dupState };
// ---------------- forward-shadow compatibility (read-only) ----------------
const SH = join(REPO, 'state', 'v8_shadow', 'decisions.jsonl'); const live = existsSync(SH) ? readFileSync(SH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((o) => o.engine === 'V8' && o.record === 'decision').sort((x, y) => x.bar_time - y.bar_time) : [];
const liveRun = (cfg, stateless) => { let st = initGate(); const recs = []; const seen = new Set(); for (const o of live) { if (seen.has(o.bar_time)) continue; seen.add(o.bar_time); const out = decideGate(stateless ? initGate() : st, fromShadowRecord(o), cfg); if (!stateless) st = out.state; recs.push(out.record); } return recs; };
const lp = liveRun(CONFIGS.PRIMARY, false); const li = liveRun(CONFIGS.ILLUSTRATIVE_PCT_0_50_10K, true);
const missing = li.filter((r) => r.engine_action !== 'WAIT' && ['DATA_STALE_QUOTE'].includes(r.reason)).length;
res.forward_shadow = { records: live.length, period: live.length ? [live[0].bar_close_utc, live.at(-1).bar_close_utc] : null, primary: summary(lp), illustrative_stateless: summary(li), engine_signals: lp.filter((r) => r.engine_action !== 'WAIT').length, eligible_where_engine_waited: lp.concat(li).filter((r) => r.decision === 'TRADE_ELIGIBLE' && r.engine_action === 'WAIT').length, missing_field_fail_closed: missing, missing_field: missing ? 'quote age (tick time) is not recorded in forward-shadow decisions' : null, signal_examples: li.filter((r) => r.engine_action !== 'WAIT').map((r) => ({ ts: r.ts, engine: r.engine_action, decision: r.decision, reason: r.reason })) };
writeFileSync(join(SAMP, 'forward_shadow_gate_PRIMARY.jsonl'), lp.map((x) => JSON.stringify(x)).join('\n') + '\n');
// ---------------- decision (pre-registered §6) ----------------
const allViol = Object.values(res.splits).flatMap((s2) => Object.values(s2.configs).flatMap((c) => c.invariant_violations)).concat(res.forward_shadow.primary.invariant_violations, res.forward_shadow.illustrative_stateless.invariant_violations);
const lookBad = Object.values(res.splits).flatMap((s2) => Object.values(s2.configs).map((c) => c.lifecycle_lookahead_violations ?? 0)).reduce((x, y) => x + y, 0);
const fail = { invariant_violations: allViol.length, eligible_without_engine_entry: res.forward_shadow.eligible_where_engine_waited, nondeterministic: !(res.replay.deterministic_primary && res.replay.deterministic_current), restart_mismatch: !res.replay.restart_equals_uninterrupted, lookahead: !res.replay.prefix_stable_no_lookahead || lookBad > 0, v11_parity_failed: !['DEV', 'HOLD'].every((S) => res.splits[S].v11_parity.same) };
const failed = fail.invariant_violations > 0 || fail.eligible_without_engine_entry > 0 || fail.nondeterministic || fail.restart_mismatch || fail.lookahead || fail.v11_parity_failed;
res.decision = { failure_conditions: fail, unit_tests: 'see tests/trade_gate_v14.test.js (must pass)', forward_shadow_runs: live.length > 0, forward_shadow_missing_field: res.forward_shadow.missing_field, TRADE_GATE_STATUS: failed ? 'GATE_FAILED' : live.length === 0 ? 'GATE_INCONCLUSIVE' : missing > 0 ? 'GATE_PARTIALLY_VALIDATED' : 'GATE_VALIDATED' };
writeFileSync(join(OUT, 'v14_results.json'), JSON.stringify(res, null, 1)); writeFileSync(join(OUT, 'audit_hashes.json'), JSON.stringify({ note: 'sha256 of the full audit logs (results/audit/*, kept out of git; included in the handoff zip)', ...hashes }, null, 1));
console.log('decision', JSON.stringify(res.decision)); console.log('replay', JSON.stringify(res.replay)); for (const S of ['DEV', 'HOLD']) { console.log(S, 'parity', JSON.stringify(res.splits[S].v11_parity)); for (const [n, c] of Object.entries(res.splits[S].configs)) console.log(S, n, JSON.stringify({ ...c.by_state, conflicts: c.strategy_conflicts, discrepancies: c.discrepancies, viol: c.invariant_violations.length, look: c.lifecycle_lookahead_violations })); }
console.log('forward', JSON.stringify({ records: res.forward_shadow.records, primary: res.forward_shadow.primary.by_state, illustrative: res.forward_shadow.illustrative_stateless.by_reason, missing }));
