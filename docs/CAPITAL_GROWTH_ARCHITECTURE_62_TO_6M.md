# $62_TO_$6M_CAPITAL_GROWTH_ARCHITECTURE — RISK POLICY V2

**Status:** DESIGN ONLY (V1 2026-09-26, V2 revision 2026-09-26). Nothing here is implemented, enabled or wired. Production remains USER_FIXED 0.01 lot with the existing intraday_5m signal engine, RR 1.7, quality 65/70, News/Shock protection, feed/spread guards, single-position discipline, adaptive management and the 2/2 consecutive-loss breaker, all unchanged. The current +30 / −50 USD monetary envelope is treated in this document as a NON-AUTHORITATIVE example configuration, not a user-approved risk rule.

**V2 supersedes V1 on:** the SEED risk percentage (10 % → 5 %), the margin rules (V1 assumed leverage was unknown; it is 1:200), the monetary envelope (fixed dollars → structural-risk-derived), governor thresholds (10/15/25 % → tier-scaled 8/12/20 % down to 5/8/12 %), promotion evidence (sample sizes raised to statistically meaningful counts), and the explicit statement that at 62.07 USD almost every valid XAUUSD 5m signal is unaffordable at prudent risk.

---

## M. VERIFIED BROKER FACTS (read-only from MT5 on 2026-09-25 18:58 UTC, no order placed)

| Fact | Value |
|---|---|
| REAL_ACCOUNT_LEVERAGE | **1:200** (account_info.leverage = 200) |
| Margin mode / stop-out mode | retail hedging account (margin_mode 2), stop-out mode percent |
| Margin call level / stop-out level | 60 % / 0 % of margin level |
| XAUUSDM_MARGIN_CALC_MODE | Forex-style (trade_calc_mode 0): margin = lot × contract × price / leverage; margin_initial and margin_maintenance 0 (defaults) |
| XAUUSDM_CONTRACT_SIZE | 100 oz per 1.0 lot → 0.01 lot = 1 oz = 1.00 USD P&L per 1.00 USD of gold (order_calc_profit confirms 1.0) |
| MIN_LOT / MAX_LOT / LOT_STEP | 0.01 / 200 / 0.01 |
| Digits / tick | 3 / 0.001, tick value 0.10 USD per 1.0 lot |
| Spread at reading | 240 points = 0.24 USD per oz |
| Commission | none on this account (deal history shows profit = net) |
| Swap | long −550.4 points/night ≈ −0.55 USD per night at 0.01; short 0 |
| Stops level / freeze level | 0 / 0 |
| XAUUSDM_MARGIN_FOR_0_01 | **21.47 USD** at 4293 (broker order_calc_margin), = 34.6 % of the 62.07 USD account; 0.02 = 42.93 USD; 0.05 = 107.33 USD; 0.10 = 214.66 USD |
| Margin level at open with 0.01 | 289 %; margin call (60 %) is reached after a 49.2 USD loss; the margin for 0.01 rises with the gold price (≈ price / 200) |

Two independent tests must both pass for every trade: (1) risk test at the structural stop, (2) margin/reserve test. Enough margin never makes a trade affordable, and affordable risk never excuses inadequate margin.

---

## A. CORE PHILOSOPHY

1. **Order of questions.** VALID MARKET SIGNAL → structural invalidation / stop distance (from the engine, never altered) → monetary risk at broker minimum volume → account risk % → margin requirement → free-margin reserve → drawdown state → loss-streak state → permitted size → TRADE or NO TRADE. The question "how much do we want to make or lose" is never asked.
2. **Three separated authorities.** The market decides whether a trade exists. Capital policy decides whether the account can afford it and at what size. The 6,000,000 USD objective defines milestones for reporting only.
3. **Never tighten a stop to fit.** If 0.01 lot at the structural stop exceeds the permitted risk: VALID SIGNAL + UNAFFORDABLE STRUCTURAL RISK = NO TRADE. That outcome is expected to be the common case at 62.07 USD.
4. **Risk before lot, never balance → lot.**
5. **Asymmetry.** Scaling down is immediate and automatic; scaling up requires realized evidence and a confirmed high-water mark.
6. **Invariants** preserved verbatim: no martingale, grid, averaging, recovery sizing, target-chasing sizing or trade quota; single position; WAIT always valid; RR 1.7; quality thresholds; News/Shock/feed/spread guards; loss breaker.
7. **Determinism.** Same inputs → same output. No model, tool or operator chooses a lot at runtime. Every number below is a constant that needs explicit user approval before it can exist in code.

