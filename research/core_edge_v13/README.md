# V13 — CORE EDGE RECONSTRUCTION (lean strategy audit, research only)

RESEARCH ONLY.
- **Unchanged:** REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · PRODUCTION_CHANGED NO.
- **Frozen inputs:** engine frozen (V8 corrected core, 5 strategies) · structural SL unchanged · RR 1.70.
- **Settings:** CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED.

## Outcome
**EDGE_STATUS = EDGE_NOT_DEMONSTRATED. CORRECTION_CANDIDATE = NONE. → STOP_COMPLEXITY_RECOMMENDATION.**
- **Strategies:** none of the 5 shows a demonstrated edge, and no stage (pattern, setup, trigger, direction, location gates) does either.
- **Costs and direction:** no strategy is cost-resilient, and no direction preference is stable.
- **Subgroups:** 66 simple pre-entry subgroups were checked. One passed DEV and failed HOLD.
- **Where to read more:** `reports/V13_FINAL_DECISION.md` and `reports/V13_NO_EDGE_FINDINGS.md`.

## Layout
| Path | Content |
|---|---|
| `V13_PREREGISTRATION.md` (+ `.sha256`) | units, costs, stage tests, the six pre-registered groupings, decision rules |
| `scripts/lean.mjs` | pure helpers: groupings (existing pre-entry attributes only), decision rules |
| `scripts/v13_study.mjs` | `EDGE_PHASE=DEV` → DEV audit + subgroup screen + freeze; `EDGE_PHASE=FULL` → DEV + HOLD, classifications, candidates, replay parity |
| `scripts/write_reports.mjs` | the 14 reports |
| `configs/v13_freeze.json` | hashes and the DEV-frozen candidate list |
| `results/` | `v13_dev.json`, `v13_results_FULL.json`, console and test outputs |

## Reproduce
```
EDGE_PHASE=DEV  node research/core_edge_v13/scripts/v13_study.mjs
EDGE_PHASE=FULL node research/core_edge_v13/scripts/v13_study.mjs
node research/core_edge_v13/scripts/write_reports.mjs
node --test tests/core_edge_v13.test.js
```
