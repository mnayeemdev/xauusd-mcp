# V13 — CORE EDGE RECONSTRUCTION (LEAN STRATEGY AUDIT) — PRE-REGISTRATION (frozen 2026-10-02, before any V13 computation)

Research only.
- **Authority and production:** REAL = OFF, DEMO = OFF, EXECUTION_AUTHORITY = NONE, PRODUCTION_CHANGED = NO.
- **Settings:** RR = 1.70, CAPITAL_HARVEST = OFF, RISK_PERCENTAGE = UNRESOLVED (no risk sizing used).
- **Frozen engine:** the V8 corrected core, XAUUSD 5m, 5 strategies (MC, PB, BO, SR, MR) with their pattern, setup, trigger, direction and location rules, structural SL. Nothing is changed.
- **Simplicity:** no new indicator, filter, score, regime / session / news / volatility / correlation rule or model. Gap risk (V12) is excluded from this entry study.

## 1. Units and costs
- **Valid entry:** every engine signal of the strategy, evaluated with its own entry, structural SL and the fixed 1.70 R exit (thesis close, broker fail-safe 1.5 R + spread, 288-bar horizon). Each entry is evaluated independently.
- **Strategy walk:** the strategy ALONE in the unchanged one-position walk (`canReenter`). Strategies are not combined. The combined engine is reported separately as a reference.
- **Cost bases:**
  - GROSS: zero spread and slippage, swap added back;
  - NORMAL: 0.24 + 0.10, with swap;
  - STRESS: 0.60 + 0.60, with swap, no gap.
- **Uncertainty:** 95 % day-block bootstrap (1,000 resamples, seed 20261002).

## 2. Strategy metrics (each strategy separately, DEV and HOLD)
Valid setups (bars at setup stage), valid entries, walk trades, win rate, average win / loss, expectancy R (gross / normal / stress), PF, max DD (R, sequential), MFE, MAE, 1.70 R reach, average duration (bars).

## 3. Stage tests (V12 probe: entry at the stage bar close, SL 1.35 ATR, fixed 1.70 R, GROSS, edge vs same-side baseline)
Each test is per strategy, both sides pooled:
- **PATTERN edge:** PATTERN-stage edge.
- **SETUP adds:** PATTERN → SETUP change.
- **TRIGGER adds:** SETUP → TRIGGER change.
- **DIRECTION adds:** TRIGGER → DIRECTION change (bias / eligibility rule).
- **LOCATION / ENTRY gates add:** DIRECTION → ENTRY change.

**Classification:**
- DEMONSTRATED: the CI is above 0 on DEV and on HOLD.
- NEGATIVE (replicated): the CI is below 0 on both splits.
- Otherwise NOT_DEMONSTRATED.
- If PATTERN and SETUP are both not demonstrated → SETUP_ADDS_NO_DEMONSTRATED_EDGE.

## 4. Pre-registered simple groupings (existing pre-entry attributes only; no others)
| Grouping | Levels | Source |
|---|---|---|
| DIRECTION | BUY / SELL | signal side |
| LOCATION | VALID ≤ 2.0 ATR / MARGINAL 2.0–2.5 ATR from the anchor | V8 location classes |
| STRUCTURE | ALIGNED / COUNTER (5m structure state vs side) | row st5 |
| PATTERN_EVENT | BOS / CHOCH (last 5m structure event) | row ev5 |
| SL_SOURCE | candidate_anchor / candidate_anchor+min_risk / atr_fallback | engine geometry |
| BIAS | ALIGNED / NEUTRAL / OPPOSED (15m bias vs side) | row b15 |

- **Scope:** each grouping is evaluated per strategy and for the combined engine, about 80 subgroups in all (not hundreds).
- **Minimum sample:** fewer than 100 valid entries in either split → INSUFFICIENT_EVIDENCE.
- **Reported per subgroup:** n, expectancy (gross / normal / stress), PF, CI, DEV and HOLD.

## 5. Decision rules
**A. Strategy edge.** A strategy is EDGE_DEMONSTRATED only if, on BOTH DEV and HOLD:
- valid entries GROSS CI lower bound > 0;
- valid entries NORMAL CI lower bound > 0;
- valid entries STRESS mean > 0;
- strategy-walk NORMAL expectancy > 0.

It is INSUFFICIENT_EVIDENCE with fewer than 100 valid entries in a split. Otherwise it is EDGE_NOT_DEMONSTRATED (NO_DEMONSTRATED_EDGE; the strategy is not modified or deleted).

**B. Cost label.** Gross CI includes 0 and normal mean < 0 → NO_COST_RESILIENT_EDGE.

**C. Direction.**
- A BUY or SELL difference counts only if the same side is better with a CI-separated difference on DEV and on HOLD.
- Otherwise NO_DIRECTION_EDGE.
- Descriptive only; no permanent directional filter.

**D. Correction candidates.**
- **Screening (DEV):** a subgroup passes DEV if it has ≥ 100 entries in DEV, a GROSS CI lower bound > 0, a NORMAL CI lower bound > 0 and a STRESS mean > 0.
- **Freeze:** DEV-passing subgroups are frozen.
- **HOLD test (once):** the same criteria, plus ≥ 100 HOLD entries and the same sign.
- **Replay:** parity is required.
- **If one survives:** CORRECTION_CANDIDATE is documented, not implemented.
- **Otherwise:** CORRECTION_CANDIDATE = NONE.
- **Holdout caveat:** HOLD was already viewed at model / direction / location level in V8–V12. A surviving candidate would also need fresh forward (live shadow) evidence before any claim.

**E. Final EDGE_STATUS.**
- EDGE_DEMONSTRATED: the combined engine meets rule A.
- EDGE_PARTIALLY_DEMONSTRATED: at least one strategy meets rule A or a correction candidate survives, while the combined engine does not.
- INSUFFICIENT_EVIDENCE: the combined engine has fewer than 100 entries in a split.
- Otherwise EDGE_NOT_DEMONSTRATED → STOP_COMPLEXITY_RECOMMENDATION. No V14 filter research.

## 6. Replay
- The combined engine reproduces V8 (entries, one-position trades, expectancy).
- Per-strategy entry counts match the V8 model mix.
- Probe stage edges reproduce V12.
- Re-running is deterministic.