---

## N. SEED RISK REVIEW (62.07 USD account, 0.01 lot minimum)

Equal-percentage consecutive losses (each loss = p % of remaining equity), cost allowance per trade at 0.01 lot = spread 0.24 + slippage allowance 0.30 + commission 0 ≈ 0.55, rounded to **0.60 USD**:

| Risk % | USD risk | After 1 loss | After 2 losses (breaker) | After 5 losses | Drawdown after 5 | Recovery needed | Max structural stop at 0.01 (risk − 0.60 cost) |
|---|---|---|---|---|---|---|---|
| 1 % | 0.62 | 61.45 | 60.83 | 59.03 | 4.9 % | +5.2 % | 0.02 USD → impossible |
| 2 % | 1.24 | 60.83 | 59.61 | 56.11 | 9.6 % | +10.6 % | 0.64 USD → impossible |
| 3 % | 1.86 | 60.21 | 58.40 | 53.30 | 14.1 % | +16.5 % | 1.26 USD → impossible |
| **5 %** | **3.10** | 58.97 | 56.02 | 48.03 | 22.6 % | +29.2 % | **2.50 USD** → below the engine's own minimum stop (0.5 × 5m ATR ≈ 2.5–3.5 USD): effectively no signal fits |
| 7.5 % | 4.66 | 57.41 | 53.11 | 42.03 | 32.3 % | +47.7 % | 4.06 USD → only the tightest BO/SR stops fit (2 of 7 candidates on 2026-09-25) |
| 10 % | 6.21 | 55.86 | 50.28 | 36.65 | 41.0 % | +69.5 % | 5.61 USD → about half of the day's candidates fit |

Fixed-dollar (non-compounding) equal losses are slightly worse: five 10 % losses leave 31.03 USD (50 % drawdown).

Observed structural stops on 2026-09-25 at 0.01: 3.42, 3.49, 4.86, 5.89, 12.43, 15.78, 26.94 USD (median ≈ 8 USD). The equity at which the median stop plus cost fits: 172 USD at 5 %, 287 USD at 3 %; a tight 4 USD stop fits at 92 USD (5 %).

**Recommendation: SEED maximum risk = 5 % of eligible equity, 3.10 USD at 62.07 USD.** Reasons: (a) a 5-loss run costs 22.6 % and is recoverable with +29 %, whereas 10 % needs +70 % and 7.5 % needs +48 %; (b) two same-day losses (the breaker) cost 9.75 % instead of 19.5 %; (c) the margin footprint of 0.01 is already 34.6 % of equity, so the account has no room for a second error; (d) any percentage chosen to "produce trades" at this size is a decision to accept ruin risk, which must be the user's explicit choice, not the policy default. Consequence stated plainly: **at 62.07 USD the 5 % rule makes 0.01 lot unaffordable for essentially every XAUUSD 5m structural stop; the policy answer will be VALID SIGNAL — NO TRADE — CAPITAL TOO SMALL FOR SAFE STRUCTURAL RISK until equity reaches roughly 92 USD (tight stops) to 172 USD (median stops).** The only ways out are external funding to the 175–300 USD range or a user-approved, time-boxed SEED EXCEPTION (documented below as an option, not a recommendation).

Optional SEED EXCEPTION (requires explicit user approval, otherwise absent): max risk 7.5 % (4.66 USD) with hard conditions: stop + cost ≤ 4.66 USD, streak 0, governor NORMAL, margin level at the stop ≥ 200 %, at most 1 trade per UTC day, expires automatically when equity ≥ 100 USD or after 30 completed trades, whichever first. Expected effect on 2026-09-25: 2 of 7 candidates would have been affordable, both would have lost (−3.5 USD each).

---

## B. CAPITAL TIER TABLE (V2)

Definitions: risk base = min(balance, equity, confirmed tier base + realized gain since confirmation) − locked reserve; floating profit never enters. Lot ceiling = hard cap regardless of stop size. Position margin cap and free-margin reserve are the two halves of the margin test (both must pass). Scaling-freeze DD = drawdown from HWM that enters CAUTION (section G).

