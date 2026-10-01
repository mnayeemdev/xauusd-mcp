# V10 — RISK + CAPITAL CONTROL (research / validation only)

RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · dynamic sizing RESEARCH_ONLY.
- **Unchanged:** EXECUTION_AUTHORITY NONE · PRODUCTION_CHANGED NO.
- **Settings:** RR 1.70 · LOT 0.01 · AUTO_SCALING OFF · CAPITAL_HARVEST OFF · MARTINGALE OFF · AVERAGING_DOWN OFF.

## Outcome
**RISK_MODEL = INCONCLUSIVE · PROPOSED_RISK_SPEC = NO.**
- **Mechanics:** the risk-layer mechanics are validated by tests and replay.
- **No supported risk %:** none of 0.10 / 0.25 / 0.50 / 0.75 / 1.00 % met the pre-registered capital-safety criteria on DEV, so nothing was frozen for the holdout, and no risk percentage is proposed.
- **Root cause:** the negative expectancy of the frozen entry stream, combined with the 0.01-lot broker minimum.
- **Where to read more:** `reports/V10_RISK_CAPITAL_CONTROL.md`.

## Layout
| Path | Content |
|---|---|
| `V10_PREREGISTRATION.md` (+ `.sha256`) | design, criteria and decision rule, frozen before any outcome |
| `scripts/risk.mjs` | pure risk layer: broker-spec loader, sizing, rounding, margin, daily / streak / weekly controller, fail-safes (hash frozen in `configs/v10_freeze.json`) |
| `scripts/sim.mjs` | shared simulation helpers: signals, outcomes per cost, chronological walk, Monte Carlo, streak maths |
| `scripts/v10_study.mjs` | pre-registered study. `EDGE_PHASE=DEV` → selection + freeze; `EDGE_PHASE=FULL` → DEV + HOLDOUT grid, Monte Carlo, replay / restart, maths, decision |
| `scripts/v10_descriptive.mjs` | DESCRIPTIVE_ONLY_NOT_SELECTION tables: controls and margin caps at every risk %, risk table, SL distribution, loss overshoot, SL-quartile weighting, exposure |
| `scripts/write_reports.mjs` | renders the 20 reports from the results |
| `configs/` | `selection.json` (no supported risk %), `v10_freeze.json` (prereg / risk / selection hashes) |
| `results/` | `v10_dev.json`, `v10_results_FULL.json`, `v10_descriptive.json`, fingerprint, test-suite outputs (login redacted) |
| `reports/` | 20 V10 reports |

## Reproduce
```
EDGE_PHASE=DEV  node research/risk_capital_v10/scripts/v10_study.mjs   # rewrites selection + freeze (same hashes; new timestamp)
EDGE_PHASE=FULL node research/risk_capital_v10/scripts/v10_study.mjs   # verifies the freeze first
node research/risk_capital_v10/scripts/v10_descriptive.mjs
node research/risk_capital_v10/scripts/write_reports.mjs
node --test tests/risk_capital_v10.test.js
```

**Inputs.** The study needs:
- the V8 replay rows `research/core_pattern_audit_v8/results/rows/ALL_{DEV,HOLD}.jsonl` (gitignored; regenerate with the V8 scripts);
- the Edge Lab bars `handoff/edge_discovery_lab/data/XAUUSDm_bars.json`;
- the broker record in `state/xauusd_mt5_real_trade_log.jsonl`, read-only. Only symbol and contract fields are used; no credential is read into the spec.

## Notes
- **Shared-helper move.** The simulation helpers were moved from `v10_study.mjs` into `sim.mjs` after the first FULL run. DEV and FULL were re-run: selection byte-identical, results identical apart from timestamps. The original freeze file was kept.
- **Common exit for every model.** CURRENT is replayed with the same structural exit as every other model. Production's −50 USD monetary broker SL and +30 USD profit budget (0.01 lot) are measured, not simulated: they bind on 1.9 % and 10.5 % of HOLD signals respectively (`V10_STRUCTURAL_SL_RISK`).
- **Gap-through fills.** The bar simulator fills the broker SL at its level. Gap-through fills are represented by the SEVERE deterministic gap only.
