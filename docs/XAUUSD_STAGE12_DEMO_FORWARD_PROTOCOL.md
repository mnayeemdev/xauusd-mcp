# XAUUSD_STAGE12_DEMO_FORWARD_PROTOCOL — frozen before the first forward DEMO outcome (2026-09-26)

Stage 12A–C collects prospective evidence of the UNCHANGED production strategy executing on the approved DEMO account (480236873 / Exness-MT5Trial11, XAUUSDm, lot exactly 0.01). It is not an optimisation, not a strategy redesign and not permission to trade more. The REAL account (its lot, breaker, News Protection V2, scaling OFF) is untouched. Nothing in this protocol can flip EDGE_DEMONSTRATED to YES; the best attainable Stage 12 status is ELIGIBLE_FOR_INDEPENDENT_VALIDATION, which only opens the separate Stage 12 Master Prompt 2 evaluation (12D–12F).

## 1. What is measured

Signal generation, execution reliability (order lifecycle, fills, slippage, retcodes, reconciliation), adaptive trade management, News Protection V2 interaction, safety controls, realized trade outcomes, blocked-signal outcomes, restart/recovery — all forward-only, timestamped at decision time, labelled after pre-declared horizons.

## 2. Evidence contract (schema `demo-forward-1.0`, `src/demo/evidence.js`)

Provenance vocabulary: FORWARD_LIVE_DEMO (created by the live validator ≤ 15 min after the engine decision time, validator-enforced), BACKFILL, HISTORICAL_REPLAY, TEST. **Only FORWARD_LIVE_DEMO counts.** Records: SIGNAL (decision-time record of every genuine production BUY/SELL, executed or blocked, with regime/bias/context, geometry, spread/feed, News V2 state and tier, shock state, breaker state, account_class DEMO, expected identity, lot 0.01, execution eligibility/status and block reason; future fields are rejected by the validator), EXECUTION (mirrored executor audit rows: INTENT, OPENED, SKIPPED, STOPS_REALIGNED, THESIS_*, CLOSE_TRIGGERED, CLOSED, EMERGENCY_*, ANOMALY, INTENT_RESOLVED, with broker retcode/deal/order/ticket, requested vs fill price, live bid/ask, spread, drift, broker SL/TP, realized net/gross P&L, commission, swap, MFE/MAE, exit reason), OUTCOME (per signal and horizon h12 = 1 h, h24 = 2 h, h48 = 4 h in 5m bars from the engine entry: side-signed move, MFE, MAE, mark-to-market R, TP1-vs-SL first-touch geometry within 48 bars; written only after the horizon elapsed, INCOMPLETE_PATH when bars are missing, never forward-filled). Unavailable metrics are stored as null, never fabricated.

## 3. Pre-declared gates (`src/demo/report.js` STAGE12_GATES)

| Requirement | Value / methodology |
|---|---|
| minimum completed forward DEMO trades | 60 |
| minimum independent trading sessions (UTC days with ≥ 1 signal) | 40 |
| minimum elapsed calendar period | 90 days |
| minimum model coverage | ≥ 2 model families with completed trades (report by model; a family with < 10 trades is descriptive only) |
| expectancy metric | mean R per completed trade, R = realized net P&L / initial broker risk (|entry − structural stop| × 100 × 0.01); bootstrap 95 % CI (2,000 resamples) lower bound > 0 |
| profit factor | ≥ 1.15 on realized net P&L |
| drawdown | PREDECLARED_REVIEW_REQUIRED: the observed maximum drawdown (USD and R) is reported; no pass/fail number is set until ≥ 60 trades exist, then the owner sets it in Master Prompt 2 before looking at the outcome |
| outlier / top-winner dependence | mean R without the top 5 winners > 0 |
| cost sensitivity | expectancy recomputed with an additional 0.40 USD round-trip cost and 0.10 USD slippage must stay > 0 (reported; part of the pass) |
| BUY/SELL stability | both sides non-negative expectancy, or the negative side < 25 % of trades |
| monthly stability | ≥ 60 % of months with ≥ 10 trades positive, ≥ 3 such months |
| model-family stability | no family with ≥ 15 trades and expectancy < −0.3 R |
| execution reliability | fill-failure share ≤ 5 % of order attempts, median entry slippage ≤ 0.30 USD (methodology: |fill − requested| on OPENED records; PREDECLARED_REVIEW_REQUIRED for a tighter number until 30 fills exist), 0 unreconciled events (ANOMALY), 0 duplicate order attempts |
| missing data | ≤ 10 % of forward signals without decision-time context; ≤ 10 % of outcomes INCOMPLETE |
| News V2 evidence | at least one Tier B (CPI/NFP) and one Tier A (FOMC) window observed with the executor blocking as designed and no execution inside a block |
| restart / recovery | every validator restart reconciled from broker truth without an ANOMALY record; a PENDING intent with unreadable history halts the executor |

Statuses (`STAGE12_STATUSES`): COLLECTING (< 20 completed trades), INSUFFICIENT_FORWARD_EVIDENCE (≥ 20 but below the minimums), EXECUTION_RELIABILITY_ISSUE (reliability thresholds violated: takes precedence), PROMISING_UNPROVEN (minimums met, positive mean R, CI includes zero), FAILED_FORWARD_GATE (minimums met and negative or CI upper bound ≤ 0), ELIGIBLE_FOR_INDEPENDENT_VALIDATION (all gates met). No automatic PRODUCTION_APPROVED / EDGE_DEMONSTRATED_YES / CAPITAL_SCALING_APPROVED state exists.

## 4. Non-negotiables during collection

No threshold or rule change because of early results; no cherry-picking; no manual DEMO trade; the first DEMO trade must come from a NEW genuine live signal after activation; lot exactly 0.01 regardless of the DEMO balance; scaling OFF; the same consecutive-loss breaker (2), monetary envelope (+30 / −50 USD), minimum effective RR 1.7, thesis exit, News Protection V2 (Tier B T+60, Tier A cluster, DATA_UNAVAILABLE BLOCK, normalisation extension OFF/shadow) and shock/spread/feed guards as REAL. If a DEMO breaker stops entries, subsequent valid signals are recorded as blocked (CONSECUTIVE_LOSS_LIMIT) and labelled, never executed for data.

## 5. Relation to Stage 11C

Stage 11C keeps running independently (read-only shadow observer, its own store). Stage 12 never writes to the shadow store; reports may correlate the two by signal_id / timestamps later. Neither system has any path to the REAL account.

## 6. Capital

EDGE_DEMONSTRATED = NO and CAPITAL_SCALING_READY = NO throughout Stage 12A–C. The owner destinations (USD 6 M, then 600 M) have zero authority over any number above.
