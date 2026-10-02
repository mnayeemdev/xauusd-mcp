/**
 * V17 RISK GATE HARDENING -- renders the 20 required reports from results/ (no computation that could change a result).
 *   node research/risk_gate_v17/scripts/write_reports.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const RES = join(ROOT, 'results'); const REP = join(ROOT, 'reports'); mkdirSync(REP, { recursive: true });
const R = JSON.parse(readFileSync(join(RES, 'v17_results.json'), 'utf8')); const D = R.decision; const FZ = R.freeze; const SC = FZ.scenarios; const W = R.walks; const BR = R.broker;
const T = existsSync(join(RES, 'test_counts.json')) ? JSON.parse(readFileSync(join(RES, 'test_counts.json'), 'utf8')) : null;
const tbl = (h, rows) => `| ${h.join(' | ')} |\n|${h.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
const st = (o) => (o && o.n ? `n ${o.n}; mean ${o.mean}; p50 ${o.p50}; p90 ${o.p90}; p99 ${o.p99}; max ${o.max}` : '—'); const fmt = (o) => Object.entries(o ?? {}).map(([k, v]) => `${k}: ${v}`).join('; ') || '—';
const yn = (b) => (b === true ? 'YES' : b === false ? 'NO' : 'n/a'); const pc = (x) => (x == null ? '—' : `${(x * 100).toFixed(2)} %`); const n2 = (x) => (x == null ? '—' : Number(x).toFixed(2));
const RPS = [0.001, 0.0025, 0.005, 0.01]; const SCN = ['NORMAL', 'MODERATE', 'SEVERE']; const SPL = ['DEV', 'HOLD'];
const HEAD = (t) => `# ${t}\n\nV17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ${R.prereg_sha.slice(0, 16)}… · freeze ${R.freeze_sha.slice(0, 16)}…\n\n`;
const H = (S, scn, rp = 0.005, basis = 'ENVELOPE') => W[S][`${scn}|${rp}|${basis}`];
const decisionOf = (w) => { const L = w.losing; const within = w.exceedance.WITHIN_RISK ?? 0; const parts = Object.entries(w.exceedance).filter(([k]) => k !== 'WITHIN_RISK').map(([k, v]) => `${k} ${v}`); return `${within}/${L} losers within planned${parts.length ? `; ${parts.join(', ')}` : ''}`; };
const out = {};

out.V17_RISK_GATE_HARDENING = HEAD('V17_RISK_GATE_HARDENING') + `## Scope
The owner's eight items: planned vs realized risk, gap exposure, slippage, swap, minimum-lot constraints, margin, risk rejection, fail-safe behaviour. Nothing else changed.

## The gate (\`scripts/riskgate.mjs\`, pure; every step can only reject)
1. Broker data validated → RISK_REJECTED_BROKER_DATA.
2. Equity, SL, risk inputs, quote (V16 timing) → EQUITY_UNAVAILABLE / SL_INVALID / INVALID_RISK / QUOTE.
3. Duplicate, open exposure (max 1), production breakers, existing re-entry guard.
4. PRIMARY: risk % UNRESOLVED → VALID_ENTRY + RISK_PERCENTAGE_UNRESOLVED.
5. Sizing:
   - equity × research risk % → cash risk;
   - exposure per oz = 1.5 × structural distance + spread + 0.10 (+ envelope swap);
   - lots rounded DOWN to the step;
   - **actual exposure recalculated after rounding** → MINIMUM_LOT / BROKER_LIMIT (no silent cap) / INVALID_SIZE / INCONSISTENT / STOPS_LEVEL / MARGIN_REJECTED.
6. The entry is hashed before and after. The SL is an input only.

## What is new compared with V10 / V11
- **Owner reject codes.** Every rejection now uses the owner's code (MINIMUM_LOT, BROKER_LIMIT, INVALID_SIZE, BROKER_DATA, MARGIN_REJECTED, …).
- **No silent maximum-lot cap.** V10 capped silently at volume_max; V17 rejects.
- **Live broker data:** a read-only capture, validated against MT5's own calculators and the REAL bridge record.
- **Realized risk is decomposed per trade:** stop loss, commission, swap, slippage, gap. The exceedance is classified.
- **Swap** follows the broker calendar (triple Wednesday, no weekend charges) instead of a flat rate.
- **Gap** is measured from data. No invented multiplier: V10's "every 10th stop gaps 0.5 R" is retired.
- **Envelope sizing:** the gate sizes on planned + commission + the known maximum swap. The gap tail is reported separately.

## Status
**${D.RISK_GATE_STATUS}.** Separately reported:
- GAP_RISK = ${D.GAP_RISK};
- SLIPPAGE_RISK = UNRESOLVED;
- RISK_PERCENTAGE = UNRESOLVED;
- DAILY_LOSS_POLICY = UNRESOLVED.
`;

const ex = W.DEV['NORMAL|0.005|ENVELOPE'].max_exceedance;
out.V17_POSITION_SIZING = HEAD('V17_POSITION_SIZING') + `## Pipeline (owner §4)
CURRENT EQUITY → APPROVED RESEARCH RISK % → MAX CASH RISK → EXECUTION PRICE (BUY ask / SELL bid) → STRUCTURAL SL → POSITION SIZE (rounded down) → BROKER ROUNDING → ACTUAL STOP EXPOSURE (recalculated).

## Worked example (DEV trade ${ex?.id}, NORMAL, 0.50 %)
${ex ? tbl(['Step', 'Value'], [['equity × 0.50 % = planned risk amount', `${n2(ex.planned_risk_amount)} USD`], ['execution price (SELL bid)', String(ex.entry_price)], ['structural SL (V8, unchanged)', String(ex.sl_price)], ['exposure per oz = 1.5 × |entry − SL| + spread + 0.10', n2(1.5 * Math.abs(ex.engine_entry - ex.sl_price) + 0.24 + 0.1)], ['raw size → rounded DOWN', `${ex.position_size} lot`], ['actual stop exposure after rounding', `${n2(ex.actual_stop_risk)} USD (≤ planned)`], ['hard broker stop', String(ex.broker_sl)], ['margin required', `${ex.margin_required} USD`]]) : ''}

## Decisions in the chronological walk (10,000 USD, ENVELOPE basis, NORMAL)
${tbl(['Split', 'Risk %', 'Decisions'], SPL.flatMap((S) => RPS.map((rp) => [S, pc(rp), fmt(H(S, 'NORMAL', rp).decisions)])))}

- **Determinism:** the same inputs give the same size (tested). Every accepted size is re-checked after rounding.
- **Invariants over all walks:** ${R.invariants.rounding_violations} over-risk after rounding; ${R.invariants.rr_violations} RR violations.
- **PRIMARY** (risk % unresolved): DEV ${fmt(R.primary.DEV)}; HOLD ${fmt(R.primary.HOLD)}.
`;

out.V17_MINIMUM_LOT = HEAD('V17_MINIMUM_LOT') + `## Rule
If the rounded size is below volume_min (${R.spec.volume_min}), the minimum lot would exceed the permitted risk → RISK_REJECTED_MINIMUM_LOT. The size is never rounded up, and the risk, SL and entry are never changed. VALID_ENTRY is kept.

## Share of valid entries rejected for the minimum lot (static, NORMAL, ENVELOPE basis)
${tbl(['Split', 'Equity (USD)', ...RPS.map(pc)], SPL.flatMap((S) => [250, 1000, 10000].map((eq) => [S, String(eq), ...RPS.map((rp) => pc(R.minimum_lot[S][`${eq}|${rp}`].share_min_lot))])))}

## Risk the minimum lot would have taken, when rejected (% of equity)
${tbl(['Split', 'Equity', 'Risk %', 'Min-lot risk of rejected entries (% of equity)'], SPL.flatMap((S) => [250, 1000].map((eq) => [S, String(eq), pc(0.005), st(R.minimum_lot[S][`${eq}|0.005`].min_lot_risk_pct_of_rejected)])))}

**Reading:** at small equity almost every valid entry is rejected rather than over-risked. This is the V10 finding, unchanged: the 0.01-lot minimum needs several thousand USD for a 0.25–0.50 % risk.
`;

out.V17_MAXIMUM_LOT = HEAD('V17_MAXIMUM_LOT') + `## Rule
- **Over the maximum:** if the rounded size is above volume_max (${R.spec.volume_max} lots, live broker data), the result is RISK_REJECTED_BROKER_LIMIT.
- **No silent cap:** V10's \`sizePosition\` capped silently at volume_max. V17 rejects, because a capped size was never part of the approved risk model.
- **Tests:** a 1e9 USD account at 1 % with a 0.5 USD stop is rejected; \`checkVolume(201)\` is rejected.

## Replay
- **Not binding.** The maximum lot never binds at 10,000 USD: the largest size is far below 200 lots. There are no BROKER_LIMIT rejections in any walk.
- **The rule is in force, not exercised:** it exists for completeness and is test-covered.
`;

out.V17_LOT_STEP = HEAD('V17_LOT_STEP') + `## Rule
- **Rounding:** sizes are rounded DOWN to volume_step (${R.spec.volume_step}).
- **\`checkVolume\`** rejects with:
  - RISK_REJECTED_INVALID_SIZE for an off-grid or non-finite size;
  - RISK_REJECTED_MINIMUM_LOT below the minimum;
  - RISK_REJECTED_BROKER_LIMIT above the maximum.
- **Incoherent broker data:** a step / minimum mismatch (e.g. a 0.015 minimum on a 0.01 step) or a missing step makes the broker data invalid → RISK_REJECTED_BROKER_DATA.

## Evidence
- **Over-risk after rounding:** ${R.invariants.rounding_violations} cases over every walk (raw-value comparison; see CORRECTION_LOG D2).
- **Broker-rounding exceedance:** ${R.invariants.broker_rounding_exceedance}. It is impossible by construction, and asserted.
- **Broker-rounding test:** sizes for equities 1,000–50,000 × every risk % are always on the grid and never above the cash risk.
`;

out.V17_STRUCTURAL_SL = HEAD('V17_STRUCTURAL_SL') + `## Authority
- **The V8 structural SL is an input only.** It is never widened, tightened or moved to fit a dollar-risk target.
- **The structural stop acts on a confirmed 5m close beyond it** (thesis invalidation, exit at that close).
- **The hard broker stop** sits at the fill ∓ (1.5 × structural distance + spread). That is production \`LOSS_CONTROL.structuralMultiple\` = ${R.rules.structuralMultiple}, and it is the stop exposure sized for.
- **An SL that is missing, non-finite or on the wrong side** of the entry or the execution price → RISK_REJECTED_SL_INVALID.
- **An SL that cannot produce a safe size** → rejected: MINIMUM_LOT / MARGIN / STOPS_LEVEL.

## Evidence
- **Accepted trades:** in every one, the recorded \`sl_price\` equals the engine SL, and RR = 1.70 from the execution price (${R.invariants.rr_violations} violations).
- **Risk firewall:** the entry hash is recorded and re-checked; any change throws.
`;

const comp = (S, scn = 'NORMAL') => { const w = H(S, scn); return [S, scn, String(w.accepted), String(w.losing), n2(w.planned_risk_amount.mean), n2(w.actual_stop_risk.mean), n2(w.stop_loss_loss_losers.mean), n2(w.commission.mean), `${n2(w.swap.mean)} (max ${n2(w.swap.max)})`, n2(w.slippage.mean), `${n2(w.gap_impact_all.mean)} (max ${n2(w.gap_impact_all.max)})`, `${n2(w.total_realized_losers.mean)} (max ${n2(w.total_realized_losers.max)})`, st(w.multiplier_losers)]; };
out.V17_PLANNED_VS_REALIZED_RISK = HEAD('V17_PLANNED_VS_REALIZED_RISK') + `## Planned (owner §9) and realized (owner §10) are recorded separately for every trade
- **Planned:** PLANNED_RISK_AMOUNT, PLANNED_RISK_PERCENT, ENTRY_PRICE, SL_PRICE, POSITION_SIZE, plus the post-rounding ACTUAL_STOP_RISK.
- **Realized:** STOP_LOSS_LOSS, COMMISSION, SWAP, SLIPPAGE, GAP_IMPACT → TOTAL_REALIZED_RISK and RISK_MULTIPLIER (= total ÷ actual stop risk).
- **The planned SL is not a guaranteed loss:** slippage beyond the allowance, swap and gaps through the stop are all recorded.

## 0.50 % research scenario, 10,000 USD, ENVELOPE basis (USD; losers for the loss columns)
${tbl(['Split', 'Scenario', 'Accepted', 'Losers', 'Planned risk', 'Actual stop risk', 'Stop-loss loss', 'Commission', 'Swap', 'Slippage', 'Gap impact', 'Total realized (losers)', 'Risk multiplier (losers)'], SPL.flatMap((S) => SCN.map((scn) => comp(S, scn))))}

## Stop execution vs gap through the stop
- **STOP EXECUTION:** the hard stop fills at its level plus slippage. In NORMAL, the multiplier is exactly 1.00 (sized for it).
- **GAP THROUGH STOP:** the bar opens beyond the level, and the fill is at that open. This is GAP_IMPACT, with no upper bound from the stop itself (see V17_GAP_RISK).
`;

const sw = (S, rule) => R.swap[S][rule];
out.V17_SWAP = HEAD('V17_SWAP') + `## Broker rates (live read-only capture)
- **Long:** ${R.swap.DEV.usd_per_oz_per_night.long} USD per oz per charged night (−513.2 points × 0.001).
- **Short:** ${R.swap.DEV.usd_per_oz_per_night.short} (no swap on SELL positions).
- **Triple:** on day ${R.spec.swap_rollover3days} (Wednesday).
- **Calendar:** Saturday and Sunday rollovers are not charged.

## Categories (0.50 %, NORMAL, ENVELOPE walk; cost USD; share of the actual stop risk)
${tbl(['Split', 'Rule', 'Category', 'Trades', 'BUY', 'Swap cost (USD)', 'Swap / stop risk'], SPL.flatMap((S) => [['midnight_rule', '00:00 broker time (primary)'], ['daily_break_rule_sensitivity', 'daily break (sensitivity)']].flatMap(([k, lab]) => ['INTRADAY', 'OVERNIGHT', 'TRIPLE_ROLLOVER'].map((c) => [S, lab, c, String(sw(S, k)[c].trades), String(sw(S, k)[c].buy_trades), st(sw(S, k)[c].swap_cost_usd), st(sw(S, k)[c].swap_cost_share_of_actual_stop_risk)]))))}

## Exceedance
${tbl(['Split', 'SWAP_EXCEEDANCE, PLANNED basis', 'SWAP_EXCEEDANCE, ENVELOPE basis', 'Envelope nights (DEV-frozen)', 'Maximum charged nights in the horizon (this split)'], SPL.map((S) => [S, String(R.swap[S].swap_exceedance_planned_basis), String(R.swap[S].swap_exceedance_envelope_basis), String(R.swap[S].envelope_nights), String(R.swap[S].max_charged_nights_in_horizon_this_split)]))}

**Reading:**
- **Swap is small, but not zero:** overnight BUYs pay up to about 5–8 % of the stop risk; a triple night up to about 11 %.
- **Sized on the planned stop only,** one loser per split exceeds its planned risk because of swap.
- **The deterministic fix needs no prohibition.** The swap is known from the broker data and the calendar, so the envelope includes it (DEV-frozen maximum of ${R.swap.DEV.envelope_nights} charged nights, CORRECTION_LOG D1). Swap exceedance is then 0.
- **No overnight prohibition is created.**
`;

out.V17_SLIPPAGE = HEAD('V17_SLIPPAGE') + `## Scenarios (frozen before HOLDOUT)
${tbl(['Scenario', 'Spread', 'Exit slippage (USD/oz)', 'Source'], SCN.map((s) => [s, String(SC[s].spread), String(SC[s].slip), SC[s].source]))}

## Evidence
- **Real account:** ${R.slippage.real_account_entry_slippage}. Stop fills: ${R.slippage.stop_fill_evidence}.
- **In-session 5m discontinuities** (|open − previous close|, consecutive bars):
${tbl(['Split', 'p50', 'p90', 'p99', 'max (at)', 'above the frozen SEVERE'], SPL.map((S) => { const x = R.slippage[S].in_session_discontinuity; return [S, String(x.normal_p50), String(x.moderate_p90), String(x.severe_p99), `${x.historical_max} (${R.slippage[S].max_at})`, String(R.slippage[S].above_frozen_severe)]; }))}

## Effect (0.50 %, ENVELOPE)
${tbl(['Split', 'Scenario', 'Decision', 'Risk multiplier (losers)'], SPL.flatMap((S) => SCN.map((scn) => [S, scn, decisionOf(H(S, scn)), st(H(S, scn).multiplier_losers)])))}

**Reading:**
- **NORMAL:** slippage stays inside the 0.10 allowance.
- **MODERATE** (0.30) exceeds it by about 4–7 %.
- **SEVERE** (the DEV maximum jump on every exit) is an upper-bound stress; the multipliers reach about 4–4.6.
- **HOLDOUT** shows larger in-session jumps than DEV (p99 0.40 vs 0.12; max 14.97 > the frozen 9.61): 2026 is more volatile.
- **SLIPPAGE_RISK = UNRESOLVED:** there is no stop-fill evidence, so the allowance is an assumption.
`;

const gr = (S) => R.gap[S]; const cf = (S, type, q) => gr(S).exposure_counterfactual[type].extra_multiple_if_adverse_gap[q];
out.V17_GAP_RISK = HEAD('V17_GAP_RISK') + `## Reopen gaps (|open − previous close|, USD/oz)
${tbl(['Split', 'Type', 'Normal (p50)', 'Moderate (p90)', 'Severe (p99)', 'Historical max', 'n'], SPL.flatMap((S) => ['DAILY_BREAK', 'CLOSURE'].map((t) => { const l = gr(S).reopen_levels[t]; return [S, t, String(l.normal_p50), String(l.moderate_p90), String(l.severe_p99), String(l.historical_max), String(l.n)]; })))}

## Realized gap-through in the chronological replay (NORMAL, 0.50 %, ENVELOPE)
${tbl(['Split', 'Events', 'Kind', 'Gap impact (USD)', 'Risk multiplier', 'Worst trade'], SPL.map((S) => { const g = gr(S).realized_gap_through; const w = g.worst; return [S, String(g.events), fmt(g.by_kind), st(g.gap_impact_usd), st(g.multiplier), w ? `${w.id} ${w.side} ${w.model}: planned ${n2(w.actual_stop_risk)} USD → realized ${n2(w.total_realized)} USD (${n2(w.risk_multiplier)}×)` : '—']; }))}

## Exposure counterfactual
Positions open over a reopen, with an adverse gap at each DEV level. The table shows the extra loss as a multiple of the stop risk.

${tbl(['Split', 'Type', 'Positions', 'Gap level', 'Share through the stop', 'Extra multiple'], SPL.flatMap((S) => ['DAILY_BREAK', 'CLOSURE'].flatMap((t) => ['normal_p50', 'moderate_p90', 'severe_p99', 'historical_max'].map((q) => [S, t, String(gr(S).exposure_counterfactual[t].positions_open_over_reopen), q, pc(cf(S, t, q).share_through_stop), st(cf(S, t, q).extra_multiple)]))))}

## Pre-trade condition GC1 (informational only)
- **The candidate:** "a closure is reachable within the 288-bar horizon → reject".
- **What it would flag:** ${pc(gr('DEV').GC1_informational.entries_flagged_share)} (DEV) / ${pc(gr('HOLD').GC1_informational.entries_flagged_share)} (HOLD) of valid entries.
- **What it would remove:** the realized closure-gap exceedances (${gr('DEV').GC1_informational.gap_exceedances_removed} DEV, ${gr('HOLD').GC1_informational.gap_exceedances_removed} HOLD).
- **Why it is not adopted:**
  - production has no maximum holding time, so the 288-bar horizon is not a real guarantee, and GC1 cannot bound live exposure without a new exit rule (forbidden);
  - daily-break gaps can also pass through stops (counterfactual above).

## GAP_RISK = ${D.GAP_RISK}
- **Stop execution ≠ market gap through the stop.** The stop does not guarantee the planned loss: the worst realized HOLDOUT case lost ${n2(gr('HOLD').realized_gap_through.worst?.risk_multiplier)}× its planned risk across a weekend reopen.
- **No multiplier is invented,** and the tail is not converted into a production percentage.
`;

out.V17_RISK_ENVELOPE = HEAD('V17_RISK_ENVELOPE') + `## Definition (owner §15)
- **ENVELOPE per oz** = planned exposure (1.5 R + spread + 0.10 slippage allowance) + commission (0) + the known maximum swap within the horizon (DEV-frozen ${FZ.envelope_swap_max_charged_nights_dev} charged nights × the adverse rate).
- **Sizing:** the V17 gate sizes on the ENVELOPE.
- **Gap tail:** reported separately.

## Losers within the envelope, excluding gap (NORMAL, 0.50 %)
${tbl(['Split', 'Losers', 'Within the envelope (gap excluded)', 'Exceed (gap excluded)', 'Gap tail events'], SPL.map((S) => { const e = R.envelope[S]; return [S, String(e.losing), String(e.within_envelope_excluding_gap), fmt(e.exceed_excluding_gap), String(e.gap_tail)]; }))}

## By scenario
${tbl(['Split', 'Scenario', 'Decision'], SPL.flatMap((S) => SCN.map((scn) => [S, scn, decisionOf(H(S, scn))])))}

**Reading:**
- **NORMAL:** every loser stays within the envelope except the gap tail.
- **MODERATE / SEVERE:** losers exceed through slippage beyond the 0.10 allowance. That is an assumption-level item (no stop-fill evidence).
- **The envelope is not a guarantee.** The gap tail is outside it by definition.
`;

out.V17_MARGIN = HEAD('V17_MARGIN') + `## Rule (existing)
- **Required margin** = lots × contract × price / leverage. Margin availability is never permission to raise risk.
- **MARGIN_REJECTED** in any of these cases:
  - required > available margin (equity − used margin; used = 0 because at most one position is open);
  - required > ${R.rules.marginCapPct * 100} % of equity;
  - margin level after the planned loss < margin call ${R.spec.margin_call_pct} % + ${R.rules.marginLevelBufferPct} points.

## Validation against MT5's own calculation (live, read-only)
${tbl(['Lots', 'Formula (USD)', 'MT5 order_calc_margin', '|diff|'], BR.margin_check.map((m) => [String(m.lots), String(m.formula), String(m.mt5_calc), String(m.abs_diff)]))}

## Replay (10,000 USD, NORMAL, ENVELOPE)
${tbl(['Split', 'Risk %', 'Margin required (USD)', 'Margin / equity'], SPL.flatMap((S) => RPS.map((rp) => [S, pc(rp), st(H(S, 'NORMAL', rp).margin_required), st(H(S, 'NORMAL', rp).margin_share_of_equity)])))}

**Reading:**
- **Not binding at 10,000 USD:** at most about 10 % of equity at 1 %.
- **Tests:** leverage 1 and leverage 5 are rejected (insufficient / above cap / level after loss).
`;

out.V17_BROKER_DATA = HEAD('V17_BROKER_DATA') + `## Live read-only capture (\`results/broker_spec_live.json\`, ${BR.live_capture_utc}, account mode ${BR.account_mode}; identity never recorded)
${tbl(['Field', 'Live', 'REAL bridge record', 'Equal'], Object.entries(BR.real_record_compare).map(([k, v]) => [k, String(v.live), String(v.real_record), yn(v.equal)]))}

${tbl(['Check', 'Result'], [['required fields (tick size, tick value, contract size, volume min / max / step, leverage, margin call, stops level, freeze level)', BR.validation.ok ? 'present and coherent' : `FAIL ${JSON.stringify(BR.validation)}`], ['tick value: 0.01 lot × 1 USD move', `formula ${BR.tick_value_check.formula_usd_per_1usd_move_0_01} USD; MT5 order_calc_profit ${BR.tick_value_check.mt5_calc} USD`], ['margin', 'formula = MT5 within ≤ 0.005 USD (V17_MARGIN)'], ['spread (live)', `${R.spec.live_spread_usd} USD`], ['swap', `long ${R.spec.swap_long_points} points, short ${R.spec.swap_short_points}, mode ${R.spec.swap_mode} (points), triple day ${R.spec.swap_rollover3days}`], ['commission', 'not a platform field; production estimate 0 per side; the 2 real closes record commission 0, swap 0, fee 0'], ['broker data validated', yn(BR.ok)]])}

**Notes:**
- **The capture is from the connected DEMO account.** Every required field equals the REAL bridge record.
- **Fail-closed rule:** any missing or invalid required field rejects (RISK_REJECTED_BROKER_DATA, tested field by field).
`;

out.V17_RISK_EXCEEDANCE = HEAD('V17_RISK_EXCEEDANCE') + `## Classes (sequential attribution against the planned amount)
WITHIN_RISK · COST_EXCEEDANCE · SWAP_EXCEEDANCE · SLIPPAGE_EXCEEDANCE · GAP_EXCEEDANCE · BROKER_ROUNDING_EXCEEDANCE · OTHER

${tbl(['Split', 'Scenario', 'Risk %', 'Basis', 'Losers', 'Classes', 'Max multiplier'], SPL.flatMap((S) => SCN.flatMap((scn) => RPS.flatMap((rp) => ['ENVELOPE', 'PLANNED'].map((b) => { const w = W[S][`${scn}|${rp}|${b}`]; return [S, scn, pc(rp), b, String(w.losing), fmt(w.exceedance), String(w.multiplier_losers.max)]; })))))}

- **BROKER_ROUNDING_EXCEEDANCE:** ${R.invariants.broker_rounding_exceedance} (impossible by construction).
- **OTHER:** ${R.invariants.other_exceedance}.
`;

const FT = R.final_table;
out.V17_COST_STRESS = HEAD('V17_COST_STRESS') + `## Final table (owner §33)
- **Setup:** 10,000 USD reference equity, ENVELOPE basis.
- **Units:** USD; means over accepted trades, with totals and multipliers over losers.
- **No scenario is "best"; there is no winner.**

${tbl(['Split', 'Scenario', 'Risk %', 'Planned risk', 'Actual stop risk', 'Commission', 'Swap (mean / max)', 'Slippage', 'Gap impact (max)', 'Total exposure (mean / max, losers)', 'Risk multiplier (p50 / p99 / max)', 'Decision'], FT.map((r) => [r.split, r.scenario, pc(r.risk_pct), n2(r.planned_risk), n2(r.actual_stop_risk), n2(r.commission), `${n2(r.swap_mean)} / ${n2(r.swap_max)}`, n2(r.slippage), `${n2(r.gap_impact_max)} (${r.gap_events} events)`, `${n2(r.total_exposure_mean_losers)} / ${n2(r.total_exposure_max)}`, `${r.multiplier_p50} / ${r.multiplier_p99} / ${r.multiplier_max}`, `${r.within_risk}/${r.losing} within; ${fmt(Object.fromEntries(Object.entries(r.exceedance).filter(([k]) => k !== 'WITHIN_RISK')))}`]))}
`;

const phaseRows = (S) => SCN.map((scn) => [scn, String(H(S, scn).accepted), decisionOf(H(S, scn)), st(H(S, scn).multiplier_losers), String(H(S, scn).gap_events)]);
out.V17_DEVELOPMENT_RESULTS = HEAD('V17_DEVELOPMENT_RESULTS') + `## DEV (2025-05-07 → 2025-12-31): frozen before HOLDOUT
${tbl(['Frozen item', 'Value'], [['SEVERE slippage', `${SC.SEVERE.slip} USD/oz (${SC.SEVERE.source})`], ['daily-break gap levels', fmt(FZ.reopen_gap_levels_dev.DAILY_BREAK)], ['closure gap levels', fmt(FZ.reopen_gap_levels_dev.CLOSURE)], ['in-session discontinuity', fmt(FZ.in_session_discontinuity_dev)], ['envelope swap nights', String(FZ.envelope_swap_max_charged_nights_dev)], ['swap', fmt(FZ.swap)], ['freeze sha256', R.freeze_sha]])}

## DEV results (0.50 %, ENVELOPE)
${tbl(['Scenario', 'Accepted', 'Decision', 'Risk multiplier (losers)', 'Gap events'], phaseRows('DEV'))}
`;

out.V17_HOLDOUT_RESULTS = HEAD('V17_HOLDOUT_RESULTS') + `## HOLDOUT (2026-01-01 → 2026-09-29): run once with the DEV freeze; nothing tuned
${tbl(['Scenario', 'Accepted', 'Decision', 'Risk multiplier (losers)', 'Gap events'], phaseRows('HOLD'))}

## Out-of-sample checks against the DEV freeze
${tbl(['Item', 'DEV', 'HOLDOUT'], [['in-session discontinuity p99 / max', `${R.slippage.DEV.in_session_discontinuity.severe_p99} / ${R.slippage.DEV.in_session_discontinuity.historical_max}`, `${R.slippage.HOLD.in_session_discontinuity.severe_p99} / ${R.slippage.HOLD.in_session_discontinuity.historical_max} (${R.slippage.HOLD.above_frozen_severe} above the frozen SEVERE)`], ['closure gap max', String(R.gap.DEV.reopen_levels.CLOSURE.historical_max), String(R.gap.HOLD.reopen_levels.CLOSURE.historical_max)], ['daily-break gap max', String(R.gap.DEV.reopen_levels.DAILY_BREAK.historical_max), String(R.gap.HOLD.reopen_levels.DAILY_BREAK.historical_max)], ['worst realized multiplier (NORMAL)', String(H('DEV', 'NORMAL').multiplier_losers.max), String(H('HOLD', 'NORMAL').multiplier_losers.max)], ['swap exceedance, envelope basis', String(R.swap.DEV.swap_exceedance_envelope_basis), String(R.swap.HOLD.swap_exceedance_envelope_basis)]])}

**Reading:**
- **The gate's integrity holds out-of-sample:** no over-risk after rounding, RR 1.70, PRIMARY never accepted, replay parity.
- **The tail evidence moves the wrong way:** larger in-session jumps and a 6.6× weekend-gap loss. That is exactly why GAP_RISK and SLIPPAGE_RISK stay UNRESOLVED.
`;

out.V17_REPLAY_RESULTS = HEAD('V17_REPLAY_RESULTS') + `${tbl(['Split', 'Deterministic (two runs)', 'Restart from serialized state = uninterrupted', 'Hash'], SPL.map((S) => [S, yn(R.replay[S].deterministic), yn(R.replay[S].restart_equals_uninterrupted), R.replay[S].hash]))}

## No-lookahead
- **Sizing and decisions read only entry-time inputs:** equity, execution price, SL, spread and broker data. A test adds outcome fields to the inputs, and nothing changes.
- **Envelope swap:** a DEV-frozen constant, not a per-entry count from future bar times (CORRECTION_LOG D1).
- **Realized components** are measured after the decision, from the bars after entry. They are outcome measurement and never fed back into a decision.
- **Freeze:** written before HOLDOUT; its hash is verified on every FULL run.
`;

out.V17_FAIL_CLOSED = HEAD('V17_FAIL_CLOSED') + `${tbl(['Condition (owner §27)', 'Decision', 'Tested'], [['equity unavailable', 'RISK_REJECTED_EQUITY_UNAVAILABLE', 'yes'], ['risk calculation invalid (non-finite risk %, negative spread or swap)', 'RISK_REJECTED_INVALID_RISK', 'yes'], ['SL unavailable or wrong side', 'RISK_REJECTED_SL_INVALID', 'yes'], ['broker data unavailable / incoherent (each required field)', 'RISK_REJECTED_BROKER_DATA', 'yes'], ['position size invalid (off step / non-finite)', 'RISK_REJECTED_INVALID_SIZE', 'yes'], ['minimum lot exceeds risk', 'RISK_REJECTED_MINIMUM_LOT', 'yes'], ['maximum lot exceeded (no capping)', 'RISK_REJECTED_BROKER_LIMIT', 'yes'], ['margin insufficient / above cap / level after loss', 'MARGIN_REJECTED', 'yes'], ['quote invalid / stale / missing / impossible timestamp (V16 timing)', 'RISK_REJECTED_QUOTE', 'yes'], ['risk exposure inconsistent after rounding', 'RISK_REJECTED_INCONSISTENT', 'by construction'], ['hard-stop distance below the broker stops level', 'RISK_REJECTED_STOPS_LEVEL', 'by construction (stops level 0)'], ['position already open', 'RISK_REJECTED_EXPOSURE', 'yes'], ['duplicate signal', 'RISK_REJECTED_DUPLICATE', 'yes'], ['risk % unresolved (PRIMARY)', 'RISK_PERCENTAGE_UNRESOLVED', 'yes']])}

- **A 1–6 s execution delay is not a quote failure** (V16; tested).
- **Every rejection keeps VALID_ENTRY** separate from the rejection.
`;

const crit = [['1', 'risk never modifies entry validity', 'YES (entry hash firewall; tests)'], ['2', 'structural SL unchanged', 'YES'], ['3', 'RR 1.70', yn(R.invariants.rr_violations === 0)], ['4', 'position sizing deterministic', 'YES (tests; replay)'], ['5', 'broker rounding validated', yn(R.invariants.rounding_violations === 0 && R.invariants.broker_rounding_exceedance === 0)], ['6', 'minimum-lot violations rejected', 'YES'], ['7', 'margin violations rejected', 'YES'], ['8', 'swap measured separately', 'YES'], ['9', 'slippage measured separately', 'YES'], ['10', 'gap risk explicitly separated', `YES (GAP_RISK ${D.GAP_RISK})`], ['11', 'planned vs realized risk visible', 'YES'], ['12', 'missing risk data fails closed', 'YES'], ['13', 'replay parity', yn(D.integrity.replay_parity)], ['14', 'no-lookahead', 'YES'], ['15', 'no strategy rules changed', 'YES (fingerprint ok)'], ['16', 'no orders placed', 'YES']];
const hold = H('HOLD', 'NORMAL'); const gw = R.gap.HOLD.realized_gap_through.worst;
const summary = `V17_STATUS                = COMPLETE
RISK_GATE_STATUS          = ${D.RISK_GATE_STATUS}
RISK_PERCENTAGE           = UNRESOLVED
POSITION_SIZING           = DETERMINISTIC (equity -> % -> cash -> ask/bid -> structural SL -> size rounded down -> actual exposure recalculated)
BROKER_ROUNDING           = VALIDATED (0 over-risk after rounding; never rounded up)
MINIMUM_LOT               = ENFORCED (RISK_REJECTED_MINIMUM_LOT; e.g. 0.50 % at 1,000 USD rejects ${pc(R.minimum_lot.HOLD['1000|0.005'].share_min_lot)} of HOLD entries)
MAXIMUM_LOT               = ENFORCED (RISK_REJECTED_BROKER_LIMIT; no silent cap)
LOT_STEP                  = ENFORCED (RISK_REJECTED_INVALID_SIZE)
STRUCTURAL_SL             = UNCHANGED
RR                        = 1.70
PLANNED_RISK              = RECORDED per trade (amount, %, entry, SL, size, actual stop exposure)
REALIZED_RISK             = DECOMPOSED (stop loss, commission, swap, slippage, gap); HOLD NORMAL losers p50 ${hold.multiplier_losers.p50}x, max ${hold.multiplier_losers.max}x of planned
SWAP_RISK                 = MEASURED and BOUNDED by the envelope (long ${R.swap.DEV.usd_per_oz_per_night.long} USD/oz/night, short 0; 0 swap exceedances on the envelope basis)
SLIPPAGE_RISK             = UNRESOLVED (no stop-fill evidence; MODERATE / SEVERE exceed the 0.10 allowance)
GAP_RISK                  = ${D.GAP_RISK} (worst HOLD weekend gap ${n2(gw?.risk_multiplier)}x planned; no pre-trade rule bounds it without a new exit rule)
RISK_ENVELOPE             = DEFINED (planned + commission + known max swap); NORMAL losers within it except the gap tail
MARGIN_STATUS             = VALIDATED (formula = MT5 calculation; not binding at 10,000 USD)
BROKER_DATA_STATUS        = VALIDATED (live read-only capture = REAL record on every required field)
RISK_EXCEEDANCE           = CLASSIFIED (WITHIN / COST / SWAP / SLIPPAGE / GAP / BROKER_ROUNDING 0 / OTHER 0)
FAIL_CLOSED               = PASS
REPLAY_PARITY             = ${D.integrity.replay_parity ? 'PASS' : 'FAIL'}
NO_LOOKAHEAD              = PASS
ENTRY_RULES_CHANGED       = NO
CAPITAL_HARVEST           = OFF
REAL_TRADE_PLACED         = NO
DEMO_TRADE_PLACED         = NO
EXECUTION_AUTHORITY       = NONE
PRODUCTION_CHANGED        = NO`;
out.V17_FINAL_DECISION = HEAD('V17_FINAL_DECISION') + `## Decision
**${D.RISK_GATE_STATUS}**

${tbl(['Integrity criterion', 'Result'], Object.entries(D.integrity).map(([k, v]) => [k, yn(v)]))}

${tbl(['Measurement criterion', 'Result'], Object.entries(D.measured).map(([k, v]) => [k, yn(v)]))}

## Owner success criteria (§34)
${tbl(['#', 'Criterion', 'Met'], crit)}

## Separately reported (not hidden, not converted into numbers)
- **GAP_RISK = ${D.GAP_RISK}:**
  - weekend / holiday reopen gaps pass through the hard stop;
  - the worst HOLDOUT case is ${n2(gw?.risk_multiplier)}× planned;
  - production has no maximum holding time, so no pre-trade calendar rule can bound it without changing exits.
- **SLIPPAGE_RISK = UNRESOLVED:** there is no stop-fill evidence, and HOLDOUT in-session jumps exceed the DEV maximum.
- **RISK_PERCENTAGE = UNRESOLVED; DAILY_LOSS_POLICY = UNRESOLVED.**
- **Risk creates no edge.** V17 measures and controls exposure only.

## Final table (0.50 % research scenario; all risk % in V17_COST_STRESS)
${tbl(['Split', 'Scenario', 'Planned risk', 'Actual stop risk', 'Commission', 'Swap', 'Slippage', 'Gap impact (max)', 'Total exposure (max)', 'Risk multiplier (max)', 'Decision'], FT.filter((r) => r.risk_pct === 0.005).map((r) => [r.split, r.scenario, n2(r.planned_risk), n2(r.actual_stop_risk), n2(r.commission), n2(r.swap_mean), n2(r.slippage), n2(r.gap_impact_max), n2(r.total_exposure_max), String(r.multiplier_max), `${r.within_risk}/${r.losing} within`]))}

## Final terminal summary
\`\`\`
${summary}
\`\`\`
`;
for (const [name, text] of Object.entries(out)) writeFileSync(join(REP, `${name}.md`), text);
console.log(`wrote ${Object.keys(out).length} reports`);
