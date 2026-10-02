# V17 — RISK GATE HARDENING · PRE-REGISTRATION

Written 2026-10-02, before any V17 HOLDOUT computation. RESEARCH ONLY.
- **Execution:** REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE.
- **Strategy:** the frozen V8 entry engine is unchanged; structural SL authority and RR 1.70 are unchanged.
- **Policies:** RISK_PERCENTAGE UNRESOLVED · DAILY_LOSS_POLICY UNRESOLVED · CAPITAL_HARVEST OFF.
- **Execution timing:** V16 is preserved (6 s tolerance with revalidation; quote integrity fails closed).

**What is already known from DEV (development split, 2025-05-07 → 2025-12-31)** and was looked at before writing this file:
- **In-session 5m bar continuity** (|open − previous close|, consecutive bars): p50 0.035, p99 0.116, p99.9 0.176, max 9.608 USD/oz.
- **Daily-break reopen gaps:** p50 1.53, p90 4.85, p99 9.02, max 15.75.
- **Weekend / holiday reopen gaps:** p50 4.06, p90 13.69, max 44.57.
- **Real account** (2 trades in the REAL log): entry slippage 0, commission 0, swap 0, fee 0.
- **Production has no maximum holding time**, so a position can be open over any market reopen.

**HOLDOUT** (2026-01-01 → 2026-09-29) gap magnitudes were reported once in V12. V17 derives no parameter from HOLDOUT: every V17 parameter below is either an existing rule or a mechanical DEV statistic.

## 1. Existing rules used (nothing new is invented)
| Item | Value | Source |
|---|---|---|
| RR | 1.70 | owner |
| hard broker stop | fill ∓ (1.5 × structural distance + spread) | production `LOSS_CONTROL.structuralMultiple` 1.5, `computeProtectiveStops`, V10 |
| structural stop | thesis invalidation on a confirmed 5m close beyond the V8 SL (exit at that close) | production / V9 simulator |
| slippage allowance in sizing | 0.10 USD/oz | production `CAPITAL_DEFAULTS.slippage`, V10 / V11 |
| commission | 0 per side | production `estimatedCommissionPerSideUsd` 0; the 2 real closes show 0 |
| maximum spread | 0.60 | production `maxSpreadUsd` |
| margin | required = lots × contract × price / leverage; ≤ 50 % of equity; margin level after the planned loss ≥ margin call + 40 points | V10 / V11, production `marginBudgetPct` 50 |
| exposure | MAX_SIMULTANEOUS_TRADES = 1; re-entry guard `canReenter` | production / V14 |
| breakers | 2 consecutive losses per day, 10 trades per day ceiling | production REAL_DEFAULTS |
| daily loss limit | none (production disabled it on 2026-09-25) | DAILY_LOSS_POLICY = UNRESOLVED |
| research risk % | 0.10 / 0.25 / 0.50 / 1.00 | comparison scenarios only; no winner is selected |
| reference equity | 10,000 USD (demo baseline used since V11), plus 250 and 1,000 USD for the minimum-lot analysis | research |

## 2. Sizing pipeline (owner §4); every step can only reject
1. **Inputs:**
   - equity;
   - the research risk %, giving the maximum cash risk;
   - the execution price (BUY = ask, SELL = bid; in historical replay = bar close ± the scenario spread, labelled REPLAY, with no quote age claimed);
   - the structural SL (V8, never moved);
   - the broker data.
2. **Exposure per oz** = 1.5 × |engine entry − SL| + spread + 0.10 (+ commission per oz; 0).
3. **Size:** raw lots = cash risk ÷ (exposure per oz × contract size), rounded DOWN to the volume step. Never rounded up.
4. **Recalculate after rounding:** actual stop exposure = lots × exposure per oz × contract size. It must be ≤ the cash risk, otherwise RISK_REJECTED_INCONSISTENT.
5. **Rejections, in order:**

| Condition | Code |
|---|---|
| broker data missing or invalid (tick size, tick value, contract size, volume min / max / step, leverage, margin call, stops level, freeze level, spread) | RISK_REJECTED_BROKER_DATA |
| equity missing or ≤ 0 | RISK_REJECTED_EQUITY_UNAVAILABLE |
| SL missing, or on the wrong side | RISK_REJECTED_SL_INVALID |
| risk inputs not finite | RISK_REJECTED_INVALID_RISK |
| quote invalid or stale (V16 timing) | RISK_REJECTED_QUOTE |
| a position is already open | RISK_REJECTED_EXPOSURE |
| signal already decided | RISK_REJECTED_DUPLICATE |
| existing breakers | WAIT_SAFETY_BREAKER |
| rounded lots < volume_min (the minimum lot would exceed the risk) | RISK_REJECTED_MINIMUM_LOT |
| rounded lots > volume_max (no silent capping) | RISK_REJECTED_BROKER_LIMIT |
| lots not on the step grid | RISK_REJECTED_INVALID_SIZE |
| hard-stop distance below the broker stops level | RISK_REJECTED_STOPS_LEVEL |
| margin above the cap, or margin level after the loss too low | MARGIN_REJECTED |

6. **PRIMARY** (risk % UNRESOLVED): every valid entry ends as VALID_ENTRY + RISK_REJECTED (RISK_PERCENTAGE_UNRESOLVED).
7. **Risk firewall:** the entry is hashed before and after; any change throws.

## 3. Realized-risk model (per closed hypothetical trade; nothing executed)
Every component is recorded separately:

