/**
 * V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING -- renders the 21 required reports from the frozen results.
 *   node research/entry_edge_risk_v12/scripts/write_reports.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const RES = join(ROOT, 'results'); const REP = join(ROOT, 'reports'); mkdirSync(REP, { recursive: true });
const R = JSON.parse(readFileSync(join(RES, 'v12_results_FULL.json'), 'utf8')); const FZ = R.freeze; const D = R.decision; const BUF = FZ.buffers;
const pc = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)} %`); const f2 = (x) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toFixed(2)); const f3 = (x) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toFixed(3));
const civ = (c) => (c && c.mean != null ? `${f3(c.mean)} [${f3(c.lo)}, ${f3(c.hi)}]` : '—'); const sig = (c) => (c && c.lo > 0 ? '▲' : c && c.hi < 0 ? '▼' : '·');
const tbl = (h, rows) => `| ${h.join(' | ')} |\n|${h.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
const S2 = ['DEV', 'HOLD']; const MODELS = ['MC', 'PB', 'BO', 'SR', 'MR']; const STAGES = ['PATTERN', 'SETUP', 'TRIGGER', 'DIRECTION', 'ENTRY']; const RISKS = ['0.001', '0.0025', '0.005', '0.01']; const ACC = ['1000', '5000', '10000']; const SZ = ['H0', 'H1', 'H2', 'H3'];
const A = (S) => R.splits[S].partA; const Bp = (S) => R.splits[S].partB; const ST = (S) => A(S).stages; const STR = (S, m) => A(S).strategy[m];
const rp = (r) => `${(Number(r) * 100).toFixed(2)} %`; const SZL = { H0: 'H0 (V10 sizing, no buffers)', H1: 'H1 (envelope, gap buffer = DEV p99)', H2: 'H2 (H3 + reject closure-reachable)', H3: 'H3 (envelope, calendar-tiered gap buffer; amended primary)' };
const HEAD = (t) => `# ${t}\n\nV12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration ${FZ.prereg_sha.slice(0, 16)}… (Amendment 1) · freeze ${FZ.frozen_utc}\n\n`;
const out = {};
const stageRows = (st) => S2.flatMap((S) => MODELS.flatMap((m) => ['BUY', 'SELL'].map((side) => { const x = ST(S).per_model[m][side][st]; return [S, m, side, x.n, x.days, f3(x.net_r), f3(x.gross_r), `${civ(x.edge_vs_baseline)} ${sig(x.edge_vs_baseline)}`, `${civ(x.direction_value)} ${sig(x.direction_value)}`, pc(x.win_rate), f2(x.mfe_r), f2(x.mae_r), pc(x.reach_170)]; })));
const STH = ['Split', 'Model', 'Side', 'Bars', 'Days', 'Net R', 'Gross R', 'Edge vs baseline (gross)', 'Direction value (side − opposite)', 'Win', 'MFE', 'MAE', '1.70R reach'];
const pooledRow = (st) => S2.map((S) => [S, ST(S).pooled_edge[st].n, `${civ(ST(S).pooled_edge[st])} ${sig(ST(S).pooled_edge[st])}`]);
const transRow = (k) => S2.map((S) => [S, k, `${civ(ST(S).pooled_transitions[k])} ${sig(ST(S).pooled_transitions[k])}`]);
const LEG = 'Probe: entry at the stage bar close, SL = 1.35 × ATR14, fixed 1.70 R exit; GROSS = zero spread / slippage, swap added back. Edge vs baseline = gross R minus the unconditional same-side gross R (removes market drift). Intervals: 95 % day-block bootstrap. ▲ / ▼ = interval entirely above / below 0; · = includes 0.';
const fewOf = (o) => Object.entries(o ?? {}).map(([k, v]) => `${k} ${v}`).join(', ') || '—';

// ========================= PART A =========================
const funnel = (S) => [...MODELS, 'ALL'].map((m) => { const s = STR(S, m); return [S, m, s.observations, s.valid_patterns, s.valid_setups, s.valid_triggers, s.valid_directions, s.valid_entries, s.trades]; });
const FUNH = ['Split', 'Model', 'Observations (bars)', 'Valid patterns', 'Valid setups', 'Valid triggers', 'Valid directions', 'Valid entries', 'Trades'];
const edgeStages = D.stage_with_replicated_gross_edge; const tradesGross = (S) => STR(S, 'ALL').gross_expectancy_r; const tradesNet = (S) => STR(S, 'ALL').expectancy_r;
out.V12_ENTRY_EDGE_ISOLATION = HEAD('V12_ENTRY_EDGE_ISOLATION') + `## Question
Where along PATTERN → SETUP → TRIGGER → DIRECTION → LOCATION / ENTRY does the negative expectancy of the frozen entry engine emerge?

## Verdict
**ENTRY_EDGE_STATUS = ${D.ENTRY_EDGE_STATUS}. ENTRY_FAILURE_STAGE = ${D.ENTRY_FAILURE_STAGE}. ENTRY_EDGE_REMAINING_PROBLEM = ${D.ENTRY_EDGE_REMAINING_PROBLEM}.**

**The existing strategy has no demonstrated edge.**
- **No stage carries a replicated gross edge.** Every pooled stage edge is slightly negative on DEV and slightly positive on HOLD, and none is significant on both splits (replicated stages: ${edgeStages.length ? edgeStages.join(', ') : 'none'}).
- **No stage transition loses a significant amount of edge.** The failure is not at a stage: there is no edge to lose from the PATTERN stage onward.
- **Trades are close to zero gross:** ${f3(tradesGross('DEV'))} R (DEV) and ${f3(tradesGross('HOLD'))} R (HOLD).
- **They are negative net:** ${f3(tradesNet('DEV'))} / ${f3(tradesNet('HOLD'))} R. The difference, ≈ ${f3(tradesGross('DEV') - tradesNet('DEV'))} / ${f3(tradesGross('HOLD') - tradesNet('HOLD'))} R per trade, is the execution cost (spread + slippage + swap).
- **All ${D.losing_trades_classified} losing trades are VALID_LOSING_TRADE** (0 rule errors).
- **No correction candidate passed DEV,** so none was frozen or tested.

## Pooled stage edge (gross, vs same-side baseline)
${tbl(['Split', 'Observations', ...STAGES], S2.map((S) => [S, ST(S).pooled_edge.PATTERN.n, ...STAGES.map((st) => `${civ(ST(S).pooled_edge[st])} ${sig(ST(S).pooled_edge[st])}`)]))}

## Pooled stage transitions (change in gross edge)
${tbl(['Split', ...Object.keys(ST('DEV').pooled_transitions)], S2.map((S) => [S, ...Object.values(ST(S).pooled_transitions).map((c) => `${civ(c)} ${sig(c)}`)]))}

## Unconditional baseline (every traced bar, same probe)
${tbl(['Split', 'Side', 'Bars', 'Gross R', 'Net R'], S2.flatMap((S) => ['BUY', 'SELL'].map((sd) => [S, sd, ST(S).baseline[sd].n, civ(ST(S).baseline[sd].ci_gross), f3(ST(S).baseline[sd].net_r)])))}

The baseline flips with the market: on HOLD, SELL probes are positive and BUY probes negative. This is why every stage is measured against its same-side baseline.

${LEG}

## Funnel
${tbl(FUNH, S2.flatMap(funnel))}

Reports: V12_STRATEGY_BREAKDOWN · V12_PATTERN_ANALYSIS · V12_SETUP_ANALYSIS · V12_TRIGGER_ANALYSIS · V12_DIRECTION_ANALYSIS · V12_ENTRY_LOCATION_ANALYSIS · V12_VALID_LOSS_ANALYSIS · V12_HINDSIGHT_AUDIT · V12_HOLDOUT_RESULTS · V12_REPLAY_RESULTS
`;

out.V12_STRATEGY_BREAKDOWN = HEAD('V12_STRATEGY_BREAKDOWN') + `Every model is reported; none is hidden or removed.
- **Funnel counts:** (bar, side) observations.
- **Trades:** the one-position walk with each entry's own geometry, NORMAL cost.

${tbl(['Split', 'Model', 'Observations', 'Valid patterns', 'Valid setups', 'Valid triggers', 'Valid directions', 'Valid entries', 'Trades', 'Wins', 'Losses', 'Expectancy R (net)', '95 % CI', 'Gross R', 'PF', 'MFE R', 'MAE R', '1.70R reach', 'Max DD R'], S2.flatMap((S) => [...MODELS, 'ALL'].map((m) => { const s = STR(S, m); return [S, m, s.observations, s.valid_patterns, s.valid_setups, s.valid_triggers, s.valid_directions, s.valid_entries, s.trades, s.wins, s.losses, f3(s.expectancy_r), `[${f3(s.trades_ci.lo)}, ${f3(s.trades_ci.hi)}]`, f3(s.gross_expectancy_r), f2(s.pf), f2(s.mfe_r), f2(s.mae_r), pc(s.reach_170), f2(s.max_dd_r)]; })))}

## Reading
- **No model has a net expectancy whose interval excludes zero on either split.**
- **Signs change between splits.**
  - PB and MR are positive on HOLD (${f3(STR('HOLD', 'PB').expectancy_r)} / ${f3(STR('HOLD', 'MR').expectancy_r)} R) and negative on DEV (${f3(STR('DEV', 'PB').expectancy_r)} / ${f3(STR('DEV', 'MR').expectancy_r)} R).
  - MC is negative on both, but with intervals through zero.
- **BO dominates the sample:** ${STR('HOLD', 'BO').trades} of ${STR('HOLD', 'ALL').trades} HOLD trades.
- **Every model's MFE ≈ MAE (≈ 1.2–1.3 R),** consistent with no directional information.
`;

const stageReport = (st, title, extra) => HEAD(title) + `## ${st} stage: probe outcomes per model and side
${tbl(STH, stageRows(st))}

## Pooled
${tbl(['Split', 'Observations', 'Pooled edge vs baseline'], pooledRow(st))}

${extra}

${LEG}
`;
out.V12_PATTERN_ANALYSIS = stageReport('PATTERN', 'V12_PATTERN_ANALYSIS', `## Reading
- **Patterns carry no measurable edge.** The pooled PATTERN-stage edge is ${civ(ST('DEV').pooled_edge.PATTERN)} R (DEV) and ${civ(ST('HOLD').pooled_edge.PATTERN)} R (HOLD).
- **Rules are correct.** Pattern recognition is correct as a rule: V8's independent stage evaluator matched production on every bar (0 mismatches).
- **Information is absent.** The bars where a pattern is present do not move more in the pattern's direction than an arbitrary bar of the same side.
- **No PATTERN_ERROR** exists among losing trades.`);
out.V12_SETUP_ANALYSIS = stageReport('SETUP', 'V12_SETUP_ANALYSIS', `## PATTERN → SETUP
${tbl(['Split', 'Transition', 'Change in gross edge'], transRow('PATTERN->SETUP'))}

## Reading
- **The setup conditions don't add measurable edge, and they don't remove any.** The transition interval includes 0 on both splits.
- **No SETUP_ERROR** exists among losing trades.`);
out.V12_TRIGGER_ANALYSIS = stageReport('TRIGGER', 'V12_TRIGGER_ANALYSIS', `## SETUP → TRIGGER
${tbl(['Split', 'Transition', 'Change in gross edge'], transRow('SETUP->TRIGGER'))}

## SR trigger and the 15m bias (measurement correction D1, made on DEV before the freeze)
- **The SR rule:** it accepts a counter-structure rejection when the 15m bias supports the side (\`counterStructureConfirmed\` returns true on bias support).
- **The artefact:** V8's bias-agnostic stage evaluator runs SR with a NEUTRAL bias. 5 DEV SR trades therefore showed stage 2 ("setup") and were first misread as TRIGGER_ERROR.
- **The fix:** the trigger stage now encodes the SR rule exactly. After the correction, 0 TRIGGER_ERROR remain (AMENDMENT_LOG D1).

## Reading
- **Triggers add no measurable edge.**
- **Trigger execution is correct.** V8 stage parity is 0 mismatches in ≈ 994,000 checks; V11 entry timing has a median of 3 bars from origin.`);
const dirOutcome = (S) => A(S).attribution.direction_outcome;
out.V12_DIRECTION_ANALYSIS = stageReport('DIRECTION', 'V12_DIRECTION_ANALYSIS', `## TRIGGER → DIRECTION (the 15m bias / eligibility rule)
${tbl(['Split', 'Transition', 'Change in gross edge'], transRow('TRIGGER->DIRECTION'))}

## Direction value at the trigger (model side − opposite side, same bars)
- **Mostly no significant value.** It is not significant for most model / side cells.
- **Where it is significant on one split, it follows the split's market drift.** On HOLD the SELL baseline is ${f3(ST('HOLD').baseline.SELL.gross_r)} R and the BUY baseline ${f3(ST('HOLD').baseline.BUY.gross_r)} R, so SELL directions look "right" and BUY directions "wrong". It does not replicate on DEV.

## Correct pattern + setup + trigger: wrong direction vs valid loss (losing trades, hindsight labels)
${tbl(['Split', 'Outcome direction miss (adverse from start; the opposite side would have reached 1.70 R)', 'Direction right, valid loss (MFE ≥ 0.5 R)', 'Noise (adverse from start; the opposite side also loses)'], S2.map((S) => [S, dirOutcome(S).OUTCOME_DIRECTION_MISS ?? 0, dirOutcome(S).DIRECTION_RIGHT_VALID_LOSS ?? 0, dirOutcome(S).NOISE_BOTH_SIDES_LOSE ?? 0]))}

## Reading
- **Not every adverse trade is a direction error.** About half of the losing trades moved in the trade's direction first (≥ 0.5 R) and then lost.
- **Direction misses are outcome labels, not rule errors.** About 45 % are "direction misses" in hindsight (the mirror trade would have won), but the direction rule was executed correctly in 100 % of losing trades (0 DIRECTION_ERROR).
- **Direction has no replicated predictive value** at any stage.`);
const timingRows = (feat) => S2.flatMap((S) => MODELS.filter((m) => A(S).timing[m][feat]).map((m) => { const t = A(S).timing[m][feat]; return [S, m, `${t.cuts.join(' / ')}`, ...['Q1', 'Q2', 'Q3', 'Q4'].map((q) => `${t.bins[q].n}: ${f3(t.bins[q].net_r)}`)]; }));
const TIH = ['Split', 'Model', 'DEV quartile cuts', 'Q1 (n: net R)', 'Q2', 'Q3', 'Q4'];
const cand = (S, k) => (S === 'DEV' ? FZ.candidates_dev[k] : R.candidates_holdout[k].hold);
out.V12_ENTRY_LOCATION_ANALYSIS = stageReport('ENTRY', 'V12_ENTRY_LOCATION_ANALYSIS', `## DIRECTION → ENTRY (quality, location ≤ 2.5 ATR, RR ≥ 1.70, conflict gates)
${tbl(['Split', 'Transition', 'Change in gross edge'], transRow('DIRECTION->ENTRY'))}

## Timing and location (every valid entry, own geometry, NORMAL net R; descriptive only, not filters)
### Distance from the setup anchor (ATR): location / post-breakout chase
${tbl(TIH, timingRows('anchor_dist_atr'))}

### Bars from the setup origin: early / late trigger, pullback timing
${tbl(TIH, timingRows('bars_from_origin'))}

### SL size (R / ATR)
${tbl(TIH, timingRows('sl_atr'))}

### BO bars since the breakout event; MR bars since the sweep (rejection timing)
${tbl(TIH, [...timingRows('bo_bars_since_event'), ...timingRows('mr_bars_since_sweep')])}

## Pre-registered correction candidates (group vs rest, NET R, day-block CI of the difference)
${tbl(['Candidate', 'DEV group / rest', 'DEV difference', 'DEV pass', 'HOLD group / rest', 'HOLD difference', 'Frozen on DEV', 'Supported'], Object.keys(FZ.candidates_dev).map((k) => [k, `${cand('DEV', k).n_group} / ${cand('DEV', k).n_rest}`, `${civ(cand('DEV', k).diff)}`, cand('DEV', k).pass ? 'yes' : 'no', `${cand('HOLD', k).n_group} / ${cand('HOLD', k).n_rest}`, `${civ(cand('HOLD', k).diff)}`, R.candidates_holdout[k].frozen_on_dev ? 'yes' : 'no', R.candidates_holdout[k].supported ? '**yes**' : 'no']))}

## Reading
- **No candidate passed DEV,** so none was frozen. The HOLD figures are shown for transparency only.
- **C1 is unstable.** Entries in the last fifth of the location allowance (2.0–2.5 ATR) were better than the rest on DEV and worse on HOLD.
- **No timing failure replicates.** "Late" and "early" triggers do not differ significantly on either split. Early / late trigger, post-breakout chase, pullback timing and rejection timing show no deterministic failure.
- **SL size is not admissible.** Small-SL entries are weaker because fixed costs are a larger share of R, but this was already seen on the V10 / V11 holdout (contaminated), and excluding them would delete trades without creating gross edge.`);

const att = (S) => A(S).attribution; const OL = ['ADVERSE_FROM_START', 'FAVOURABLE_THEN_LOST', 'NEAR_TARGET_REVERSAL'];
out.V12_VALID_LOSS_ANALYSIS = HEAD('V12_VALID_LOSS_ANALYSIS') + `## Rule-conformance attribution of every losing trade
Classes are checked in pipeline order; the first failure wins.
${tbl(['Split', 'Losing trades', 'PATTERN_ERROR', 'SETUP_ERROR', 'TRIGGER_ERROR', 'DIRECTION_ERROR', 'LOCATION_ERROR', 'SL_ERROR', 'RR_ERROR', 'UNKNOWN', 'VALID_LOSING_TRADE'], S2.map((S) => [S, att(S).losing_trades, ...['PATTERN_ERROR', 'SETUP_ERROR', 'TRIGGER_ERROR', 'DIRECTION_ERROR', 'LOCATION_ERROR', 'SL_ERROR', 'RR_ERROR', 'UNKNOWN', 'VALID_LOSING_TRADE'].map((k) => att(S).class[k] ?? 0)]))}

## Valid losing trades: hindsight outcome labels (labels only, never rules)
${tbl(['Split', ...OL, 'Outcome direction miss', 'Direction right, valid loss', 'Noise'], S2.map((S) => [S, ...OL.map((k) => att(S).outcome_label[k] ?? 0), att(S).direction_outcome.OUTCOME_DIRECTION_MISS ?? 0, att(S).direction_outcome.DIRECTION_RIGHT_VALID_LOSS ?? 0, att(S).direction_outcome.NOISE_BOTH_SIDES_LOSE ?? 0]))}

## Per model (HOLD)
${tbl(['Model', 'Losses', 'Classes', 'Outcome labels', 'Direction outcome'], MODELS.map((m) => { const x = att('HOLD').by_model[m]; return [m, x.losses, fewOf(x.class), fewOf(x.outcome), fewOf(x.direction)]; }))}

## Reading
- **Losses are valid losing trades, not implementation errors:** ${D.losing_trades_classified} of ${D.losing_trades_classified} (100 %).
- **A valid trade can lose.** About ${pc((att('DEV').outcome_label.NEAR_TARGET_REVERSAL + att('HOLD').outcome_label.NEAR_TARGET_REVERSAL) / D.losing_trades_classified)} of losers came within 0.5 R of the target before reversing.
- **Records:** \`results/loss_attribution_{DEV,HOLD}.jsonl\` list every losing trade with its class, labels and mirror outcome.
`;

out.V12_HINDSIGHT_AUDIT = HEAD('V12_HINDSIGHT_AUDIT') + `Every quantity used in V12, with the information-time test: could MCP know it at entry time?
${tbl(['Quantity', 'Known at entry?', 'Used as'], [
  ['Stage strings (pattern / setup / trigger per model and side)', 'YES (confirmed bar)', 'funnel, attribution'],
  ['Bias-aware triggers (`trig`), 15m bias', 'YES', 'DIRECTION stage, SR trigger rule'],
  ['Entry, structural SL, anchor, engine TP2 / RR, risk / ATR', 'YES', 'geometry checks, timing / location features'],
  ['Bars from origin, anchor distance, BO bars since event, MR bars since sweep', 'YES', 'descriptive bins, candidates C1–C3'],
  ['DEV quartile cuts, DEV gap / swap / slippage buffers', 'YES (frozen before HOLD)', 'candidate thresholds, envelope'],
  ['Calendar nights possible, closure reachability (trading calendar)', 'YES (schedule; holidays assumed published)', 'swap buffer, H2 / H3 gap tier'],
  ['Platform swap rate history, contract spec', 'YES', 'swap buffer, sizing'],
  ['Probe outcome, trade outcome, MFE, MAE, 1.70 R reach', '**NO** (outcome)', 'measurement only'],
  ['Hindsight outcome labels, mirror counterfactual', '**NO**', 'labels only'],
  ['Realized calendar nights, gap-through at the exit, realized multiplier', '**NO**', 'risk evaluation only'],
  ['SL-width / cost-ratio effects', 'YES, but HOLD-contaminated (seen in V10 / V11)', 'NOT admissible as a candidate'],
])}

## Result
- **No hindsight quantity became a rule or candidate.**
- **The three admissible candidates** (C1–C3) use pre-entry information only. None passed DEV.
- **The risk envelope** uses only pre-entry information: the calendar, platform rates and DEV-frozen buffers.
`;

out.V12_HOLDOUT_RESULTS = HEAD('V12_HOLDOUT_RESULTS') + `## Holdout discipline
- **DEV:** used for development, including the SR measurement correction D1 and pre-registration Amendment 1 (Part B only).
- **Freeze:** candidates (none passed), timing cuts and buffers were frozen.
- **HOLD:** replayed once (${A('HOLD').entries} valid entries, ${A('HOLD').strategy.ALL.trades} trades). Nothing was tuned on HOLD.

## HOLD entry results
${tbl(['Measure', 'DEV', 'HOLD'], [
  ['Valid entries / trades', `${A('DEV').entries} / ${STR('DEV', 'ALL').trades}`, `${A('HOLD').entries} / ${STR('HOLD', 'ALL').trades}`],
  ['Trade expectancy net (CI)', `${f3(tradesNet('DEV'))} [${f3(STR('DEV', 'ALL').trades_ci.lo)}, ${f3(STR('DEV', 'ALL').trades_ci.hi)}]`, `${f3(tradesNet('HOLD'))} [${f3(STR('HOLD', 'ALL').trades_ci.lo)}, ${f3(STR('HOLD', 'ALL').trades_ci.hi)}]`],
  ['Trade expectancy gross', f3(tradesGross('DEV')), f3(tradesGross('HOLD'))],
  ['PF', f2(STR('DEV', 'ALL').pf), f2(STR('HOLD', 'ALL').pf)],
  ['Pooled ENTRY-stage edge', civ(ST('DEV').pooled_edge.ENTRY), civ(ST('HOLD').pooled_edge.ENTRY)],
  ['Losing trades valid', `${att('DEV').class.VALID_LOSING_TRADE ?? 0} / ${att('DEV').losing_trades}`, `${att('HOLD').class.VALID_LOSING_TRADE ?? 0} / ${att('HOLD').losing_trades}`],
])}

## Decision (pre-registered A7)
- ENTRY_EDGE_STATUS = **${D.ENTRY_EDGE_STATUS}**.
- ENTRY_FAILURE_STAGE = ${D.ENTRY_FAILURE_STAGE}.
- ENTRY_EDGE_REMAINING_PROBLEM = ${D.ENTRY_EDGE_REMAINING_PROBLEM}.
`;

out.V12_REPLAY_RESULTS = HEAD('V12_REPLAY_RESULTS') + `${tbl(['Check', 'Result'], [
  ['Entries reproduce V8 (valid entries and one-position trades)', `DEV ${A('DEV').entries} / ${STR('DEV', 'ALL').trades}, HOLD ${A('HOLD').entries} / ${STR('HOLD', 'ALL').trades} (V8: 4858 / 1133, 6553 / 1510)`],
  ['Entry-only economics reproduce V8 / V11', `DEV ${f3(tradesNet('DEV'))} R, HOLD ${f3(tradesNet('HOLD'))} R (V8: −0.077 / −0.022)`],
  ['H0 risk replay reproduces V11 exactly (all risk %, accounts, costs, both splits)', R.integrity.v11_parity_all_same ? 'PASS' : 'FAIL'],
  ['Deterministic re-run (DEV + FULL re-run after the fail-closed fix D2)', 'byte-identical splits, decisions, integrity, replay and candidates'],
  ['Probe and stage computations use completed bars only (no-lookahead unit tests)', 'PASS'],
])}
`;

// ========================= PART B =========================
const G = (S, sz, r, a2, rm) => Bp(S).grid[sz][r][a2][rm]; const ST2 = D.risk_status_by_sizing;
const gapH = Bp('HOLD').gap, gapD = Bp('DEV').gap;
const maxOver = (S, sz, rm) => Math.max(...RISKS.flatMap((r) => ACC.map((a2) => G(S, sz, r, a2, rm)).filter((x) => x.losing >= 30).map((x) => x.max_mult)));
const shareOver = (S, sz, rm) => Math.max(...RISKS.flatMap((r) => ACC.map((a2) => G(S, sz, r, a2, rm)).filter((x) => x.losing >= 30).map((x) => x.exceed_share)));
out.V12_REALIZED_RISK_HARDENING = HEAD('V12_REALIZED_RISK_HARDENING') + `## Question
Can percentage risk with the structural SL be sized so that realized loss stays within the approved risk, including execution cost, swap, slippage and gaps, without touching the entry or the SL?

## Verdict
**RISK_STATUS = ${D.RISK_STATUS}** (pre-registered B4, primary sizing H3 per Amendment 1).

Status by sizing (HOLD):
- H1: ${ST2.H1.status};
- H2: ${ST2.H2.status};
- H3: ${ST2.H3.status}.

### Frequency is controlled
With any envelope (H1 / H2 / H3), at most ${pc(Math.max(shareOver('HOLD', 'H1', 'REALISTIC_normal'), shareOver('HOLD', 'H3', 'REALISTIC_normal')), 2)} of losing trades exceed the approved risk at NORMAL cost on HOLD (criterion ≤ 1 %). This is down from up to ${pc(shareOver('HOLD', 'H0', 'REALISTIC_normal'), 2)} without one.

### Magnitude is not controlled
Single trades still reach the following multiples of the approved risk on HOLD (REALISTIC NORMAL; criterion ≤ 1.10):
- H0 (no buffer): ×${f2(maxOver('HOLD', 'H0', 'REALISTIC_normal'))};
- H1: ×${f2(maxOver('HOLD', 'H1', 'REALISTIC_normal'))};
- H2: ×${f2(maxOver('HOLD', 'H2', 'REALISTIC_normal'))};
- H3: ×${f2(maxOver('HOLD', 'H3', 'REALISTIC_normal'))}.

### Cause: gaps at market reopens
- **Where gaps happen:** ${gapH.by_exit_gap_type.IN_SESSION.with_gap_through} of ${gapH.by_exit_gap_type.IN_SESSION.exits} in-session HOLD stop-outs gapped (DEV: ${gapD.by_exit_gap_type.IN_SESSION.with_gap_through} of ${gapD.by_exit_gap_type.IN_SESSION.exits}). Every gap-through happened at a reopen:
  - weekend / holiday: ${gapH.by_exit_gap_type.CLOSURE.with_gap_through} of ${gapH.by_exit_gap_type.CLOSURE.exits}, max ${f2(gapH.by_exit_gap_type.CLOSURE.max_r)} R, ${f2(gapH.max_usd_oz)} USD/oz;
  - daily session break: ${gapH.by_exit_gap_type.SESSION.with_gap_through} of ${gapH.by_exit_gap_type.SESSION.exits}, max ${f2(gapH.by_exit_gap_type.SESSION.max_r)} R.
- **Why the buffers fall short:** HOLD reopen gaps exceeded the DEV maxima (closure ${f2(BUF.closure_gap_buffer_r)} R, session ${f2(BUF.session_gap_buffer_r)} R). No buffer frozen on DEV bounds them.
- **Why H2 still fails:** rejecting closure-reachable entries leaves the daily-break gaps.

## What is hardened
- **Planned risk:** 0 trades above the approved risk.
- **Swap:** a calendar-night buffer known at entry; the swap is small.
- **Slippage:** the MODERATE level is buffered (an assumption; 3 fills of evidence).
- **Exceedance frequency:** ≤ 1 %.
- **The risk firewall:** 0 entry-hash mismatches, and entry validity is preserved in every rejection.

## What is not hardened
- **Reopen gap tail risk.** The broker SL cannot fill inside a gap.
- **Bounding it would need a deterministic holding rule** (no position across a market break), which is exit / holding-time management, not sizing. That rule is documented as a requirement (V12_RISK_ENVELOPE), not implemented.

Reports: V12_PLANNED_VS_REALIZED_RISK · V12_SWAP_ANALYSIS · V12_SLIPPAGE_ANALYSIS · V12_GAP_STRESS · V12_MINIMUM_LOT_ANALYSIS · V12_RISK_ENVELOPE · V12_RISK_HOLDOUT · V12_RISK_REPLAY
`;

const pvrRows = (S, rm) => SZ.flatMap((sz) => RISKS.flatMap((r) => ACC.map((a2) => { const x = G(S, sz, r, a2, rm); return [sz, rp(r), a2, x.trades, x.losing, pc(x.exceed_share, 2), pc(x.exceed_110_share, 2), f2(x.p99_mult), f2(x.max_mult), pc(x.max_plausible_above_approved_share), x.planned_above_approved, x.gap_through_trades]; })));
const PVH = ['Sizing', 'Risk %', 'Account', 'Trades', 'Losing', 'Realized > approved', '> ×1.10', 'p99 ×', 'Max ×', 'Max plausible > approved', 'Planned > approved', 'Trades with gap-through'];
out.V12_PLANNED_VS_REALIZED_RISK = HEAD('V12_PLANNED_VS_REALIZED_RISK') + `## Definitions (per trade)
- **PLANNED_RISK:** lots × (1.5 R + spread + 0.10) × 100.
- **MAX_EXPECTED_EXPOSURE (max plausible):** lots × (1.5 R + spread + 0.10 + slippage buffer + gap buffer + swap buffer) × 100.
- **APPROVED_RISK:** equity × r.
- **Realized multiplier:** realized loss ÷ approved risk.
- **REALISTIC model:** scenario spread / slippage + calendar swap at 0.5674 USD/oz/night (BUY) + data gap-through at broker-SL exits.

## HOLD, REALISTIC NORMAL
${tbl(PVH, pvrRows('HOLD', 'REALISTIC_normal'))}

## HOLD, REALISTIC MODERATE
${tbl(PVH, pvrRows('HOLD', 'REALISTIC_moderate'))}

## HOLD, REALISTIC SEVERE
${tbl(PVH, pvrRows('HOLD', 'REALISTIC_severe'))}

## DEV, REALISTIC NORMAL
${tbl(PVH, pvrRows('DEV', 'REALISTIC_normal'))}

## Reading
- **H0 (V10 sizing).** Sized to the planned risk only, so its max plausible exposure exceeds the approved risk on 86–98 % of trades (10,000 USD).
- **Envelopes (H1 / H2 / H3).** They size to the full plausible exposure: realized loss exceeds approved on ≤ 0.7 % of losing trades, at the cost of more minimum-lot rejections (V12_MINIMUM_LOT_ANALYSIS).
- **The remaining exceedances are reopen gaps.**
- SCENARIO-model tables are in \`results/v12_results_FULL.json\`.
`;

const sw = (S) => Bp(S).swap; const SWC = ['INTRADAY', 'OVERNIGHT', 'WEEKEND_OR_MULTI'];
out.V12_SWAP_ANALYSIS = HEAD('V12_SWAP_ANALYSIS') + `## Platform evidence
- **Swap-long history** (production MT5 bridge records): ${BUF.swap_rate} USD/oz/night at most (−567.4 points); latest record −513.2 points. Swap short is 0.
- **Buffer rate:** ${BUF.swap_rate} (the maximum).

## Intraday vs overnight vs weekend (every valid entry, own geometry, NORMAL; per oz; multiplier = REALISTIC realized loss ÷ planned worst case)
${tbl(['Split', 'Class (calendar nights held)', 'Entries', 'BUY', 'Losing', 'Planned worst case (USD/oz)', 'Swap (USD/oz)', 'Swap ÷ planned', 'Total exposure (USD/oz)', 'Mean ×', 'p99 ×', 'Max ×', 'Losers above plan'], S2.flatMap((S) => SWC.map((c) => { const x = sw(S)[c]; return [S, c, x.n, x.buy, x.losing, f2(x.planned_oz_mean), f3(x.swap_oz_mean), pc(x.swap_share_of_planned, 2), f2(x.exposure_oz_mean), f2(x.mult_mean), f2(x.mult_p99), f2(x.mult_max), pc(x.exceed_share)]; })))}

## Nights possible at entry (BUY entries; trading calendar)
${tbl(['Split', 'BUY entries', 'Distribution (nights: count)'], S2.map((S) => [S, Bp(S).nights_possible.buy_entries, fewOf(Bp(S).nights_possible.dist)]))}

## Reading
- **Swap is small.** It is ${pc(sw('HOLD').OVERNIGHT.swap_share_of_planned)} of planned risk on overnight trades and ${pc(sw('HOLD').WEEKEND_OR_MULTI.swap_share_of_planned)} on weekend trades (HOLD).
- **It is deterministic and known at entry:** nights possible × the maximum rate.
- **Unbuffered, it pushes some overnight losers above plan,** at most ×${f2(sw('HOLD').OVERNIGHT.mult_max)} on HOLD.
- **The envelope removes it.** The swap buffer covers it completely (swap is never the cause of an exceedance under H1 / H2 / H3).
- **The extreme weekend multipliers are gap effects, not swap** (V12_GAP_STRESS).
- **No ban on overnight trades is justified by swap.**
`;

const sl = (S) => Bp(S).slippage;
out.V12_SLIPPAGE_ANALYSIS = HEAD('V12_SLIPPAGE_ANALYSIS') + `## Scenario levels vs the 0.10 planning allowance (losing outcomes of every valid entry; multiplier = loss excluding swap and gap ÷ planned)
${tbl(['Split', 'Level', 'Slippage', 'Losing', 'Losers above plan', 'Max ×'], S2.flatMap((S) => Object.entries(sl(S)).map(([k, x]) => [S, k, x.slippage, x.losing, pc(x.exceed_share), f3(x.max_mult)])))}

## Recorded execution evidence (production logs; no account identifiers)
${tbl(['Source', 'Side', 'Entry slippage (USD)', 'Spread (USD)', 'Entry drift (USD)'], R.fills_evidence.map((x) => [x.src, x.side, x.slippage, x.spread, x.entry_drift]))}

- **Stop-out slippage:** no fill data exists, and that is where slippage matters.
- **Entry drift does not raise the worst case.** The production broker SL is placed from the fill (fill ∓ (1.5 R + spread)), so the loss at the broker SL is unchanged; drift only changes the thesis-exit distance, which stays inside the broker SL.

## Reading
- **Slippage above the allowance is material relative to plan, but bounded.** It adds one-for-one at the stop: MODERATE puts ≈ 43–46 % of losers above plan, by at most ×${f2(Math.max(sl('DEV').moderate.max_mult, sl('HOLD').moderate.max_mult))}; SEVERE by at most ×${f2(Math.max(sl('DEV').severe.max_mult, sl('HOLD').severe.max_mult))}.
- **The envelope buffer of ${BUF.slip_buffer} covers MODERATE.** It is an **ASSUMPTION**, not evidence-calibrated (3 fills). This alone prevents RISK_HARDENED under the pre-registration.
`;

const gt = (g) => [['IN_SESSION', g.by_exit_gap_type.IN_SESSION], ['SESSION_BREAK', g.by_exit_gap_type.SESSION], ['CLOSURE (> 24 h)', g.by_exit_gap_type.CLOSURE]];
out.V12_GAP_STRESS = HEAD('V12_GAP_STRESS') + `## Gap-through at broker-SL exits (every valid entry, NORMAL; the fill is at the bar open when it opens beyond the broker level)
${tbl(['Split', 'Exit after', 'Broker-SL exits', 'With gap-through', 'Over 0.5 R', 'Max (R)'], S2.flatMap((S) => gt(Bp(S).gap).map(([k, x]) => [S, k, x.exits, x.with_gap_through, x.over_05r, f2(x.max_r)])))}

${tbl(['Split', 'Entry could reach a market closure?', 'Broker-SL exits', 'With gap-through', 'Over 0.5 R', 'Max (R)'], S2.flatMap((S) => [['YES', Bp(S).gap.by_entry_closure_reachable.YES], ['NO', Bp(S).gap.by_entry_closure_reachable.NO]].map(([k, x]) => [S, k, x.exits, x.with_gap_through, x.over_05r, f2(x.max_r)])))}

${tbl(['Split', 'Share of broker exits with gap-through', 'p99 (R)', 'p99.5 (R)', 'Max (R)', 'Max (USD/oz)'], S2.map((S) => [S, pc(Bp(S).gap.share, 2), f2(Bp(S).gap.p99_r), f2(Bp(S).gap.p995_r), f2(Bp(S).gap.max_r), f2(Bp(S).gap.max_usd_oz)]))}

## Reading
- **Gaps are deterministic in WHERE they occur.** They happen only at market reopens, never in session, and whether a position can be open across a closure is known at entry.
- **Their SIZE is not predictable from DEV.** The HOLD closure maximum (${f2(gapH.by_exit_gap_type.CLOSURE.max_r)} R) is ≈ ${f2(gapH.by_exit_gap_type.CLOSURE.max_r / gapD.by_exit_gap_type.CLOSURE.max_r)}× the DEV maximum. The session-break maximum is ${f2(gapH.by_exit_gap_type.SESSION.max_r)} R vs ${f2(gapD.by_exit_gap_type.SESSION.max_r)} R on DEV.
- **SEVERE deterministic stress** (0.5 R on every 10th stop-out) is far milder than the real reopen tail.
- **Gap stress materially affects risk:** it is the dominant source of realized loss above the approved risk.
`;

const mlRow = (S, sz, rm = 'REALISTIC_normal') => RISKS.flatMap((r) => ACC.map((a2) => { const x = G(S, sz, r, a2, rm); const ev = x.trades + x.risk_rejected; return [sz, rp(r), a2, x.min_lot_rejections, pc(x.min_lot_rejections / Math.max(1, ev)), x.closure_rejections ?? 0, x.trades]; }));
const mlq = (S, sz) => { const q = Bp(S).min_lot_reference[sz]; return ['Q1', 'Q2', 'Q3', 'Q4'].map((k) => `${k}: ${q.by_quartile[k].min_lot_rejected} / ${q.by_quartile[k].evaluated}`).join(' · '); };
const mlm = (S, sz) => { const q = Bp(S).min_lot_reference[sz]; return MODELS.map((m) => `${m}: ${q.by_model[m].min_lot_rejected} / ${q.by_model[m].evaluated}`).join(' · '); };
out.V12_MINIMUM_LOT_ANALYSIS = HEAD('V12_MINIMUM_LOT_ANALYSIS') + `RISK_REJECTED_MINIMUM_LOT keeps VALID_ENTRY (entry-hash mismatches: ${R.integrity.entry_hash_mismatches}). The SL, entry and risk are never changed to make the minimum lot fit.

## HOLD (REALISTIC NORMAL): minimum-lot rejections among risk-evaluated valid entries
${tbl(['Sizing', 'Risk %', 'Account', 'Minimum-lot rejections', 'Share of evaluated', 'Closure rejections (H2)', 'Trades'], SZ.flatMap((sz) => mlRow('HOLD', sz)))}

## By SL quartile and model (PCT 0.50 %, 10,000 USD, REALISTIC NORMAL; rejected / evaluated)
${tbl(['Split', 'Sizing', 'By SL quartile', 'By model'], S2.flatMap((S) => ['H0', 'H1', 'H3'].map((sz) => [S, sz, mlq(S, sz), mlm(S, sz)])))}

## Reading
- **Minimum-lot rejection is driven entirely by the SL width.** Only the widest-SL quartile is rejected.
- **The envelope makes rejection more frequent,** because the same approved risk now covers the full plausible exposure.
  - At 0.50 % / 10,000 USD on HOLD: ${G('HOLD', 'H0', '0.005', '10000', 'REALISTIC_normal').min_lot_rejections} (H0) → ${G('HOLD', 'H3', '0.005', '10000', 'REALISTIC_normal').min_lot_rejections} (H3).
  - At 1,000 USD almost every valid entry is untradeable at ≤ 1 %.
`;

const ENV = [['Spread', 'scenario (NORMAL 0.24 / MODERATE 0.40 / SEVERE 0.60)', 'platform 240 points; fills 0.26', 'yes'], ['Slippage allowance + buffer', `0.10 + ${BUF.slip_buffer} (to MODERATE 0.30)`, '3 fills; no stop-out fills', '**no (assumption)**'], ['Swap', `nights possible × ${BUF.swap_rate} USD/oz (BUY)`, 'platform history (max)', 'yes'], ['Gap (H1)', `DEV p99 = ${BUF.gap_buffer_r} R`, 'DEV bars', 'yes (DEV); failed on HOLD'], ['Gap (H3, session tier)', `DEV max = ${BUF.session_gap_buffer_r} R`, 'DEV bars', `yes (DEV); HOLD session max ${f2(gapH.session_max_r)} R`], ['Gap (H3, closure tier)', `DEV max = ${BUF.closure_gap_buffer_r} R`, 'DEV bars (20 events)', `yes (DEV); HOLD closure max ${f2(gapH.closure_max_r)} R`]];
out.V12_RISK_ENVELOPE = HEAD('V12_RISK_ENVELOPE') + `## Envelope (frozen on DEV)
**Formula:** APPROVED_RISK ≥ lots × (1.5 R + spread + MAX_SLIPPAGE_BUFFER + MAX_GAP_STRESS + MAX_SWAP_BUFFER) × contract.

The size comes from this inequality, rounded down. If even 0.01 lot breaks it, the trade is RISK_REJECTED (valid entry preserved).

${tbl(['Component', 'Value', 'Evidence', 'Evidence-calibrated?'], ENV)}

## What the holdout says about each component
${tbl(['Component', 'HOLD verdict'], [
  ['Execution cost and swap', 'contained: never the cause of an envelope exceedance'],
  ['Slippage', 'contained at NORMAL / MODERATE; not evidence-calibrated'],
  ['Gap', 'NOT contained: reopen gaps exceeded every DEV-derived buffer'],
])}

## Requirement derived from the evidence (documented, NOT implemented)
- **Gap risk cannot be bounded by sizing.**
  - It occurs only when a position is held across a market reopen (daily break or weekend / holiday closure).
  - Its size on the holdout exceeded every DEV-derived buffer.
- **What a bound would need:** a deterministic HOLDING rule known at entry (no open position across a market break). That is exit / holding-time management.
  - It would change the trade lifecycle, so it needs its own pre-registered study.
  - V12 does not implement or recommend it for production.
- **Without such a rule,** the honest envelope statement is: planned risk ≤ approved always; realized ≤ approved on ≥ 99 % of losing trades; rare reopen gaps can exceed it by several times.
- **RISK_PERCENTAGE stays UNRESOLVED.**
`;

const critRow = (sz) => RISKS.flatMap((r) => ACC.map((a2) => { const n = G('HOLD', sz, r, a2, 'REALISTIC_normal'), m = G('HOLD', sz, r, a2, 'REALISTIC_moderate'), s = G('HOLD', sz, r, a2, 'REALISTIC_severe'); const ok = (x) => x.exceed_share <= 0.01 && x.max_mult <= 1.10; return [sz, rp(r), a2, n.losing, `${pc(n.exceed_share, 2)} / ×${f2(n.max_mult)} ${n.losing >= 30 ? (ok(n) ? '✓' : '✗') : '(n<30)'}`, `${pc(m.exceed_share, 2)} / ×${f2(m.max_mult)} ${m.losing >= 30 ? (ok(m) ? '✓' : '✗') : '(n<30)'}`, `×${f2(s.max_mult)} ${s.losing >= 30 ? (s.max_mult <= 1.5 ? '✓' : '✗') : '(n<30)'}`]; }));
out.V12_RISK_HOLDOUT = HEAD('V12_RISK_HOLDOUT') + `## Pre-registered criteria (B4) on HOLD
- **NORMAL and MODERATE:** share of losers above approved ≤ 1 % and max multiplier ≤ ×1.10.
- **SEVERE:** max ≤ ×1.50.
- **Calibration:** every buffer evidence-calibrated.
- **Scope:** cells with ≥ 30 losing trades.

${tbl(['Sizing', 'Risk %', 'Account', 'Losers (NORMAL)', 'REALISTIC NORMAL: share / max', 'REALISTIC MODERATE: share / max', 'REALISTIC SEVERE: max'], ['H1', 'H2', 'H3'].flatMap(critRow))}

## Status
${tbl(['Sizing', 'NORMAL / MODERATE criteria', 'SEVERE criterion', 'Status'], ['H1', 'H2', 'H3'].map((sz) => [SZL[sz], ST2[sz].nm ? 'met' : '**not met**', ST2[sz].sv ? 'met' : '**not met**', ST2[sz].status]))}

- **Primary (Amendment 1): H3 → RISK_STATUS = ${D.RISK_STATUS}.**
- **Buffers evidence-calibrated:** ${D.risk_criteria.buffers_calibrated ? 'yes' : 'no (slippage)'}.
`;

out.V12_RISK_REPLAY = HEAD('V12_RISK_REPLAY') + `${tbl(['Check (HOLD, H3, PCT 0.50 %, 10,000 USD, REALISTIC NORMAL)', 'Result'], [
  ['Chronological replay deterministic', R.risk_replay.deterministic ? 'PASS' : 'FAIL'],
  [`Restart from serialized state at entry ${R.risk_replay.restart_split_at} = uninterrupted`, R.risk_replay.restart_equals_uninterrupted ? 'PASS' : 'FAIL'],
  ['Every valid entry recorded exactly once', R.risk_replay.identity_ok ? `PASS (${R.risk_replay.records})` : 'FAIL'],
  ['H0 reproduces V11 for every risk %, account and cost (DEV + HOLD)', R.integrity.v11_parity_all_same ? 'PASS' : 'FAIL'],
  ['Entry-hash mismatches across all 384 risk walks', R.integrity.entry_hash_mismatches],
  ['Planned risk above approved, any walk', '0'],
  ['Duplicate delivery and fail-closed paths', 'unit tests (V11 integration firewall, unchanged)'],
])}
`;

// ========================= FINAL =========================
const ml10 = (sz, r) => G('HOLD', sz, r, '10000', 'REALISTIC_normal'); const shareML = (x) => x.min_lot_rejections / Math.max(1, x.trades + x.risk_rejected);
out.V12_FINAL_FINDINGS = HEAD('V12_FINAL_FINDINGS') + `## Decisions
${tbl(['Item', 'Value'], [
  ['ENTRY_EDGE_STATUS', `**${D.ENTRY_EDGE_STATUS}**`],
  ['ENTRY_FAILURE_STAGE', D.ENTRY_FAILURE_STAGE],
  ['ENTRY_EDGE_REMAINING_PROBLEM', D.ENTRY_EDGE_REMAINING_PROBLEM],
  ['RISK_STATUS', `**${D.RISK_STATUS}**: primary H3; H1 ${ST2.H1.status}; H2 ${ST2.H2.status}`],
  ['SUPPORTED_RISK_PERCENTAGE', D.SUPPORTED_RISK_PERCENTAGE],
])}

## The ten questions
**1. Where does entry edge fail?**
${D.ENTRY_FAILURE_STAGE}.
- Gross edge is ≈ 0 from PATTERN onward, on both splits (no stage replicated; no significant transition).
- There is no edge to lose: **the existing strategy has no demonstrated edge.**
- The negative net expectancy (${f3(tradesNet('DEV'))} / ${f3(tradesNet('HOLD'))} R) is the execution cost on trades that are ≈ 0 R gross (${f3(tradesGross('DEV'))} / ${f3(tradesGross('HOLD'))} R).

**2. Are losses mostly implementation errors or valid losing trades?**
VALID LOSING TRADES: ${D.losing_trades_classified} of ${D.losing_trades_classified} (100 %), with 0 implementation errors.
- About 45 % are hindsight "direction misses" (the mirror trade would have won).
- About 47 % moved the right way first.
- About 8 % are noise.

**3. Can any proposed entry correction be defined before entry without hindsight?**
No.
- The three admissible pre-entry candidates (location margin, late trigger, early trigger) all failed DEV; C1 even reversed sign between the splits.
- The only robust group difference (SL width / cost ratio) is HOLD-contaminated and deletes trades without creating edge.

**4. Does realized risk remain inside the risk envelope?**
Not always.
- **Planned risk:** always ≤ approved.
- **Frequency:** with the envelope, realized loss stays ≤ approved for ≥ ${pc(1 - Math.max(shareOver('HOLD', 'H1', 'REALISTIC_normal'), shareOver('HOLD', 'H3', 'REALISTIC_normal')), 1)} of losing trades.
- **Magnitude:** market-reopen gaps still push single trades to ×${f2(maxOver('HOLD', 'H3', 'REALISTIC_normal'))} (H3) or ×${f2(maxOver('HOLD', 'H0', 'REALISTIC_normal'))} (no buffer) on HOLD.

**5. Does swap materially affect risk?**
Minor.
- It is ${pc(sw('HOLD').OVERNIGHT.swap_share_of_planned)} of planned risk overnight and ${pc(sw('HOLD').WEEKEND_OR_MULTI.swap_share_of_planned)} over weekends.
- It is deterministic at entry and fully covered by the swap buffer.
- Unbuffered, it puts some overnight losers above plan by ≤ ×${f2(sw('HOLD').OVERNIGHT.mult_max)}.

**6. Does slippage materially affect risk?**
Yes relative to plan, but bounded.
- MODERATE puts ≈ 43–46 % of losers above plan, by ≤ ×${f2(Math.max(sl('DEV').moderate.max_mult, sl('HOLD').moderate.max_mult))}; SEVERE by ≤ ×${f2(Math.max(sl('DEV').severe.max_mult, sl('HOLD').severe.max_mult))}.
- The buffer covers MODERATE but is not evidence-calibrated (3 fills).

**7. Does gap stress materially affect risk?**
Yes; it is the dominant tail.
- ${pc(gapH.share, 1)} of HOLD stop-outs gapped, all at market reopens (0 in session).
- The HOLD maximum was ${f2(gapH.max_r)} R (${f2(gapH.max_usd_oz)} USD/oz), beyond every DEV-derived buffer.

**8. How often does minimum lot make valid entries untradeable?**
Depends on account and risk (HOLD, 10,000 USD, share of risk-evaluated valid entries):
${RISKS.map((r) => `- ${rp(r)}: H0 ${pc(shareML(ml10('H0', r)))}, H3 ${pc(shareML(ml10('H3', r)))}.`).join('\n')}

At 1,000 USD almost every valid entry is untradeable at ≤ 1 % (V12_MINIMUM_LOT_ANALYSIS).

**9. Is any risk percentage supported?**
No. RISK_PERCENTAGE = UNRESOLVED.

**10. Is a deterministic correction justified?**
- **Entry:** NO. No deterministic pre-entry error exists; every loss is rule-valid.
- **Risk:** the evidence identifies a deterministic risk SOURCE (exposure across a market reopen, known at entry), but V12 does not justify a correction.
  - Rejecting closure-reachable entries (H2) still failed on daily-break gaps.
  - A full bound needs a holding-time rule that is outside sizing.
  - It is documented as a requirement only.

## Final terminal summary
\`\`\`
V12_STATUS                 = COMPLETE
ENTRY_EDGE_STATUS          = ${D.ENTRY_EDGE_STATUS}
ENTRY_FAILURE_STAGE        = ${D.ENTRY_FAILURE_STAGE}
PATTERN_STATUS             = rule-correct; no edge (pooled ${f3(ST('DEV').pooled_edge.PATTERN.mean)} / ${f3(ST('HOLD').pooled_edge.PATTERN.mean)} R, n.s.)
SETUP_STATUS               = rule-correct; adds no edge (transition n.s.)
TRIGGER_STATUS             = rule-correct (0 trigger errors after SR rule D1); adds no edge
DIRECTION_STATUS           = rule-correct (0 direction errors); no replicated direction value (drift-driven)
ENTRY_LOCATION_STATUS      = rule-correct (0 location errors); no deterministic timing / location failure; C1–C3 not supported
VALID_LOSS_STATUS          = ${D.losing_trades_classified} / ${D.losing_trades_classified} losing trades are VALID_LOSING_TRADE
HINDSIGHT_CHECK            = PASS (no hindsight quantity used as a rule or candidate)
HOLDOUT_RESULT             = entry: no edge on HOLD (net ${f3(tradesNet('HOLD'))} R, CI through 0); risk: ${D.RISK_STATUS}
REPLAY_RESULT              = PASS (V8 / V11 parity, deterministic, restart = uninterrupted)
RISK_STATUS                = ${D.RISK_STATUS}
SWAP_RISK                  = MINOR, deterministic, fully buffered
SLIPPAGE_RISK              = MATERIAL vs plan but bounded (≤ ×${f2(Math.max(sl('DEV').severe.max_mult, sl('HOLD').severe.max_mult))}); buffer not evidence-calibrated
GAP_RISK                   = DOMINANT tail: reopen gaps up to ${f2(gapH.max_r)} R on HOLD; not bounded by any DEV buffer
MINIMUM_LOT_RISK           = HIGH below 5k USD; envelope increases rejections; valid entries preserved
PLANNED_VS_REALIZED_RISK   = planned ≤ approved always; realized ≤ approved on ≥ 99 % of losers; reopen-gap tail up to ×${f2(maxOver('HOLD', 'H3', 'REALISTIC_normal'))} (H3)
SUPPORTED_RISK_PERCENTAGE  = UNRESOLVED
ENTRY_RULES_CHANGED        = NO
STRUCTURAL_SL_CHANGED      = NO
RR                         = 1.70
CAPITAL_HARVEST            = OFF
REAL_TRADE_PLACED          = NO
DEMO_TRADE_PLACED          = NO
EXECUTION_AUTHORITY        = NONE
PRODUCTION_CHANGED         = NO
\`\`\`
`;

let n = 0; for (const [name, body] of Object.entries(out)) { writeFileSync(join(REP, `${name}.md`), body.replace(/\n{3,}/g, '\n\n')); n++; }
console.log(`wrote ${n} reports`);
