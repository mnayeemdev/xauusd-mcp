# V11 CORRECTION LOG

## C1 — fault-injection harness: the MARGIN_INSUFFICIENT injection did not create insufficient margin (2026-10-02)

**Pre-registered run (kept, not overwritten)**

Artefacts:
- `results/v11_results_FULL_prereg_harness.json`;
- `results/full_phase_console_prereg_harness.txt`;
- `configs/v11_freeze_prereg_harness.json`;
- the script as frozen: `configs/v11_study_prereg_harness.mjs.txt` (sha 708d0605…, equal to that freeze's `study_sha`).

Result:
- 2 of 13 injected `MARGIN_INSUFFICIENT` faults were accepted.
- The pre-registered failure condition "an injected fail-safe condition does not close" fired, so the computed status was **INTEGRATION_FAILED**.

**Diagnosis**
- **The injection.** It set the account leverage to 1:1. That does not guarantee insufficient margin: at 1:1 a 0.01 lot needs about lots × 100 × price ≈ 4,100 – 4,400 USD, which is under the 50 % cap of a ~10,000 USD account.
- **The two accepted trades** (HOLD, PCT 0.50 %, 10,000 USD) both had wide structural SLs and therefore the minimum size:

| Entry | Lots | Margin at 1:1 | Cap | Margin level after the worst-case loss | Margin rule (≤ cap, ≥ 60 + 40 %) |
|---|---|---|---|---|---|
| 81370\|BUY | 0.01 | 40.3 % of equity | 50 % | 247 % | satisfied |
| 93876\|SELL | 0.01 | 42.8 % of equity | 50 % | 233 % | satisfied |

- **The integration was correct.** It computed the margin and accepted two trades whose margin really was sufficient. The defect is in the test harness: its condition did not produce the fault it was named after.

**Correction**
- The injection now sets a leverage that makes the minimum-lot margin equal to 2 × the cap at the current equity, which guarantees MARGIN_ABOVE_CAP.
- The original leverage-1 injection is still replayed as a diagnostic (`integrity.fault_injection_prereg_harness`), with the margin figures of every trade it accepted.
- `decision.prereg_harness` records that the pre-registered harness would give INTEGRATION_FAILED.

**What did not change**
- `integrate.mjs`: sha 82c1e6c7… identical in both freezes.
- The V10 risk library.
- The pre-registration.
- Every DEV and HOLD grid, entry-only economics, V10 parity, matrix, replay, restart and duplicate result: byte-identical between the two FULL runs.
- Only the fault-injection section differs.

**Re-freeze and re-run**
- DEV was re-run (new freeze `configs/v11_freeze.json`, new `study_sha`), then FULL once.
- With the corrected harness, 0 of 172 injected faults are accepted (13 / 13 fault types close), so no failure condition fires: **INTEGRATION_PARTIALLY_VALIDATED**.
- Both results are reported; the owner decides whether to accept the correction.