| Component | Definition |
|---|---|
| STOP_LOSS_LOSS | price loss from the fill to the exit level (the broker level for a hard-stop exit; the close for thesis invalidation or horizon), spread included; no slippage, no gap |
| COMMISSION | 2 × commission per side (0) |
| SWAP | one charge per broker rollover crossed (00:00 broker time = UTC, per the V15 calibration). Saturday / Sunday rollovers are not charged; the rollover on `swap_rollover3days` counts 3. Rates are `swap_long` / `swap_short` × point from the live broker spec (sign kept: a credit reduces the loss) |
| SLIPPAGE | the scenario slippage at the exit |
| GAP_IMPACT | at a hard-stop exit whose bar opened beyond the broker level: the distance from the level to the open (V12 `gapThroughOz`) |

- **TOTAL_REALIZED_LOSS** = the sum of the components. **RISK_MULTIPLIER** = total ÷ planned (actual stop exposure).
- **Exceedance class** (sequential attribution against the planned amount; the first component that pushes the cumulative loss above planned):
  - WITHIN_RISK, BROKER_ROUNDING_EXCEEDANCE, COST_EXCEEDANCE, SWAP_EXCEEDANCE, SLIPPAGE_EXCEEDANCE (only the part beyond the 0.10 allowance), GAP_EXCEEDANCE, OTHER.
  - BROKER_ROUNDING_EXCEEDANCE is impossible by construction (rounding down), and this is asserted.
- **Swap categories:** INTRADAY (no rollover), OVERNIGHT (≥ 1 rollover, no triple), TRIPLE_ROLLOVER.

## 4. Cost scenarios (risk integrity only; nothing is optimized)
| Scenario | Spread | Exit slippage | Source |
|---|---|---|---|
| NORMAL | 0.24 | 0.10 | V5 / V9 / V10 normal, production defaults |
| MODERATE | 0.60 | 0.30 | production maximum spread; the V12 moderate slippage level |
| SEVERE | 0.60 | the DEV maximum in-session 5m discontinuity (frozen from DEV) | DEV evidence; applied to every exit as an upper-bound stress |

**Gap impact** is the actual data gap-through in every scenario. No gap multiplier is invented.

## 5. Gap analysis
- **(a) Reopen-gap distributions** by type: DAILY_BREAK (bar gap 30 min – 24 h) and CLOSURE (> 24 h). Normal = p50, moderate = p90, severe = p99, plus the historical maximum. DEV is frozen; HOLDOUT is reported out-of-sample.
- **(b) Realized gap-through events** in the chronological replay.
- **(c) Exposure counterfactual:**
  - for every replay position open over a reopen, impact = max(0, g − distance from the pre-reopen close to the broker level);
  - g is taken at each reopen scenario level.
- **(d) Pre-trade condition candidate GC1** ("a scheduled closure is reachable within the 288-bar simulator horizon → reject"):
  - it is evaluated **informationally only**;
  - production has no maximum holding time, so the 288-bar horizon is not an existing guarantee, and GC1 cannot bound real exposure without a new exit rule (forbidden);
  - daily-break gaps are not addressed by it.
- **GAP_RISK = BOUNDED** only if no gap exceedance exists in DEV and HOLDOUT. Otherwise GAP_RISK = UNRESOLVED, with the tail reported separately. It is never converted into a percentage.

## 6. Risk envelope (owner §15)
- **ENVELOPE per oz** = planned exposure (1.5 R + spread + 0.10 allowance) + commission + known maximum swap within the horizon (calendar nights possible × the adverse swap rate, triple-aware).
- **The research gate sizes on the ENVELOPE.** The PLANNED-only basis is also reported, for comparison with V10.
- **Measured:** the share of losing trades whose total realized loss stays within the envelope, excluding gap; the gap tail is reported separately.

## 7. Data and procedure
- **Inputs:**
  - V8 corrected-core replay rows (DEV, HOLDOUT);
  - Edge Lab XAUUSDm 5m bars;
  - the V9 simulator (BASELINE policy: 1.70 R target, hard broker stop, thesis invalidation, 288-bar horizon), unchanged.
- **Chronological walk:** one position at a time, the existing re-entry guard, production breakers and equity updating.
- **Grid:** 4 risk % × 3 cost scenarios × 2 bases (PLANNED, ENVELOPE) at 10,000 USD. Minimum-lot shares at 250 and 1,000 USD.
- **Order:** DEV first, then `configs/v17_freeze.json` (hash recorded: severe slippage, gap percentiles, swap rates, rollover rule), then HOLDOUT once.
- **Broker data:** a fresh read-only capture (`symbol_info`, `account_info` without identity, `symbol_info_tick`, and the MT5 calculation functions `order_calc_margin` / `order_calc_profit`, which send no request). It is compared with the REAL bridge record.

## 8. Decision
- **RISK_GATE_FAILED** — any one of the following:
  - risk modified an entry;
  - an SL moved;
  - RR ≠ 1.70;
  - an accepted trade's post-rounding exposure exceeded the approved cash risk;
  - lots were rounded up;
  - a minimum-lot / maximum-lot / step / margin / broker-data / quote violation was accepted;
  - a replay mismatch;
  - lookahead;
  - a strategy-rule change;
  - an order.
- **RISK_GATE_VALIDATED** — all of the following:
  - the 16 owner success criteria are shown by the tests, DEV and HOLDOUT;
  - the live read-only broker data validates (required fields present; margin and tick value agree with MT5's own calculation; consistent with the REAL record);
  - the realized-risk components are measured on both splits.
- **RISK_GATE_PARTIALLY_VALIDATED:** the gate logic passes but broker validation or a measurement is incomplete.
- **RISK_GATE_INCONCLUSIVE:** a criterion cannot be established.
- **Separate statuses:** GAP_RISK, SLIPPAGE_RISK (no stop-fill evidence) and RISK_PERCENTAGE are reported as their own statuses. UNRESOLVED there does not change the gate status: the gate's job is to expose them, never to hide them.
