/**
 * V10 RISK + CAPITAL CONTROL -- renders the 20 required reports from the frozen results (no computation that could change a result).
 *   node research/risk_capital_v10/scripts/write_reports.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assessRealLot } from '../../../src/engine/mt5RealPolicy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const RES = join(ROOT, 'results'); const REP = join(ROOT, 'reports'); mkdirSync(REP, { recursive: true });
const J = (f) => JSON.parse(readFileSync(join(RES, f), 'utf8'));
const D = J('v10_dev.json'); const R = J('v10_results_FULL.json'); const X = J('v10_descriptive.json'); const FZ = R.freeze; const SPEC = R.spec;
const pc = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)} %`); const f2 = (x) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toFixed(2)); const f3 = (x) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toFixed(3));
const usd = (x) => (x == null || !Number.isFinite(x) ? '—' : `${Number(x).toFixed(2)}`); const rp = (r) => `${(r * 100).toFixed(2)} %`;
const HEAD = (t) => `# ${t}\n\nV10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration ${FZ.prereg_sha.slice(0, 16)}… · selection frozen ${FZ.frozen_utc}\n\n`;
const ACC = [100, 250, 500, 1000, 5000, 10000]; const BIG = [1000, 5000, 10000]; const RISKS = [0.001, 0.0025, 0.005, 0.0075, 0.01]; const S2 = ['DEV', 'HOLD']; const COSTS = ['normal', 'moderate', 'severe'];
const g = (S, A, m, c = 'normal') => R.splits[S].grid[A][m][c]; const P = (r) => `PCT_${r}`; const mc = (S, r) => R.splits[S].monte_carlo[r];
const st1 = (r) => D.stage1.rows.find((x) => x.riskPct === r); const dec = R.decision; const SEL = R.selection;
const sizeable = (S, A, r) => { const x = g(S, A, P(r)); const m = x.rejected_by_reason.RISK_BELOW_MIN_LOT ?? 0; return x.trades / Math.max(1, x.trades + m); };
const holdChecks = (r) => Object.fromEntries(BIG.map((A) => [A, { b: g('HOLD', A, P(r)).max_dd_pct <= 0.15, c: g('HOLD', A, P(r), 'severe').max_dd_pct <= 0.25, d: mc('HOLD', r).p_dd_ge_20 <= 0.05, e: R.math.streaks[r][20].normal <= 0.2, f: sizeable('HOLD', A, r) >= 0.9 }]));
const failed = (o) => Object.entries(o).filter(([, v]) => !v).map(([k]) => k);
const CLABEL = { a_actual_le_approved: '(a) actual ≤ approved', b_hist_dd_le_15: '(b) historical DD ≤ 15 %', c_severe_dd_le_25: '(c) severe DD ≤ 25 %', d_mc_p20_le_5: '(d) MC P(DD ≥ 20 %) ≤ 5 %', e_streak20_le_20: '(e) 20-loss DD ≤ 20 %', f_sizeable_ge_90: '(f) ≥ 90 % sizeable' };
const XS = (S) => X.splits[S]; const sl = (S) => XS(S).sl_distribution;
// CURRENT production veto: smallest equity at which assessRealLot accepts 0.01 lot at the HOLD median price (pure function, read-only)
const curMinEquity = (() => { const price = sl('HOLD').entry_price_median; let lo = 1, hi = 5000; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; const a = assessRealLot({ lot: 0.01, price, contractSize: SPEC.contract_size, leverage: SPEC.leverage, equity: mid, freeMargin: mid, spreadUsd: 0.24 }); if (a.executable) hi = mid; else lo = mid; } return hi; })();
const RUIN = XS('HOLD').current_250_moderate_last_trades.last.at(-1);
const RUIN_NOTE = `the final trade (${RUIN.date}, structural SL ${usd(RUIN.R_usd)} USD) lost ${usd(-RUIN.pnl_usd)} USD at 1 oz from ${usd(RUIN.equity_before)} USD of equity. That replay uses the common structural exit; production's −50 USD monetary broker SL ${RUIN.production_monetary_cap_binds ? 'would have bound on that trade, limiting the loss to about 50 USD and leaving about ' + usd(RUIN.equity_before - 50 - 0.4) + ' USD' : 'would not have bound'}`;
const out = {};

// ---------- shared facts ----------
const takenR = (S) => g(S, 10000, P(0.005)).taken_mean_r; const curRet = (S, A) => g(S, A, 'CURRENT').return_pct;
const FACTS = [
  `**Negative entry expectancy is the root cause.** At 0.50 % risk / 10,000 USD the trades taken average ${f3(takenR('DEV'))} R (DEV) and ${f3(takenR('HOLD'))} R (HOLD) at NORMAL cost; every percentage-risk walk with more than 4 trades loses money on both splits at every cost. Risk sizing controls how fast capital is lost; it cannot create an edge.`,
  `**CURRENT's positive HOLD result is a weighting effect, not an edge.** The fixed 0.01 lot ends HOLD at +${usd(XS('HOLD').sl_quartile_weighting.normal.total_usd_001lot)} USD at NORMAL cost (the same dollar amount at every account from 500 to 10,000 USD), while its trades average ${f3(XS('HOLD').sl_quartile_weighting.normal.mean_r_all)} R. A fixed lot weights each trade by its SL width in dollars, and the widest-SL quartile is the only one with positive R on both splits (DEV ${f3(XS('DEV').sl_quartile_weighting.normal.quartiles.Q4.mean_r)} R, HOLD ${f3(XS('HOLD').sl_quartile_weighting.normal.quartiles.Q4.mean_r)} R). The tightest quartile loses ${f3(XS('DEV').sl_quartile_weighting.normal.quartiles.Q1.mean_r)} / ${f3(XS('HOLD').sl_quartile_weighting.normal.quartiles.Q1.mean_r)} R, mostly because fixed costs are a large fraction of a small R. Percentage risk weights every trade equally in R. Under MODERATE cost CURRENT also loses on HOLD (${usd(XS('HOLD').sl_quartile_weighting.moderate.total_usd_001lot)} USD) and on DEV at every cost. An SL-width or cost/R filter would be an ENTRY change and is out of scope; it is reported, not proposed.`,
  `**The broker minimum lot (0.01) sets a minimum account size for governed risk.** One 0.01 lot at the median HOLD structural SL already risks ${usd(XS('HOLD').risk_table.find((x) => x.equity === 10000 && x.risk_pct === 0.0025 && x.sl_case === 'SL_p50').worst_case_loss_per_001_lot_usd)} USD, so 0.25 % risk needs ≥ ${usd(XS('HOLD').min_equity_for_min_lot[0.0025].SL_p50)} USD for the median trade and ${usd(XS('HOLD').min_equity_for_min_lot[0.0025].SL_p90)} USD for the 90th-percentile trade. Below that the trade must be REJECTED, never rounded up.`,
  `**CURRENT (fixed 0.01 lot, fixed −50 USD assumption) is not a constant risk.** On HOLD its per-trade risk is ${pc(XS('HOLD').current_fixed_lot_pct_risk[10000].p50, 2)} of equity (median) at 10,000 USD but ${pc(XS('HOLD').current_fixed_lot_pct_risk[1000].p50)} at 1,000 USD and ${pc(XS('HOLD').current_fixed_lot_pct_risk[250].p50)} at 250 USD (90th percentile ${pc(XS('HOLD').current_fixed_lot_pct_risk[250].p90)}). The HOLD drawdown is ${pc(g('HOLD', 1000, 'CURRENT').max_dd_pct)} at 1,000 USD and ${pc(g('HOLD', 250, 'CURRENT').max_dd_pct)} at 250 USD; under MODERATE cost the 250 USD account ends at ${usd(g('HOLD', 250, 'CURRENT', 'moderate').end)} USD (negative equity): ${RUIN_NOTE}.`,
  `**No risk percentage passes the pre-registered capital-safety gate on DEV.** 0.10 % fails only sizeability (${pc(st1(0.001).per_account[1000].sizeable_share)} / ${pc(st1(0.001).per_account[5000].sizeable_share)} / ${pc(st1(0.001).per_account[10000].sizeable_share)} of trades sizeable at 1k / 5k / 10k). 0.25 % fails the Monte Carlo gate at every account (P(DD ≥ 20 % in a year) = ${pc(mc('DEV', 0.0025).p_dd_ge_20)} on DEV, ${pc(mc('HOLD', 0.0025).p_dd_ge_20)} on HOLD), plus sizeability at 1,000 / 5,000 USD and the drawdown gates at 5,000 / 10,000 USD. 0.50 % and above fail the historical drawdown gate at every account.`,
  `**Margin is never the binding constraint.** At 1.00 % risk the largest margin use is ${pc(Math.max(...S2.flatMap((S) => BIG.map((A) => g(S, A, P(0.01)).max_margin_pct))))} of equity; the 25 % and 50 % caps never reject a trade and the 10 % cap rejects at most ${pc(Math.max(...S2.flatMap((S) => BIG.map((A) => XS(S).margin_caps[0.01][A][0.1].margin_reject_share))), 2)}. Risk, not margin, limits size.`,
  '**Daily-loss, loss-streak and weekly controls are not consistently protective.** Described at every risk % (no risk % was supported, so stage 2 never selected): the same control reduces drawdown on one split and increases it on the other (for example daily 1 % at 0.25 % / 10,000 USD: ' + `${pc(XS('DEV').controls[0.0025][10000].daily_1.dd_reduction_rel)} on DEV, ${pc(XS('HOLD').controls[0.0025][10000].daily_1.dd_reduction_rel)} on HOLD). None is supported.`,
  `**Realized loss can exceed the planned worst case.** At NORMAL cost ${pc(XS('HOLD').loss_overshoot.normal.share_above_planned)} of HOLD losing outcomes exceed the planned hard-stop loss (max ×${f2(XS('HOLD').loss_overshoot.normal.max_ratio)}); the whole excess is the overnight BUY swap (0.56 USD/oz/night) that the worst-case formula omits. Under SEVERE cost (slippage 0.60 vs the 0.10 allowance, plus gaps) ${pc(XS('HOLD').loss_overshoot.severe.share_above_planned)} exceed it, up to ×${f2(XS('HOLD').loss_overshoot.severe.max_ratio)}.`,
  `**Production fixed-dollar budgets bind on real trades.** The production −50 USD monetary broker SL (0.01 lot) is tighter than the structural fail-safe on ${pc(sl('HOLD').share_monetary_50_binds)} of HOLD signals and lies INSIDE the structural SL itself on ${pc(sl('HOLD').share_structural_beyond_50)} (the stop is moved to satisfy a dollar amount). The +30 USD profit budget closes below 1.70 R on ${pc(sl('HOLD').share_profit_budget_30_binds_before_1_7R)} of HOLD signals. These are exactly the universal fixed-dollar assumptions the owner principle forbids; they are reported, not changed.`,
];

// 1 ---------- master ----------
out.V10_RISK_CAPITAL_CONTROL = HEAD('V10_RISK_CAPITAL_CONTROL') + `## Question
Can a simple governed risk layer (equity → risk % → maximum cash risk → structural SL distance → position size → broker validation → margin safety → eligibility) protect capital on the frozen V8 corrected-core entries, with the structural SL and RR 1.70 unchanged, better than the CURRENT fixed-lot / fixed-dollar model?

## Verdict
**RISK_MODEL = ${dec.RISK_MODEL}; PROPOSED_RISK_SPEC = ${dec.PROPOSED_RISK_SPEC}.** The sizing mechanics work. Every test passes: sizing, rounding down, actual risk ≤ approved, margin, daily, pause, exposure, gap fail-safe, restart, duplicates, broker rejection, missing SL. Replay is deterministic, and the percentage model never exceeded its approved risk on any trade in any scenario. But **no risk percentage met the pre-registered capital-safety criteria on DEV**, so nothing was frozen for the holdout, and under the pre-registration no risk percentage is proposed. *Do not invent a final risk percentage.*

## Findings
${FACTS.map((f, k) => `${k + 1}. ${f}`).join('\n')}

## CURRENT versus percentage risk (identical signals, structural SL and exits; NORMAL cost)
| Account | Split | CURRENT end / max DD | PCT 0.10 % | PCT 0.25 % | PCT 0.50 % | PCT 1.00 % |
|---|---|---|---|---|---|---|
${ACC.flatMap((A) => S2.map((S) => `| ${A} | ${S} | ${usd(g(S, A, 'CURRENT').end)} / ${pc(g(S, A, 'CURRENT').max_dd_pct)} | ${[0.001, 0.0025, 0.005, 0.01].map((r) => (g(S, A, P(r)).trades ? `${usd(g(S, A, P(r)).end)} / ${pc(g(S, A, P(r)).max_dd_pct)} (${g(S, A, P(r)).trades} tr)` : 'no sizeable trade')).join(' | ')} |`)).join('\n')}

Cells give end equity / max drawdown in USD (trades). "No sizeable trade" means the broker minimum lot exceeds the approved risk on every signal, so the account does not trade.

## What is validated, what is not
- **Validated (mechanics):**
  - sizing from the structural SL;
  - rounding down and minimum-lot rejection;
  - actual-risk recalculation;
  - margin checks;
  - the daily, streak and weekly controller;
  - single exposure;
  - restart from serialized state equal to an uninterrupted run;
  - duplicate and broker-rejection handling;
  - SL fail-safes;
  - the broker spec read from the platform log.
  - Evidence: tests/risk_capital_v10.test.js and V10_REPLAY_RESULTS.
- **Not validated:**
  - a capital-safe risk percentage for this entry stream;
  - any daily, streak or weekly limit.

## Operational observation (outside the research, no action taken)
The most recent production bridge record (${SPEC.recorded_at}) shows the MT5 terminal connected to a non-real (trial) server with algo trading disabled; the REAL watcher logged REAL_NOT_VERIFIED and is failing closed. The broker contract fields are identical to the 9 REAL-verified records (2026-09-25 to 2026-09-30). The REAL watcher, the silver/DOM observer and the V8 forward shadow were not touched.

## Protocol
- Pre-registered (sha ${FZ.prereg_sha.slice(0, 16)}…).
- DEV 2025-05-07 → 2025-12-31: ${D.signals} signals over ${D.sessions} sessions.
- Three stages on DEV only. The selection is frozen (sha ${FZ.selection_sha.slice(0, 16)}…), as is the risk library (sha ${FZ.risk_sha.slice(0, 16)}…).
- HOLDOUT 2026-01-01 → 2026-09-29: ${R.splits.HOLD.signals} signals over ${R.splits.HOLD.sessions} sessions, replayed once.
- Costs: NORMAL, MODERATE and SEVERE (with a deterministic gap).
- Monte Carlo proxy: 2,000 paths.
- Descriptive tables (controls and margin caps at every candidate risk) are labelled DESCRIPTIVE_ONLY_NOT_SELECTION.

## Report index
V10_RISK_PERCENTAGE_RESEARCH · V10_POSITION_SIZING · V10_STRUCTURAL_SL_RISK · V10_MARGIN_PROTECTION · V10_DAILY_LOSS_CONTROL · V10_CONSECUTIVE_LOSS_RESEARCH · V10_TOTAL_EXPOSURE · V10_BROKER_CONSTRAINTS · V10_SLIPPAGE_STRESS · V10_CAPITAL_SURVIVAL · V10_RECOVERY_MATH · V10_RISK_OF_RUIN · V10_ACCOUNT_SIZE_COMPARISON · V10_DEVELOPMENT_RESULTS · V10_HOLDOUT_RESULTS · V10_REPLAY_RESULTS · V10_REJECTED_PARAMETERS · V10_SUPPORTED_PARAMETERS · V10_PROPOSED_RISK_SPEC
`;

// 2 ---------- risk percentage ----------
out.V10_RISK_PERCENTAGE_RESEARCH = HEAD('V10_RISK_PERCENTAGE_RESEARCH') + `## Candidates
0.10 %, 0.25 %, 0.50 %, 0.75 % and 1.00 % of current equity, with no daily, pause or weekly control and the production margin cap of 50 %.

A risk % is SUPPORTED only if criteria (a)–(f) hold for every account ≥ 1,000 USD on DEV.

## DEV (selection split)
| Risk % | Account | Trades | Return | Max DD (normal) | Max DD (severe) | MC P(DD ≥ 20 %) | 20-loss DD | Sizeable | Failed criteria |
|---|---|---|---|---|---|---|---|---|---|
${RISKS.flatMap((r) => BIG.map((A) => { const x = st1(r).per_account[A]; return `| ${rp(r)} | ${A} | ${x.normal.trades} | ${pc(x.normal.return_pct)} | ${pc(x.normal.max_dd_pct)} | ${pc(x.severe.max_dd_pct)} | ${pc(st1(r).monte_carlo.p_dd_ge_20)} | ${pc(st1(r).streak_dd[20])} | ${pc(x.sizeable_share)} | ${failed(st1(r).checks[A]).map((k) => CLABEL[k]).join('; ') || 'none'} |`; })).join('\n')}

**Result:** supported risk percentages = ${SEL.supported_risk_pcts.length ? SEL.supported_risk_pcts.map(rp).join(', ') : '**none**'}.

## HOLDOUT (descriptive only; no risk % was frozen, so the holdout cannot select)
| Risk % | Account | Trades | Return | Max DD (normal) | Max DD (severe) | MC P(DD ≥ 20 %) | Sizeable | Would fail |
|---|---|---|---|---|---|---|---|---|
${RISKS.flatMap((r) => BIG.map((A) => { const h = holdChecks(r)[A]; return `| ${rp(r)} | ${A} | ${g('HOLD', A, P(r)).trades} | ${pc(g('HOLD', A, P(r)).return_pct)} | ${pc(g('HOLD', A, P(r)).max_dd_pct)} | ${pc(g('HOLD', A, P(r), 'severe').max_dd_pct)} | ${pc(mc('HOLD', r).p_dd_ge_20)} | ${pc(sizeable('HOLD', A, r))} | ${failed(h).join(', ') || 'none'} |`; })).join('\n')}

## Small accounts (< 1,000 USD; eligibility reported, not a criterion)
| Risk % | 100 USD | 250 USD | 500 USD |
|---|---|---|---|
${RISKS.map((r) => `| ${rp(r)} | ${[100, 250, 500].map((A) => `${pc(sizeable('DEV', A, r))} DEV / ${pc(sizeable('HOLD', A, r))} HOLD sizeable`).join(' | ')} |`).join('\n')}

## Reading
- **The trade-off is structural.** A risk % small enough for the drawdown gates (0.10 %) is too small for the 0.01-lot minimum on most trades. A risk % large enough to size most trades (≥ 0.25 % at 10,000 USD) fails the drawdown and Monte Carlo gates, because the entry stream's expectancy is negative.
- **No risk % reconciles both** for any account size tested.
`;

// 3 ---------- position sizing ----------
const RT = (S) => XS(S).risk_table;
out.V10_POSITION_SIZING = HEAD('V10_POSITION_SIZING') + `## Sizing chain (research library \`scripts/risk.mjs\`, pure)
1. **Equity:** account equity at the decision (see V10_TOTAL_EXPOSURE for the definition).
2. **Maximum cash risk** = equity × approved risk %.
3. **Worst-case loss per 1.0 lot** = (1.5 × |entry − structural SL| + spread + slippage allowance) × contract size.
   - 1.5 × structural is the hard broker fail-safe distance; the thesis exit is a confirmed close beyond the structural SL.
4. **Raw lots** = cash risk ÷ worst-case loss per lot.
5. **Rounding:** DOWN to the broker volume step (${SPEC.volume_step}), capped at the broker maximum (${SPEC.volume_max}).
6. **Below the minimum:** if the lot is < the broker minimum (${SPEC.volume_min}), REJECT (RISK_BELOW_MIN_LOT). Never round up.
7. **Actual risk** = lots × worst-case loss per lot, recalculated after rounding; asserted ≤ the approved cash risk.
8. **Margin check:** see V10_MARGIN_PROTECTION.
9. **Account controls:** daily, streak and weekly; see their reports.
10. **Outcome:** ACCEPT or REJECT with a reason. The structural SL is an input and is never moved.

## Risk table (HOLD prices: entry ${usd(sl('HOLD').entry_price_median)}; SL = median and 90th-percentile HOLD structural distance; NORMAL spread 0.24 + allowance 0.10; margin cap 50 %)
| Equity | Risk % | Max risk $ | SL case | SL distance $ | Worst loss / 0.01 lot $ | Calculated size | Rounded size | Actual risk $ | Actual risk % | Margin $ | Remaining margin $ | Margin level after loss | Eligibility |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${RT('HOLD').map((x) => `| ${x.equity} | ${rp(x.risk_pct)} | ${usd(x.max_risk_usd)} | ${x.sl_case} | ${usd(x.sl_distance_usd)} | ${usd(x.worst_case_loss_per_001_lot_usd)} | ${f3(x.lots_calculated)} | ${x.lots_rounded_down.toFixed(2)} | ${usd(x.actual_risk_usd)} | ${pc(x.actual_risk_pct, 3)} | ${usd(x.margin_usd)} | ${usd(x.remaining_margin_usd)} | ${x.margin_level_after_loss_pct == null ? '—' : `${Math.round(x.margin_level_after_loss_pct)} %`} | ${x.eligible ? 'ELIGIBLE' : `REJECT ${x.reason}${x.min_lot_risk_pct != null ? ` (0.01 lot = ${pc(x.min_lot_risk_pct, 2)})` : ''}`} |`).join('\n')}

## Minimum equity for one 0.01 lot (worst-case loss of 0.01 lot ÷ risk %)
| Risk % | DEV SL p50 | DEV SL p90 | DEV SL p99 | HOLD SL p50 | HOLD SL p90 | HOLD SL p99 |
|---|---|---|---|---|---|---|
${RISKS.map((r) => `| ${rp(r)} | ${['DEV', 'HOLD'].flatMap((S) => ['SL_p50', 'SL_p90', 'SL_p99'].map((k) => usd(XS(S).min_equity_for_min_lot[r][k]))).join(' | ')} |`).join('\n')}

## Notes
- **Rounding is always down,** so the actual risk is always ≤ the approved risk. Across 5,000 random property cases the lot was always a step multiple and never above the approved risk; every PCT replay trade in every scenario also passed (V10_REPLAY_RESULTS).
- **Margin availability is not risk permission:** leverage never enters the size (test "more leverage never increases the size").
- Dynamic sizing is RESEARCH_ONLY. Production remains LOT = 0.01 and AUTO_SCALING = OFF.
`;

// 4 ---------- structural SL ----------
const sd = (S) => sl(S).structural_distance_usd; const wl = (S) => sl(S).worst_case_loss_usd_at_001_lot;
out.V10_STRUCTURAL_SL_RISK = HEAD('V10_STRUCTURAL_SL_RISK') + `## Structural SL distance (USD per oz) and worst-case loss of 0.01 lot at the hard stop
| Split | Signals | Entry median | SL p10 | p50 | p90 | p99 | max | 0.01-lot loss p50 | p90 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|---|---|
${S2.map((S) => `| ${S} | ${sl(S).signals} | ${usd(sl(S).entry_price_median)} | ${sd(S).p10} | ${sd(S).p50} | ${sd(S).p90} | ${sd(S).p99} | ${sd(S).max} | ${wl(S).p50} | ${wl(S).p90} | ${wl(S).p99} | ${wl(S).max} |`).join('\n')}

## Consequences
- **Wider SLs in 2026.** The holdout structural SL is roughly ${f2(sd('HOLD').p50 / sd('DEV').p50)}× wider than DEV at the median and ${f2(sd('HOLD').p99 / sd('DEV').p99)}× at the 99th percentile (higher gold price and volatility). At a fixed risk % the size is smaller; at a fixed lot the dollar risk is larger.
- **The SL is never moved.** Under percentage risk a wide SL gives a small lot or a rejection. The study never moves the SL to fit a dollar amount.
- **Production's fixed −50 USD maximum loss (0.01 lot) does move it.** It places the broker SL at min(50 USD, 1.5 × structural + spread):
  - the monetary distance is tighter than the structural fail-safe on ${pc(sl('DEV').share_monetary_50_binds, 2)} of DEV and ${pc(sl('HOLD').share_monetary_50_binds, 2)} of HOLD signals;
  - it lies inside the structural SL itself on ${pc(sl('DEV').share_structural_beyond_50, 2)} of DEV and ${pc(sl('HOLD').share_structural_beyond_50, 2)} of HOLD signals.
  - This conflicts with the owner principle "never move the structural SL simply to satisfy a desired dollar loss". Reported, not changed.
- **The +30 USD profit budget truncates the target.** The production profit budget at 0.01 lot closes below the 1.70 R objective whenever 1.70 × SL > 30 USD: ${pc(sl('DEV').share_profit_budget_30_binds_before_1_7R)} of DEV and ${pc(sl('HOLD').share_profit_budget_30_binds_before_1_7R)} of HOLD signals.
- **Modelling note.** The study compares sizing on the COMMON structural exit (fixed 1.70 R target, hard broker fail-safe at 1.5 × structural + spread, thesis invalidation on a confirmed close, 288-bar horizon). The CURRENT replay therefore shows CURRENT sizing without the two fixed-dollar budgets.

## P&L by structural-SL quartile: why a fixed lot and percentage risk disagree (CURRENT trades, 10,000 USD)
| Split | Cost | Quartile | Trades | Mean SL $ | Mean R | P&L at 0.01 lot (USD) |
|---|---|---|---|---|---|---|
${S2.flatMap((S) => ['normal', 'moderate'].flatMap((c) => ['Q1', 'Q2', 'Q3', 'Q4'].map((k) => { const q = XS(S).sl_quartile_weighting[c].quartiles[k]; return `| ${S} | ${c} | ${k} | ${q.n} | ${usd(q.mean_sl_usd)} | ${f3(q.mean_r)} | ${usd(q.usd_001lot)} |`; }))).join('\n')}

Fixed costs (spread + slippage) are a constant dollar amount, so they cost more R on tight SLs. A fixed lot puts more dollars on wide-SL trades; percentage risk puts the same risk on every trade. This explains CURRENT's positive HOLD result at NORMAL cost. It is not a reason to prefer a fixed lot: on DEV the fixed lot loses too, and it reverses under MODERATE cost.

## Largest CURRENT single losses (0.01 lot, 1,000 USD, NORMAL cost)
| Split | Signal | Date | Structural SL $ | Loss $ | Exit | Production −50 USD cap would bind |
|---|---|---|---|---|---|---|
${S2.flatMap((S) => XS(S).current_largest_losses_1000.map((x) => `| ${S} | ${x.id} | ${x.date} | ${x.R_usd} | ${x.loss_usd} | ${x.exit} | ${x.monetary_cap_would_bind ? 'yes' : 'no'} |`)).join('\n')}
`;

// 5 ---------- margin ----------
out.V10_MARGIN_PROTECTION = HEAD('V10_MARGIN_PROTECTION') + `## Rule (research library)
- **Required margin:** lots × ${SPEC.contract_size} × price ÷ ${SPEC.leverage}. The leverage is read from the account; the margin currency is ${SPEC.margin_currency}, so the margin moves with the gold price.
- **Reject MARGIN_ABOVE_CAP** if the margin exceeds the cap % of equity (researched: 10 %, 25 %, 50 %; production budget 50 %).
- **Reject MARGIN_LEVEL_AFTER_LOSS_TOO_LOW** if the margin level after the worst-case loss would be below the broker margin call (${SPEC.margin_call_pct} %) + 40 points.
- **Reject EQUITY_EXHAUSTED_AT_STOP** if the equity at the stop would be ≤ 0.
- **Margin availability is NOT risk permission:** size comes from risk only, and margin can only reject.

## Margin use observed (NORMAL cost, cap 50 %)
| Split | Account | ${RISKS.map((r) => `${rp(r)} max / mean`).join(' | ')} | CURRENT max / mean |
|---|---|${RISKS.map(() => '---').join('|')}|---|
${S2.flatMap((S) => ACC.map((A) => `| ${S} | ${A} | ${RISKS.map((r) => (g(S, A, P(r)).trades ? `${pc(g(S, A, P(r)).max_margin_pct)} / ${pc(g(S, A, P(r)).mean_margin_pct)}` : '—')).join(' | ')} | ${pc(g(S, A, 'CURRENT').max_margin_pct)} / ${pc(g(S, A, 'CURRENT').mean_margin_pct)} |`)).join('\n')}

## Margin caps (DESCRIPTIVE_ONLY_NOT_SELECTION: stage 3 runs only at a supported risk %, and there is none)
Share of otherwise-eligible trades rejected by margin rules:
| Split | Risk % | Account | Cap 10 % | Cap 25 % | Cap 50 % |
|---|---|---|---|---|---|
${S2.flatMap((S) => RISKS.flatMap((r) => BIG.map((A) => `| ${S} | ${rp(r)} | ${A} | ${pc(XS(S).margin_caps[r][A][0.1].margin_reject_share, 2)} | ${pc(XS(S).margin_caps[r][A][0.25].margin_reject_share, 2)} | ${pc(XS(S).margin_caps[r][A][0.5].margin_reject_share, 2)} |`))).join('\n')}

## CURRENT production veto
- **Rule:** \`assessRealLot\` lets 0.01 lot trade while the margin is ≤ 50 % of equity, the equity after the fixed −50 USD loss stays > 0, and the margin level at that loss is ≥ 60 %.
- **Floor:** at the HOLD median price that is any equity ≥ about **${usd(curMinEquity)} USD**.
- **Risk at the floor:** at that equity a single median-SL loss is ${pc(wl('HOLD').p50 / curMinEquity)} of equity, and a 99th-percentile loss is ${pc(wl('HOLD').p99 / curMinEquity)}.
- **Conclusion:** the production margin veto protects against margin exhaustion, not against capital loss.

## Conclusion
- **Margin never limits a percentage-risk position** in the tested range: at most about ${pc(Math.max(...S2.flatMap((S) => ACC.map((A) => g(S, A, P(0.01)).max_margin_pct))))} of equity at 1.00 % risk.
- **No cap is evidence-selected.** The margin-level-after-loss buffer and a 50 % cap are harmless backstops (they never rejected a trade). A 10 % cap would start to bind only at 1.00 % risk.
`;

// 6 ---------- daily loss ----------
const CT = (S, r, A, k) => XS(S).controls[r][A][k];
const ctrlTable = (keys) => `| Split | Risk % | Account | Control | Trades | Return | Max DD | DD change vs none | Blocked | Blocked mean R | Taken mean R | Stage-2 rule |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n${S2.flatMap((S) => [0.0025, 0.005, 0.01].flatMap((r) => BIG.flatMap((A) => ['none', ...keys].map((k) => { const c = CT(S, r, A, k); return `| ${S} | ${rp(r)} | ${A} | ${k} | ${c.trades} | ${pc(c.return_pct)} | ${pc(c.max_dd_pct)} | ${k === 'none' ? '—' : pc(-c.dd_reduction_rel)} | ${c.blocked_by_control} | ${f3(c.blocked_mean_r)} | ${f3(c.taken_mean_r)} | ${k === 'none' ? '—' : c.would_pass_stage2_rule ? 'pass' : 'fail'} |`; })))).join('\n')}`;
const consistency = (keys) => keys.map((k) => { const cells = [0.0025, 0.005, 0.01].flatMap((r) => BIG.map((A) => [CT('DEV', r, A, k).would_pass_stage2_rule, CT('HOLD', r, A, k).would_pass_stage2_rule])); const both = cells.filter(([a, b]) => a && b).length; const devOnly = cells.filter(([a, b]) => a && !b).length; return `| ${k} | ${cells.filter(([a]) => a).length} / ${cells.length} | ${cells.filter(([, b]) => b).length} / ${cells.length} | ${both} | ${devOnly} |`; }).join('\n');
const bothCells = (k) => [0.0025, 0.005, 0.01].flatMap((r) => BIG.filter((A) => CT('DEV', r, A, k).would_pass_stage2_rule && CT('HOLD', r, A, k).would_pass_stage2_rule).map((A) => `${rp(r)} / ${A}`)).join(', ') || 'none';
out.V10_DAILY_LOSS_CONTROL = HEAD('V10_DAILY_LOSS_CONTROL') + `## Definition (research library)
- **Day:** the UTC calendar day. The day-start equity is the equity at the first decision or settlement of the day.
- **Limit reached:** once the realized daily loss ≥ limit % × day-start equity → DAILY_LOSS_LIMIT_REACHED.
- **Capacity check:** if the realized loss plus the next trade's planned (actual) risk would exceed the limit → DAILY_CAPACITY_INSUFFICIENT. The size is never increased to "use" the remaining capacity.
- **Reset:** trading resumes the next UTC day. The limit is a percentage of the day-start equity, never a fixed dollar amount.
- **States:**
  - NORMAL: trading allowed;
  - PROTECTED: the daily limit or the loss-streak pause is active, no new trade until the next UTC day;
  - HALTED: the weekly limit is active, no new trade until the next ISO week.
- **CAUTION was not introduced.** No size reduction after losses was pre-registered, and no control earned a place (smallest effective structure).

## Pre-registered stage 2
Not executed: it runs only at a SUPPORTED risk %, and none exists (V10_DEVELOPMENT_RESULTS). The tables below are **DESCRIPTIVE_ONLY_NOT_SELECTION**.
The stage-2 rule: DD reduced ≥ 10 % relative, and the blocked trades are not better than the taken trades by more than 0.05 R.

${ctrlTable(['daily_1', 'daily_2', 'daily_3', 'weekly_5'])}

## Consistency across splits (stage-2 rule pass counts over 3 risk % × 3 accounts)
| Control | Pass on DEV | Pass on HOLD | Pass on both | DEV-only |
|---|---|---|---|---|
${consistency(['daily_1', 'daily_2', 'daily_3', 'weekly_5'])}

## Conclusion
- **No daily or weekly limit is supported.** Stage 2 is defined only at a supported risk %, and there is none.
- **Descriptively:**
  - daily 1 % passes the stage-2 rule on BOTH splits only at ${bothCells('daily_1')}. Those risk levels fail the capital-safety gate themselves, and there it works mainly by cutting trades on a negative-expectancy stream (trades fall from ${CT('HOLD', 0.01, 10000, 'none').trades} to ${CT('HOLD', 0.01, 10000, 'daily_1').trades} at 1.00 % / 10,000 USD on HOLD).
  - At 0.25 % daily 1 % does not pass on either split; on HOLD at 10,000 USD it worsens the drawdown by ${pc(-CT('HOLD', 0.0025, 10000, 'daily_1').dd_reduction_rel)}.
  - Daily 2 % / 3 % pass on both splits at ${bothCells('daily_2')} / ${bothCells('daily_3')}; weekly 5 % at ${bothCells('weekly_5')}.
- **Future test:** daily 1 % and pause 3 (V10_CONSECUTIVE_LOSS_RESEARCH) are the candidates worth pre-registering, and only together with a risk % that is itself supported.
- **The mechanism is validated by tests:** limit reached, capacity insufficient, next-day reset.
`;

// 7 ---------- consecutive loss ----------
out.V10_CONSECUTIVE_LOSS_RESEARCH = HEAD('V10_CONSECUTIVE_LOSS_RESEARCH') + `## Observed worst losing streaks (NORMAL cost, trades taken)
| Split | Account | CURRENT | ${RISKS.map(rp).join(' | ')} |
|---|---|---|${RISKS.map(() => '---').join('|')}|
${S2.flatMap((S) => BIG.map((A) => `| ${S} | ${A} | ${g(S, A, 'CURRENT').worst_loss_streak} | ${RISKS.map((r) => g(S, A, P(r)).worst_loss_streak).join(' | ')} |`)).join('\n')}

## Drawdown after k consecutive full losses (mathematics only: 1 − (1 − r·u)^k)
- u = 1 means a full planned loss.
- u = 1.25 is a severe-cost loss (25 % worse than planned; the observed SEVERE p99 overshoot is ×${f2(XS('HOLD').loss_overshoot.severe.p99_ratio)}).

| Risk % | k = 5 | k = 10 | k = 15 | k = 20 | k = 20 severe |
|---|---|---|---|---|---|
${RISKS.map((r) => `| ${rp(r)} | ${[5, 10, 15, 20].map((k) => pc(R.math.streaks[r][k].normal, 2)).join(' | ')} | ${pc(R.math.streaks[r][20].severe_1_25x, 2)} |`).join('\n')}

## CURRENT fixed 0.01 lot after k losses of the median DEV worst-case loss (${usd(R.math.current_fixed_lot_streak.median_worst_loss_usd_001lot)} USD; p90 ${usd(R.math.current_fixed_lot_streak.p90_worst_loss_usd_001lot)} USD)
| Account | Median risk / trade | Equity after 5 | 10 | 15 | 20 |
|---|---|---|---|---|---|
${ACC.map((A) => { const b = R.math.current_fixed_lot_streak.by_account[A]; return `| ${A} | ${pc(b.risk_pct_median, 2)} | ${[5, 10, 15, 20].map((k) => usd(b.equity_after_k_losses_median[k])).join(' | ')} |`; }).join('\n')}

## Consecutive-loss pause (DESCRIPTIVE_ONLY_NOT_SELECTION)
- **Rule:** after 3 (or 5) losses in a row, no new trade until the next UTC day. The streak resets on a win or on the pause.
- **Martingale prohibited:** the size after a loss is equity × r. It is never increased; the test asserts identical lots whatever the streak.

${ctrlTable(['pause_3', 'pause_5'])}

| Control | Pass on DEV | Pass on HOLD | Pass on both | DEV-only |
|---|---|---|---|---|
${consistency(['pause_3', 'pause_5'])}

## Conclusion
- **Streaks of ${Math.max(...S2.flatMap((S) => BIG.map((A) => g(S, A, P(0.005)).worst_loss_streak)))} or more losses occur** in both splits.
- **No pause rule is supported.** pause 3 passes the stage-2 rule on both splits only at ${bothCells('pause_3')}, and pause 5 at ${bothCells('pause_5')}. Most DEV passes do not replicate on HOLD, so the pause is not added (smallest effective structure).
`;

// 8 ---------- exposure ----------
out.V10_TOTAL_EXPOSURE = HEAD('V10_TOTAL_EXPOSURE') + `## Equity definition
- **Authoritative equity:** the account EQUITY (balance + floating P/L) at the decision instant, as reported by the platform. It is never free margin, never a starting balance and never a fixed number.
- **In this study:** a new trade is only considered when flat (MAX_SIMULTANEOUS_TRADES = 1), so equity = closed-trade balance at every decision.
- **Day and week anchors:** day-start equity and week-start equity are snapshots of that equity at the first event of the UTC day and ISO week.

## Open-exposure handling
- **MAX_SIMULTANEOUS_TRADES = 1.** A decision while a position is open is rejected (POSITION_OPEN_MAX_SIMULTANEOUS_1). There is no pyramiding, no second position and no averaging down.
- **Remaining capacity:** with no open position the per-trade capacity is the full per-trade budget (equity × r), capped by the remaining daily capacity when a daily limit is configured.
- **Total planned exposure** is therefore at most one position's actual risk (≤ equity × r) at any time.
- **Cross-symbol exposure:** none (XAUUSD only).

## Measured (PCT 0.50 %, 10,000 USD, NORMAL cost)
| Split | Trades | Signals arriving while the single position was open | Share of all signals |
|---|---|---|---|
${S2.map((S) => `| ${S} | ${XS(S).exposure.trades} | ${XS(S).exposure.signals_during_open_position} | ${pc(XS(S).exposure.share_of_signals)} |`).join('\n')}

These signals are not traded (not queued, not added). The existing one-position walk (\`canReenter\`) also blocks same-setup repeats and revenge re-entries; that is unchanged from V8/V9.

## Prohibited (asserted by tests)
- Increasing risk after a loss (martingale).
- Recovery sizing.
- Averaging down.
- Size growth from recent profit beyond equity proportionality.
- AUTO_SCALING stays OFF; CAPITAL_HARVEST stays OFF.
`;

// 9 ---------- broker ----------
out.V10_BROKER_CONSTRAINTS = HEAD('V10_BROKER_CONSTRAINTS') + `## Source
\`${SPEC.source}\`: the latest XAUUSDm record (${SPEC.recorded_at}). The values are read, not assumed. The loader fails closed if the file or a required field is missing (tested).

The same contract fields appear in all 9 REAL-verified records (2026-09-25 → 2026-09-30) and in the latest record. No login, password or server value is copied into the spec.

| Field | Value | Use |
|---|---|---|
| Contract size | ${SPEC.contract_size} oz | loss per lot, margin |
| Volume min / step / max | ${SPEC.volume_min} / ${SPEC.volume_step} / ${SPEC.volume_max} | rounding down, rejection below the minimum, cap |
| Point / digits | ${SPEC.point} / ${SPEC.digits} | tick size ${SPEC.tick_size} |
| Tick value per lot | ${SPEC.tick_value_per_lot} USD per point | (contract × point) |
| Stops level / freeze level | ${SPEC.stops_level_points} / ${SPEC.freeze_level_points} points | no minimum SL distance imposed by the broker |
| Leverage | 1:${SPEC.leverage} | margin |
| Margin currency | ${SPEC.margin_currency} | margin scales with price |
| Margin call | ${SPEC.margin_call_pct} % | margin-level-after-loss rule (+40 buffer) |
| Spread (recorded) | ${SPEC.spread_points} points = ${f2(SPEC.spread_points * SPEC.point)} USD | NORMAL cost spread 0.24 |
| Swap long | ${SPEC.swap_long_points} points = ${f2(SPEC.swap_long_points * SPEC.point)} USD/oz/night | BUY overnight cost in the simulator; NOT in the worst-case formula (see V10_SLIPPAGE_STRESS) |

## Constraints that shape the result
- **Minimum lot.** 0.01 lot = 1 oz. The worst-case loss of the smallest possible position is (1.5 × SL + 0.34) USD: median ${usd(wl('HOLD').p50)} USD on HOLD, up to ${usd(wl('HOLD').max)} USD.
  - Any risk budget below that must reject the trade.
  - This dominates small accounts (V10_ACCOUNT_SIZE_COMPARISON).
- **Step 0.01 and rounding down.** The actual risk is up to one step below the approved risk; small budgets lose proportionally more to rounding.
- **Stops and freeze level 0.** The broker places no extra distance constraint. The production rule "never closer than 4 spreads" remains a production property.

## Not read from the platform (gaps; handled conservatively)
- **Commission:** none is recorded for this account type; costs are modelled via spread + slippage.
- **Swap short:** not recorded in the log; SELL swap is modelled as 0.
- **Live tick-by-tick spread:** the study uses fixed NORMAL / MODERATE / SEVERE levels.
`;

// 10 ---------- slippage ----------
const lo = (S, c) => XS(S).loss_overshoot[c];
out.V10_SLIPPAGE_STRESS = HEAD('V10_SLIPPAGE_STRESS') + `## Cost levels (per oz)
- **NORMAL:** spread 0.24 + slippage 0.10.
- **MODERATE:** 0.40 + 0.30.
- **SEVERE:** 0.60 + 0.60, plus a gap. Every 10th stop-out (broker SL or thesis invalidation) in time order fills a further 0.5 × structural distance worse.
- **Planning assumption:** the worst-case loss always uses the NORMAL slippage allowance (0.10), so the stress tests how wrong the plan can be.

## Realized loss versus the planned hard-stop loss (all losing signal outcomes)
| Split | Cost | Losing outcomes | Share above plan | Share above ×1.25 | p99 ratio | Max ratio |
|---|---|---|---|---|---|---|
${S2.flatMap((S) => COSTS.map((c) => `| ${S} | ${c} | ${lo(S, c).losing_outcomes} | ${pc(lo(S, c).share_above_planned)} | ${pc(lo(S, c).share_above_1_25x)} | ${f3(lo(S, c).p99_ratio)} | ${f3(lo(S, c).max_ratio)} |`)).join('\n')}

### Worst NORMAL-cost overshoots
| Split | Signal | Date | Exit | SL $ | Loss $/oz | Ratio |
|---|---|---|---|---|---|---|
${S2.flatMap((S) => lo(S, 'normal').worst5.map((x) => `| ${S} | ${x.id} | ${x.date} | ${x.exit} | ${x.R_usd} | ${x.loss_oz} | ${f3(x.ratio)} |`)).join('\n')}

Every NORMAL overshoot is a BUY held overnight: the bar simulator charges the broker swap (0.56 USD/oz/night), and the worst-case formula does not include it.
**A future sizing formula must add a swap allowance for BUY positions that can cross the daily rollover.**

The bar simulator fills the broker SL at its level (+ slippage). Gap-through fills beyond the stop are represented only by the SEVERE deterministic gap.

## End equity / max drawdown by cost (USD)
| Split | Account | Model | NORMAL | MODERATE | SEVERE |
|---|---|---|---|---|---|
${S2.flatMap((S) => [250, 1000, 10000].flatMap((A) => ['CURRENT', P(0.001), P(0.0025), P(0.005), P(0.01)].map((m) => `| ${S} | ${A} | ${m} | ${COSTS.map((c) => { const x = g(S, A, m, c); return x.trades ? `${usd(x.end)} / ${pc(x.max_dd_pct)}${x.survived ? '' : ' **RUIN**'}` : 'no trade'; }).join(' | ')} |`))).join('\n')}

## Reading
- **Costs dominate.** Moving from NORMAL to SEVERE turns a 10,000 USD account at 0.50 % risk from ${usd(g('HOLD', 10000, P(0.005)).end)} to ${usd(g('HOLD', 10000, P(0.005), 'severe').end)} USD on HOLD.
- **Results are not strictly monotone in cost** at small accounts, because the size is path-dependent: higher spread → larger worst-case loss per lot → more minimum-lot rejections → a different trade set.
- **CURRENT can go below zero.** The 250 USD account under MODERATE cost ends at ${usd(g('HOLD', 250, 'CURRENT', 'moderate').end)} USD on HOLD: the fixed lot keeps trading while equity approaches the production veto floor, and a single wide-SL loss exceeds the remaining equity. Specifically, ${RUIN_NOTE}.
- **Percentage sizing never ruins** (minimum equity stays > 0 in every scenario): it shrinks or rejects instead.
`;

// 11 ---------- survival ----------
const smallScen = S2.flatMap((S) => [100, 250, 500].flatMap((A) => COSTS.map((c) => g(S, A, 'CURRENT', c))));
out.V10_CAPITAL_SURVIVAL = HEAD('V10_CAPITAL_SURVIVAL') + `## Loss-streak survival (mathematics only)
| Risk % | 5 losses | 10 losses | 15 losses | 20 losses | 20 losses (×1.25 severe) | Equity left after 20 |
|---|---|---|---|---|---|---|
${RISKS.map((r) => `| ${rp(r)} | ${[5, 10, 15, 20].map((k) => pc(R.math.streaks[r][k].normal, 2)).join(' | ')} | ${pc(R.math.streaks[r][20].severe_1_25x, 2)} | ${pc(1 - R.math.streaks[r][20].normal, 1)} |`).join('\n')}

Fixed-fraction sizing cannot reach zero from losses alone: each loss is r × the current equity. A minimum-lot rejection stops trading before the risk % would be exceeded.

## Fixed 0.01 lot (CURRENT): survival depends on the account
| Account | Median risk / trade (DEV) | Equity after 20 median losses | Losses to zero at the median loss |
|---|---|---|---|
${ACC.map((A) => { const b = R.math.current_fixed_lot_streak.by_account[A]; return `| ${A} | ${pc(b.risk_pct_median, 2)} | ${usd(b.equity_after_k_losses_median[20])} | ${Math.floor(A / R.math.current_fixed_lot_streak.median_worst_loss_usd_001lot)} |`; }).join('\n')}

## Survival in the chronological replays (minimum equity reached; RUIN = equity ≤ 0)
| Split | Account | CURRENT N / M / S | ${[0.0025, 0.005, 0.01].map((r) => `${rp(r)} N / M / S`).join(' | ')} |
|---|---|---|${[0.0025, 0.005, 0.01].map(() => '---').join('|')}|
${S2.flatMap((S) => ACC.map((A) => `| ${S} | ${A} | ${COSTS.map((c) => `${usd(g(S, A, 'CURRENT', c).min_equity)}${g(S, A, 'CURRENT', c).survived ? '' : ' RUIN'}`).join(' / ')} | ${[0.0025, 0.005, 0.01].map((r) => COSTS.map((c) => usd(g(S, A, P(r), c).min_equity)).join(' / ')).join(' | ')} |`)).join('\n')}

## Reading
- **Small accounts.** Capital survival for accounts < 1,000 USD requires NOT trading at the 0.01-lot minimum on most signals. Of the ${smallScen.length} small-account CURRENT replays (100 / 250 / 500 USD × 2 splits × 3 costs), ${smallScen.filter((x) => x.survived && x.end < 1.5 * curMinEquity).length} end within 1.5× of the production veto floor (≈ ${usd(curMinEquity)} USD), where the veto stops further trading. ${smallScen.filter((x) => !x.survived).length} ends with negative equity (HOLD, 250 USD, MODERATE). Only ${smallScen.filter((x) => x.end >= x.start).length} ends at or above its start.
- **Large accounts.** At 10,000 USD the fixed 0.01 lot is a very small risk (~0.1 %), which is why CURRENT shows a small drawdown there.
`;

// 12 ---------- recovery ----------
out.V10_RECOVERY_MATH = HEAD('V10_RECOVERY_MATH') + `## Gain required to recover a drawdown: g = d ÷ (1 − d)
| Drawdown | Gain required |
|---|---|
${Object.entries(R.math.recovery).map(([d, x]) => `| ${pc(Number(d), 0)} | ${pc(x)} |`).join('\n')}

## Recovery required after the observed maximum drawdown (NORMAL cost)
| Split | Account | CURRENT | ${RISKS.map(rp).join(' | ')} |
|---|---|---|${RISKS.map(() => '---').join('|')}|
${S2.flatMap((S) => BIG.map((A) => `| ${S} | ${A} | ${pc(g(S, A, 'CURRENT').max_dd_pct)} → +${pc(g(S, A, 'CURRENT').recovery_needed_pct)} | ${RISKS.map((r) => (g(S, A, P(r)).trades ? `${pc(g(S, A, P(r)).max_dd_pct)} → +${pc(g(S, A, P(r)).recovery_needed_pct)}` : '—')).join(' | ')} |`)).join('\n')}

- **Recovery math is not a reason to raise risk.** A negative-expectancy stream does not recover a drawdown by itself, whatever the risk %.
- **Raising risk after a drawdown is prohibited:** no martingale, no recovery sizing.
`;

// 13 ---------- risk of ruin ----------
out.V10_RISK_OF_RUIN = HEAD('V10_RISK_OF_RUIN') + `## Assumptions (labelled)
- **Resampling:** trades are i.i.d. resamples of the realized risk units of the trades taken (P&L ÷ planned worst-case loss, NORMAL cost), DEV (${R.splits.DEV.units_n} trades) or HOLD (${R.splits.HOLD.units_n} trades).
- **Sizing:** fixed fraction r, no controls, no minimum-lot effect.
- **Horizon:** one year = the split's trade rate scaled to 252 sessions (DEV ${mc('DEV', 0.001).trades_per_year}, HOLD ${mc('HOLD', 0.001).trades_per_year} trades).
- **Paths:** 2,000, seed 20261001.
- **Interpretation:** a stationarity-dependent PROXY, not a forecast. Ruin to zero is impossible under fixed-fraction sizing, so drawdown thresholds are used.

| Split | Risk % | P(DD ≥ 10 %) | P(DD ≥ 20 %) | P(DD ≥ 30 %) | P(DD ≥ 50 %) | Median DD | p95 DD |
|---|---|---|---|---|---|---|---|
${S2.flatMap((S) => RISKS.map((r) => { const m = mc(S, r); return `| ${S} | ${rp(r)} | ${pc(m.p_dd_ge_10)} | ${pc(m.p_dd_ge_20)} | ${pc(m.p_dd_ge_30)} | ${pc(m.p_dd_ge_50)} | ${pc(m.median_dd)} | ${pc(m.p95_dd)} |`; })).join('\n')}

## Reading
- **Pre-registered gate (d): P(DD ≥ 20 %) ≤ 5 %.** It is met only by 0.10 %, on both splits. 0.25 % gives ${pc(mc('DEV', 0.0025).p_dd_ge_20)} (DEV) and ${pc(mc('HOLD', 0.0025).p_dd_ge_20)} (HOLD).
- **0.10 % cannot size** most trades at the broker minimum lot (V10_RISK_PERCENTAGE_RESEARCH).
- **CURRENT, observed rather than proxied:** the fixed lot reached negative equity in one replay (HOLD, 250 USD, MODERATE cost) and drawdowns of ${pc(g('HOLD', 500, 'CURRENT').max_dd_pct)} (500 USD) and ${pc(g('HOLD', 1000, 'CURRENT').max_dd_pct)} (1,000 USD) at NORMAL cost.
`;

// 14 ---------- account size ----------
const cp = (S, A) => XS(S).current_fixed_lot_pct_risk[A];
out.V10_ACCOUNT_SIZE_COMPARISON = HEAD('V10_ACCOUNT_SIZE_COMPARISON') + `## CURRENT fixed 0.01 lot expressed as % risk of equity (worst-case loss at the hard stop)
| Account | DEV p50 | DEV p90 | DEV max | HOLD p50 | HOLD p90 | HOLD p99 | HOLD max |
|---|---|---|---|---|---|---|---|
${ACC.map((A) => `| ${A} | ${pc(cp('DEV', A).p50, 2)} | ${pc(cp('DEV', A).p90, 2)} | ${pc(cp('DEV', A).max, 1)} | ${pc(cp('HOLD', A).p50, 2)} | ${pc(cp('HOLD', A).p90, 2)} | ${pc(cp('HOLD', A).p99, 1)} | ${pc(cp('HOLD', A).max, 1)} |`).join('\n')}

## Per account: CURRENT versus percentage risk (NORMAL cost, end equity / max DD / trades)
| Account | Split | CURRENT | 0.10 % | 0.25 % | 0.50 % | 0.75 % | 1.00 % |
|---|---|---|---|---|---|---|---|
${ACC.flatMap((A) => S2.map((S) => `| ${A} | ${S} | ${usd(g(S, A, 'CURRENT').end)} / ${pc(g(S, A, 'CURRENT').max_dd_pct)} / ${g(S, A, 'CURRENT').trades} | ${RISKS.map((r) => (g(S, A, P(r)).trades ? `${usd(g(S, A, P(r)).end)} / ${pc(g(S, A, P(r)).max_dd_pct)} / ${g(S, A, P(r)).trades}` : 'no trade')).join(' | ')} |`)).join('\n')}

## Reading by account size
- **100 USD.** One 0.01 lot risks ${pc(cp('HOLD', 100).p50)} of equity on the median HOLD trade. No percentage ≤ 1 % can size a single trade. CURRENT trades only ${g('HOLD', 100, 'CURRENT').trades} times before the production veto stops it, with a ${pc(g('HOLD', 100, 'CURRENT').max_dd_pct)} drawdown.
- **250 – 500 USD.**
  - CURRENT risks ${pc(cp('HOLD', 250).p50)} (250) and ${pc(cp('HOLD', 500).p50)} (500) per median trade.
  - Its HOLD drawdowns are ${pc(g('HOLD', 250, 'CURRENT').max_dd_pct)} and ${pc(g('HOLD', 500, 'CURRENT').max_dd_pct)}.
  - Percentage risk ≤ 1 % sizes only a minority of trades.
- **1,000 USD.**
  - CURRENT ≈ ${pc(cp('HOLD', 1000).p50)} median risk; HOLD drawdown ${pc(g('HOLD', 1000, 'CURRENT').max_dd_pct)}.
  - 0.25 % sizes ${pc(sizeable('HOLD', 1000, 0.0025))} of HOLD trades; 0.50 % sizes ${pc(sizeable('HOLD', 1000, 0.005))}.
- **5,000 – 10,000 USD.** The fixed 0.01 lot becomes a SMALL risk (≈ ${pc(cp('HOLD', 10000).p50, 2)} at 10,000), smaller than any candidate percentage, so CURRENT has the smallest drawdown there. Sizeable share at 10,000 USD: 0.25 % ${pc(sizeable('DEV', 10000, 0.0025))} DEV / ${pc(sizeable('HOLD', 10000, 0.0025))} HOLD; 0.50 % ${pc(sizeable('DEV', 10000, 0.005))} / ${pc(sizeable('HOLD', 10000, 0.005))}. At 5,000 USD: 0.50 % ${pc(sizeable('DEV', 5000, 0.005))} / ${pc(sizeable('HOLD', 5000, 0.005))}.
- **Conclusion:** the fixed lot is oversized for small accounts and undersized (relative to every candidate) for large ones. Percentage sizing makes risk proportional but cannot make this entry stream profitable.
`;

// 15 ---------- development ----------
out.V10_DEVELOPMENT_RESULTS = HEAD('V10_DEVELOPMENT_RESULTS') + `## Split
- **Period:** DEV 2025-05-07 → 2025-12-31.
- **Signals:** ${D.signals} V8 corrected-core signals over ${D.sessions} sessions.
- **Monte Carlo units:** ${D.stage1.units_n} trades, ${D.stage1.trades_per_year} trades per year.

## Stage 1 (risk %)
| Risk % | Supported | MC P(DD ≥ 20 %) | Failed criteria by account (1k / 5k / 10k) |
|---|---|---|---|
${RISKS.map((r) => `| ${rp(r)} | ${st1(r).supported ? 'YES' : 'no'} | ${pc(st1(r).monte_carlo.p_dd_ge_20)} | ${BIG.map((A) => failed(st1(r).checks[A]).map((k) => CLABEL[k].split(' ')[0]).join(' ') || 'none').join(' / ')} |`).join('\n')}

## Stage 2 (controls) and stage 3 (margin cap)
- **Not executed:** both are defined AT the supported risk %, and there is none.
- **Descriptive equivalents:** V10_DAILY_LOSS_CONTROL, V10_CONSECUTIVE_LOSS_RESEARCH and V10_MARGIN_PROTECTION.

## Selection (frozen)
\`configs/selection.json\`:
- supported_risk_pcts = [${SEL.supported_risk_pcts.join(', ')}];
- approved_risk_pct = ${SEL.approved_risk_pct};
- supported_controls = [${SEL.supported_controls.join(', ')}];
- margin_cap_pct = ${SEL.margin_cap_pct}.

## Freeze
- frozen_utc: ${FZ.frozen_utc}
- prereg_sha: ${FZ.prereg_sha}
- risk_sha: ${FZ.risk_sha}
- selection_sha: ${FZ.selection_sha}
- Verified by the FULL run and by the test suite.
`;

// 16 ---------- holdout ----------
out.V10_HOLDOUT_RESULTS = HEAD('V10_HOLDOUT_RESULTS') + `## Split
- **Period:** HOLDOUT 2026-01-01 → 2026-09-29.
- **Signals:** ${R.splits.HOLD.signals} signals over ${R.splits.HOLD.sessions} sessions, replayed once after the freeze.

## Pre-registered holdout check
- **Not applicable:** no risk % was frozen, so condition (ii) of the decision ("a SUPPORTED risk % exists on DEV and on HOLDOUT still meets (a)–(e)") fails at its first clause.
- **Holdout flags:** hold_confirms = ${dec.hold_confirms}; hold_checks = ${JSON.stringify(R.integrity.hold_checks)}.

## Holdout grid (NORMAL cost; DESCRIPTIVE: the holdout cannot select)
| Account | CURRENT end / DD / trades | ${RISKS.map(rp).join(' | ')} |
|---|---|${RISKS.map(() => '---').join('|')}|
${ACC.map((A) => `| ${A} | ${usd(g('HOLD', A, 'CURRENT').end)} / ${pc(g('HOLD', A, 'CURRENT').max_dd_pct)} / ${g('HOLD', A, 'CURRENT').trades} | ${RISKS.map((r) => (g('HOLD', A, P(r)).trades ? `${usd(g('HOLD', A, P(r)).end)} / ${pc(g('HOLD', A, P(r)).max_dd_pct)} / ${g('HOLD', A, P(r)).trades}` : 'no trade')).join(' | ')} |`).join('\n')}

## Would any risk % have passed on HOLD alone? (criteria b–f, accounts ≥ 1,000; descriptive)
| Risk % | 1,000 | 5,000 | 10,000 |
|---|---|---|---|
${RISKS.map((r) => `| ${rp(r)} | ${BIG.map((A) => failed(holdChecks(r)[A]).join(', ') || 'all met').join(' | ')} |`).join('\n')}

## Reading
- **HOLD is less adverse than DEV** for percentage risk at 10,000 USD (taken mean R ${f3(takenR('HOLD'))} vs ${f3(takenR('DEV'))}). It is still negative.
- **The minimum-lot constraint is tighter on HOLD,** because the SLs are wider.
- **Nothing on HOLD changes the decision.** Using HOLD to pick a risk % would be holdout tuning and is not done.
`;

// 17 ---------- replay ----------
const rep = R.integrity.replay;
out.V10_REPLAY_RESULTS = HEAD('V10_REPLAY_RESULTS') + `## Integrity (FULL run)
| Check | Result |
|---|---|
| Chronological replay deterministic (two runs, identical trade lists by hash) | ${rep.deterministic ? 'PASS' : 'FAIL'} |
| Restart from serialized state (first half → serialize → deserialize → second half) equals the uninterrupted run | ${rep.restart_equals_uninterrupted ? 'PASS' : 'FAIL'} |
| Restart prefix consistent with the uninterrupted run | ${rep.restart_prefix_consistent ? 'PASS' : 'FAIL'} |
| Duplicate signal rejected | ${rep.duplicate_prevented ? 'PASS' : 'FAIL'} |
| PCT never above its approved risk (every split × account × risk % × cost) | ${R.integrity.pct_never_above_approved ? 'PASS' : 'FAIL'} |

## Reproduction
- **Refactor check.** The simulation helpers were moved from \`v10_study.mjs\` into \`scripts/sim.mjs\` after the first FULL run. DEV was re-run (selection.json byte-identical; v10_dev.json identical apart from the timestamp; freeze hashes identical), and FULL was re-run: v10_results_FULL.json was identical apart from the timestamp.
- **Restore.** The original freeze file was restored.

## Mechanics tests (\`tests/risk_capital_v10.test.js\`)
The suite covers:
- percentage risk, sizing and SL distance;
- broker rounding (down, never up) and the actual-risk property over 5,000 random cases;
- minimum-lot rejection;
- the broker spec loaded from the platform log (fails closed);
- margin cap, margin level after loss, and margin ≠ risk permission;
- daily limit and capacity, next-day reset;
- consecutive-loss pause, weekly halt;
- MAX_SIMULTANEOUS_TRADES = 1;
- no martingale and no profit escalation;
- restart = uninterrupted;
- duplicates (also after restart);
- broker rejection (no retry, no size change);
- missing, wrong-side and loosened SL, lost connection;
- the excess-exposure fail-safe;
- stress-cost ordering;
- the CURRENT production margin veto;
- research boundaries;
- the frozen results.

Tests: see GIT_EVIDENCE for counts.
`;

// 18 ---------- rejected ----------
const ctrlVerdict = (k) => { const cells = [0.0025, 0.005, 0.01].flatMap((r) => BIG.map((A) => [CT('DEV', r, A, k).would_pass_stage2_rule, CT('HOLD', r, A, k).would_pass_stage2_rule])); return `passes the stage-2 rule on DEV in ${cells.filter(([a]) => a).length}/9 and on HOLD in ${cells.filter(([, b]) => b).length}/9 risk × account cells, both in ${cells.filter(([a, b]) => a && b).length}/9`; };
out.V10_REJECTED_PARAMETERS = HEAD('V10_REJECTED_PARAMETERS') + `## Risk percentages (pre-registered stage 1, DEV)
| Parameter | Status | Reason |
|---|---|---|
${RISKS.map((r) => `| risk ${rp(r)} | REJECTED | ${[...new Set(BIG.flatMap((A) => failed(st1(r).checks[A]).map((k) => CLABEL[k])))].join('; ')} |`).join('\n')}

## Controls (DESCRIPTIVE: no risk % was supported, so none could be selected)
| Parameter | Status | Evidence |
|---|---|---|
${['daily_1', 'daily_2', 'daily_3', 'pause_3', 'pause_5', 'weekly_5'].map((k) => `| ${k} | NOT SUPPORTED | ${ctrlVerdict(k)} |`).join('\n')}

## Margin caps
| Parameter | Status | Evidence |
|---|---|---|
| cap 10 % / 25 % / 50 % | NOT SELECTED | Stage 3 not executed (no supported risk %). Descriptively, 25 % and 50 % never bind; 10 % binds only at 1.00 % risk (≤ ${pc(Math.max(...S2.flatMap((S) => BIG.map((A) => XS(S).margin_caps[0.01][A][0.1].margin_reject_share))), 2)} of trades). |

## Production assumptions examined (not changed; RESEARCH finding)
| Assumption | Status | Evidence |
|---|---|---|
| Fixed −50 USD maximum loss per trade (0.01 lot) as the risk definition | REJECTED as a risk model | It is a universal fixed-dollar assumption, and the % risk varies with account and SL. HOLD median ${pc(cp('HOLD', 1000).p50)} at 1,000 USD vs ${pc(cp('HOLD', 250).p50)} at 250 USD. The monetary SL lies inside the structural SL on ${pc(sl('HOLD').share_structural_beyond_50, 2)} of HOLD signals. |
| Fixed 0.01 lot for every account size | REJECTED as capital-safe for small accounts | HOLD drawdown ${pc(g('HOLD', 250, 'CURRENT').max_dd_pct)} (250 USD), ${pc(g('HOLD', 500, 'CURRENT').max_dd_pct)} (500 USD), ${pc(g('HOLD', 1000, 'CURRENT').max_dd_pct)} (1,000 USD); negative equity at 250 USD under MODERATE cost |
| Margin veto as risk permission | REJECTED | It allows trading down to ≈ ${usd(curMinEquity)} USD of equity, where one median loss is ${pc(wl('HOLD').p50 / curMinEquity)} of equity |
| Worst-case loss without a swap allowance | REJECTED for any future spec | All NORMAL-cost overshoots (max ×${f2(XS('HOLD').loss_overshoot.normal.max_ratio)}) are overnight BUY swap |

## Prohibited by design (not researched as options)
Martingale, recovery sizing, averaging down, profit-based escalation, AUTO_SCALING and moving the structural SL to fit a dollar amount.
`;

// 19 ---------- supported ----------
out.V10_SUPPORTED_PARAMETERS = HEAD('V10_SUPPORTED_PARAMETERS') + `## Supported by the pre-registered selection
| Parameter | Value |
|---|---|
| SUPPORTED_RISK_PERCENTAGE | ${SEL.supported_risk_pcts.length ? SEL.supported_risk_pcts.map(rp).join(', ') : '**none**'} |
| Supported controls | ${SEL.supported_controls.length ? SEL.supported_controls.join(', ') : '**none**'} |
| Margin cap | ${SEL.margin_cap_pct == null ? '**none selected**' : rp(SEL.margin_cap_pct)} |

## Mechanics validated (tests + replay)
These are not evidence of capital safety for this entry stream. They are the components a future governed risk layer would be built from:
| Mechanism | Validated property |
|---|---|
| Sizing from the structural SL | lots = ⌊equity × r ÷ worst-case loss per lot ÷ step⌋ × step; wider SL → smaller size; SL never moved |
| Rounding | always down; actual risk recalculated; never above approved (5,000-case property + every replay trade) |
| Minimum lot | REJECT below the broker minimum; never round up |
| Broker spec | read from the platform record; fails closed when missing |
| Margin | cap + margin-level-after-loss buffer (60 % + 40); leverage never increases the size |
| Daily / streak / weekly controller | limits as % of day- or week-start equity; resets; pure and serialisable |
| Exposure | MAX_SIMULTANEOUS_TRADES = 1 |
| Restart / duplicates / broker rejection | restart = uninterrupted; duplicates rejected (also after restart); broker rejection never retried or resized |
| Fail-safes | missing / wrong-side / loosened broker SL, excess actual exposure, lost connection → fail closed |
`;

// 20 ---------- proposed spec ----------
out.V10_PROPOSED_RISK_SPEC = HEAD('V10_PROPOSED_RISK_SPEC') + `## Status
**RISK_MODEL = ${dec.RISK_MODEL}. PROPOSED_RISK_SPEC = ${dec.PROPOSED_RISK_SPEC}.**

Under the pre-registration a specification may be proposed only if a risk % is supported on DEV and confirmed on HOLD. None was supported, so **no risk percentage, maximum risk amount, daily limit or pause rule is proposed.** Do not invent a final risk percentage.

## Decision conditions
| Condition | Result |
|---|---|
| (i) Mechanical tests pass | see GIT_EVIDENCE (all V10 tests pass) |
| (ii) A SUPPORTED risk % exists on DEV and HOLD confirms | ${dec.supported_on_dev ? 'yes' : 'NO: no risk % supported on DEV'} |
| (iii) PCT never above approved risk | ${dec.never_above_approved ? 'yes' : 'no'} |
| (iv) Replay deterministic; restart = uninterrupted | ${dec.replay_ok ? 'yes' : 'no'} |

## Production stays unchanged
RR 1.70; LOT 0.01; AUTO_SCALING OFF; CAPITAL_HARVEST OFF; MARTINGALE OFF; AVERAGING_DOWN OFF; EXECUTION_AUTHORITY NONE.

## What any future risk spec would have to satisfy (requirements derived from this study, not a proposal)
1. **An entry stream with demonstrated positive expectancy** after costs. Without it, every risk % only sets the speed of capital loss.
2. **A minimum-equity rule from the broker minimum lot:** trade only when 0.01 lot × worst-case loss ≤ equity × r. Otherwise reject.
3. **A swap allowance in the worst-case loss** for BUY positions that can cross the rollover.
4. **No universal fixed-dollar maximum loss.** Risk is a percentage of current equity, and the structural SL is never moved to fit a dollar amount.
5. **The validated mechanics** in V10_SUPPORTED_PARAMETERS: rounding down, actual-risk recalculation, margin buffer, single exposure, restart and duplicate safety, fail-safes.
`;

let n = 0; for (const [name, body] of Object.entries(out)) { writeFileSync(join(REP, `${name}.md`), body.replace(/\n{3,}/g, '\n\n')); n++; }
console.log(`wrote ${n} reports`);
