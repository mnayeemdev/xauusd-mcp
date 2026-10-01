# V10_DEVELOPMENT_RESULTS

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Split
- **Period:** DEV 2025-05-07 → 2025-12-31.
- **Signals:** 4858 V8 corrected-core signals over 186 sessions.
- **Monte Carlo units:** 1133 trades, 1535 trades per year.

## Stage 1 (risk %)
| Risk % | Supported | MC P(DD ≥ 20 %) | Failed criteria by account (1k / 5k / 10k) |
|---|---|---|---|
| 0.10 % | no | 0.0 % | (f) / (f) / (f) |
| 0.25 % | no | 50.6 % | (d) (f) / (b) (c) (d) (f) / (b) (c) (d) |
| 0.50 % | no | 95.0 % | (b) (c) (d) (f) / (b) (c) (d) / (b) (c) (d) |
| 0.75 % | no | 99.3 % | (b) (c) (d) (f) / (b) (c) (d) / (b) (c) (d) |
| 1.00 % | no | 100.0 % | (b) (c) (d) (f) / (b) (c) (d) / (b) (c) (d) |

## Stage 2 (controls) and stage 3 (margin cap)
- **Not executed:** both are defined AT the supported risk %, and there is none.
- **Descriptive equivalents:** V10_DAILY_LOSS_CONTROL, V10_CONSECUTIVE_LOSS_RESEARCH and V10_MARGIN_PROTECTION.

## Selection (frozen)
`configs/selection.json`:
- supported_risk_pcts = [];
- approved_risk_pct = null;
- supported_controls = [];
- margin_cap_pct = null.

## Freeze
- frozen_utc: 2026-10-01T13:45:42.325Z
- prereg_sha: 4a677f6e421ed033e41a761bc9263d8653304e22f72077b08523ad4efd0ae69e
- risk_sha: 2fc1806a1e14748e430e75e6eb0fa58ce6ebf79ad63f4262d9275c0366e49cd0
- selection_sha: c7dbe6eeb5ed0cd212a7535a341f03c947267bae58774eaff6e9f2aa0c265082
- Verified by the FULL run and by the test suite.
