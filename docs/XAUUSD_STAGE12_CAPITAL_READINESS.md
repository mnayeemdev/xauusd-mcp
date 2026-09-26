# XAUUSD STAGE 12F — CAPITAL READINESS DECISION (frozen 2026-09-26, rule version `stage12-def-1.0`)

**Question:** even if an edge is supported, is there sufficient evidence to CONSIDER increasing capital exposure? This is a READ-ONLY readiness decision. It is not a lot-sizing activation stage. The strongest automated conclusion is `ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW`, which changes no lot.

## 1. Current capital policy (12F.3) — unchanged by any 12F result

REAL lot = exactly 0.01, USER_FIXED, AUTO_SCALING = OFF, no live sizing hook (`computeSizing` absent from the REAL config; test-enforced), bridge exact-volume guard untouched, dormant `mt5RealScaling.js` not wired. `CAPITAL_SCALING_READY` is never set by software.

## 2. Hard prerequisites (12F.1) — all required

STAGE12D_EVIDENCE_COMPLETE, STAGE12D_EDGE_SUPPORTED, STAGE12E_INDEPENDENT_VALIDATION_SUPPORTED, EXECUTION_RELIABILITY_OK, DRAWDOWN_KNOWN (≥ 60 trades), COST_STRESS_OK, WINNER_DEPENDENCE_OK, NO_UNRESOLVED_P0, STRATEGY_FINGERPRINT_UNCHANGED, REAL_CONFIG_KNOWN (lot 0.01, fixed_user_lot, no sizing hook), EVIDENCE_INTEGRITY_OK. A higher balance, a few wins, a transient PF > 1, the existence of the 12D/12F code or a positive point estimate can never satisfy them.

## 3. Readiness states (12F.5)

`NOT_READY_INSUFFICIENT_EVIDENCE` → `NOT_READY_EDGE_NOT_SUPPORTED` → `NOT_READY_INDEPENDENT_VALIDATION` → `NOT_READY_EXECUTION_RELIABILITY` → `NOT_READY_SAFETY_OR_FINGERPRINT` → `ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW`. No "AUTO_SCALE_READY" state exists.

## 4. Capital risk analysis (12F.2, read-only)

Observed R and USD distributions (mean, median, stdev, p10/p90, worst/best), observed drawdown (R/USD) and losing streak, seeded Monte Carlo (seed 12061926, 2000 i.i.d. resampled paths of the observed results: drawdown p50/p90/p95/p99, losing-streak percentiles, final-equity percentiles, probability of a negative path), tail losses (worst 5, CVaR 10 %), execution cost sensitivity (the frozen cost scenarios), margin at the fixed lot from the last recorded account snapshot (`assessRealLot`: margin required, % of equity, margin level at max loss, equity at max loss), risk concentration (top model / session bucket / month share of net), gap/slippage risk (max and p95 entry slippage), extended losing sequences. Assumptions are printed with every result; nothing forecasts the future or authorises exposure.

## 5. Future capital ladder (12F.4) — PROPOSAL_ONLY

Illustrative fixed-lot tiers under one frozen rule: the maximum loss per trade (−50 USD at lot 0.01, scaled by lot) may not exceed 5 % of equity ⇒ 0.01 ≥ 1 000 USD, 0.02 ≥ 2 000, 0.03 ≥ 3 000, 0.05 ≥ 5 000, 0.10 ≥ 10 000. Every tier is labelled `PROPOSAL_ONLY`, `NOT_EXECUTION_AUTHORITY`, `OWNER_APPROVAL_REQUIRED`. The system never progresses a tier. Even after `ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW` the production lot remains 0.01 until a separate explicit owner-approved change is implemented, tested and re-frozen.

## 6. Current result (2026-09-26)

`STAGE12F_STATUS = CAPITAL_SCALING_NOT_READY` (`NOT_READY_INSUFFICIENT_EVIDENCE`); 7 prerequisites missing; CAPITAL_SCALING_READY = NO; OWNER_CAPITAL_REVIEW_ELIGIBLE = NO; current equity ≈ 62 USD qualifies for no tier above 0.01 under the proposal rule (and 0.01 itself only by owner decision, as today).
