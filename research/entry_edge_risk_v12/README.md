# V12 — ENTRY EDGE ISOLATION + REALIZED RISK HARDENING (research only)

RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED.
- **Unchanged:** REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · PRODUCTION_CHANGED NO.
- **Frozen inputs:** entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF.

## Outcome
- **ENTRY_EDGE_STATUS = EDGE_FAILURE_NOT_ISOLATED**: no deterministic failure identified, and the existing strategy has no demonstrated edge.
  - Gross edge ≈ 0 at every stage on both splits.
  - Net expectancy is negative by the execution cost.
  - 100 % of losing trades are valid losing trades.
  - No pre-entry correction candidate passed DEV.
- **RISK_STATUS = RISK_FAILED** (pre-registered).
  - Planned risk never exceeds approved.
  - With the envelope, realized loss exceeds approved on < 1 % of losing trades.
  - Market-reopen gaps (weekend / holiday up to 10.7 R, daily break up to 1.9 R on HOLD) exceed every DEV-derived buffer, so the magnitude criterion fails.
  - Swap is minor and fully buffered; slippage is bounded, but its buffer is not evidence-calibrated.
- **SUPPORTED_RISK_PERCENTAGE = UNRESOLVED.**
- **Where to read more:** `reports/V12_FINAL_FINDINGS.md`.

## Layout
| Path | Content |
|---|---|
| `V12_PREREGISTRATION.md` (+ `.sha256`) | design and decision rules, plus Amendment 1 (Part B, written after DEV and before HOLD) |
| `AMENDMENT_LOG.md` | D1 (SR trigger rule, DEV), A1 (envelope tiers, before HOLD), D2 (fail-closed fix, results byte-identical) |
| `scripts/isolation.mjs` | stage funnel, probe, rule-conformance attribution, timing features, day-block bootstrap |
| `scripts/envelope.mjs` | calendar nights, closure reachability, gap-through, swap history, envelope, realized-loss models |
| `scripts/v12_study.mjs` | `EDGE_PHASE=DEV` → Part A + B on DEV, candidates, buffers, freeze; `EDGE_PHASE=FULL` → DEV + HOLD once, risk replay, decisions |
| `scripts/write_reports.mjs` | the 21 reports |
| `configs/` | `v12_freeze.json` (current), pre-amendment and pre-fix freeze records |
| `results/` | DEV and FULL results, loss-attribution records, reference risk-walk records, console and test outputs |
| `reports/` | the 21 V12 reports |

## Reproduce
```
EDGE_PHASE=DEV  node research/entry_edge_risk_v12/scripts/v12_study.mjs
EDGE_PHASE=FULL node research/entry_edge_risk_v12/scripts/v12_study.mjs
node research/entry_edge_risk_v12/scripts/write_reports.mjs
node --test tests/entry_edge_risk_v12.test.js
```

Inputs are the same as V10 / V11. The broker record (`state/xauusd_mt5_real_trade_log.jsonl`) is used read-only, for the contract and the swap history.
