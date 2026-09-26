/**
 * STAGE 12E — INDEPENDENT VALIDATION GATE. READ-ONLY.
 *
 * Independence rule (rules.js INDEPENDENCE): the primary/development forward evidence is every FORWARD_LIVE_DEMO
 * trade since the validator started. Independent validation evidence = forward trades with decision time >=
 * VALIDATION_START_UTC, declared ONCE by the owner in validation_window.frozen.json only after Stage 12D is
 * EVIDENCE_COMPLETE_* on the primary dataset, strictly later than the last primary trade, never moved. The same
 * frozen minimums and gates apply, without retuning. Stage 11C SC2 measures the same production signals as the
 * DEMO validator, so it is a cross-check, not an independent dataset; SC1 validates its own hypothesis under its
 * own frozen gates (src/shadow/report.js FORWARD_GATES). Candidate hashes are verified, never modified.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyFrozenRegistry, registryHashes, CANDIDATES } from '../../src/shadow/candidates.js';
import { evaluateCandidate } from '../../src/shadow/report.js';
import { createEvidenceStore } from '../../src/shadow/store.js';
import { EVALUATION_RULE_VERSION, STAGE12E_STATUS, STAGE12D_STATUS, INDEPENDENCE, SHADOW_GATES } from './rules.js';
import { evaluateDataset } from './edge.js';

export const DEFAULT_WINDOW_PATH = fileURLToPath(new URL('./validation_window.frozen.json', import.meta.url));

export function loadValidationWindow(path = DEFAULT_WINDOW_PATH) {
  if (!existsSync(path)) return { status: 'NOT_DECLARED', validation_start_utc: null, missing: true };
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (err) { return { status: 'CORRUPT', validation_start_utc: null, error: err.message }; }
}

/** Validates a declared window against the primary dataset: must be declared after 12D completion and after the last primary trade. */
export function checkWindowDeclaration(window, { primaryTrades, stage12dStatus }) {
  // `primaryTrades` = EVERY gate-eligible trade (before and after the boundary); the declaration itself records when
  // it was made and the last trade that existed at that moment, so relabelled discovery data is detectable later.
  const problems = [];
  if (!window || window.status !== 'DECLARED' || !window.validation_start_utc) return { declared: false, problems: ['NOT_DECLARED'] };
  const start = Date.parse(window.validation_start_utc); if (!Number.isFinite(start)) problems.push('START_NOT_ISO');
  const declaredAt = Date.parse(window.declared_at_utc ?? ''); if (!Number.isFinite(declaredAt)) problems.push('DECLARED_AT_MISSING');
  if (![STAGE12D_STATUS.EDGE_SUPPORTED, STAGE12D_STATUS.EDGE_NOT_SUPPORTED].includes(window.declared_after_12d_status)) problems.push('DECLARED_BEFORE_12D_COMPLETE');
  const lastAtDecl = Date.parse(window.last_primary_trade_utc_at_declaration ?? ''); if (!Number.isFinite(lastAtDecl)) problems.push('LAST_PRIMARY_TRADE_AT_DECLARATION_MISSING');
  if (Number.isFinite(start) && Number.isFinite(lastAtDecl) && start <= lastAtDecl) problems.push('START_NOT_AFTER_LAST_PRIMARY_TRADE');
  if (Number.isFinite(start) && Number.isFinite(declaredAt) && primaryTrades.some((t) => { const d = Date.parse(t.decision_time_utc); return d >= start && d < declaredAt; })) problems.push('DISCOVERY_DATA_RELABELLED_AS_VALIDATION');
  if (Number.isFinite(declaredAt) && Number.isFinite(lastAtDecl) && primaryTrades.some((t) => { const d = Date.parse(t.decision_time_utc); return d < declaredAt && d > lastAtDecl; })) problems.push('PRIMARY_TRADES_AFTER_DECLARED_BOUNDARY');
  if (stage12dStatus === STAGE12D_STATUS.INSUFFICIENT_EVIDENCE) problems.push('PRIMARY_12D_STILL_INSUFFICIENT');
  return { declared: problems.length === 0, problems, start_utc: window.validation_start_utc };
}