| # | Tier (confirmed base → next) | Max risk / trade | Lot ceiling | Position margin cap | Free-margin reserve after position | Scaling freeze DD | Lot increase allowed? | Promotion sample (trades AND days) | Profit lock |
|---|---|---|---|---|---|---|---|---|---|
| 0 | SEED 62.07 → 100 | 5 % (3.10 USD) | 0.01 | 40 % of equity (0.01 = 21.5 USD; fails if gold > ≈ 4,965) | 55 % | 8 % | NO (broker minimum) | 20 trades AND 30 days | none |
| 1 | 100 → 250 | 5 % | 0.01 | 30 % | 55 % | 8 % | NO | 20 AND 30 | none |
| 2 | 250 → 500 | 4 % | 0.01 | 20 % | 55 % | 8 % | NO | 30 AND 45 | none |
| 3 | 500 → 1,000 | 3 % | 0.02 | 15 % | 55 % | 6 % | YES, only if the formula yields it | 30 AND 45 | none |
| 4 | 1,000 → 2,500 | 2.5 % | 0.03 | 12 % | 55 % | 6 % | YES | 30 AND 60 | 10 % of gain |
| 5 | 2,500 → 5,000 | 2 % | 0.06 | 10 % | 55 % | 6 % | YES | 30 AND 60 | 10 % |
| 6 | 5,000 → 10,000 | 1.5 % | 0.10 | 10 % | 60 % | 6 % | YES | 40 AND 60 | 10 % |
| 7 | 10,000 → 25,000 | 1.25 % | 0.16 | 8 % | 60 % | 5 % | YES | 40 AND 90 | 15 % |
| 8 | 25,000 → 50,000 | 1 % | 0.32 | 6 % | 60 % | 5 % | YES after BROKER EXPOSURE REVIEW | 50 AND 90 | 20 % |
| 9 | 50,000 → 100,000 | 1 % | 0.60 | 5 % | 65 % | 5 % | YES after broker exposure review | 50 AND 90 | 20 % |
| 10 | 100,000 → 250,000 | 0.75 % | 1.00 (existing absolute ceiling) | 5 % | 65 % | 5 % | YES after LIQUIDITY/SLIPPAGE REVIEW | 60 AND 120 | 25 % |
| 11 | 250,000 → 500,000 | 0.6 % | 2.0 | 4 % | 65 % | 4 % | REQUIRES INSTITUTIONAL-SCALE REVIEW before any lot above 1.0 | 60 AND 120 | 30 % |
| 12 | 500,000 → 1,000,000 | 0.5 % | 3.0 | 4 % | 70 % | 4 % | REQUIRES INSTITUTIONAL-SCALE REVIEW | 80 AND 180 | 30 % |
| 13 | 1,000,000 → 2,000,000 | 0.4 % | 5.0 | 3 % | 70 % | 4 % | REQUIRES INSTITUTIONAL-SCALE REVIEW (multi-venue) | 80 AND 180 | 35 % |
| 14 | 2,000,000 → 3,000,000 | 0.35 % | 8.0 | 3 % | 70 % | 3 % | REQUIRES INSTITUTIONAL-SCALE REVIEW | 100 AND 180 | 35 % |
| 15 | 3,000,000 → 4,000,000 | 0.3 % | 11.0 | 3 % | 75 % | 3 % | REQUIRES INSTITUTIONAL-SCALE REVIEW | 100 AND 180 | 40 % |
| 16 | 4,000,000 → 5,000,000 | 0.3 % | 14.0 | 2.5 % | 75 % | 3 % | REQUIRES INSTITUTIONAL-SCALE REVIEW | 100 AND 180 | 40 % |
| 17 | 5,000,000 → 6,000,000 | 0.25 % | 15.0 | 2.5 % | 75 % | 3 % | REQUIRES INSTITUTIONAL-SCALE REVIEW | 100 AND 180 | 40 % |
| 18 | 6,000,000 reached | 0.25 % | 18.0 | 2.5 % | 75 % | 3 % | REQUIRES INSTITUTIONAL-SCALE REVIEW | n/a | policy review |

Notes: tiers 0–2 never raise the lot; growth there comes only from expectancy at 0.01 and from the widening set of affordable stops as equity grows. Lot ceilings are caps derived from `risk / (8 USD reference stop × 100)`, not targets. The existing 1.0 absolute ceiling is correct through tier 10 and may only be raised by a recorded institutional review.

---

## C. RISK-SIZING FORMULA (V2, structural-stop first, both tests mandatory)

