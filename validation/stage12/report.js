/**
 * STAGE 12 D/E/F — READ-ONLY REPORT CLI.
 *   npm run xauusd:stage12:report            human-readable
 *   npm run xauusd:stage12:report -- --json  full JSON
 *   ... --out <dir>                          also writes stage12_gate_report.json/.md into <dir> (nowhere else)
 *   ... --demo-dir <dir> --shadow-dir <dir> --real-log <file> --now <iso>
 * It NEVER trades, restarts, modifies strategy, resets state, changes the breaker or the lot, or enables scaling.
 * It only reads evidence files and writes (optionally) its own report files.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadDemoEvidence, loadRealAuditEvidence, readJsonl } from './evidence.js';
import { buildStage12D } from './edge.js';
import { buildStage12E, loadValidationWindow, DEFAULT_WINDOW_PATH } from './independent.js';
import { buildStage12F } from './capital.js';
import { EVALUATION_RULE_VERSION, RULES_FROZEN_AT, MINIMUMS, ROBUSTNESS, COST_SCENARIOS, RESAMPLING, ruleFingerprintInputs } from './rules.js';
import { canonicalJson } from '../../src/engine/strategyFingerprint.js';
import { createHash } from 'node:crypto';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DEFAULTS = Object.freeze({ demoDir: join(REPO_ROOT, 'state', 'demo_forward'), shadowDir: join(REPO_ROOT, 'state', 'shadow'), realLog: join(REPO_ROOT, 'state', 'xauusd_mt5_real_trade_log.jsonl') });
export const ruleFingerprint = () => createHash('sha256').update(canonicalJson(ruleFingerprintInputs())).digest('hex');

function gitHead() { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, timeout: 10_000 }).trim(); } catch { return null; } }
async function strategyFingerprintInfo() { try { const m = await import('../../src/engine/strategyFingerprint.js'); const v = m.verifyStrategyFingerprint(); return { ok: v.ok, frozen_version: v.frozen?.version ?? null, fingerprint: v.current?.strategy_fingerprint ?? null, changed: v.changed ?? [] }; } catch (err) { return { ok: null, error: err.message }; } }
function lastRealAccount(realLog) { const { rows } = readJsonl(realLog); const st = [...rows].reverse().find((r) => r.r?.type === 'STARTED'); return st ? { account: st.r.account ?? null, symbol_spec: st.r.symbol_spec ?? null, at: st.r.timestamp } : { account: null, symbol_spec: null, at: null }; }

export async function buildStage12Report({ demoDir = DEFAULTS.demoDir, shadowDir = DEFAULTS.shadowDir, realLog = DEFAULTS.realLog, nowSec = Date.now() / 1000, windowPath, includeReal = true } = {}) {
  const fp = await strategyFingerprintInfo();
  const demo = loadDemoEvidence({ dir: demoDir, nowSec });
  const real = includeReal ? loadRealAuditEvidence({ path: realLog, nowSec }) : null;
  const window = loadValidationWindow(windowPath ?? DEFAULT_WINDOW_PATH);
  const stage12d = buildStage12D({ demo, real, nowSec, strategyFingerprint: fp.fingerprint, validationStartUtc: window?.status === 'DECLARED' ? window.validation_start_utc : null });
  const stage12e = buildStage12E({ stage12d, demo, shadowDir, nowSec, windowPath });
  const acct = includeReal ? lastRealAccount(realLog) : { account: null, symbol_spec: null };
  const market = acct.symbol_spec ? { bid: acct.symbol_spec.bid, ask: acct.symbol_spec.ask, spread_price: acct.symbol_spec.spread != null && acct.symbol_spec.point != null ? acct.symbol_spec.spread * acct.symbol_spec.point : 0.26 } : null;
  const stage12f = buildStage12F({ stage12d, stage12e, trades: demo.trades.filter((t) => t.gate_eligible), account: acct.account, market, fingerprintOk: fp.ok, unresolvedP0: 0, nowSec });
  const waiting = stage12d.status === 'INSUFFICIENT_EVIDENCE';
  return {
    generated_at: new Date(nowSec * 1000).toISOString(), read_only: true,
    version_links: { evaluation_rule_version: EVALUATION_RULE_VERSION, rules_frozen_at: RULES_FROZEN_AT, rule_fingerprint: ruleFingerprint(), strategy_fingerprint: fp.fingerprint, strategy_fingerprint_ok: fp.ok, strategy_frozen_version: fp.frozen_version, git_commit: gitHead(), evidence_schema_versions: { demo: 'demo-forward-1.0', shadow: 'shadow-1.0' }, candidate_hashes: stage12e.shadow_candidates?.registry?.hashes ?? null, account_class_primary: 'DEMO', symbol: 'XAUUSDm', timeframe: '5m (intraday_5m profile)' },
    sources: { demo_dir: demoDir, shadow_dir: shadowDir, real_log: includeReal ? realLog : null },
    frozen_rules: { minimums: MINIMUMS, robustness: ROBUSTNESS, cost_scenarios: COST_SCENARIOS, resampling: RESAMPLING },
    stage12d, stage12e, stage12f,
    summary: {
      STAGE12D_STATUS: waiting ? 'WAITING_FOR_FORWARD_EVIDENCE' : stage12d.status, STAGE12D_DETAIL: stage12d.status, STAGE12E_STATUS: stage12e.status, STAGE12F_STATUS: stage12f.status === 'ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW' ? stage12f.status : 'CAPITAL_SCALING_NOT_READY', STAGE12F_DETAIL: stage12f.status,
      EDGE_DEMONSTRATED: stage12d.edge_demonstrated ? 'YES' : 'NO', CAPITAL_SCALING_READY: 'NO', OWNER_CAPITAL_REVIEW_ELIGIBLE: stage12f.owner_capital_review_eligible ? 'YES' : 'NO',
      forward_completed_trades: stage12d.primary.counts.completed, forward_sessions: stage12d.primary.counts.sessions, forward_calendar_days: stage12d.primary.counts.calendar_days_since_first, model_families_observed: stage12d.primary.counts.models_covered,
      expectancy_r: stage12d.primary.expectancy.point_estimate_r, expectancy_ci95: stage12d.primary.expectancy.ci95 ? [stage12d.primary.expectancy.ci95.lower, stage12d.primary.expectancy.ci95.upper] : null, profit_factor: stage12d.primary.profit_factor.value, profit_factor_status: stage12d.primary.profit_factor.status, max_drawdown_r: stage12d.primary.drawdown.max_drawdown_r,
      top_winner_dependence: stage12d.primary.winner_dependence, cost_stress: stage12d.primary.cost_scenarios.find((c) => c.gate) ?? null, integrity_ok: stage12d.integrity.ok, pine_parity_limitation: stage12d.primary.pine_parity.disclosure,
      supplementary_real_completed_trades: stage12d.supplementary_real?.counts?.completed ?? 0,
    },
  };
}

export function formatStage12Report(rep) {
  const s = rep.summary; const d = rep.stage12d.primary; const L = [];
  L.push(`STAGE 12 D/E/F REPORT ${rep.generated_at} (rule ${rep.version_links.evaluation_rule_version}, strategy ${rep.version_links.strategy_fingerprint?.slice(0, 16)} ok=${rep.version_links.strategy_fingerprint_ok}, git ${rep.version_links.git_commit?.slice(0, 12)}) READ-ONLY`);
  L.push(`12D ${s.STAGE12D_STATUS} (${s.STAGE12D_DETAIL}) | 12E ${s.STAGE12E_STATUS} | 12F ${s.STAGE12F_STATUS} (${s.STAGE12F_DETAIL})`);
  L.push(`EDGE_DEMONSTRATED=${s.EDGE_DEMONSTRATED} CAPITAL_SCALING_READY=${s.CAPITAL_SCALING_READY} OWNER_CAPITAL_REVIEW_ELIGIBLE=${s.OWNER_CAPITAL_REVIEW_ELIGIBLE}`);
  L.push(`accepted evidence: gate-eligible ${rep.stage12d.accepted_evidence.gate_eligible_trades} trades (${JSON.stringify(rep.stage12d.accepted_evidence.demo_trades_by_provenance)}); excluded non-forward ${rep.stage12d.accepted_evidence.excluded_non_forward_trades}; integrity ok=${rep.stage12d.integrity.ok} quarantined demo=${rep.stage12d.integrity.demo?.quarantined_count ?? 0} malformed=${rep.stage12d.integrity.demo?.malformed_count ?? 0}`);
  L.push(`minimums: ${Object.entries(d.minimums).map(([k, v]) => `${k}=${v.value}/${v.min}${v.ok ? '✓' : '✗'}`).join(' ')}`);
  L.push(`expectancy R=${d.expectancy.point_estimate_r ?? 'NOT_AVAILABLE'} CI95=${d.expectancy.ci95 ? `[${d.expectancy.ci95.lower},${d.expectancy.ci95.upper}]` : 'NOT_AVAILABLE'} point_positive=${d.expectancy.point_estimate_positive} statistically_supported=${d.expectancy.statistically_supported} PF=${d.profit_factor.value ?? d.profit_factor.status} maxDD_R=${d.drawdown.max_drawdown_r ?? 'NOT_AVAILABLE'} maxDD_USD=${d.drawdown.max_drawdown_usd ?? 'NOT_AVAILABLE'}`);
  L.push(`gates: ${Object.entries(d.gates).map(([k, v]) => `${k}=${v.ok === true ? 'PASS' : v.ok === false ? 'FAIL' : String(v.ok ?? 'NOT_AVAILABLE')}`).join(' ')}`);
  L.push(`cost scenarios: ${d.cost_scenarios.map((c) => `${c.id}:meanR=${c.mean_r ?? 'NA'}`).join(' ')} | winner dependence: ${d.winner_dependence.map((w) => `top${w.removed_top}:meanR=${w.mean ?? w.status}`).join(' ')}`);
  L.push(`models: ${d.models.map((m) => `${m.key}(n=${m.n},meanR=${m.mean},PF=${m.profit_factor})`).join(' ') || 'none'} | blocked: ${d.blocked_signal_reasons.map((b) => `${b.reason}=${b.n}`).join(' ') || 'none'}`);
  L.push(`pine parity: read=${d.pine_parity.reference_read} unavailable=${d.pine_parity.reference_unavailable} unknown=${d.pine_parity.unknown} -- ${d.pine_parity.disclosure}`);
  if (rep.stage12d.supplementary_real) { const r = rep.stage12d.supplementary_real; L.push(`SUPPLEMENTARY REAL (never mixed, never gate-eligible): completed=${r.counts.completed} meanR=${r.expectancy.point_estimate_r} netUSD=${r.usd_summary.net ?? 'NA'} exits=${r.exit_reasons.map((e) => `${e.reason}=${e.n}`).join(',')}`); }
  const sc = rep.stage12e.shadow_candidates?.candidates ?? {}; L.push(`12E window: ${rep.stage12e.datasets.independent_validation_evidence.window.status} (${rep.stage12e.status_reason}); SC1 ${sc.SC1_SILVER_LEAD_v1?.status} fwd_obs=${sc.SC1_SILVER_LEAD_v1?.forward_observations ?? 0}; SC2 ${sc.SC2_PRODUCTION_SIGNAL_v1?.status} fwd_obs=${sc.SC2_PRODUCTION_SIGNAL_v1?.forward_observations ?? 0}; registry ok=${rep.stage12e.shadow_candidates?.registry?.ok}`);
  L.push(`12F prerequisites missing: ${rep.stage12f.missing_prerequisites.join(',') || 'none'}; policy: lot ${rep.stage12f.current_capital_policy.real_lot} ${rep.stage12f.current_capital_policy.lot_authority} scaling ${rep.stage12f.current_capital_policy.auto_scaling}`);
  L.push(rep.stage12f.hard_rule);
  return L.join('\n');
}

export function markdownStage12Report(rep) {
  const s = rep.summary; const d = rep.stage12d.primary; const row = (k, v) => `| ${k} | ${v} |`;
  const lines = ['# Stage 12 D/E/F gate report', '', `Generated ${rep.generated_at} — READ-ONLY — rule ${rep.version_links.evaluation_rule_version} (frozen ${rep.version_links.rules_frozen_at}) — strategy fingerprint ${rep.version_links.strategy_fingerprint} (ok=${rep.version_links.strategy_fingerprint_ok}) — git ${rep.version_links.git_commit}`, '', '| Field | Value |', '|---|---|'];
  for (const [k, v] of Object.entries(s)) if (typeof v !== 'object' || v === null) lines.push(row(k, v));
  lines.push(row('expectancy_ci95', JSON.stringify(s.expectancy_ci95)), row('cost_stress', JSON.stringify(s.cost_stress)), row('top_winner_dependence', JSON.stringify(s.top_winner_dependence)));
  lines.push('', '## Minimums (frozen)', '', '| Gate | Value | Minimum | OK |', '|---|---|---|---|'); for (const [k, v] of Object.entries(d.minimums)) lines.push(`| ${k} | ${v.value} | ${v.min} | ${v.ok} |`);
  lines.push('', '## Robustness gates', '', '| Gate | Result |', '|---|---|'); for (const [k, v] of Object.entries(d.gates)) lines.push(`| ${k} | ${JSON.stringify(v)} |`);
  lines.push('', '## Pine parity disclosure', '', d.pine_parity.disclosure, '', '## Stage 12E', '', `Status: ${rep.stage12e.status} (${rep.stage12e.status_reason}). Window: ${JSON.stringify(rep.stage12e.datasets.independent_validation_evidence.window)}`, '', `Candidates: ${JSON.stringify(Object.fromEntries(Object.entries(rep.stage12e.shadow_candidates?.candidates ?? {}).map(([k, v]) => [k, { status: v.status, forward_observations: v.forward_observations, sessions: v.sessions, calendar_days: v.calendar_days }])))}`, '', '## Stage 12F', '', `Status: ${rep.stage12f.status}. Missing prerequisites: ${rep.stage12f.missing_prerequisites.join(', ') || 'none'}.`, '', rep.stage12f.hard_rule, '');
  return lines.join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2); const arg = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
  const nowSec = arg('--now') ? Date.parse(arg('--now')) / 1000 : Date.now() / 1000;
  buildStage12Report({ demoDir: arg('--demo-dir') ?? DEFAULTS.demoDir, shadowDir: arg('--shadow-dir') ?? DEFAULTS.shadowDir, realLog: arg('--real-log') ?? DEFAULTS.realLog, nowSec }).then((rep) => {
    if (arg('--out')) { const out = arg('--out'); mkdirSync(out, { recursive: true }); writeFileSync(join(out, 'stage12_gate_report.json'), JSON.stringify(rep, null, 1)); writeFileSync(join(out, 'stage12_gate_report.md'), markdownStage12Report(rep)); }
    console.log(args.includes('--json') ? JSON.stringify(rep, null, 1) : formatStage12Report(rep));
  }).catch((err) => { console.error(`stage12 report failed: ${err.stack ?? err.message}`); process.exitCode = 1; });
}
void existsSync; void readFileSync;
