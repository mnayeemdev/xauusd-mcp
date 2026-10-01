# V9 — CAPITAL HARVEST: ADAPTIVE PROFIT MANAGEMENT — PRE-REGISTRATION (frozen 2026-10-01, before any V9 outcome is computed)

Research only. No order and no position action. Execution authority is NONE. The entry engine is unchanged; production `src/` is not modified.

## 1. Entries and baseline (identical for every policy)
- **Entries:** every BUY/SELL of the V8 corrected core, taken from the V8 replay rows `research/core_pattern_audit_v8/results/rows/ALL_{DEV,HOLD}.jsonl` (DEV 4,858, HOLD 6,553 signals).
- **Entry terms:**
  - entry = the signal-candle close;
  - initial protection = the engine's structural SL;
  - 1 R = |entry − SL|;
  - fill = entry + spread (BUY) or entry (SELL).
- **Baseline A:** fixed 1.70 R target with the EXIT_F rules:
  - broker fail-safe at 1.5 R + spread, intrabar;
  - thesis invalidation on a confirmed close beyond the structural SL;
  - target touch;
  - stop before target on the same bar;
  - 288-bar horizon.
- **Costs:**
  - NORMAL spread 0.24 + slippage 0.10 USD;
  - STRESS spread 0.60 + slippage 0.20;
  - the exit pays slippage once;
  - swap 0.56 USD per BUY night.
- **Sensitivity:** the same policies on the production CONTROL entries (`CONTROL_*.jsonl`).
- **Unchanged for every policy:** entries, SL, lot 0.01 and RR 1.70. Only exit management differs.

## 2. Decision timing (no hindsight)
A policy acts only at a COMPLETED 5m close, using bars ≤ that close. A protective floor set at close j takes effect from bar j+1 as a hard intrabar level. The order of events within a bar is:
1. protective floor;
2. broker fail-safe;
3. active 1.70 R target;
4. MFE update;
5. close-based thesis invalidation;
6. the end-of-bar decision (HOLD / PROTECT / HARVEST / EXIT, floor ratchet, target activation for the next bar).

The floor is monotone: it is never lowered, never set below break-even once armed, and never above the current close. The structural SL and the broker fail-safe are never widened.

## 3. Continuation state (simple, deterministic, completed bars only; BUY shown, SELL mirrored)
- **INVALIDATED:** close below the most recent confirmed 3/3 pivot low formed after entry, with the pivot confirmed at or before this bar (trade structure broken), or the thesis invalidation of §1.
- **STRONG:** all three hold:
  - a new highest close since entry within the last 3 bars;
  - close above the 5m EMA20;
  - ≥ 2 of the last 3 bars closed up.
- **WEAK:** any of:
  - close below EMA20;
  - an opposite rejection candle (upper wick ≥ 50 % of range and close in the lower third);
  - two consecutive down closes, each below the previous close.
- **MODERATE:** otherwise.

Mapping:
- STRONG → HOLD, or PROTECT + RUN (the 1.70 R target is suspended for the next bar and the floor protects).
- MODERATE → PROTECT (target active).
- WEAK → HARVEST at the close if the open profit at the close is ≥ harvestMinR, otherwise PROTECT.
- INVALIDATED → EXIT at the close.

If price is already beyond the 1.70 R target at a close while the target was suspended and the state is no longer STRONG, the policy harvests at that close.

**Scope:** continuation states drive decisions only after profit has become available (MFE ≥ armR, the floor is armed). Before that, only the structural SL, the thesis invalidation and the broker fail-safe apply, so the loss side is unchanged; V9 is profit management only.

**State priority (first match):** INVALIDATED → WEAK → STRONG → MODERATE.

## 4. Protected-profit floors (research families; floor armed once MFE ≥ armR)
| Family | Floor (BUY; SELL mirrored) |
|---|---|
| A R-step | fill + (⌊MFE_R / 0.5⌋ × 0.5 − lagR) × R |
| B volatility (chandelier) | highest high since entry − k × ATR14 |
| C structure | most recent confirmed 3/3 pivot low after entry − 0.1 × ATR14 |
| D MFE retention | fill + ρ × MFE |
| E hybrid | max(C, B) |

Every armed floor is ≥ break-even (fill + slippage). These are research formulas; none is assumed superior.

## 5. Grid (DEV only; every configuration is recorded)
- **Floor-only formulas** (baseline target 1.70 R kept, no state machine):
  - A: arm {0.75, 1.0} × lag {0.5, 0.75}
  - B: arm {0.75, 1.0} × k {1.0, 1.5, 2.0}
  - C: arm {0.75, 1.0}
  - D: arm {0.75, 1.0} × ρ {0.4, 0.5, 0.6}
  - E: arm {0.75, 1.0} × k {1.0, 1.5}