```
Inputs (facts only):
  E_bal, E_eq            broker balance, equity (equal when flat; single-position rule)
  B_conf, G_reserve      confirmed tier base, locked profit reserve
  tier                   { riskPct, lotCeiling, marginCapPct, reservePct }
  m_gov                  governor multiplier ∈ {1.0, 0.5, 0.25, 0}
  m_streak               1.0 (streak 0) | 0.5 (streak 1) | 0 (streak ≥ 2, existing breaker)
  entry, structural_stop from the validated signal (never altered)
  contract = 100, step = 0.01, lot_min = 0.01, lot_max = 200
  price, leverage = 200, free_margin, margin_call_pct = 60, stop_out_pct = 0
  cost_allowance_per_0_01 = spread + slippage_allowance(0.30) + commission(0)  ≈ 0.60 USD

1. risk_per_0_01     = |entry − structural_stop| × contract × 0.01 + cost_allowance_per_0_01
2. eligible_equity   = min(E_bal, E_eq, B_conf + realized_gain_since_confirmation) − G_reserve
3. permitted_risk    = eligible_equity × tier.riskPct × m_gov × m_streak
4. required_lot      = permitted_risk / (risk_per_0_01 / 0.01)          (= permitted_risk / structural_risk_per_lot)
5. lot               = floor_to_step(required_lot, step)                 (never rounds up)
6. lot               = min(lot, tier.lotCeiling, lot_max, ABSOLUTE_CEILING, post_loss_cap)
                       post_loss_cap = previous lot if the previous completed trade was a loss, else ∞
7. if lot < lot_min  → NO_TRADE: CAPITAL_TOO_SMALL_FOR_SAFE_STRUCTURAL_RISK
8. margin_req        = lot × contract × price / leverage                 (broker order_calc_margin is authoritative when available)
   if margin_req > tier.marginCapPct × E_eq                               → step lot down; if < lot_min → NO_TRADE: MARGIN_CAP
   if free_margin − margin_req < tier.reservePct × E_eq                    → step down; NO_TRADE: FREE_MARGIN_RESERVE
9. equity_at_stop    = E_eq − lot × |entry − structural_stop| × contract − cost
   margin_level_at_stop = equity_at_stop / margin_req × 100
   require margin_level_at_stop ≥ max(200 %, margin_call_pct + 100)     → else step down / NO_TRADE: STOP_OUT_RISK
10. max_loss_usd     = lot × |entry − structural_stop| × contract + cost   (expected loss = structural loss; nothing larger is "normal")
    catastrophic_backstop_usd = min(1.5 × max_loss_usd, 2 × permitted_risk)  (section O)
11. output = { lot, permitted_risk, max_loss_usd, catastrophic_backstop_usd, margin_req, checks[] } or { NO_TRADE, reason }
```

Worked example at 62.07 USD, tier 0, NORMAL, streak 0, 5 %: permitted_risk = 3.10 USD. Signal with a 3.49 USD stop (BO 14:35 on 2026-09-25): risk_per_0_01 = 3.49 + 0.60 = 4.09 > 3.10 → required_lot = 0.0076 → floor 0.00 → NO_TRADE. Signal with a 2.40 USD stop: risk 3.00 ≤ 3.10 → lot 0.01 → margin 21.47 = 34.6 % ≤ 40 %, free margin 40.6 = 65 % ≥ 55 %, margin level at stop (62.07 − 3.00)/21.47 = 275 % ≥ 200 % → TRADE at 0.01.

Properties: structural stop is an input and is never moved; never rounds up; no term references the objective, milestones, time or trade counts; permitted_risk is non-increasing in drawdown, streak and demotion and increases only through confirmed promotion; all existing executor gates (evaluateEntry, assessSafety veto, executable-geometry RR 1.7 at live price, News/Shock/feed guards) still run after sizing.

---

## O. MONETARY ENVELOPE — WHAT REPLACES +30 / −50

FIXED_PLUS_30_MINUS_50_SHOULD_REMAIN = NO. At 62.07 USD a −50 USD boundary authorizes an 80 % loss and sits 0.8 USD from the margin-call level; a +30 USD target is a fixed dollar goal unrelated to structure. Both are example values inherited from the 100 USD / 0.02 lot era.

Replacement (design):

