# V9 CAPITAL HARVEST — adaptive profit-management research (2026-10-01)

Research only: hypothetical, not executed. Entries are the V8 corrected core, with RR 1.70 and lot 0.01; only the exit management differs. The verdict is **CAPITAL_HARVEST_EDGE = INCONCLUSIVE**, with no policy proposed and Capital Harvest OFF. Start with `reports/V9_CAPITAL_HARVEST_RESEARCH.md`.

| Path | Content |
|---|---|
| `V9_PREREGISTRATION.md` (+ .sha256) | definitions, grid, selection, decision rule — frozen before any outcome |
| `scripts/harvest.mjs` | pure causal profit manager (HOLD / PROTECT / HARVEST / EXIT, floors A–E, continuation states) |
| `scripts/v9_study.mjs` | DEV grid and selection, then FULL holdout, integrity checks and the decision |
| `scripts/v9_drift_control.mjs` | uncapped-hold diagnostic (actual vs random vs opposite side) |
| `scripts/write_reports.mjs` | the 16 reports |
| `configs/` | frozen selection and freeze record |
| `results/` | DEV grid, FULL results, drift control, test / lint / fingerprint outputs |
| `CORRECTION_LOG.md` | analysis-code corrections |

Reproduce from the repository root (needs the V8 replay rows and the Edge Lab bars):
1. `EDGE_PHASE=DEV node research/capital_harvest_v9/scripts/v9_study.mjs`
2. `EDGE_PHASE=FULL node research/capital_harvest_v9/scripts/v9_study.mjs`
3. `node research/capital_harvest_v9/scripts/v9_drift_control.mjs`
4. `node research/capital_harvest_v9/scripts/write_reports.mjs`
