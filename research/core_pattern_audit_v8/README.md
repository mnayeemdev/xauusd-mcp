# V8 — CORE PATTERN EXECUTION AUDIT (research only, 2026-10-01)

Question: does the production intraday_5m engine recognise its own five patterns (MC, PB, BO, SR, MR) correctly? Result: six confirmed implementation defects (D1–D6), corrected as research copies and diffs only. Replay parity and no-lookahead PASS. The corrected engine is better than CONTROL on HOLDOUT but still negative. **EDGE_DEMONSTRATED = NO, DEMO_ELIGIBLE = NO, production unchanged.** Start with `reports/V8_FINAL_SPEC.md`.

| Path | Content |
|---|---|
| `V8_PREREGISTRATION.md` (+ .sha256) | defects, corrections, rules and decision criteria, frozen before any outcome |
| `scripts/corrections.mjs` | the six minimal corrections as exact text edits of production files |
| `scripts/build_engines.mjs` | builds `engines/<variant>/` (gitignored, regenerable; hashes in `configs/engines.sha256`) and `patches/*.patch` |
| `scripts/v8_replay.mjs`, `run_phase.sh` | per-bar replay of every variant (rows gitignored, ~370 MB) |
| `scripts/v8_study.mjs` | fidelity gates, economics, forensics, freeze (`configs/v8_freeze.json`) |
| `scripts/v8_live_parity.mjs`, `v8_live_production_parity.mjs` | live orchestrator and live-record parity |
| `scripts/v8_symmetry.mjs`, `v8_symmetry_residual.mjs` | price-mirror BUY/SELL test |
| `scripts/write_reports.mjs` | renders `reports/` |
| `results/` | result JSON, test / lint / fingerprint outputs |
| `CORRECTION_LOG.md` | analysis-code correction made before the HOLDOUT replay |

Reproduce: `node scripts/build_engines.mjs` → `bash scripts/run_phase.sh DEV` → `EDGE_PHASE=DEV node scripts/v8_study.mjs` → `bash scripts/run_phase.sh HOLD` → `EDGE_PHASE=FULL node scripts/v8_study.mjs` → `node scripts/v8_live_parity.mjs` → `node scripts/v8_live_production_parity.mjs` → `node scripts/v8_symmetry.mjs` → `node scripts/v8_symmetry_residual.mjs` → `node scripts/write_reports.mjs`. Run them from the repository root, with the Edge Lab data in `handoff/edge_discovery_lab/data/`. No MT5 or CDP query is issued.