| Layer | Authority | Definition |
|---|---|---|
| Normal loss | structural | broker SL and thesis stop = the engine's structural stop (1.0 × structural + spread); expected loss = permitted risk or less |
| Adaptive exits | structural | existing THESIS_INVALIDATION_CLOSE, THESIS_DETERIORATION_CLOSE, PROFIT_PROTECT_CLOSE, unchanged |
| Profit | structural | TP2 = the engine's structural objective (RR ≥ 1.7); no mandatory fixed-dollar profit target exists; PROFIT_PROTECT governs give-back |
| Broker fail-safe SL | emergency | placed at min(1.5 × structural distance + spread, 2 × permitted_risk / (lot × contract)); exists only for the case where Node/Python die; never the expected loss |
| Catastrophic equity backstop | emergency | if floating loss ≥ catastrophic_backstop_usd (gap, feed failure) → EMERGENCY_CLOSE; derived from current equity and tier risk, never a fixed dollar amount |
| Overnight | policy | a position held across the swap time incurs −0.55 USD per night at 0.01 (long); at SEED that is 18 % of the permitted risk, so the adaptive manager's existing evidence rules decide holding, not the swap, but the swap is charged against the trade's risk accounting |

Net effect: the fixed monetary monitor (`evaluateExit` at +30/−50) becomes a derived backstop keyed to the sized trade, and the profit side has no fixed dollar authority at all.

---

## D. PROMOTION RULES (V2 evidence)

Promotion N → N+1 happens only while flat and only when all of the following stored facts are true:

1. HWM state STABILIZED for tier N+1 (section F).
2. Realized: balance ≥ threshold(N+1) at every UTC daily close for the confirmation window: 5 consecutive closes for tiers 0–6, 10 for tiers 7–10, 20 for tiers ≥ 11; no open position at those closes.
3. Sample at tier N: at least the table's trades AND days. Statistical note: 10 trades cannot distinguish skill from noise (a 0.2 R edge has a standard error of about 0.3 R at n = 10); 30 trades is the minimum at which a positive mean R is meaningfully separable from zero, 50–100 for large tiers. Tiers 0–1 keep 20 trades because no lot change results from their promotion.
4. Expectancy over the sample: net R > 0; mean R ≥ +0.15 with n ≥ 30 (≥ +0.10 for tiers 0–1); profit factor ≥ 1.2; longest losing streak across days ≤ 4.
5. Drawdown over the sample ≤ the tier's scaling-freeze DD; governor NORMAL now.
6. Breaker: no trip in the last 5 trading days; streak 0.
7. Execution: median slippage ≤ 0.10 USD, 95th percentile ≤ 0.30 USD; skips for ENTRY_DRIFT + SPREAD_TOO_WIDE ≤ 10 % of signals.
8. Runtime: no FEED_STALLED, no CANDLE_READ_FAILED streak ≥ 3, no watcher crash, no reconcile anomaly in 7 days.
9. Margin: the new tier's lot ceiling would still satisfy the margin cap and reserve at current equity and price.
10. Profit lock recorded where required.
11. Review gate recorded where required (tiers 8, 10, 11+).

Promotion changes riskPct and lotCeiling only. Nothing about signals changes. No discretionary promotion exists.

---

## E. DEMOTION RULES (V2, immediate)

| Trigger | Action, effective next sizing |
|---|---|
| balance < threshold(N) − 10 % of the tier range | demote to N−1 |
| drawdown ≥ CAUTION threshold | risk × 0.5, promotion frozen |
| drawdown ≥ DEFENSIVE threshold | risk × 0.25, demote one tier |
| drawdown ≥ PRESERVATION threshold | no new entries |
| consecutive losses = 1 | risk × 0.5 next trade; post_loss_cap = previous lot |
| consecutive losses = 2 | existing breaker (no trade until UTC day roll); after the roll risk × 0.5 until 2 consecutive completed wins |
| last 10 completed trades net R < −3 R | risk × 0.5 for the next 10 trades; promotion frozen |
| margin cap or reserve fails at lot_min | NO TRADE until margin facts change (including gold-price-driven margin rises) |
| slippage 95th pct > 0.5 USD or spread skips > 25 % over 10 signals | promotion frozen; lot ceiling × 0.5 |
| FEED_STALLED, watcher crash, reconcile anomaly | promotion frozen 7 days |

**Proof LOSS → SAME OR LOWER RISK, and → SAME OR LOWER LOT.** After a loss: balance falls so eligible_equity (a min including balance) is non-increasing; drawdown rises so m_gov is non-increasing; streak rises so m_streak is non-increasing; tier can only demote so riskPct and lotCeiling are non-increasing. permitted_risk is a product of non-increasing factors, hence non-increasing. Because the next stop could be smaller, post_loss_cap additionally enforces lot(n+1) ≤ lot(n). Both invariants hold by construction and are property-tested (section L).

