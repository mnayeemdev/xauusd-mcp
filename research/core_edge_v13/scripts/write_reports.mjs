/**
 * V13 CORE EDGE RECONSTRUCTION -- renders the 14 required reports from the frozen results (descriptive; no ranking, no score).
 *   node research/core_edge_v13/scripts/write_reports.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const RES = join(ROOT, 'results'); const REP = join(ROOT, 'reports'); mkdirSync(REP, { recursive: true });
const R = JSON.parse(readFileSync(join(RES, 'v13_results_FULL.json'), 'utf8')); const FZ = R.freeze; const D = R.decision;
const f2 = (x) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toFixed(2)); const f3 = (x) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toFixed(3)); const pc = (x) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(1)} %`);
const civ = (c) => (c && c.mean != null ? `${f3(c.mean)} [${f3(c.lo)}, ${f3(c.hi)}]` : '—'); const sig = (c) => (c && c.lo > 0 ? '▲' : c && c.hi < 0 ? '▼' : '·');
const tbl = (h, rows) => `| ${h.join(' | ')} |\n|${h.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
const S2 = ['DEV', 'HOLD']; const M5 = ['MC', 'PB', 'BO', 'SR', 'MR']; const M6 = [...M5, 'ALL']; const NAME = { MC: 'MC momentum continuation', PB: 'PB pullback continuation', BO: 'BO breakout retest', SR: 'SR structure rejection', MR: 'MR mean reversion', ALL: 'ALL (combined engine, reference)' };
const sp = (S) => R.splits[S]; const st = (S, m) => sp(S).strategies[m]; const stg = (S, m) => sp(S).stages.models[m];
const HEAD = (t) => `# ${t}\n\nV13 CORE EDGE RECONSTRUCTION · LEAN STRATEGY AUDIT · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · engine frozen (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · pre-registration ${FZ.prereg_sha.slice(0, 16)}… · freeze ${FZ.frozen_utc}\n\n`;
const LEG = 'Intervals: 95 % day-block bootstrap. ▲ / ▼ = interval entirely above / below 0; · = includes 0. Entries = every valid signal with its own geometry (evaluated independently); walk = the strategy alone in the one-position walk.';
const out = {};
const stageCell = (m, key, kind) => `DEV ${civ(kind === 'edge' ? stg('DEV', m).edge[key] : stg('DEV', m).transitions[key])} ${sig(kind === 'edge' ? stg('DEV', m).edge[key] : stg('DEV', m).transitions[key])} · HOLD ${civ(kind === 'edge' ? stg('HOLD', m).edge[key] : stg('HOLD', m).transitions[key])} ${sig(kind === 'edge' ? stg('HOLD', m).edge[key] : stg('HOLD', m).transitions[key])}`;
const groupRows = (g) => M6.flatMap((m) => Object.keys({ ...sp('DEV').groups[m][g], ...sp('HOLD').groups[m][g] }).sort().map((lv) => { const d = sp('DEV').groups[m][g][lv], h = sp('HOLD').groups[m][g][lv]; const small = !(d?.n >= 100 && h?.n >= 100); return [m, lv, d?.n ?? 0, h?.n ?? 0, small ? 'INSUFFICIENT_EVIDENCE' : 'sufficient', `${civ(d?.normal)} ${sig(d?.normal)}`, `${civ(h?.normal)} ${sig(h?.normal)}`, `${f3(d?.gross?.mean)} / ${f3(h?.gross?.mean)}`, `${f3(d?.stress_mean)} / ${f3(h?.stress_mean)}`, `${f2(d?.pf)} / ${f2(h?.pf)}`]; }));
const GH = ['Strategy', 'Level', 'n DEV', 'n HOLD', 'Sample', 'DEV net R', 'HOLD net R', 'Gross R DEV / HOLD', 'Stress R DEV / HOLD', 'PF DEV / HOLD'];

// ---------- final table (section 26) ----------
const FT = M6.map((m) => { const s = D.stage_tests[m]; return [NAME[m], s.PATTERN, s.SETUP_LABEL, s.TRIGGER, D.direction[m], s.LOCATION_GATES, `${f3(st('DEV', m).entries.gross.mean)} / ${f3(st('HOLD', m).entries.gross.mean)}`, `${f3(st('DEV', m).entries.normal.mean)} / ${f3(st('HOLD', m).entries.normal.mean)}`, `${civ(st('HOLD', m).entries.normal)} ${sig(st('HOLD', m).entries.normal)}`, `${f3(st('DEV', m).entries.stress_mean)} / ${f3(st('HOLD', m).entries.stress_mean)}`, D.strategy_status[m]]; });
const FTH = ['Strategy', 'Pattern', 'Setup', 'Trigger', 'Direction', 'Location (entry gates)', 'Gross expectancy R (DEV / HOLD)', 'Net expectancy R (DEV / HOLD)', 'Holdout (HOLD net R, CI)', 'Cost stress R (DEV / HOLD)', 'Status'];
const FINAL_TABLE = tbl(FTH, FT);
const nNo = M5.filter((m) => D.strategy_status[m] === 'EDGE_NOT_DEMONSTRATED').length, nYes = M5.filter((m) => D.strategy_status[m] === 'EDGE_DEMONSTRATED').length, nIns = M5.filter((m) => D.strategy_status[m] === 'INSUFFICIENT_EVIDENCE').length;
const sg = R.subgroups; const sgSuff = sg.filter((x) => x.sample === 'SUFFICIENT'); const holdOnly = sg.filter((x) => x.passes_hold && !x.passes_dev).map((x) => x.key);

out.V13_CORE_EDGE_RECONSTRUCTION = HEAD('V13_CORE_EDGE_RECONSTRUCTION') + `## The one question
Do the EXISTING rules have a demonstrated edge?

## Answer
**${D.EDGE_STATUS === 'EDGE_NOT_DEMONSTRATED' ? 'NO' : D.EDGE_STATUS}. EDGE_STATUS = ${D.EDGE_STATUS}. CORRECTION_CANDIDATE = ${Array.isArray(D.CORRECTION_CANDIDATE) ? D.CORRECTION_CANDIDATE.join(', ') : D.CORRECTION_CANDIDATE}.**
- **Strategies:** ${nYes} of 5 have a demonstrated edge; ${nNo} of 5 show no demonstrated edge (NO_DEMONSTRATED_EDGE); ${nIns} are insufficient evidence.
- **Stages:** no pattern, setup, trigger, direction or location stage shows an edge that holds on both DEV and HOLD, in any strategy.
- **Costs:** every strategy is negative under stress cost on both splits; the combined engine is ≈ 0 gross and negative net (NO_COST_RESILIENT_EDGE).
- **Subgroups:** 66 simple pre-registered subgroups were checked. One passed DEV and failed HOLD; none survives.
- **Recommendation:** STOP_COMPLEXITY_RECOMMENDATION (V13_NO_EDGE_FINDINGS). The strategy should remain research-only.

## Final table (descriptive; no ranking, no score, no winner)
${FINAL_TABLE}

Gross / net / stress values are mean R per valid entry (own geometry). ${LEG}

## Owner principle
A simple strategy with no demonstrated edge is preferable to a complex strategy whose apparent edge exists only because of overfitting. V13 found no simple edge, and it adds no complexity.

Reports: V13_STRATEGY_BY_STRATEGY · V13_PATTERN_EDGE · V13_SETUP_EDGE · V13_TRIGGER_EDGE · V13_DIRECTION_EDGE · V13_LOCATION_EDGE · V13_COST_RESILIENCE · V13_DEVELOPMENT_VS_HOLDOUT · V13_REPLAY_VALIDATION · V13_HINDSIGHT_AUDIT · V13_CORRECTION_CANDIDATES · V13_NO_EDGE_FINDINGS · V13_FINAL_DECISION
`;

out.V13_STRATEGY_BY_STRATEGY = HEAD('V13_STRATEGY_BY_STRATEGY') + `Each strategy independently. Strategies are not combined; "ALL" is the combined engine, shown for reference only. Nothing is ranked.

## Valid entries (own geometry)
${tbl(['Split', 'Strategy', 'Valid setups', 'Valid entries', 'Win rate', 'Avg win R', 'Avg loss R', 'Expectancy R gross', 'Expectancy R normal', 'Expectancy R stress', 'PF', 'MFE R', 'MAE R', '1.70R reach', 'Avg duration (bars)'], S2.flatMap((S) => M6.map((m) => { const e = st(S, m).entries; return [S, m, st(S, m).valid_setups, e.n, pc(e.win_rate), f2(e.avg_win_r), f2(e.avg_loss_r), `${civ(e.gross)} ${sig(e.gross)}`, `${civ(e.normal)} ${sig(e.normal)}`, f3(e.stress_mean), f2(e.pf), f2(e.mfe_r), f2(e.mae_r), pc(e.reach_170), f2(e.duration_bars)]; })))}

## Strategy alone in the one-position walk
${tbl(['Split', 'Strategy', 'Trades', 'Win rate', 'Avg win R', 'Avg loss R', 'Expectancy R normal (CI)', 'Gross R', 'Stress R', 'PF', 'Max DD R', 'MFE R', 'MAE R', '1.70R reach', 'Avg duration (bars)'], S2.flatMap((S) => M6.map((m) => { const w = st(S, m).walk; return [S, m, w.trades, pc(w.win_rate), f2(w.avg_win_r), f2(w.avg_loss_r), `${civ(w.ci_normal)} ${sig(w.ci_normal)}`, f3(w.gross_expectancy), f3(w.stress_expectancy), f2(w.pf), f2(w.max_dd_r), f2(w.mfe_r), f2(w.mae_r), pc(w.reach_170), f2(w.duration_bars)]; })))}

## Status (rule A)
${tbl(['Strategy', 'Status'], M6.map((m) => [NAME[m], D.strategy_status[m]]))}

${LEG}
`;

out.V13_PATTERN_EDGE = HEAD('V13_PATTERN_EDGE') + `## Does the actual pattern contain measurable edge?
The PATTERN-stage probe edge is measured against the same-side baseline, gross, with both sides pooled per strategy.
${tbl(['Strategy', 'PATTERN edge (DEV · HOLD)', 'Class'], M6.map((m) => [m, stageCell(m, 'PATTERN', 'edge'), D.stage_tests[m].PATTERN]))}

## Existing pattern-event categories (last 5m structure event: BOS / CHOCH), valid entries, net R
${tbl(GH, groupRows('PATTERN_EVENT'))}

## Reading
- **No strategy's pattern carries an edge that holds on both splits.**
- **No pattern-event category is stable.** A category that is positive on one split is not positive on the other with a separated interval.
- **No new pattern categories were created.**
`;

out.V13_SETUP_EDGE = HEAD('V13_SETUP_EDGE') + `## Does the setup add value beyond the pattern? (PATTERN → SETUP change in gross edge)
${tbl(['Strategy', 'PATTERN → SETUP (DEV · HOLD)', 'Class', 'Label'], M6.map((m) => [m, stageCell(m, 'PATTERN->SETUP', 'trans'), D.stage_tests[m].SETUP, D.stage_tests[m].SETUP_LABEL]))}

## Existing setup / stop types (engine SL source), valid entries, net R
${tbl(GH, groupRows('SL_SOURCE'))}

## Reading
**SETUP_ADDS_NO_DEMONSTRATED_EDGE** for every strategy: the pattern ≈ 0 and the setup adds ≈ 0.
`;

out.V13_TRIGGER_EDGE = HEAD('V13_TRIGGER_EDGE') + `## Does the trigger add value beyond the setup? (SETUP → TRIGGER change in gross edge)
${tbl(['Strategy', 'SETUP → TRIGGER (DEV · HOLD)', 'Class'], M6.map((m) => [m, stageCell(m, 'SETUP->TRIGGER', 'trans'), D.stage_tests[m].TRIGGER]))}

## Reading
- **No strategy's trigger adds a demonstrated edge.**
- **The trigger rules execute correctly.** V8 stage parity is 0 mismatches; V12 attribution found 0 trigger errors. No new trigger rule was tested or created.
`;

const dirRows = S2.flatMap((S) => M6.map((m) => { const d = sp(S).direction[m]; return [S, m, d.BUY.n, `${civ(d.BUY.normal)} ${sig(d.BUY.normal)}`, d.SELL.n, `${civ(d.SELL.normal)} ${sig(d.SELL.normal)}`, `${civ(d.buy_minus_sell)} ${sig(d.buy_minus_sell)}`]; }));
out.V13_DIRECTION_EDGE = HEAD('V13_DIRECTION_EDGE') + `## BUY vs SELL per strategy (valid entries, net R; descriptive only, no directional filter)
${tbl(['Split', 'Strategy', 'BUY n', 'BUY net R', 'SELL n', 'SELL net R', 'BUY − SELL'], dirRows)}

## Class (rule C)
${tbl(['Strategy', 'Direction', 'TRIGGER → DIRECTION (bias rule) change (DEV · HOLD)', 'Class'], M6.map((m) => [m, D.direction[m], stageCell(m, 'TRIGGER->DIRECTION', 'trans'), D.stage_tests[m].DIRECTION]))}

## Direction context (existing attributes): 15m bias vs side, 5m structure vs side
${tbl(GH, [...groupRows('BIAS'), ...groupRows('STRUCTURE')])}

## Reading
- **NO_DIRECTION_EDGE** for every strategy.
- **The combined engine flips sign.** BUY was better on DEV (BUY − SELL ${civ(sp('DEV').direction.ALL.buy_minus_sell)}) and SELL on HOLD (${civ(sp('HOLD').direction.ALL.buy_minus_sell)}). That is the market drift of each period, not a direction skill.
- **Not stable, so no directional preference is supported.**
`;

out.V13_LOCATION_EDGE = HEAD('V13_LOCATION_EDGE') + `## Do the existing entry gates (quality, location ≤ 2.5 ATR, RR ≥ 1.70, conflict) add value? (DIRECTION → ENTRY change)
${tbl(['Strategy', 'DIRECTION → ENTRY (DEV · HOLD)', 'Class'], M6.map((m) => [m, stageCell(m, 'DIRECTION->ENTRY', 'trans'), D.stage_tests[m].LOCATION_GATES]))}

## Existing location classes (V8: VALID ≤ 2.0 ATR, MARGINAL 2.0–2.5 ATR from the anchor), valid entries, net R
${tbl(GH, groupRows('LOCATION'))}

## Reading
- **No location edge is demonstrated.**
- **The combined engine's MARGINAL class is unstable.** It passed the DEV screen (net ${civ(sp('DEV').groups.ALL.LOCATION['MARGINAL_2.0_2.5'].normal)}) and reversed on HOLD (${civ(sp('HOLD').groups.ALL.LOCATION['MARGINAL_2.0_2.5'].normal)}).
- **No distance threshold was invented or optimised.** Only the two existing V8 classes were used.
`;

const costRows = S2.flatMap((S) => M6.map((m) => { const e = st(S, m).entries, w = st(S, m).walk; return [S, m, `${civ(e.gross)} ${sig(e.gross)}`, `${civ(e.normal)} ${sig(e.normal)}`, `${civ(e.stress)} ${sig(e.stress)}`, `${f3(w.gross_expectancy)} / ${f3(w.normal_expectancy)} / ${f3(w.stress_expectancy)}`, D.cost_labels[m][S]]; }));
out.V13_COST_RESILIENCE = HEAD('V13_COST_RESILIENCE') + `## Cost bases
- **GROSS:** zero spread and slippage, swap added back.
- **NORMAL:** 0.24 + 0.10.
- **STRESS:** 0.60 + 0.60.
- **Gap risk:** excluded (V12 records it separately).

${tbl(['Split', 'Strategy', 'Entries gross R', 'Entries normal R', 'Entries stress R', 'Walk gross / normal / stress R', 'Label'], costRows)}

## Reading
- **No strategy has a gross expectancy whose interval is above 0 on either split.**
- **Costs make every strategy negative under stress on both splits.**
- **Where gross ≈ 0 and normal < 0, the label is NO_COST_RESILIENT_EDGE.**
- **Risk management and Capital Harvest cannot help.** Neither can compensate for this, and neither was used.
`;

out.V13_DEVELOPMENT_VS_HOLDOUT = HEAD('V13_DEVELOPMENT_VS_HOLDOUT') + `## All pre-registered subgroups (${sg.length})
- **Sample:** ${sgSuff.length} have sufficient samples (≥ 100 entries in each split); ${sg.length - sgSuff.length} are INSUFFICIENT_EVIDENCE.
- **Sign stability:** of the sufficient ones, ${sgSuff.filter((x) => x.sign_stable).length} keep the same sign on both splits.
- **Positive on both splits (point estimates):** ${sgSuff.filter((x) => x.dev_normal.mean > 0 && x.hold_normal.mean > 0).length}, all with intervals through 0.

${tbl(['Subgroup (strategy | grouping | level)', 'n DEV', 'n HOLD', 'Sample', 'DEV net R', 'HOLD net R', 'Sign stable', 'Passes DEV screen', 'Passes HOLD criteria'], sg.map((x) => [x.key, x.n_dev, x.n_hold, x.sample, `${civ(x.dev_normal)} ${sig(x.dev_normal)}`, `${civ(x.hold_normal)} ${sig(x.hold_normal)}`, x.sign_stable == null ? '—' : x.sign_stable ? 'yes' : 'no', x.passes_dev ? '**yes**' : 'no', x.passes_hold ? '**yes**' : 'no']))}

## Reading
- **Frozen candidates:** only ${FZ.candidates_frozen.length} subgroup passed the DEV screen (${FZ.candidates_frozen.join(', ') || 'none'}). It failed HOLD.
- **HOLD-only passes:** ${holdOnly.length ? holdOnly.join(', ') : 'none'} passed the criteria on HOLD alone, after failing DEV. Selecting it would be holdout tuning, so it is NOT a candidate.
- **No subgroup works on both splits.**
`;

const rp = R.replay.parity;
out.V13_REPLAY_VALIDATION = HEAD('V13_REPLAY_VALIDATION') + `${tbl(['Check', 'DEV', 'HOLD'], [
  ['Valid entries = V8 signals', `${rp.DEV.entries} = ${rp.DEV.v8_signals}`, `${rp.HOLD.entries} = ${rp.HOLD.v8_signals}`],
  ['Per-strategy entry counts = V8 model mix', rp.DEV.model_mix_equal ? 'equal' : 'DIFFERENT', rp.HOLD.model_mix_equal ? 'equal' : 'DIFFERENT'],
  ['Combined one-position trades = V8', `${rp.DEV.combined_trades} = ${rp.DEV.v8_trades}`, `${rp.HOLD.combined_trades} = ${rp.HOLD.v8_trades}`],
  ['Combined expectancy (R) vs V8', `${rp.DEV.combined_expectancy} vs ${rp.DEV.v8_expectancy}`, `${rp.HOLD.combined_expectancy} vs ${rp.HOLD.v8_expectancy}`],
  ['Probe stage edges vs V12 (max absolute difference)', rp.DEV.v12_probe_edge_max_abs_diff, rp.HOLD.v12_probe_edge_max_abs_diff],
])}

- **Deterministic re-run** (HOLD outcomes and walk recomputed, identical hash): ${R.replay.deterministic_rerun ? 'PASS' : 'FAIL'}.
- **REPLAY_PARITY:** ${R.replay.ok ? 'PASS' : 'FAIL'}.
`;

out.V13_HINDSIGHT_AUDIT = HEAD('V13_HINDSIGHT_AUDIT') + `${tbl(['Quantity', 'Known before entry?', 'Use'], [
  ['Strategy (model), side', 'YES', 'unit of analysis, DIRECTION grouping'],
  ['Anchor distance class (V8 VALID / MARGINAL)', 'YES', 'LOCATION grouping'],
  ['5m structure state (st5)', 'YES', 'STRUCTURE grouping'],
  ['Last 5m structure event (BOS / CHOCH)', 'YES', 'PATTERN_EVENT grouping'],
  ['Engine SL source', 'YES', 'SL_SOURCE grouping'],
  ['15m bias', 'YES', 'BIAS grouping'],
  ['Stage strings and bias-aware triggers', 'YES', 'stage tests'],
  ['Outcome R, MFE, MAE, 1.70 R reach, duration', 'NO: HINDSIGHT_ONLY', 'metrics only, never a condition'],
  ['Probe outcome after a stage bar', 'NO: HINDSIGHT_ONLY', 'measurement only'],
])}

**HINDSIGHT_CHECK = PASS.**
- Every grouping is computed from fields recorded at the signal close; a unit test shows that adding outcome fields never changes a level.
- No future candle, MFE, MAE, outcome, structure, reversal or price movement enters any condition.
`;

const cands = D.candidates_holdout;
out.V13_CORRECTION_CANDIDATES = HEAD('V13_CORRECTION_CANDIDATES') + `## Protocol (pre-registered rule D)
A correction candidate must satisfy all of:
- defined before entry;
- deterministic;
- ≥ 100 entries per split;
- gross and normal CI above 0, and stress mean above 0, on DEV;
- frozen;
- the same on HOLD;
- replay parity.

## Candidates frozen on DEV and their single HOLD test
${tbl(['Subgroup', 'DEV n', 'DEV gross R (CI)', 'DEV net R (CI)', 'DEV stress R', 'HOLD n', 'HOLD net R (CI)', 'HOLD stress R', 'Survives'], Object.entries(cands).map(([k, c]) => [k, c.dev.n, civ(c.dev.gross), civ(c.dev.normal), f3(c.dev.stress_mean), c.hold.n, `${civ(c.hold.normal)} ${sig(c.hold.normal)}`, f3(c.hold.stress_mean), c.survives ? '**yes**' : 'no']))}

## Not admissible
${holdOnly.length ? `${holdOnly.join(', ')}: passes on HOLD only (failed DEV). Using it would be holdout selection.` : 'none'}

## Result
**CORRECTION_CANDIDATE = ${Array.isArray(D.CORRECTION_CANDIDATE) ? D.CORRECTION_CANDIDATE.join(', ') : D.CORRECTION_CANDIDATE}.** No change is proposed to any strategy.
`;

out.V13_NO_EDGE_FINDINGS = HEAD('V13_NO_EDGE_FINDINGS') + `## NO_DEMONSTRATED_EDGE records
None of these strategies is modified, disabled or deleted.
${tbl(['Strategy', 'Status', 'DEV net R (CI)', 'HOLD net R (CI)', 'Cost label DEV / HOLD'], M6.map((m) => [NAME[m], D.strategy_status[m], civ(st('DEV', m).entries.normal), civ(st('HOLD', m).entries.normal), `${D.cost_labels[m].DEV} / ${D.cost_labels[m].HOLD}`]))}

## STOP_COMPLEXITY_RECOMMENDATION
**1. What was tested (V8 → V13, same frozen engine, same data):**
- implementation correctness: 6 defects found and corrected in V8; stage parity 0 mismatches;
- profit management: Capital Harvest (V9);
- risk sizing and capital control: V10;
- entry-risk integration: V11;
- the stage-by-stage funnel, timing, location, direction and realized risk: V12;
- each strategy separately, each stage, direction, location, cost resilience and 66 simple pre-entry subgroups: V13.

**2. What was rejected:**
- every risk percentage (V10);
- every daily, streak and weekly control (V10);
- every Capital Harvest policy (V9);
- every pre-entry correction candidate (V12 C1–C3; V13 the one DEV candidate);
- every directional preference (it flips with the market regime);
- every stage as an edge source.

**3. Why further filtering is unsupported:**
- The gross expectancy is ≈ 0 at every stage of every strategy.
- A filter can only remove trades from a stream with no gross edge. It cannot create edge; it only changes which zero-edge trades remain, and the subgroups that look good on one split do not repeat on the other.
- More filters would add parameters that fit noise, which the owner principle rejects.

**4. What evidence would actually be required before any further strategy work:**
- A strategy definition that produces positive GROSS expectancy with a day-block interval above 0 on a development period AND on an untouched holdout. HOLD has now been viewed many times, so this requires new data: forward shadow observation or a period outside 2025-05 → 2026-09.
- That edge surviving NORMAL and STRESS costs (spread, slippage, swap).
- Replay parity and a frozen rule written before the test.
- Only then: risk sizing (V10 / V11 mechanics) and the reopen-gap problem (V12), which remain open on their own.

**5. Status of the current strategy:**
- **RESEARCH-ONLY.** It should remain research-only: no DEMO and no REAL authorisation is supported by the evidence.
- **The V8 forward shadow** can keep measuring rule correctness, as evidence, not as a target.
- **No V14 filter-research project** is recommended.
`;

out.V13_FINAL_DECISION = HEAD('V13_FINAL_DECISION') + `## Decision
**${D.EDGE_STATUS}**

## Final table (descriptive; no ranking, no score, no winner)
${FINAL_TABLE}

## Final terminal summary
\`\`\`
V13_STATUS                          = COMPLETE
EDGE_STATUS                         = ${D.EDGE_STATUS}
STRATEGY_COUNT                      = 5 (MC, PB, BO, SR, MR)
STRATEGIES_WITH_DEMONSTRATED_EDGE   = ${nYes}
STRATEGIES_WITHOUT_DEMONSTRATED_EDGE= ${nNo} (${M5.filter((m) => D.strategy_status[m] === 'EDGE_NOT_DEMONSTRATED').join(', ')})
INSUFFICIENT_EVIDENCE_STRATEGIES    = ${nIns}
PATTERN_EDGE                        = NOT DEMONSTRATED (${M5.filter((m) => D.stage_tests[m].PATTERN === 'DEMONSTRATED').length} of 5)
SETUP_EDGE                          = SETUP_ADDS_NO_DEMONSTRATED_EDGE (${M5.filter((m) => D.stage_tests[m].SETUP_LABEL === 'SETUP_ADDS_NO_DEMONSTRATED_EDGE').length} of 5)
TRIGGER_EDGE                        = NOT DEMONSTRATED (${M5.filter((m) => D.stage_tests[m].TRIGGER === 'DEMONSTRATED').length} of 5 add edge)
DIRECTION_EDGE                      = NO_DIRECTION_EDGE (combined engine flips sign DEV -> HOLD)
LOCATION_EDGE                       = NOT DEMONSTRATED (MARGINAL class reversed DEV -> HOLD)
COST_RESILIENCE                     = NO_COST_RESILIENT_EDGE (stress negative for every strategy on both splits)
HOLDOUT_STABILITY                   = NONE (1 DEV candidate reversed on HOLD; no subgroup passes both)
REPLAY_PARITY                       = ${R.replay.ok ? 'PASS' : 'FAIL'}
HINDSIGHT_CHECK                     = PASS
CORRECTION_CANDIDATE                = ${Array.isArray(D.CORRECTION_CANDIDATE) ? D.CORRECTION_CANDIDATE.join(', ') : D.CORRECTION_CANDIDATE}
RISK_PERCENTAGE                     = UNRESOLVED
CAPITAL_HARVEST                     = OFF
RR                                  = 1.70
ENTRY_RULES_CHANGED                 = NO
STRUCTURAL_SL_CHANGED               = NO
REAL_TRADE_PLACED                   = NO
DEMO_TRADE_PLACED                   = NO
EXECUTION_AUTHORITY                 = NONE
PRODUCTION_CHANGED                  = NO
\`\`\`

**Next step:** STOP_COMPLEXITY_RECOMMENDATION (V13_NO_EDGE_FINDINGS). No V14 filter research. The strategy remains research-only.
`;

let n = 0; for (const [name, body] of Object.entries(out)) { writeFileSync(join(REP, `${name}.md`), body.replace(/\n{3,}/g, '\n\n')); n++; }
console.log(`wrote ${n} reports`);
