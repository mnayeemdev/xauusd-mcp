# V12 AMENDMENT AND CHANGE LOG

| # | When | What | Holdout seen before? |
|---|---|---|---|
| D1 | 2026-10-02, DEV phase | Attribution / funnel measurement fix: the SR trigger is valid under the model's own rule when the 15m bias supports the side (`counterStructureConfirmed` returns true on bias support). The bias-agnostic V8 stage evaluator ran SR with a NEUTRAL bias, so 5 DEV SR trades showed stage 2 and were misread as TRIGGER_ERROR. `isolation.triggerValid` now encodes the SR rule exactly. | NO (DEV only) |
| A1 | 2026-10-02, after DEV, before HOLD | Pre-registration Amendment 1 (Part B): CLOSURE_REACHABLE, two-tier gap buffer (session / closure, DEV maxima), H3 (amended primary) and H2 (alternative). Motivated by the DEV evidence that all gap-through happens at market reopens and that the p99 gap buffer leaves 1.8–2.1× single-trade overshoot. Original pre-registration sha 529a0ed5590d97d1aa7d2b5723be62675b10ac9e054d5ac15cac77070df6c599; amended sha in V12_PREREGISTRATION.sha256. | NO |

The pre-amendment DEV outputs and freeze record are kept (`results/v12_dev_pre_amendment.json`, `results/dev_phase_console_pre_amendment.txt`, `configs/v12_freeze_pre_amendment.json`). Part A is unaffected by A1.

| # | When | What | Holdout seen before? |
|---|---|---|---|
| D2 | 2026-10-02, after the FULL run | Fail-closed bug fixed in `envelope.mjs`: `null >= 0` is `true` in JavaScript, so a null swap rate or gap buffer did not fail closed. The checks now use `Number.isFinite`. The study always passes a real rate (0.5674) and real buffers, so no number changed. DEV and FULL were re-run, and every split, decision, integrity, replay and candidate result is byte-identical to the run before the fix. Only the freeze timestamp and the envelope hash differ (pre-fix freeze kept as `configs/v12_freeze_pre_fix.json`). Found by the V12 fail-closed unit test. | YES (results unaffected) |