---

## F. HIGH-WATER-MARK RULES

HWM_equity = highest equity at a UTC daily close while flat; HWM_balance = highest realized balance. Neither resets downward.

| State | Deterministic definition | Exit |
|---|---|---|
| BELOW | HWM_balance < T | balance ≥ T observed → REACHED |
| REACHED | balance ≥ T at least once (floating never counts) | confirmation-window daily closes ≥ T while flat → CONFIRMED; any close < T → BELOW |
| CONFIRMED | window held; B_conf(T) = T recorded | promotion evidence D.3–D.9 satisfied → STABILIZED; balance < floor(T) → BELOW |
| STABILIZED | evidence present; awaiting profit lock / review gate | lock and gate recorded (or not required) → PROMOTED; drawdown ≥ CAUTION → CONFIRMED |
| PROMOTED | tier N+1 parameters active for the next flat sizing | demotion rules apply at any time |

Sizing uses min(balance, equity, confirmed base + realized gain), so a spike can never size a trade; it must survive the window and the sample first.

---

## G. DRAWDOWN GOVERNOR (V2, tier-scaled, risk permission only)

Thresholds are expressed as drawdown from HWM_equity and scale with the tier's max risk so that CAUTION ≈ 1.5–2 losses, DEFENSIVE ≈ 2.5–3 losses, PRESERVATION ≈ 4–5 losses at full risk:

| Tiers | CAUTION | DEFENSIVE | CAPITAL_PRESERVATION |
|---|---|---|---|
| 0–2 (risk 4–5 %) | 8 % | 12 % | 20 % |
| 3–6 (risk 1.5–3 %) | 6 % | 10 % | 15 % |
| 7–10 (risk 0.75–1.25 %) | 5 % | 8 % | 12 % |
| 11+ (risk ≤ 0.6 %) | 4 % | 6 % | 10 % |

| State | Permitted risk | Scaling | Lot | New entries | Recovery |
|---|---|---|---|---|---|
| NORMAL | tier × 1.0 | allowed (per D) | tier ceiling | permitted | — |
| CAUTION | × 0.5 | frozen | ≤ previous lot | permitted | drawdown < CAUTION − 2 points for 3 daily closes AND 3 completed trades with net R ≥ 0 → NORMAL |
| DEFENSIVE | × 0.25 | frozen, demote one tier | lower tier ceiling; if formula < lot_min → NO TRADE | permitted only if sized lot ≥ lot_min | drawdown < DEFENSIVE − 2 points for 5 daily closes AND 5 completed trades with net R ≥ 0 → CAUTION |
| CAPITAL_PRESERVATION | 0 | frozen | none | NOT permitted | drawdown < PRESERVATION − 3 points AND a dated user acknowledgement record → DEFENSIVE |

Consequence at SEED: with 5 % risk, a two-loss day (9.75 %) enters CAUTION; the next loss at half risk (2.5 %) reaches DEFENSIVE; PRESERVATION needs about four full-risk losses. The governor reads equity, HWM, streak and outcomes only; it never reads or writes market fields.

---

## H. SMALL-ACCOUNT 62.07 USD SURVIVAL POLICY (V2)

1. Both tests at 0.01: risk test → structural stop + 0.60 USD cost ≤ 3.10 USD (5 % of eligible equity); margin test → 21.47 USD ≤ 40 % of equity (true up to a gold price of ≈ 4,965; above that 0.01 is unaffordable by margin alone), free margin after the position ≥ 55 % of equity, margin level at the stop ≥ 200 %.
2. Any valid signal failing either test → VALID SIGNAL — NO TRADE — CAPITAL TOO SMALL FOR SAFE STRUCTURAL RISK (or MARGIN_CAP / FREE_MARGIN_RESERVE / STOP_OUT_RISK). The stop is never tightened. The signal is still logged and alerted exactly as breaker-blocked signals are today.
3. Applied to 2026-09-25: none of the seven observed candidates (stops 3.42–26.94 USD) would have been affordable at 5 %; two would have been affordable under the optional 7.5 % SEED EXCEPTION, and both lost.
4. Survival arithmetic accepted explicitly: this is a NO-TRADE-dominant regime by design. The path out is equity ≥ 92 USD (tight stops fit), ≥ 172 USD (median stops fit), or external funding; the policy is not weakened because the broker minimum is 0.01.
5. Promotion out of SEED (balance ≥ 100 confirmed, 20 trades AND 30 days, positive expectancy) does not change the lot; it only widens the affordable-stop set to 5 % × 100 − 0.60 = 4.40 USD.