/** Stage 11C candidates through the frozen shadow evaluator (registry integrity first). */
export function evaluateShadowCandidates({ shadowDir, nowSec = Date.now() / 1000 }) {
  let registry; try { registry = verifyFrozenRegistry(); } catch (err) { return { registry: { ok: false, error: err.message }, candidates: {} }; }
  const hashes = registryHashes();
  const roleOf = (id) => (id === 'SC2_PRODUCTION_SIGNAL_v1' ? 'CROSS_CHECK_OF_PRODUCTION_SIGNALS (same signals as the DEMO validator; not an independent dataset)' : 'OWN_HYPOTHESIS (non-production candidate; validates itself under its frozen gates)');
  if (!shadowDir || !existsSync(shadowDir)) return { registry: { ok: true, frozen_at: registry.frozen_at, hashes }, candidates: Object.fromEntries(CANDIDATES.map((c) => [c.id, { candidate_id: c.id, status: 'COLLECTING', forward_observations: 0, note: 'shadow store not found', frozen_hash: hashes[c.id], gate: SHADOW_GATES[c.id], independent_of_demo: c.id === 'SC1_SILVER_LEAD_v1', role: roleOf(c.id) }])) };
  const store = createEvidenceStore({ dir: shadowDir }); const obs = store.readAll('observations'); const outs = store.readAll('outcomes');
  const byProv = {}; for (const o of obs) byProv[o.provenance] = (byProv[o.provenance] ?? 0) + 1;
  const versionMismatch = obs.filter((o) => o.candidate_id && CANDIDATES.some((c) => c.id === o.candidate_id) && o.candidate_version != null && o.candidate_version !== CANDIDATES.find((c) => c.id === o.candidate_id).version).length;
  const candidates = Object.fromEntries(CANDIDATES.map((c) => { const e = evaluateCandidate(c.id, obs, outs, { nowSec }); return [c.id, { ...e, frozen_hash: hashes[c.id], gate: SHADOW_GATES[c.id], independent_of_demo: c.id === 'SC1_SILVER_LEAD_v1', role: roleOf(c.id) }]; }));
  return { registry: { ok: true, frozen_at: registry.frozen_at, hashes }, store: { observations_by_provenance: byProv, malformed_lines: store.stats().malformed_lines, candidate_version_mismatches: versionMismatch }, candidates };
}

export function buildStage12E({ stage12d, demo, shadowDir, nowSec = Date.now() / 1000, windowPath = DEFAULT_WINDOW_PATH }) {
  const window = loadValidationWindow(windowPath);
  const startMs = window?.status === 'DECLARED' && window.validation_start_utc ? Date.parse(window.validation_start_utc) : null;
  const allEligible = (demo?.trades ?? []).filter((t) => t.gate_eligible);
  const primaryTrades = allEligible.filter((t) => !Number.isFinite(startMs) || Date.parse(t.decision_time_utc) < startMs);
  const decl = checkWindowDeclaration(window, { primaryTrades: allEligible, stage12dStatus: stage12d?.status });
  const shadow = evaluateShadowCandidates({ shadowDir, nowSec });
  let status = STAGE12E_STATUS.NOT_ELIGIBLE_YET; let independent = null; let reason = decl.problems.join(',') || 'window declared';
  if (decl.declared) {
    const start = Date.parse(decl.start_utc);
    const indTrades = (demo?.trades ?? []).filter((t) => t.gate_eligible && Date.parse(t.decision_time_utc) >= start);
    independent = evaluateDataset({ label: 'INDEPENDENT_VALIDATION', trades: indTrades, executions: (demo?.executions ?? []).filter((e) => e.provenance === 'FORWARD_LIVE_DEMO' && Date.parse(e.event_time_utc) >= start), blocked_signals: (demo?.blocked_signals ?? []).filter((b) => Date.parse(b.decision_time_utc) >= start), nowSec });
    if (!independent.evidence_complete) { status = STAGE12E_STATUS.RUNNING; reason = 'independent window declared; minimums not yet met'; }
    else { status = independent.all_gates_pass && independent.status === STAGE12D_STATUS.EDGE_SUPPORTED ? STAGE12E_STATUS.SUPPORTED : STAGE12E_STATUS.FAILED; reason = independent.status_reason; }
  }
  const recommendations = status === STAGE12E_STATUS.FAILED ? ['do not alter the production strategy automatically', 'open a NEW research premise with a new frozen candidate id; never retune the failed rule on the validation data', 'keep collecting forward evidence under the unchanged fingerprint'] : [];
  return { stage: '12E', rule_version: EVALUATION_RULE_VERSION, generated_at: new Date(nowSec * 1000).toISOString(), independence_rule: INDEPENDENCE, datasets: { primary_forward_evidence: { label: 'DEVELOPMENT / PRIMARY FORWARD EVIDENCE', source: 'FORWARD_LIVE_DEMO trades since validator start', trades: primaryTrades.length, stage12d_status: stage12d?.status ?? null }, independent_validation_evidence: { label: 'INDEPENDENT VALIDATION EVIDENCE', window, declaration: decl, trades: independent?.counts?.completed ?? 0 } }, independent_evaluation: independent, shadow_candidates: shadow, status, status_reason: reason, recommendations, note: 'SC2 shares its signals with the DEMO validator and cannot serve as independent validation of the production strategy; SC1 is a separate hypothesis with its own frozen gates.' };
}
