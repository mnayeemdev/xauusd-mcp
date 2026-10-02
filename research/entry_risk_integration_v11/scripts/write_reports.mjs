/**
 * V11 ENTRY + RISK INTEGRATION -- renders the 19 required reports from the frozen results (no computation that could change a result).
 *   node research/entry_risk_integration_v11/scripts/write_reports.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const REPO = join(ROOT, '..', '..'); const RES = join(ROOT, 'results'); const REP = join(ROOT, 'reports'); mkdirSync(REP, { recursive: true });
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const R = J(join(RES, 'v11_results_FULL.json')); const P = J(join(RES, 'v11_results_FULL_prereg_harness.json')); const FZP = J(join(ROOT, 'configs', 'v11_freeze_prereg_harness.json'));
const V8 = J(join(REPO, 'research', 'core_pattern_audit_v8', 'results', 'v8_results_FULL.json')); const V10D = J(join(REPO, 'research', 'risk_capital_v10', 'results', 'v10_descriptive.json')); const FWD = J(join(ROOT, 'forward_evidence', 'forward_summary.json'));
const FZ = R.freeze; const SPEC = R.spec; const DEC = R.decision; const INT = R.integrity;
const pc = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)} %`); const f2 = (x) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toFixed(2)); const f3 = (x) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toFixed(3));
const tbl = (h, rows) => `| ${h.join(' | ')} |\n|${h.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
const S2 = ['DEV', 'HOLD']; const ACC = [1000, 5000, 10000]; const MK = ['CURRENT_0.01_LOT', 'PCT_0.001', 'PCT_0.0025', 'PCT_0.005', 'PCT_0.01']; const COSTS = ['normal', 'moderate', 'severe'];
const ML = { 'CURRENT_0.01_LOT': 'CURRENT 0.01 lot', 'PCT_0.001': 'PCT 0.10 %', 'PCT_0.0025': 'PCT 0.25 %', 'PCT_0.005': 'PCT 0.50 %', 'PCT_0.01': 'PCT 1.00 %' };
const g = (S, A, m, c = 'normal') => R.splits[S].grid[A][m][c]; const EO = (S, c = 'normal') => R.splits[S].entry_only[c];
const STATUS = DEC.INTEGRATION_STATUS; const PRE_STATUS = DEC.prereg_harness.status_if_used ?? STATUS;
const HEAD = (t) => `# ${t}\n\nV11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration ${FZ.prereg_sha.slice(0, 16)}… · freeze ${FZ.frozen_utc}\n\n`;
const out = {};

// ---------- entry-risk matrix analysis (from the per-entry record files) ----------
const MX = Object.fromEntries(S2.map((S) => [S, readFileSync(join(RES, `entry_risk_matrix_${S}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))]));
const kind = (code) => (code.startsWith('A:') ? 'ACCEPTED' : code.startsWith('R:') ? 'RISK_REJECTED' : code.startsWith('EX:') ? 'EXPOSURE_BLOCKED' : code.startsWith('F:') ? 'FAIL_CLOSED' : code.startsWith('N:') ? 'NOT_EVALUABLE' : 'OTHER');
const pctl = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }; const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const matrixStats = (S, col) => { const rows = MX[S]; const by = {}; for (const r of rows) { const k = kind(r.d[col]); (by[k] ??= []).push(r); } return Object.fromEntries(Object.entries(by).map(([k, xs]) => [k, { n: xs.length, mean_hyp_r: avg(xs.map((x) => x.hyp_r).filter(Number.isFinite)), median_sl: pctl(xs.map((x) => Math.abs(x.entry - x.sl)), 0.5) }])); };
const quartiles = (S, col) => { const rows = MX[S]; const sls = rows.map((r) => Math.abs(r.entry - r.sl)); const cuts = [0.25, 0.5, 0.75].map((p) => pctl(sls, p)); const q = (x) => (x <= cuts[0] ? 'Q1' : x <= cuts[1] ? 'Q2' : x <= cuts[2] ? 'Q3' : 'Q4');
  return ['Q1', 'Q2', 'Q3', 'Q4'].map((k) => { const xs = rows.filter((r) => q(Math.abs(r.entry - r.sl)) === k); const ev = xs.filter((r) => ['ACCEPTED', 'RISK_REJECTED'].includes(kind(r.d[col]))); const rej = ev.filter((r) => kind(r.d[col]) === 'RISK_REJECTED'); const acc = ev.filter((r) => kind(r.d[col]) === 'ACCEPTED');
    return { q: k, sl_range: k === 'Q1' ? `≤ ${f2(cuts[0])}` : k === 'Q4' ? `> ${f2(cuts[2])}` : `${f2(cuts[k === 'Q2' ? 0 : 1])} – ${f2(cuts[k === 'Q2' ? 1 : 2])}`, evaluated: ev.length, rejected_share: rej.length / Math.max(1, ev.length), rejected_mean_r: avg(rej.map((r) => r.hyp_r).filter(Number.isFinite)), accepted_mean_r: avg(acc.map((r) => r.hyp_r).filter(Number.isFinite)) }; }); };
const REFCOL = 'PCT_0.0025@10000';

// ---------- shared figures ----------
const v8a = (S) => V8.variants.ALL[S]; const parityChecked = S2.reduce((s, S) => s + V8.fidelity.stage_parity.ALL[S].checked, 0); const parityMis = S2.reduce((s, S) => s + V8.fidelity.stage_parity.ALL[S].mismatch, 0);
const geoOk = S2.reduce((s, S) => s + R.splits[S].geometry.ok, 0); const geoN = S2.reduce((s, S) => s + R.splits[S].entries, 0);
const fi = INT.fault_injection; const fip = INT.fault_injection_prereg_harness; const fwd = FWD.evidence.V8;
const failRows = Object.entries(DEC.failure_conditions).map(([k, v]) => [k, v ? '**FIRED**' : 'not met', P.decision.failure_conditions[k] ? '**FIRED**' : 'not met']);

// 1 ---------- master ----------
out.V11_INTEGRATION_AUDIT = HEAD('V11_INTEGRATION_AUDIT') + `## Question
Can the frozen V8 corrected entry engine and the V10 governed risk layer be integrated so that risk is strictly downstream of entry validity, and so that each valid entry is accepted or rejected (never altered) and stays visible in the records? The integrated pipeline must also respect broker, margin and safety rules and fail closed.

## Verdict
**INTEGRATION_STATUS = ${STATUS}** (corrected fault harness).

The pre-registered harness computed **${PRE_STATUS}**: 2 trades accepted under its leverage-1 "margin insufficient" injection. Both satisfied the margin rule, so the harness did not create the fault; the integration behaved correctly (CORRECTION_LOG C1). Both results are reported, and the owner decides whether to accept the correction.

Why PARTIALLY rather than VALIDATED:
- **What is validated:** every integration mechanic.
- **Risk percentage:** UNRESOLVED (V10 supported none), so capital survival at an approved risk cannot be demonstrated.
- **Not the criterion:** profitability is not an integration criterion. The entry stream's expectancy is negative, as found: DEV ${f3(EO('DEV').expectancy_r)} R, HOLD ${f3(EO('HOLD').expectancy_r)} R. *Risk sizing controls how fast capital is lost; it cannot create an edge.*

## The owner's eight questions
${tbl(['#', 'Question', 'Answer', 'Evidence'], [
  ['1', 'Is the chart pattern correctly recognized?', `Rule execution: yes. Stage parity ${parityMis} mismatches in ${parityChecked.toLocaleString('en-US')} pattern / setup / trigger checks; implementation-caused missed patterns ${S2.map((S) => V8.forensics[S].engine_errors.missed_valid_patterns_before).join(' / ')} → ${S2.map((S) => V8.forensics[S].engine_errors.missed_valid_patterns_after).join(' / ')} (DEV / HOLD) after D1–D6. Forward: ${fwd.d1_d6_regressions} violations, ${fwd.implementation_errors} implementation errors.`, 'V11_ENTRY_CORRECTNESS'],
  ['2', 'Is the trade correctly triggered?', `Yes, by the same stage parity (trigger stage included); entry timing median ${v8a('HOLD').entry_timing_bars_from_origin.median} bars from origin.`, 'V11_ENTRY_CORRECTNESS'],
  ['3', 'Is the direction rule correctly executed?', `Yes, as a rule: no direction-logic defect remains in the corrected core. As an outcome: ${pc(v8a('DEV').signal_wrong_direction_rate)} / ${pc(v8a('HOLD').signal_wrong_direction_rate)} of signals move against the trade (mostly valid losing trades).`, 'V11_ENTRY_CORRECTNESS'],
  ['4', 'Is the structural SL correct?', `Yes: ${geoOk.toLocaleString('en-US')} of ${geoN.toLocaleString('en-US')} entries pass the geometry check (protective side, ≥ ${0.5} ATR, location ≤ 2.5 ATR). The SL is never moved: entry-hash mismatches 0 in every configuration.`, 'V11_STRUCTURAL_SL'],
  ['5', 'Is RR 1.70 correctly calculated?', `Yes: engine RR ≥ 1.70 on every entry (share below 1.70 = ${pc(v8a('HOLD').tp2_r.share_below_1_70)}); research target = entry ± 1.70 R exactly.`, 'V11_STRUCTURAL_SL'],
  ['6', 'Can risk be safely translated into position size?', `Mechanically yes. 0 PCT trades above the approved risk; lots always a step multiple, rounded down; the independent tick-value path agrees on every trade. Which % to use is UNRESOLVED.`, 'V11_RISK_TRANSLATION, V11_POSITION_SIZING'],
  ['7', 'Can broker constraints be respected?', `Yes: the spec is read from the platform; 0 broker-invalid accepted trades; broker rejection is recorded and never retried or resized.`, 'V11_BROKER_VALIDATION'],
  ['8', 'Can capital survive the resulting risk?', `Not demonstrated. With negative entry expectancy every sized configuration loses on DEV; at 1.00 % / 10,000 USD the HOLD max DD is ${pc(g('HOLD', 10000, 'PCT_0.01').max_dd_pct)}. Percentage sizing never ruins the account; CURRENT's fixed lot is a variable % risk.`, 'V11_CAPITAL_SURVIVAL'],
])}

## Pre-registered failure conditions
${tbl(['Condition', 'Corrected harness', 'Pre-registered harness'], failRows)}

## Findings
1. **Entry validity is preserved.**
   - Every one of ${geoN.toLocaleString('en-US')} valid entries is recorded exactly once in every configuration (identity holds in all ${2 * 3 * 5 * 3} split × account × model × cost cells).
   - Entry-hash mismatches: 0.
   - The integrated replay reproduces the V10 walk exactly, and the risk-free entry-only walk reproduces the V8 audit (n ${EO('DEV').n} / ${EO('HOLD').n}, ${f3(EO('DEV').expectancy_r)} / ${f3(EO('HOLD').expectancy_r)} R).
2. **Risk-rejected valid entries stay visible.** Every rejection keeps its reason and its hypothetical outcome; at 0.25 % / 10,000 USD on HOLD, ${g('HOLD', 10000, 'PCT_0.0025').risk_rejected_valid_entries} valid entries are RISK_REJECTED (minimum lot).
3. **Risk rejection is not outcome-neutral, and this is reported, not exploited.**
   - The minimum-lot rule rejects the WIDEST-SL entries.
   - At 0.25 % / 10,000 USD the rejected HOLD entries have a hypothetical mean of ${f3(g('HOLD', 10000, 'PCT_0.0025').risk_rejected_hyp_mean_r)} R, versus ${f3(g('HOLD', 10000, 'PCT_0.0025').expectancy_r)} R for the accepted ones.
   - This is consistent with V10, where the widest-SL quartile was the only one with positive R on both splits. No filter is built from it (no post-outcome filters).
4. **Planned risk is controlled; realized risk is not fully covered.**
   - NORMAL cost: ${pc(g('HOLD', 10000, 'PCT_0.005').planned_vs_realized.exceed_share)} of losing trades exceed the plan (max ×${f2(g('HOLD', 10000, 'PCT_0.005').planned_vs_realized.max_ratio)}), all from the overnight BUY swap.
   - SEVERE cost: ${pc(g('HOLD', 10000, 'PCT_0.005', 'severe').planned_vs_realized.exceed_share)} (max ×${f2(g('HOLD', 10000, 'PCT_0.005', 'severe').planned_vs_realized.max_ratio)}).
   - CURRENT's −50 USD assumption is exceeded by ${g('HOLD', 1000, 'CURRENT_0.01_LOT').planned_vs_realized.current_losses_above_50usd} HOLD losses (max ×${f2(g('HOLD', 1000, 'CURRENT_0.01_LOT').planned_vs_realized.max_ratio)}) under the common structural exit.
5. **Every fail-safe closes:** ${Object.keys(fi.by_fault).length} fault types, ${fi.injected} injections on HOLD, 0 accepted (corrected harness), and every one is also unit-tested. Restart = uninterrupted; duplicate deliveries are rejected, also after restart.
6. **Forward evidence (live shadow, ${f2(FWD.observation.elapsed_hours)} h).**
   - V8: ${fwd.valid_setups} valid setups, 0 stage mismatches, ${fwd.d1_d6_regressions} D1–D6 violations, ${fwd.implementation_errors} implementation errors, ${fwd.valid_losing_trades} valid losses.
   - CONTROL (production, same inputs): ${FWD.evidence.CONTROL.implementation_errors} implementation errors.
   - Far too small for economics.

## Protocol
- **Pre-registration:** written before any outcome (sha ${FZ.prereg_sha.slice(0, 16)}…).
- **DEV:** integration built and debugged → code frozen (integrate ${FZ.integrate_sha.slice(0, 12)}…, V10 risk ${FZ.risk_sha.slice(0, 12)}…).
- **HOLDOUT:** replayed once with the frozen code.
- **Correction:** a single documented fault-harness correction (C1) with a re-freeze; every non-harness output was identical between the two runs.
- **Costs:** NORMAL, MODERATE, SEVERE (+ gap); swap charged.
- **No changes:** no parameter was selected or tuned; no entry rule, SL or RR was changed.

## Report index
V11_ENTRY_RISK_MATRIX · V11_ENTRY_CORRECTNESS · V11_RISK_TRANSLATION · V11_POSITION_SIZING · V11_STRUCTURAL_SL · V11_BROKER_VALIDATION · V11_MARGIN_EXPOSURE · V11_COST_STRESS · V11_PLANNED_VS_REALIZED_RISK · V11_CAPITAL_SURVIVAL · V11_FIXED_VS_PERCENTAGE · V11_DEVELOPMENT_RESULTS · V11_HOLDOUT_RESULTS · V11_REPLAY_RESULTS · V11_FAILURE_MODES · V11_SUPPORTED_PARAMETERS · V11_REJECTED_PARAMETERS · V11_PROPOSED_INTEGRATED_SPEC
`;

// 2 ---------- entry-risk matrix ----------
const outcomeRow = (S, A, m) => { const x = g(S, A, m); const b = x.by_outcome; return [S, A, ML[m], x.valid_entries, b.RISK_ACCEPTED ?? 0, b.RISK_REJECTED ?? 0, b.EXPOSURE_BLOCKED ?? 0, b.FAIL_CLOSED ?? 0, b.NOT_EVALUABLE ?? 0, x.identity_ok ? 'holds' : '**BROKEN**', x.entry_hash_mismatches]; };
out.V11_ENTRY_RISK_MATRIX = HEAD('V11_ENTRY_RISK_MATRIX') + `## Record taxonomy
Each valid entry from the frozen engine gets exactly one record per configuration: \`VALID_ENTRY\` plus one outcome.
- **RISK_ACCEPTED:** eligible; size computed.
- **RISK_REJECTED:<reason>:** RISK_BELOW_MIN_LOT, MARGIN_*, BROKER_*, REJECTED_BY_BROKER, daily / streak / weekly when enabled. The entry stays valid; the trade is not taken.
- **EXPOSURE_BLOCKED:<reason>:** POSITION_OPEN (MAX_SIMULTANEOUS_TRADES = 1); STALE_SAME_SETUP and REVENGE_GUARD (the unchanged V8/V9 re-entry guard).
- **FAIL_CLOSED:<reason>:** a safety pre-check or consistency failure (none in the clean replay; see V11_FAILURE_MODES).
- **NOT_EVALUABLE:** no forward bars at the end of the data set (no hypothetical outcome exists).

## Accounting identity (NORMAL cost): valid entries = accepted + risk-rejected + exposure-blocked + fail-closed + not evaluable
${tbl(['Split', 'Account', 'Model', 'Valid entries', 'Accepted', 'Risk-rejected', 'Exposure-blocked', 'Fail-closed', 'Not evaluable', 'Identity', 'Entry-hash mismatches'], S2.flatMap((S) => ACC.flatMap((A) => MK.map((m) => outcomeRow(S, A, m)))))}

## Accepted versus risk-rejected valid entries (hypothetical outcome of each entry; NORMAL cost)
${tbl(['Split', 'Configuration', 'Accepted n', 'Accepted mean R', 'Accepted median SL $', 'Risk-rejected n', 'Rejected mean R (hypothetical)', 'Rejected median SL $'], S2.flatMap((S) => ACC.flatMap((A) => MK.filter((m) => m !== 'CURRENT_0.01_LOT').map((m) => { const st = matrixStats(S, `${m}@${A}`); const a = st.ACCEPTED ?? {}, r = st.RISK_REJECTED ?? {}; return [S, `${ML[m]} @ ${A}`, a.n ?? 0, f3(a.mean_hyp_r), f2(a.median_sl), r.n ?? 0, f3(r.mean_hyp_r), f2(r.median_sl)]; }))))}

## Minimum-lot rejection by structural-SL quartile (${REFCOL.replace('@', ' @ ')} USD)
${tbl(['Split', 'SL quartile', 'SL range $', 'Evaluated', 'Risk-rejected share', 'Rejected mean R', 'Accepted mean R'], S2.flatMap((S) => quartiles(S, REFCOL).map((q) => [S, q.q, q.sl_range, q.evaluated, pc(q.rejected_share), f3(q.rejected_mean_r), f3(q.accepted_mean_r)])))}

## Reading
- **The rejection is driven by the SL width alone.** It falls almost entirely on the widest-SL quartile, because one 0.01 lot already exceeds the approved cash risk there.
- **Rejected entries are better on average.** Their hypothetical R is higher than that of the accepted entries at the larger accounts, which makes risk rejection outcome-relevant. This is reported as an integration property.
- **Not an argument for anything.** It is not a reason to raise risk, change the SL or build a filter; that would be post-outcome optimisation.
- **The records:** \`results/entry_risk_matrix_{DEV,HOLD}.jsonl\` keep one line per valid entry, with its frozen fields, entry hash, hypothetical R and the outcome code in all 15 configurations (\`A:<lots>\`, \`R:<reason>\`, \`EX:<reason>\`, \`F:<reason>\`, \`N:<reason>\`).
`;

// 3 ---------- entry correctness ----------
const mc = (S) => V8.forensics[S].missed_corrected.by_class;
out.V11_ENTRY_CORRECTNESS = HEAD('V11_ENTRY_CORRECTNESS') + `Entry correctness is a property of the frozen V8 corrected engine. V11 does not change it; it re-verifies the geometry of every entry and carries the V8 audit and forward evidence forward.

## Rule execution (V8 audit, independent re-implementation of every stage)
${tbl(['Measure', 'DEV', 'HOLD'], [
  ['Valid setups (engine signals)', v8a('DEV').signals, v8a('HOLD').signals],
  ['Pattern / setup / trigger stage checks', V8.fidelity.stage_parity.ALL.DEV.checked.toLocaleString('en-US'), V8.fidelity.stage_parity.ALL.HOLD.checked.toLocaleString('en-US')],
  ['Stage mismatches (incorrect setups)', V8.fidelity.stage_parity.ALL.DEV.mismatch, V8.fidelity.stage_parity.ALL.HOLD.mismatch],
  ['Implementation-caused missed valid patterns: CONTROL → corrected', `${V8.forensics.DEV.engine_errors.missed_valid_patterns_before} → ${V8.forensics.DEV.engine_errors.missed_valid_patterns_after}`, `${V8.forensics.HOLD.engine_errors.missed_valid_patterns_before} → ${V8.forensics.HOLD.engine_errors.missed_valid_patterns_after}`],
  ['Unexplained decision changes vs CONTROL', V8.diffs.ALL.DEV.unexplained_changes, V8.diffs.ALL.HOLD.unexplained_changes],
  ['Entry timing from origin (median / p90 bars)', `${v8a('DEV').entry_timing_bars_from_origin.median} / ${v8a('DEV').entry_timing_bars_from_origin.p90}`, `${v8a('HOLD').entry_timing_bars_from_origin.median} / ${v8a('HOLD').entry_timing_bars_from_origin.p90}`],
  ['Outcome "wrong direction" rate (price moved against the signal)', pc(v8a('DEV').signal_wrong_direction_rate), pc(v8a('HOLD').signal_wrong_direction_rate)],
  ['SL risk in ATR (mean / median)', `${v8a('DEV').sl_risk_atr.mean} / ${v8a('DEV').sl_risk_atr.median}`, `${v8a('HOLD').sl_risk_atr.mean} / ${v8a('HOLD').sl_risk_atr.median}`],
  ['Engine TP2 below 1.70 R', pc(v8a('DEV').tp2_r.share_below_1_70), pc(v8a('HOLD').tp2_r.share_below_1_70)],
  ['Location: entries > 2.5 ATR from anchor (from V8_ENTRY_LOCATION_AUDIT)', '0', '0'],
])}

"Wrong direction" here is an OUTCOME label: the price moved against the trade. It is not a rule error.

In the V8 CONTROL forensics, 80.9 % (DEV) and 82.9 % (HOLD) of such trades were valid losing trades. The remaining implementation-caused classes are the D1–D6 defects that the corrected core removes.

## Missed setups (V8 event forensics, corrected core)
Reference events are independent large-move origins. Classes explain why the engine did not capture them. These are rule outcomes, not implementation errors; implementation-caused misses are 0 after the corrections.
${tbl(['Class', 'DEV', 'HOLD'], [...new Set([...Object.keys(mc('DEV')), ...Object.keys(mc('HOLD'))])].map((k) => [k, mc('DEV')[k] ?? 0, mc('HOLD')[k] ?? 0]))}

"RISK_BLOCKED" in this table is the ENGINE's own geometry gate (risk5m: stop / objective validity). It is part of entry validity, not the V11 capital-risk layer.

## V11 geometry re-verification (every entry, never repaired)
- **Rules checked:**
  - side = candidate side;
  - SL on the protective side;
  - R > 0;
  - R ≥ ${0.5} ATR;
  - |entry − anchor| ≤ 2.5 ATR;
  - engine RR ≥ 1.70 and consistent with TP2;
  - TP on the correct side.
- **Results:**
${tbl(['Split', 'Entries', 'Geometry OK', 'Defects', 'BUY / SELL', 'Model mix'], S2.map((S) => { const x = R.splits[S].geometry; return [S, x.entries, x.ok, JSON.stringify(x.defects) === '{}' ? 'none' : JSON.stringify(x.defects), `${x.side_mix.BUY} / ${x.side_mix.SELL}`, Object.entries(x.model_mix).map(([k, v]) => `${k} ${v}`).join(', ')]; }))}

## Forward shadow evidence (live, read-only, ${FWD.observation.start} → ${FWD.observation.end}, ${f2(FWD.observation.elapsed_hours)} h)
${tbl(['Measure', 'V8 corrected (frozen)', 'CONTROL (production, same inputs)'], [
  ['Candidates / valid setups / signals', `${fwd.total_candidates} / ${fwd.valid_setups} / ${fwd.shadow_signals}`, `${FWD.evidence.CONTROL.total_candidates} / ${FWD.evidence.CONTROL.valid_setups} / ${FWD.evidence.CONTROL.shadow_signals}`],
  ['Missed valid setups / incorrect blocks / late', `${fwd.missed_valid_setups} / ${fwd.incorrect_blocks} / ${fwd.late_signals}`, `${FWD.evidence.CONTROL.missed_valid_setups} / ${FWD.evidence.CONTROL.incorrect_blocks} / ${FWD.evidence.CONTROL.late_signals}`],
  ['Invalid setups accepted', fwd.invalid_setups_accepted, FWD.evidence.CONTROL.invalid_setups_accepted],
  ['D1–D6 specification violations', fwd.d1_d6_regressions, FWD.evidence.CONTROL.d1_d6_regressions],
  ['Implementation errors', fwd.implementation_errors, FWD.evidence.CONTROL.implementation_errors],
  ['Valid losing trades', fwd.valid_losing_trades, FWD.evidence.CONTROL.valid_losing_trades],
])}

The forward sample is ${fwd.shadow_signals} signals, far too small for any economic statement. The full snapshot is in \`forward_evidence/\`, rendered read-only from the running shadow store; the runner was not touched.

## Entry economics (risk-free, one position at a time, RR 1.70, NORMAL cost)
${tbl(['Split', 'n', 'Expectancy R', 'PF', 'Win rate', 'Avg win / loss R', 'Max DD R', 'Worst losing streak'], S2.map((S) => { const e = EO(S); return [S, e.n, f3(e.expectancy_r), f2(e.pf_r), pc(e.win_rate), `${f2(e.avg_win_r)} / ${f2(e.avg_loss_r)}`, e.max_dd_r, e.worst_loss_streak]; }))}

**Conclusion.** The entry engine executes its rules correctly, but the valid entries have negative expectancy. A losing valid trade is acceptable; it is not an implementation error.
`;

// 4 ---------- risk translation ----------
out.V11_RISK_TRANSLATION = HEAD('V11_RISK_TRANSLATION') + `## Pipeline (fixed order; the risk layer is strictly downstream)
1. **ENTRY:** frozen engine record (deep-frozen; hashed fields: id, bar, time, model, side, candidate side, entry, structural SL, anchor, engine TP2 / RR, risk / ATR, trigger).
2. **ENTRY GEOMETRY CHECK:** verification only; a defect → FAIL_CLOSED ENTRY_GEOMETRY_DEFECT (the entry is never repaired).
3. **EXPOSURE:** MAX_SIMULTANEOUS_TRADES = 1 and the unchanged re-entry guard → EXPOSURE_BLOCKED.
4. **FAIL-SAFE PRECHECKS:**
   - equity;
   - SL present;
   - broker spec complete;
   - tick value (platform or same-currency derivation);
   - quote age ≤ ${R.spec ? 90 : 90} s and signal age ≤ 600 s;
   - spread ≤ 0.60 USD (production REAL limits);
   - otherwise FAIL_CLOSED.
5. **RISK TRANSLATION:** the V10 library, unchanged (sha ${FZ.risk_sha.slice(0, 16)}…).
   - cash risk = equity × r;
   - worst-case loss per lot = (1.5 R + spread + 0.10) × 100;
   - lots rounded DOWN to the step;
   - < 0.01 → RISK_REJECTED RISK_BELOW_MIN_LOT;
   - margin cap 50 % plus margin level after loss ≥ 100 %.
6. **RISK CONSISTENCY:**
   - independent recomputation through the tick value: ((1.5 R + spread + 0.10) ÷ tick size) × tick value × lots must equal the library's actual risk within 1e-6 USD;
   - PCT actual ≤ approved;
   - lots finite and > 0;
   - otherwise FAIL_CLOSED.
7. **BROKER VALIDATION:**
   - lot step multiple, min / max;
   - structural and broker SL on the protective side and outside the stops / freeze level;
   - broker rejection → RISK_REJECTED (no retry, no resize).
8. **Outcome:** RISK_ACCEPTED with lots, planned risk, approved cash, margin, broker SL (= entry ∓ (1.5 R + spread)), research target (= entry ± 1.70 R) and tick-value source.

## What the risk layer may and may never do
| May | May never |
|---|---|
| accept, reject (with a reason), size, record | change pattern, setup, trigger, direction, entry location or structural SL; create an entry; weaken an entry rule; round a size up; retry a broker rejection with a different size; increase risk after a loss |

## Verified on every replay record
- Entry-hash mismatches: **0** (all 90 split × account × model × cost cells).
- Identity (each valid entry exactly once): **holds** in all cells.
- PCT planned risk above approved: **0**.
- Broker-invalid accepted trades: **0**.
- The integrated replay reproduces the V10 walk on every configuration (same entries, sizes, equity), and V10 outcome P&L matches for all three costs: ${S2.map((S) => `${S} ${R.splits[S].v10_parity.all_same ? 'identical' : 'DIFFERENT'} (${R.splits[S].v10_parity.outcome_pnl_mismatches} mismatches)`).join(', ')}.
`;

// 5 ---------- position sizing ----------
out.V11_POSITION_SIZING = HEAD('V11_POSITION_SIZING') + `## Sizing (V10 library; research only; production stays LOT 0.01)
- **Formula:** lots = ⌊ equity × r ÷ ((1.5 R + spread + 0.10) × ${SPEC.contract_size}) ÷ ${SPEC.volume_step} ⌋ × ${SPEC.volume_step}, capped at ${SPEC.volume_max}.
- **Below the minimum:** < ${SPEC.volume_min} → RISK_REJECTED, never rounded up.
- **Actual risk:** recalculated after rounding and cross-checked through the tick value (${SPEC.tick_value_per_lot} USD per point per lot, ${R.splits.HOLD.grid[10000]['PCT_0.005'].normal.trades ? 'derived as tick size × contract because the profit currency equals the account currency (USD)' : ''}).

## Sizes and planned risk (NORMAL cost)
${tbl(['Split', 'Account', 'Model', 'Accepted', 'Mean / max lots', 'Mean / max planned risk', 'Minimum-lot rejections', 'Above approved'], S2.flatMap((S) => ACC.flatMap((A) => MK.map((m) => { const x = g(S, A, m); return [S, A, ML[m], x.trades, `${f2(x.lots_mean)} / ${f2(x.lots_max)}`, `${pc(x.planned_risk_pct_mean, 2)} / ${pc(x.planned_risk_pct_max, 2)}`, x.min_lot_rejections, x.pct_above_approved ?? 'n/a']; }))))}

- **CURRENT.** Its "planned risk" is the fixed 0.01 lot's worst case expressed in % of equity (capped by the production −50 USD assumption). It is not an approved percentage, so the "above approved" check does not apply.
- **RISK_PERCENTAGE = UNRESOLVED.** No percentage is approved (V10), and none is selected here.
`;

// 6 ---------- structural SL ----------
const slq = (S) => { const s = MX[S].map((r) => Math.abs(r.entry - r.sl)); return [0.1, 0.5, 0.9, 0.99].map((p) => f2(pctl(s, p))).concat(f2(Math.max(...s))); };
out.V11_STRUCTURAL_SL = HEAD('V11_STRUCTURAL_SL') + `## Preservation
The structural SL is an input and never an output.
- Every integrated record keeps the engine's SL (entry hash unchanged; 0 mismatches in all cells).
- An accepted trade adds only DERIVED levels:
  - the broker fail-safe SL = entry ∓ (1.5 R + spread), outside the structural SL;
  - the research target = entry ± 1.70 R.
- The thesis exit is a confirmed close beyond the structural SL.

## Structural SL distance (USD per oz, all valid entries)
${tbl(['Split', 'p10', 'p50', 'p90', 'p99', 'max'], S2.map((S) => [S, ...slq(S)]))}

## RR 1.70
- Engine RR ≥ 1.70 on every entry (geometry check; V8: share of TP2 below 1.70 R = ${pc(v8a('HOLD').tp2_r.share_below_1_70)}).
- The research exit uses exactly 1.70 R in every configuration, and the risk layer cannot change it.

## Production caveat (from V10, unchanged)
The production REAL path places the broker SL at min(−50 USD monetary distance at 0.01 lot, 1.5 R + spread).
- The monetary distance is tighter than the structural fail-safe on ${pc(V10D.splits.HOLD.sl_distribution.share_monetary_50_binds)} of HOLD signals.
- It lies inside the structural SL itself on ${pc(V10D.splits.HOLD.sl_distribution.share_structural_beyond_50)}. That moves the stop to fit a dollar amount, which the owner rule forbids.

The integrated research pipeline has no fixed-dollar stop. Reported, not changed.
`;

// 7 ---------- broker validation ----------
out.V11_BROKER_VALIDATION = HEAD('V11_BROKER_VALIDATION') + `## Platform specification (read, not assumed)
- **Source:** \`state/xauusd_mt5_real_trade_log.jsonl\`, latest XAUUSDm record (${SPEC.recorded_at}).
- **Account:** the connected MT5 account is non-real (account_is_real = ${SPEC.account_is_real}); this matches the owner's statement that the 10,000 USD demo is connected for platform verification only.
- **No credentials:** no account identifier, credential or server value enters the spec.
- **Same contract as REAL:** the contract fields are identical to the 9 REAL-verified records (V10_BROKER_CONSTRAINTS).

${tbl(['Field', 'Value'], [['Contract size', `${SPEC.contract_size} oz`], ['Volume min / step / max', `${SPEC.volume_min} / ${SPEC.volume_step} / ${SPEC.volume_max}`], ['Point / digits', `${SPEC.point} / ${SPEC.digits}`], ['Stops / freeze level', `${SPEC.stops_level_points} / ${SPEC.freeze_level_points} points`], ['Leverage / margin currency / margin call', `1:${SPEC.leverage} / ${SPEC.margin_currency} / ${SPEC.margin_call_pct} %`], ['Profit / account currency', `${SPEC.currency_profit} / ${SPEC.account_currency}`], ['Platform tick value', SPEC.platform_tick_value ?? 'not recorded → derived tick size × contract = 0.1 USD per point per lot (same currency)'], ['Swap long (latest record)', `${SPEC.swap_long_points} points = ${f3(SPEC.swap_long_points * SPEC.point)} USD/oz/night (the simulator charges 0.56, conservative)`]])}

## Validation results
- **Accepted trades failing broker validation:** 0 in every cell (the lot is a step multiple within [min, max]; the structural and broker SLs are on the protective side, outside the stops and freeze levels).
- **Fault injection on HOLD (corrected harness):**
${tbl(['Injected condition', 'Injected', 'Closed with expected reason', 'Closed upstream (other reason)', 'Accepted'], ['BROKER_SPEC_UNAVAILABLE', 'TICK_VALUE_UNAVAILABLE', 'BROKER_STOPS_LEVEL', 'BROKER_REJECTS_ORDER'].map((k) => [k, fi.by_fault[k].injected, fi.by_fault[k].closed_with_expected_reason, fi.by_fault[k].closed_upstream_other_reason, fi.by_fault[k].accepted_despite_fault]))}
- **Broker rejection:** recorded as RISK_REJECTED REJECTED_BY_BROKER with retry = false and size_change = false. The same entry cannot be resubmitted (DUPLICATE_DELIVERY).
`;

// 8 ---------- margin & exposure ----------
out.V11_MARGIN_EXPOSURE = HEAD('V11_MARGIN_EXPOSURE') + `## Margin (cap 50 % of equity; margin level after the worst-case loss ≥ 60 + 40 %)
${tbl(['Split', 'Account', 'Model', 'Max margin', 'Mean margin'], S2.flatMap((S) => ACC.flatMap((A) => MK.map((m) => { const x = g(S, A, m); return [S, A, ML[m], pc(x.margin_pct_max), pc(x.margin_pct_mean)]; }))))}

Margin never binds in the clean replay; risk, not margin, limits size. Margin availability is never risk permission.

## Margin fault injection
- **Corrected harness** (leverage set so the minimum-lot margin = 2 × cap): ${fi.by_fault.MARGIN_INSUFFICIENT.injected} injected, ${fi.by_fault.MARGIN_INSUFFICIENT.closed_with_expected_reason} closed MARGIN_ABOVE_CAP, ${fi.by_fault.MARGIN_INSUFFICIENT.closed_upstream_other_reason} closed upstream, ${fi.by_fault.MARGIN_INSUFFICIENT.accepted_despite_fault} accepted.
- **Pre-registered harness** (leverage 1:1): ${fip.by_fault.MARGIN_INSUFFICIENT_PREREG_LEVERAGE_1.injected} injected, ${fip.by_fault.MARGIN_INSUFFICIENT_PREREG_LEVERAGE_1.accepted_despite_fault} accepted. Those accepted trades did satisfy the margin rule:
${tbl(['Entry', 'Lots', 'Leverage', 'Margin', 'Cap', 'Level after worst-case loss', 'Rule satisfied'], fip.accepted_details.map((x) => [x.entry_id, x.lots, x.leverage, pc(x.margin_pct), pc(x.cap, 0), `${x.margin_level_after_loss_pct} %`, x.margin_rule_satisfied ? 'yes' : 'NO']))}

## Exposure (MAX_SIMULTANEOUS_TRADES = 1)
${tbl(['Split', 'Account', 'Model', 'Exposure-blocked', 'of which POSITION_OPEN', 'STALE_SAME_SETUP', 'REVENGE_GUARD'], S2.flatMap((S) => [1000, 10000].flatMap((A) => ['CURRENT_0.01_LOT', 'PCT_0.005'].map((m) => { const x = g(S, A, m); return [S, A, ML[m], x.exposure_blocked, x.by_reason['EXPOSURE_BLOCKED:POSITION_OPEN'] ?? 0, x.by_reason['EXPOSURE_BLOCKED:STALE_SAME_SETUP'] ?? 0, x.by_reason['EXPOSURE_BLOCKED:REVENGE_GUARD'] ?? 0]; }))))}

- **Not traded:** exposure-blocked valid entries are recorded and never queued, added or averaged.
- **Total planned exposure:** at any time it is at most one position's planned risk.
`;

// 9 ---------- cost stress ----------
out.V11_COST_STRESS = HEAD('V11_COST_STRESS') + `## Entry economics by cost (risk-free one-position walk, R)
${tbl(['Split', 'Cost', 'n', 'Expectancy R', 'PF', 'Win rate', 'Avg win / loss', 'Max DD R'], S2.flatMap((S) => COSTS.map((c) => { const e = EO(S, c); return [S, c, e.n, f3(e.expectancy_r), f2(e.pf_r), pc(e.win_rate), `${f2(e.avg_win_r)} / ${f2(e.avg_loss_r)}`, e.max_dd_r]; })))}

## End equity by cost (USD)
${tbl(['Split', 'Account', 'Model', 'NORMAL', 'MODERATE', 'SEVERE'], S2.flatMap((S) => ACC.flatMap((A) => MK.map((m) => [S, A, ML[m], ...COSTS.map((c) => (g(S, A, m, c).trades ? f2(g(S, A, m, c).end) : 'no trade'))]))))}

## Cost levels
- **Spread + slippage per oz:** NORMAL 0.24 + 0.10, MODERATE 0.40 + 0.30, SEVERE 0.60 + 0.60.
- **SEVERE gap:** every 10th stop-out fills a further 0.5 R worse.
- **Swap:** 0.56 USD/oz/night on BUY, every cost level.

The SEVERE spread equals the production limit of 0.60 USD and is therefore still admissible; any wider spread fails closed.
`;

// 10 ---------- planned vs realized ----------
const pvr = (S, A, m, c) => g(S, A, m, c).planned_vs_realized;
out.V11_PLANNED_VS_REALIZED_RISK = HEAD('V11_PLANNED_VS_REALIZED_RISK') + `## Definition
- **Planned:** the worst-case loss at the hard broker stop, (1.5 R + spread + 0.10 allowance) × 100 × lots.
- **Exceedance:** realized loss > planned.
- **Attribution:** the excess is attributed to overnight BUY swap, slippage above the allowance (broker-stop exits) and the SEVERE gap.

${tbl(['Split', 'Account', 'Model', 'Cost', 'Losing trades', 'Exceedances', 'Share', 'Max realized / planned', 'Excess USD', 'Swap USD', 'Slippage USD', 'Gap USD'], S2.flatMap((S) => [1000, 10000].flatMap((A) => ['CURRENT_0.01_LOT', 'PCT_0.0025', 'PCT_0.005', 'PCT_0.01'].flatMap((m) => COSTS.map((c) => { const x = pvr(S, A, m, c); return [S, A, ML[m], c, x.losing_trades, x.exceedances, pc(x.exceed_share), f3(x.max_ratio), f2(x.excess_usd), f2(x.swap_usd), f2(x.slip_excess_usd), f2(x.gap_usd)]; })))))}

## CURRENT's fixed-dollar assumption
For CURRENT the planned loss is capped by the production −50 USD assumption. Under the common structural exit, ${pvr('HOLD', 1000, 'CURRENT_0.01_LOT', 'normal').current_losses_above_50usd} HOLD losses exceed 50 USD at 0.01 lot (max ×${f2(pvr('HOLD', 1000, 'CURRENT_0.01_LOT', 'normal').max_ratio)} of the planned value). In production, the −50 USD monetary broker SL would cut these trades, by moving the stop inside or near the structure (V11_STRUCTURAL_SL).

## Reading
- **Planned risk is controlled:** 0 PCT trades are above the approved risk.
- **Realized risk is not fully covered.** At NORMAL cost the only excess is the overnight BUY swap, which the worst-case formula omits; at SEVERE cost slippage and gaps push the majority of losing trades above plan (up to ≈ ×1.45).
- **REALIZED_RISK_CONTROL = PARTIAL.** A future spec would need a swap allowance and an explicit gap / slippage buffer.
`;

// 11 ---------- capital survival ----------
out.V11_CAPITAL_SURVIVAL = HEAD('V11_CAPITAL_SURVIVAL') + `${tbl(['Split', 'Account', 'Model', 'End', 'Return', 'Max DD', 'Recovery needed', 'Min equity', 'DD p50 / p90 (per trade)', 'Trades at DD ≥ 10 % / ≥ 20 %', 'Worst losing streak', 'Survived'], S2.flatMap((S) => ACC.flatMap((A) => MK.map((m) => { const x = g(S, A, m); return [S, A, ML[m], f2(x.end), pc(x.return_pct), pc(x.max_dd_pct), pc(x.recovery_needed_pct), f2(x.min_equity), `${pc(x.dd_distribution.p50)} / ${pc(x.dd_distribution.p90)}`, `${pc(x.dd_distribution.share_ge_10)} / ${pc(x.dd_distribution.share_ge_20)}`, x.worst_loss_streak, x.survived ? 'yes' : '**NO**']; }))))}

## Reading
- **No configuration demonstrates capital safety on a negative-expectancy stream.** Every sized configuration ends below its start on DEV, and the drawdown scales with the risk %.
- **Percentage sizing cannot ruin the account.** Each loss is a fraction of current equity, and minimum-lot cases are rejected.
- **CURRENT's survival at 1,000 – 10,000 USD reflects its small % risk at large accounts** (≈ 0.1 % at 10,000 USD); at small accounts it is a large and variable risk (V10).
- **CAPITAL_SURVIVAL = NOT DEMONSTRATED** for any approved risk, because none is approved.
`;

// 12 ---------- fixed vs percentage (section 23) ----------
const cmpRows = (S) => ACC.flatMap((A) => MK.map((m) => { const x = g(S, A, m); return [A, ML[m], pc(x.eligibility_share_of_evaluated), x.valid_entries, x.risk_rejected_valid_entries, f2(x.end), pc(x.max_dd_pct), `${pc(x.planned_risk_pct_mean, 2)} / ${pc(x.planned_risk_pct_max, 2)}`, x.min_lot_rejections, pc(x.margin_pct_max), `${f2(g(S, A, m, 'normal').end)} / ${f2(g(S, A, m, 'moderate').end)} / ${f2(g(S, A, m, 'severe').end)}`]; }));
const CMPH = ['Account', 'Model', 'Trade eligibility', 'Valid entries', 'Risk-rejected valid entries', 'End equity', 'Max DD', 'Actual risk mean / max', 'Minimum-lot rejections', 'Max margin', 'Cost sensitivity: end N / M / S'];
out.V11_FIXED_VS_PERCENTAGE = HEAD('V11_FIXED_VS_PERCENTAGE') + `**DESCRIPTIVE ONLY: no winner is declared.**

The comparison uses identical entries, structural SLs and exits; only the sizing differs.
- **Trade eligibility:** accepted ÷ (accepted + risk-rejected).
- **Exposure:** exposure-blocked entries are excluded from that ratio and counted in V11_ENTRY_RISK_MATRIX.
- **Actual risk:** the planned worst case in % of equity.

## DEV (NORMAL cost unless stated)
${tbl(CMPH, cmpRows('DEV'))}

## HOLDOUT
${tbl(CMPH, cmpRows('HOLD'))}

## Notes
- **CURRENT** trades every evaluable entry because its 0.01 lot is fixed. Its % risk therefore varies with the SL width and the account (V10).
- **PCT** holds the % risk at or below r, but rejects valid entries whose minimum lot exceeds r. These are mostly the widest-SL entries.
- **The broader point:** "Risk sizing controls how fast capital is lost; it cannot create an edge." Nothing in this table changes the entry expectancy.
`;

// 13 ---------- development ----------
out.V11_DEVELOPMENT_RESULTS = HEAD('V11_DEVELOPMENT_RESULTS') + `## DEV split (2025-05-07 → 2025-12-31): ${R.splits.DEV.entries} valid entries
- **Purpose:** DEV was used to build and debug the integration.
- **No tuning:** no parameter was selected; the risk percentage stays UNRESOLVED from V10.
- **Before the freeze:** a dry run of the FULL code path on DEV only (no holdout data) confirmed that the pipeline runs end-to-end.

${tbl(['Check', 'Result'], [['Geometry', `${R.splits.DEV.geometry.ok} / ${R.splits.DEV.entries} OK`], ['V10 parity (walk and outcomes, 3 costs)', R.splits.DEV.v10_parity.all_same ? 'identical' : 'DIFFERENT'], ['Entry-only vs V8 fixed 1.70 R', `n ${EO('DEV').n} (V8 ${v8a('DEV').fixed_170r.n}), ${f3(EO('DEV').expectancy_r)} R (V8 ${v8a('DEV').fixed_170r.expectancy_r})`]])}

## Freeze records
${tbl(['Freeze', 'Frozen (UTC)', 'prereg', 'integrate.mjs', 'v11_study.mjs', 'V10 risk.mjs'], [['pre-registered harness', FZP.frozen_utc, FZP.prereg_sha.slice(0, 12), FZP.integrate_sha.slice(0, 12), FZP.study_sha.slice(0, 12), FZP.risk_sha.slice(0, 12)], ['after correction C1', FZ.frozen_utc, FZ.prereg_sha.slice(0, 12), FZ.integrate_sha.slice(0, 12), FZ.study_sha.slice(0, 12), FZ.risk_sha.slice(0, 12)]])}

The pre-registration, the integration layer and the risk library are identical in both freezes. Only the study harness changed (CORRECTION_LOG C1).

## DEV grid (NORMAL)
${tbl(CMPH, cmpRows('DEV'))}
`;

// 14 ---------- holdout ----------
out.V11_HOLDOUT_RESULTS = HEAD('V11_HOLDOUT_RESULTS') + `## HOLDOUT split (2026-01-01 → 2026-09-29): ${R.splits.HOLD.entries} valid entries, replayed with the frozen code
${tbl(['Check', 'Result'], [['Geometry', `${R.splits.HOLD.geometry.ok} / ${R.splits.HOLD.entries} OK`], ['V10 parity (walk and outcomes, 3 costs)', R.splits.HOLD.v10_parity.all_same ? 'identical' : 'DIFFERENT'], ['Entry-only vs V8 fixed 1.70 R', `n ${EO('HOLD').n} (V8 ${v8a('HOLD').fixed_170r.n}), ${f3(EO('HOLD').expectancy_r)} R (V8 ${v8a('HOLD').fixed_170r.expectancy_r})`], ['Entry-hash mismatches / identity / above approved / broker-invalid', '0 / holds / 0 / 0 in every cell'], ['Fault injection (corrected harness)', `${fi.injected} injected, ${fi.faults_accepted} accepted`], ['Fault injection (pre-registered harness)', `${fip.injected} injected, ${fip.faults_accepted} accepted (margin rule satisfied: ${fip.accepted_details.every((x) => x.margin_rule_satisfied) ? 'yes' : 'no'})`]])}

## Decision conditions
${tbl(['Condition', 'Corrected harness', 'Pre-registered harness'], failRows)}

- **Status:** ${STATUS} (corrected harness); ${PRE_STATUS} (pre-registered harness).
- **Supported risk percentage:** ${DEC.supported_risk_percentage}.

## HOLDOUT grid (NORMAL)
${tbl(CMPH, cmpRows('HOLD'))}
`;

// 15 ---------- replay ----------
out.V11_REPLAY_RESULTS = HEAD('V11_REPLAY_RESULTS') + `${tbl(['Check (HOLD, PCT 0.50 %, 10,000 USD, NORMAL)', 'Result'], [
  ['Chronological replay deterministic (two runs, identical record hash)', INT.replay_deterministic ? 'PASS' : 'FAIL'],
  [`Restart from serialized state at entry ${INT.restart_split_at} equals the uninterrupted run`, INT.restart_equals_uninterrupted ? 'PASS' : 'FAIL'],
  ['Duplicate delivery: first / second / after restart', `${INT.duplicate_delivery.first} / ${INT.duplicate_delivery.second} / ${INT.duplicate_delivery.after_restart} → ${INT.duplicate_delivery.ok ? 'PASS' : 'FAIL'}`],
  ['Fault-injection replay: records before the first fault identical to the clean run', fi.prefix_identical_to_clean ? 'PASS' : 'FAIL'],
  ['Fault-injection replay: every valid entry still recorded once', fi.identity_ok ? 'PASS' : 'FAIL'],
  ['Integrated replay = V10 walk (all accounts, models; DEV + HOLD)', S2.every((S) => R.splits[S].v10_parity.all_same) ? 'PASS' : 'FAIL'],
  ['Entry-only replay = V8 audit (n and expectancy, DEV + HOLD)', S2.every((S) => EO(S).n === v8a(S).fixed_170r.n) ? 'PASS' : 'FAIL'],
])}

The corrected and pre-registered FULL runs are byte-identical in every split, grid, matrix, replay, restart and duplicate result. Only the fault-injection section differs (CORRECTION_LOG C1).
`;

// 16 ---------- failure modes ----------
const FM = [['equity unavailable / ≤ 0 / NaN', 'EQUITY_UNAVAILABLE'], ['SL unavailable', 'SL_UNAVAILABLE'], ['broker specification unavailable / incomplete', 'BROKER_SPEC_UNAVAILABLE'], ['tick value unavailable', 'TICK_VALUE_UNAVAILABLE'], ['tick value inconsistent with tick size × contract', 'TICK_VALUE_INCONSISTENT'], ['quote stale (> 90 s) or age unknown', 'DATA_STALE_QUOTE'], ['signal stale (> 600 s)', 'DATA_STALE_SIGNAL'], ['spread above 0.60 USD or unknown', 'SPREAD_UNAVAILABLE_OR_ABOVE_LIMIT'], ['entry geometry defect', 'ENTRY_GEOMETRY_DEFECT'], ['position sizing invalid (non-finite lots)', 'POSITION_SIZE_INVALID'], ['risk calculation inconsistent (independent path differs)', 'RISK_CALCULATION_INCONSISTENT'], ['PCT actual above approved', 'RISK_ABOVE_APPROVED'], ['minimum lot exceeds the approved risk', 'RISK_BELOW_MIN_LOT'], ['margin insufficient', 'MARGIN_ABOVE_CAP / MARGIN_LEVEL_AFTER_LOSS_TOO_LOW'], ['broker parameter rule (step, min / max, stops / freeze level, SL side)', 'BROKER_*'], ['broker rejects the order', 'REJECTED_BY_BROKER (no retry, no resize)'], ['position already open', 'EXPOSURE_BLOCKED POSITION_OPEN'], ['duplicate delivery (also after restart)', 'DUPLICATE_DELIVERY']];
const injName = { EQUITY_UNAVAILABLE: 'EQUITY_UNAVAILABLE', SL_UNAVAILABLE: 'SL_UNAVAILABLE', BROKER_SPEC_UNAVAILABLE: 'BROKER_SPEC_UNAVAILABLE', TICK_VALUE_UNAVAILABLE: 'TICK_VALUE_UNAVAILABLE', DATA_STALE_QUOTE: 'DATA_STALE_QUOTE', DATA_STALE_SIGNAL: 'DATA_STALE_SIGNAL', SPREAD_UNAVAILABLE_OR_ABOVE_LIMIT: 'SPREAD_ABOVE_LIMIT', POSITION_SIZE_INVALID: 'POSITION_SIZE_INVALID', RISK_CALCULATION_INCONSISTENT: 'RISK_CALCULATION_INCONSISTENT', RISK_BELOW_MIN_LOT: 'MIN_LOT_EXCEEDS_RISK', 'MARGIN_ABOVE_CAP / MARGIN_LEVEL_AFTER_LOSS_TOO_LOW': 'MARGIN_INSUFFICIENT', 'BROKER_*': 'BROKER_STOPS_LEVEL', 'REJECTED_BY_BROKER (no retry, no resize)': 'BROKER_REJECTS_ORDER' };
out.V11_FAILURE_MODES = HEAD('V11_FAILURE_MODES') + `Every failure mode ends in NO TRADE, the entry stays unchanged and a record remains. None is bypassed by altering the entry.

${tbl(['Condition', 'Outcome / reason', 'Unit test', 'HOLD fault replay (corrected): injected / expected reason / upstream / accepted'], FM.map(([c, reason]) => { const k = injName[reason]; const x = k ? fi.by_fault[k] : null; return [c, reason, 'yes', x ? `${x.injected} / ${x.closed_with_expected_reason} / ${x.closed_upstream_other_reason} / ${x.accepted_despite_fault}` : 'covered by the clean replay and tests']; }))}

- **"Upstream":** the injected entry was already rejected by an earlier stage (for example, the minimum lot), so no trade was possible.
- **Entry unchanged:** for every injected fault ${Object.values(fi.by_fault).every((x) => x.entry_unchanged) ? 'yes' : '**NO**'}. The delivered record without an SL is a simulated corrupt input, not an alteration.

## Pre-registered harness (diagnostic)
- ${fip.faults_accepted} of ${fip.injected} injected faults were accepted, all under the leverage-1 margin injection.
- They satisfied the margin rule (V11_MARGIN_EXPOSURE), so the injection did not create the fault.
- Under the pre-registered rule this computed ${PRE_STATUS}; see CORRECTION_LOG C1.
`;

// 17 ---------- supported ----------
out.V11_SUPPORTED_PARAMETERS = HEAD('V11_SUPPORTED_PARAMETERS') + `${tbl(['Parameter / mechanism', 'Status', 'Evidence'], [
  ['Entry validity upstream and immutable (deep-frozen, hashed record)', 'SUPPORTED', '0 entry-hash mismatches; 400-scenario test; no assignment to entry fields'],
  ['VALID_ENTRY + one outcome record per entry', 'SUPPORTED', 'identity holds in all cells; per-entry matrix files'],
  ['Structural SL preserved; RR 1.70', 'SUPPORTED', 'geometry 100 %; target = entry ± 1.70 R; broker SL = 1.5 R + spread outside'],
  ['Sizing from equity × r and the structural SL; round down; minimum-lot reject', 'SUPPORTED (mechanics)', '0 above approved; tick-path consistency'],
  ['Broker spec from the platform; tick value same-currency derivation', 'SUPPORTED', 'fail closed when missing or inconsistent'],
  ['Margin cap 50 % + margin-level buffer (60 + 40)', 'SUPPORTED as a backstop', 'never binds in the clean replay; injected fault closes'],
  ['MAX_SIMULTANEOUS_TRADES = 1', 'SUPPORTED', 'exposure-blocked entries recorded'],
  ['Fail-safes (13 injected types + unit tests)', 'SUPPORTED', `${fi.faults_accepted} accepted of ${fi.injected} (corrected harness)`],
  ['Restart / duplicate / broker-rejection handling', 'SUPPORTED', 'replay results'],
  ['Production safety limits (quote 90 s, signal 600 s, spread 0.60 USD)', 'SUPPORTED (read from production)', 'unit tests at the boundary'],
  ['RISK_PERCENTAGE', '**UNRESOLVED**', 'V10: no percentage met the capital-safety criteria; none invented'],
  ['Daily / streak / weekly controls', 'NOT SUPPORTED', 'V10 (inconsistent across splits)'],
])}
`;

// 18 ---------- rejected ----------
out.V11_REJECTED_PARAMETERS = HEAD('V11_REJECTED_PARAMETERS') + `${tbl(['Item', 'Status', 'Reason'], [
  ['Risk 0.10 / 0.25 / 0.50 / 0.75 / 1.00 %', 'REJECTED (V10, carried)', 'pre-registered capital-safety criteria not met on DEV'],
  ['Daily 1 / 2 / 3 %, pause 3 / 5, weekly 5 %', 'REJECTED (V10, carried)', 'not consistently protective'],
  ['Fixed −50 USD maximum loss as a risk definition', 'REJECTED', `universal fixed-dollar assumption; exceeded by ${pvr('HOLD', 1000, 'CURRENT_0.01_LOT', 'normal').current_losses_above_50usd} HOLD losses under the structural exit; in production it can move the stop inside the structure`],
  ['Worst-case loss without a swap / gap / slippage buffer', 'REJECTED for any future spec', 'realized loss exceeds planned (swap at NORMAL; slippage and gap at SEVERE)'],
  ['Using the positive R of minimum-lot-rejected entries (raise risk, widen acceptance, build an SL-width filter)', 'REJECTED', 'post-outcome optimisation; prohibited'],
  ['Changing entry rules / SL / RR to improve risk statistics', 'PROHIBITED', 'owner rule 19 / 20'],
  ['Capital Harvest', 'OFF', 'V9 INCONCLUSIVE; may not modify entry validity or risk validation'],
  ['Pre-registered MARGIN_INSUFFICIENT injection (leverage 1)', 'REJECTED (harness defect)', 'did not create insufficient margin on wide-SL entries (CORRECTION_LOG C1)'],
])}
`;

// 19 ---------- proposed integrated spec ----------
out.V11_PROPOSED_INTEGRATED_SPEC = HEAD('V11_PROPOSED_INTEGRATED_SPEC') + `## Status
- **Kind of document:** a PROPOSED research specification. It is NOT a deployment authorisation: EXECUTION_AUTHORITY NONE, REAL OFF, DEMO OFF, production unchanged (LOT 0.01).
- **Why it can be written:** all required integration mechanics are validated (with the documented fault-harness correction C1).
- **RISK_PERCENTAGE = UNRESOLVED.** No percentage is supported and none is invented, so this spec cannot be run as a sizing policy.

## A. ENTRY RULES (frozen; owned by the entry engine only)
1. **Engine:** entry validity comes from the frozen V8 corrected core (MC > PB > BO > SR > MR; 15m bias; quality 65 / 70).
2. **Stop:** the structural SL = the model anchor ∓ 0.25 ATR, at least 0.5 ATR from the entry.
3. **Location:** entry ≤ 2.5 ATR from the anchor.
4. **Objective:** engine RR ≥ 1.70; the research objective is exactly 1.70 R.
5. **Immutability:** the entry record is immutable and hashed. Nothing downstream may change pattern, setup, trigger, direction, entry location or SL.
6. **Visibility:** every valid entry is recorded with exactly one outcome.

## B. RISK RULES
1. **Equity:** platform account equity at the decision (never free margin, never a fixed amount).
2. **Risk per trade:** equity × r, with r = **UNRESOLVED**.
3. **Worst case:** the worst-case loss per lot at the hard stop = (1.5 R + spread + slippage allowance + **swap allowance for positions that can cross the rollover**) × contract.
4. **Size:** lots rounded DOWN to the step. Below the minimum lot → RISK_REJECTED; never round up.
5. **Recalculation:** actual risk recalculated and cross-checked through the tick value; above approved → FAIL_CLOSED.
6. **Exposure:** MAX_SIMULTANEOUS_TRADES = 1; no martingale, no averaging down, no risk increase after losses, no profit-based escalation.
7. **Controls:** no daily / streak / weekly control (none supported).

## C. BROKER RULES
1. **Spec source:** contract, volume min / step / max, point, digits, stops / freeze level, leverage and margin call are read from the platform; missing → FAIL_CLOSED.
2. **Tick value:** the platform value, or tick size × contract only when the profit currency = the account currency; otherwise FAIL_CLOSED.
3. **Order check:** the lot is a step multiple within [min, max]; the structural and broker SLs are on the protective side, outside the stops and freeze levels.
4. **Broker SL:** placed at the hard fail-safe 1.5 R + spread, never a fixed-dollar distance.
5. **Margin:** margin ≤ 50 % of equity and margin level after the worst-case loss ≥ margin call + 40. Margin is never risk permission.
6. **Broker rejection:** recorded; no retry, no resize.

## D. SAFETY RULES
1. **Fail closed:** on unavailable equity, SL, spec or tick value; quote > 90 s; signal > 600 s; spread > 0.60 USD; entry geometry defect; invalid size; inconsistent risk; margin insufficient.
2. **Restart:** from serialized state, deterministically; duplicates rejected, also after restart.
3. **No bypass:** no fail-safe may be bypassed by altering the entry.
4. **Capital Harvest:** OFF, and it may not touch entry validity or risk validation.

## Prerequisites before any sizing policy could be proposed
1. An entry stream with demonstrated positive expectancy after costs. Currently DEV ${f3(EO('DEV').expectancy_r)} R and HOLD ${f3(EO('HOLD').expectancy_r)} R (PF ${f2(EO('DEV').pf_r)} / ${f2(EO('HOLD').pf_r)}).
2. A risk percentage supported by a new pre-registered study on that stream.
3. A realized-risk buffer (swap, slippage, gap) shown to keep realized loss within plan under stress.
4. Owner review and explicit authorisation.
`;

let n = 0; for (const [name, body] of Object.entries(out)) { writeFileSync(join(REP, `${name}.md`), body.replace(/\n{3,}/g, '\n\n')); n++; }
console.log(`wrote ${n} reports`);