---

## I. 6,000,000 USD MILESTONE POLICY AND PROOF OF ISOLATION

- The objective lives in a reporting-only module that reads balance, equity, HWM, tier, governor and completed-trade statistics, and outputs tier, milestone progress and scaling-eligibility status. It is forbidden (dependency test) from being imported by `src/engine/intraday/*`, `regime/structure/correction/models/risk/quality`, `mt5Policy`, `mt5Executor`, `protectionGuards`, `newsRisk/marketShock`, `watcher`.
- Present-state proof: a search of `src/`, `mt5/` and `docs/` finds no capital-target, milestone or objective term in any executable file (verified 2026-09-25); today's decision path has zero dependency on any target.
- Future-state proof (required test): the replay harness `validation/replay_audit_2026-09-25/replay.mjs` extended with the sizing layer must produce byte-identical BUY/SELL/WAIT decisions, skip reasons and lots with the objective set to 100,000, 1,000,000 and 6,000,000 on the same bars and the same account state. Only tier limits derived from actual account state may change outcomes, never the objective.
- The objective affects: progress reporting, milestones, capital planning, institutional-review gates. It affects nothing else. It is not a schedule; no pace, deadline or "behind target" quantity exists.

---

## J. LARGE-CAPITAL REVIEW GATES

| From tier | Gate | Scope |
|---|---|---|
| 8 (25,000 USD, lots ≥ 0.3) | BROKER EXPOSURE REVIEW | per-symbol/account exposure limits, margin tier changes, negative-balance terms |
| 10 (100,000 USD, ≈ 1.0 lot) | LIQUIDITY / SLIPPAGE REVIEW | measured fill quality, spread impact on RR 1.7, slippage allowance in the effective-RR recheck, order splitting |
| 11 (250,000 USD, > 1.0 lot) | REQUIRES INSTITUTIONAL-SCALE REVIEW | concentration, counterparty risk, withdrawal/profit-reserve policy, raising the absolute ceiling |
| 13 (1,000,000 USD, ≥ 5 lots) | REQUIRES INSTITUTIONAL-SCALE REVIEW (multi-venue) | multiple accounts/brokers, prime liquidity, regulatory/tax, independent risk sign-off, executability of a 5m strategy at size |
| 14–18 (2M–6M USD) | REQUIRES INSTITUTIONAL-SCALE REVIEW at every tier | all of the above plus per-venue caps and a decision whether growth continues in one strategy |

No gate can be satisfied by code; each needs a dated approval record referenced by the tier state.

---

## K. EXISTING CODE GAP ANALYSIS (`src/engine/mt5RealScaling.js`, `mt5CapitalPolicy.js`, executor hook) — unchanged

| Requirement | Status | Detail |
|---|---|---|
| Pure deterministic sizing, floor-to-step | ALREADY_SUPPORTED | `computeDynamicSizing`, `floorToStep` |
| Lot non-decreasing in equity (no martingale shape) | ALREADY_SUPPORTED | tested in `tests/mt5_real_scaling.test.js` |
| Broker min/max/step, margin, margin budget, margin level at max loss, margin-call buffer, stop-out | ALREADY_SUPPORTED | `checks` block; steps down; `SIZING_UNSAFE` |
| Absolute 1.0 lot ceiling, env can only tighten | ALREADY_SUPPORTED | keep 1.0 until institutional review |
| Executor hook re-running entry gates after sizing | ALREADY_SUPPORTED | `config.computeSizing` → `evaluateEntry` |
| Informational projection, USER_FIXED authority | ALREADY_SUPPORTED | `computeLotSizingPolicy` |
| **Structural-stop-distance sizing** | MISSING | fixed 25 USD price envelope instead of the signal's stop |
| **Risk % anchors** | UNSAFE/INCOMPLETE | baseline 50 % of equity at 100 USD, max 50 %, min 2 %: incompatible with the V2 table |
| Fixed +15 / −25 USD envelope | UNSAFE/INCOMPLETE | inherits the +30/−50 example; overrides structural geometry |
| Cost allowance in risk | MISSING | spread appears only in a minimum-distance check |
| Leverage 1:200 assumptions | INCOMPLETE | code takes leverage as input (good) but no test covers the 34.6 % margin footprint at SEED |
| Drawdown governor / HWM / confirmation / promotion / demotion / tiers | MISSING | continuous function of current equity; sizes up immediately |
| Loss-streak multiplier and post-loss lot cap | MISSING (breaker exists separately) | — |
| Free-margin reserve fraction | INCOMPLETE | checks margin ≤ free margin and 50 % budget only |
| Profit lock / reserve exclusion | MISSING | — |
| Objective isolation and determinism tests | MISSING | — |
| Switch of lot authority | NEEDS_USER_APPROVAL | executor `LOT_NOT_USER_APPROVED`, python `REQUIRED_EXACT_VOLUME`, `FORBIDDEN_ENV`; `LOT_AUTHORITY.APPROVED_SCALING` unused |

