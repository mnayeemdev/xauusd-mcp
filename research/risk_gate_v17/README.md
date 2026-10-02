# V17 — RISK GATE HARDENING (research only)

RESEARCH ONLY.
- **Execution:** REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE.
- **Strategy:** the frozen V8 entry engine is unchanged, as are the structural SL and RR 1.70.
- **Policies:** RISK_PERCENTAGE UNRESOLVED · DAILY_LOSS_POLICY UNRESOLVED · CAPITAL_HARVEST OFF.

## Outcome
See `reports/V17_FINAL_DECISION.md`.
- **The gate:** sizing is deterministic and only rounds down; the actual exposure is recalculated after rounding; the owner's rejection codes apply; the max lot is never capped silently; live broker data is validated; margin matches MT5's own calculation.
- **Realized risk** is split into stop loss, commission, swap, slippage and gap.
- **Risk can only reject** and never touches the entry.
- **Reported separately:**
  - **GAP_RISK UNRESOLVED:** weekend reopen gaps pass through the hard stop; worst HOLDOUT case 6.6× planned. Production has no maximum holding time.
  - **SLIPPAGE_RISK UNRESOLVED:** there is no stop-fill evidence.
  - **Swap:** measured and bounded by the envelope.

## Layout
| Path | Content |
|---|---|
| `V17_PREREGISTRATION.md` (+ `.sha256`) | rules, sizing pipeline, realized model, scenarios, decision (written before HOLDOUT) |
| `CORRECTION_LOG.md` | D1 envelope swap constant (no-lookahead), D2 report-level fixes, D3 conventions |
| `scripts/riskgate.mjs` | pure risk gate: broker-data validation, sizing, volume / margin / stops checks, decisions, realized decomposition, exceedance classes |
| `scripts/broker_spec_capture.py` | read-only MT5 broker specification capture (no identity, no trading call) |
| `scripts/v17_study.mjs` | DEV → freeze → FULL (DEV + HOLDOUT walks, minimum lot, swap, slippage, gap, envelope, replay, decision) |
| `scripts/write_reports.mjs` | the 20 reports |
| `configs/v17_freeze.json` (+ `.sha256`) | DEV-frozen parameters |
| `results/` | broker capture, study results, console, test outputs, lint, fingerprint |

## Reproduce
```
python research/risk_gate_v17/scripts/broker_spec_capture.py research/risk_gate_v17/results/broker_spec_live.json   # read-only
V17_PHASE=DEV  node research/risk_gate_v17/scripts/v17_study.mjs   # writes the freeze (only once, before HOLDOUT)
V17_PHASE=FULL node research/risk_gate_v17/scripts/v17_study.mjs
node research/risk_gate_v17/scripts/write_reports.mjs
node --test tests/risk_gate_v17.test.js
```
