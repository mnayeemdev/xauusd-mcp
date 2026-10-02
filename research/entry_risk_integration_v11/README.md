# V11 — ENTRY + RISK INTEGRATION (research / validation only)

RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED.
- **Unchanged:** REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · PRODUCTION_CHANGED NO.
- **Settings:** RR 1.70 · CAPITAL_HARVEST OFF · AUTO_SCALING OFF · MARTINGALE OFF · AVERAGING_DOWN OFF.

## Outcome
**INTEGRATION_STATUS = INTEGRATION_PARTIALLY_VALIDATED**, with the corrected fault harness.
- **Pre-registered harness:** it computed INTEGRATION_FAILED. Its leverage-1 margin injection did not create insufficient margin on two wide-SL entries, and the pipeline accepted them correctly (see `CORRECTION_LOG.md`).
- **Validated:** every integration mechanic.
- **Open:** RISK_PERCENTAGE = UNRESOLVED (V10), and the entry expectancy is negative (DEV −0.077 R, HOLD −0.022 R).
- **Where to read more:** `reports/V11_INTEGRATION_AUDIT.md`.

## Layout
| Path | Content |
|---|---|
| `V11_PREREGISTRATION.md` (+ `.sha256`) | pipeline, record taxonomy, metrics, decision states; frozen before any outcome |
| `CORRECTION_LOG.md` | C1: fault-harness correction (margin injection), both results kept |
| `scripts/integrate.mjs` | pure integration layer. Frozen entry record (deep-frozen and hashed) → geometry check → fail-safe prechecks → V10 risk library (unchanged) → independent risk recomputation (tick-value path) → broker validation → one record per entry |
| `scripts/v11_study.mjs` | `EDGE_PHASE=DEV` → integration on DEV + freeze. `EDGE_PHASE=FULL` → DEV + HOLDOUT grid (CURRENT and PCT 0.10–1.00 % × 1k / 5k / 10k × 3 costs), entry-only economics, V10 / V8 parity, entry-risk matrix files, replay, restart, duplicate delivery, fault injection (corrected and pre-registered harness), decision |
| `scripts/write_reports.mjs` | the 19 reports |
| `configs/` | `v11_freeze.json` (current), `v11_freeze_prereg_harness.json` and `v11_study_prereg_harness.mjs.txt` (the script as first frozen) |
| `results/` | `v11_dev.json`, `v11_results_FULL.json`, `v11_results_FULL_prereg_harness.json`, `entry_risk_matrix_{DEV,HOLD}.jsonl` (every valid entry × 15 configurations), console and test outputs |
| `forward_evidence/` | read-only snapshot of the live V8 forward-shadow evidence (22.5 h), rendered with `runner.mjs --report <dir>`; the runner was not touched |
| `reports/` | the 19 V11 reports |

## Reproduce
```
EDGE_PHASE=DEV  node research/entry_risk_integration_v11/scripts/v11_study.mjs   # writes v11_dev.json + a new freeze record
EDGE_PHASE=FULL node research/entry_risk_integration_v11/scripts/v11_study.mjs   # verifies the freeze first
node research/entry_risk_integration_v11/scripts/write_reports.mjs
node --test tests/entry_risk_integration_v11.test.js
```

**Inputs** (same as V10):
- the V8 replay rows (gitignored; regenerable with the V8 scripts);
- the Edge Lab bars;
- the latest platform record in `state/xauusd_mt5_real_trade_log.jsonl`, read-only. It currently comes from the connected non-real demo account; only symbol, contract and currency fields are used.