Conclusion: a sound margin/stop-out safety core with the right monotone shape, but not the V2 architecture. Do not enable as-is.

---

## L. REQUIRED TESTS BEFORE ANY FUTURE ENABLEMENT

1. Monotonicity property tests: after any loss, permitted_risk(n+1) ≤ permitted_risk(n) and lot(n+1) ≤ lot(n), randomized stops/equities/tiers/governor states.
2. Determinism and objective isolation: identical inputs → identical outputs; objective 100k / 1M / 6M → byte-identical decisions on the replay harness and fixture sessions; dependency test on imports.
3. Broker-minimum refusal: floor(required_lot) < 0.01 → NO_TRADE, never 0.01.
4. Structural stop as input: lot varies inversely with stop; the broker stop equals the engine stop; cost allowance included.
5. Both-tests rule: a case passing risk but failing margin, and a case passing margin but failing risk, each → NO_TRADE with the correct reason; margin footprint at 1:200 and gold-price-driven margin growth covered.
6. HWM state machine transitions, including regression; floating profit never advances a state.
7. Governor thresholds per tier band, hysteresis, PRESERVATION blocks entries, no market fields read.
8. Promotion requires all 11 conditions; sample-size minimums enforced.
9. Demotion immediacy on balance floor, drawdown, streak, performance, margin, execution, runtime triggers.
10. Ceilings: tier and absolute caps cannot be exceeded; env can only tighten.
11. Monetary envelope replacement: no fixed dollar profit target; backstops derived from permitted risk; `evaluateExit` keyed to the sized trade.
12. Executor integration: sizing after every existing gate; `LOT_NOT_USER_APPROVED` remains until an explicit approval token switches authority; python exact-volume rule changes only under the same token.
13. Replay acceptance: ≥ 20 recorded sessions; the sized path never trades what the unsized path rejected; every candidate whose risk exceeds the budget → NO_TRADE.
14. SEED acceptance: at 62.07 USD only candidates with stop + 0.60 ≤ 3.10 USD are affordable; the optional 7.5 % exception, if approved, allows stop + 0.60 ≤ 4.66 USD and nothing else.

---

CURRENT_USER_FIXED_0_01_CHANGED = NO
PRODUCTION_CODE_CHANGED = NO
AUTO_SCALING_ENABLED = NO
LIVE_ENGINE_RESTARTED = NO
TRADE_PLACED = NO

RISK_ARCHITECTURE_READY_FOR_USER_REVIEW = YES

Requires USER APPROVAL before any implementation:
1. SEED max risk 5 % and its stated consequence (near-zero affordable signals at 62.07 USD), or the optional 7.5 % SEED EXCEPTION with its ruin arithmetic, or external funding to the 175–300 USD range.
2. Replacing the +30 / −50 USD envelope with the structural-risk-derived layers of section O (no fixed dollar profit target; catastrophic backstop = min(1.5 × structural, 2 × permitted risk)).
3. The tier table numbers (risk %, lot ceilings, margin caps, reserves, samples, profit locks).
4. Governor thresholds (8/12/20 % down to 4/6/10 %) and recovery rules.
5. Promotion evidence (30-trade minimum before any lot increase, confirmation windows 5/10/20 closes).
6. Switching lot authority from USER_FIXED to APPROVED_SCALING under one approval token (executor and python bridge together).
7. Profit-lock handling (withdrawal vs sub-account).
8. Recording leverage 1:200 and the 21.47 USD margin for 0.01 as fixed facts, with a margin-driven NO TRADE when gold makes 0.01 exceed the margin cap.
9. Keeping the 1.0 lot absolute ceiling until an institutional-scale review is recorded.
