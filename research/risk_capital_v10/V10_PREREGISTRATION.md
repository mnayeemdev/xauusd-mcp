# V10 — RISK + CAPITAL CONTROL — PRE-REGISTRATION (frozen 2026-10-01, before any V10 outcome is computed)

Research and validation only. EXECUTION_AUTHORITY = NONE, PRODUCTION_CHANGED = NO, AUTO_SCALING = OFF, CAPITAL_HARVEST = OFF. Dynamic position sizing is RESEARCH_ONLY.

## 1. Fixed inputs (identical for every model)
- **Entries:** V8 corrected-core signals (`research/core_pattern_audit_v8/results/rows/ALL_{DEV,HOLD}.jsonl`) with the structural SL and the RR 1.70 baseline exit, as in V9:
  - fixed 1.70 R target;
  - broker fail-safe at 1.5 R + spread, intrabar;
  - thesis invalidation on a confirmed close;
  - 288-bar horizon;
  - one position at a time with `canReenter`.
- **Broker specification** (read by the production MT5 bridge, `state/xauusd_mt5_real_trade_log.jsonl`, XAUUSDm):
  - contract 100 oz;
  - volume min 0.01, step 0.01, max 200;
  - point 0.001, so tick value = 0.1 USD per point per lot;
  - stops level 0, freeze level 0;
  - leverage 1:200, margin currency XAU, margin = lots × 100 × price / 200;
  - margin-call level 60 %;
  - spread 240 points;
  - swap long −560 points (0.56 USD per oz per night).
- **Costs per oz:**
  - NORMAL spread 0.24 + slippage 0.10;
  - MODERATE 0.40 + 0.30;
  - SEVERE 0.60 + 0.60, plus a gap: every 10th stop-out (broker SL or thesis invalidation) in time order fills a further 0.5 × structural distance worse.
- **Account scenarios:** 100, 250, 500, 1,000, 5,000 and 10,000 USD starting equity.

## 2. Models compared (identical signals, stops and exits; only sizing / control differs)
- **CURRENT:** the production rule.
  - lot fixed at 0.01;
  - fixed −50 USD maximum loss;
  - margin veto (`assessRealLot`): margin ≤ 50 % of equity, equity after the fixed loss > 0, margin level at the fixed loss ≥ 60 %.
- **PCT(r):** percentage-of-equity sizing.
  - Authoritative equity = account equity at the decision. With one position at most and no open position at a new entry, equity equals closed-trade balance.
  - Maximum cash risk = equity × r.
  - Worst-case loss per lot = (1.5 × |entry − SL| + spread + slippage allowance) × 100, where the slippage allowance is the NORMAL slippage.
  - Lots = ⌊cash risk / loss per lot / 0.01⌋ × 0.01, rounded DOWN and capped at the maximum volume.
  - Lots < 0.01 → REJECT (RISK_BELOW_MIN_LOT). The lot is never rounded up.
  - Actual risk = lots × loss per lot ≤ cash risk (asserted).
  - Margin control: margin ≤ cap % of equity, and the margin level after the worst-case loss ≥ 60 % + 40-point buffer.
  - r ∈ {0.10, 0.25, 0.50, 0.75, 1.00} %.

## 3. Controls (researched one at a time, smallest effective structure preferred)
- **Daily loss limit:** none, 1 %, 2 % or 3 % of the equity at the start of the UTC day. Once realized daily loss ≥ the limit, or the next trade's planned risk would exceed the remaining daily capacity, there are no new trades until the next UTC day.
- **Consecutive-loss pause:** none; after 3 losses until the next UTC day; after 5 losses until the next UTC day.
- **Weekly protection (HALTED state):** none, or a 5 % loss from the week-start equity, which halts until the next ISO week.
- **Margin cap:** 10 %, 25 % or 50 % of equity.
- **Exposure:** MAX_SIMULTANEOUS_TRADES = 1. With no open position the remaining per-trade capacity is the full per-trade budget, capped by the remaining daily capacity.
- **Prohibited:** risk after a loss is never increased (no martingale, recovery sizing or averaging down), and size never grows from recent profit (equity-proportional only, AUTO_SCALING stays OFF).

## 4. Pre-registered selection (DEV only) → freeze → HOLDOUT once
- **Stage 1, risk % (no daily, pause or weekly control; margin cap 50 %, the production value).** A risk % is SUPPORTED on DEV for an account size only if all of:
  - (a) actual planned risk never exceeds the approved risk;
  - (b) historical max drawdown ≤ 15 % (NORMAL cost);
  - (c) SEVERE-cost max drawdown ≤ 25 %;
  - (d) Monte Carlo P(drawdown ≥ 20 % within one year) ≤ 5 %;
  - (e) the drawdown after 20 consecutive full losses ≤ 20 %;
  - (f) ≥ 90 % of the trades the CURRENT walk would take are sizeable (lots ≥ 0.01). This applies to accounts ≥ 1,000 USD; below that, the eligibility is reported.
  - SUPPORTED_RISK_PERCENTAGE = the largest r meeting all of (a)–(f) for every account ≥ 1,000 USD.
- **Stage 2, controls at that r.** Each control alone versus none. A control is SUPPORTED only if it reduces the DEV max drawdown by ≥ 10 % relative AND the trades it blocks do not have a better mean R than the trades taken by more than 0.05 R. Otherwise it is REJECTED as unnecessary.
- **Stage 3, margin cap.** The smallest cap that rejects ≤ 1 % of otherwise-eligible trades at the supported r for accounts ≥ 1,000 USD.
- Selections go to `configs/selection.json` and are hashed. HOLDOUT is replayed once with the frozen selection.

## 5. Monte Carlo risk-of-ruin proxy (labelled assumptions)
- Trades are i.i.d. resamples of the DEV realized R-multiples of the trades taken (NORMAL cost).
- Fixed fraction r, no controls, one year = the DEV trades scaled to 252 sessions, 2,000 paths, seed 20261001.
- Reported: P(drawdown ≥ 10 / 20 / 30 / 50 %) and the median drawdown.
- This is a stationarity-dependent proxy, not a forecast. Ruin to zero is impossible under fixed-fraction sizing with a minimum-lot rejection; the proxy therefore uses drawdown thresholds.

## 6. Decision
**RISK_MODEL = DEMONSTRATED** only if all of:
- (i) every mechanical test passes: sizing, rounding down, actual-risk recalculation, margin, daily limit, pause, single exposure, gap stress, restart determinism, duplicate prevention, broker rejection, missing SL, excess-risk fail-safe;
- (ii) a SUPPORTED risk % exists on DEV, and on HOLDOUT it still meets (a)–(e);
- (iii) PCT never exceeds its approved risk on any trade in any scenario;
- (iv) chronological replay is deterministic, and restart from serialized state equals an uninterrupted run.

Otherwise **RISK_MODEL = INCONCLUSIVE** and no risk percentage is proposed.

A demonstrated risk model controls capital loss. It does not create an edge, and the entry stream's expectancy stays whatever it is.