- **Adaptive policies** (state machine + conditional target + harvest):
  - Policy 1 = floor D (ρ {0.5, 0.6});
  - Policy 2 = floor E (k {1.0, 1.5});
  - Policy 3 = floor A (lag {0.5, 0.75});
  - each × arm {0.75, 1.0} × harvestMinR {0.75, 1.0, 1.25}.
- Reference only: RUN_TO_END (structural stop and horizon, no target).

## 6. Selection (DEV) → freeze → HOLDOUT once
For each adaptive family (1, 2, 3) and each floor family (A–E), the DEV configuration with the highest DEV mean paired difference (policy r − baseline r, same signal, NORMAL cost) is selected among those that satisfy, on DEV:
- right-tail preservation ≥ 80 %;
- premature-harvest rate ≤ 30 %.

If none satisfies both, the best one is selected and flagged CONSTRAINT_UNMET. The selections are written to `configs/selection.json` and hashed. HOLDOUT is replayed once for the baseline and the frozen selections, and no parameter changes afterwards.

## 7. Definitions
- **Milestones:** reach of 0.25 / 0.5 / 0.75 / 1 / 1.25 / 1.5 / 1.7 / 2 / 2.5 / 3 R on the open path (structural stop only).
- **Give-back** = MFE (policy path) − realized, in R, % of MFE and USD (0.01 lot).
- **Early exit:** every exit made in profit by HARVEST or by the protective floor before the baseline outcome is classified:
  - GOOD: policy r ≥ baseline r;
  - ACCEPTABLE: baseline better by < 0.5 R;
  - PREMATURE: baseline better by ≥ 0.5 R, or the price continued ≥ 1.0 R beyond the exit before the original structural stop or horizon.
  - Premature-harvest rate = PREMATURE / early exits.
- **Additional profit after protection** = realized R − the open profit R at the bar where the floor was first armed (trades that armed).
- **Profit lost by early exit** = the mean over early exits of max(0, baseline r − policy r).
- **Right tail:**
  - Strong trades are those whose open-path MFE ≥ 2.0 R.
  - A strong trade is preserved if policy r ≥ baseline r − 0.05.
  - Preservation = preserved / strong.
  - Strong trades closed below 1.0 R by a management exit are reported separately.
- **Per-signal (primary):** every signal is an independent hypothetical trade. Paired difference CI: bootstrap of per-signal (policy − baseline), seed 20261001, 2,000 resamples.
- **Sequential:** one position at a time with `canReenter` (positionManager.js), giving drawdown, frequency, consecutive losses and capital survival on 10,000 USD at 0.01 lot.

## 8. Decision (HOLDOUT, the three adaptive policies)
**CAPITAL_HARVEST_EDGE = DEMONSTRATED** only if one adaptive policy has ALL of:
- **Expectancy, both splits:** HOLD and DEV paired mean difference vs baseline > 0 at NORMAL cost.
- **Significance:** HOLD paired-difference 95 % CI lower bound > 0.
- **Stress cost:** HOLD STRESS paired mean difference > 0.
- **Profit factor:** HOLD PF ≥ baseline PF.
- **Drawdown:** HOLD sequential max drawdown ≤ baseline.
- **Right tail:** preservation ≥ 80 % on HOLD.
- **Early exits:** premature-harvest rate ≤ 30 % on HOLD.
- **Win rate vs average win:** no win-rate gain bought by a lower expectancy.
- **Process:** replay parity and the hindsight checks PASS.

**INCONCLUSIVE** if a policy improves the paired mean on both splits, but the CI includes 0 or another condition fails.

**NOT_DEMONSTRATED** otherwise.

PROPOSED_POLICY = YES only when DEMONSTRATED. Even then nothing is deployed: DEMO and REAL stay OFF, and adoption is the owner's decision.

## 9. Integrity checks
- **Baseline reproduction:** the V9 baseline and RUN_TO_END must reproduce the V5/V8 simulator (FIXED 1.70 R and OPEN) exactly on every DEV signal.
- **Live-time = chronological replay:** the manager is fed incrementally with only the bars up to each close. Its per-bar decisions are compared with a full-array run on a sample of trades.
- **Hindsight:** bars after each decision are replaced by garbage, and every earlier decision must be unchanged.
- **Determinism:** two runs give identical hashes.
- **Cost accounting:** a zero-slippage run differs by exactly the slippage.
