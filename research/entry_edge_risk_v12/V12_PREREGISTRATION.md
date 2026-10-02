# V12 — ENTRY EDGE ISOLATION + REALIZED RISK HARDENING — PRE-REGISTRATION (frozen 2026-10-02, before any V12 outcome is computed)

Research only.
- **Authority and production:** REAL = OFF, DEMO = OFF, EXECUTION_AUTHORITY = NONE, PRODUCTION_CHANGED = NO.
- **Fixed settings:** RR = 1.70, CAPITAL_HARVEST = OFF.
- **Frozen engine:** the entry engine stays the frozen V8 corrected core with 5 models (MC, PB, BO, SR, MR). No rule, SL or RR is changed. No filter, indicator, Silver, DXY or external data is added.

## PART A — ENTRY EDGE ISOLATION

### A1. Stage funnel per model m and side s
Data: the V8 corrected-core replay rows, one per 5m bar.
- **PATTERN:** stage(m, s) ≥ 1.
- **SETUP:** stage(m, s) ≥ 2.
- **TRIGGER:** stage(m, s) = 3.
- **DIRECTION:** the trigger survives the 15m bias / eligibility rules, i.e. `m+s` ∈ row.trig.
- **ENTRY:** the engine signal (act = s, mdl = m), after the quality, location (≤ 2.5 ATR), RR (≥ 1.70) and conflict gates.
- **TRADE:** the entry is taken by the unchanged one-position walk (`canReenter`).

The first three stages are bias-agnostic. They come from V8's independent stage evaluator (0 mismatches against production triggers on every bar).

### A2. Measurement probe (identical for every stage)
- **Entry:** the close of the stage bar.
- **SL:** the close ∓ 1.35 × ATR14. 1.35 is the DEV median engine R/ATR of 1.36, rounded.
- **Exit:** the unchanged BASELINE exit (1.70 R target, broker fail-safe 1.5 R + spread, thesis close beyond the SL, 288-bar horizon).
- **Cost bases:**
  - NET: NORMAL cost, 0.24 spread + 0.10 slippage plus swap;
  - GROSS: zero spread and slippage, swap added back.
- **Unconditional baseline:** every bar carrying a model-layer trace, both sides.
- **Stage edge** = GROSS mean R at the stage − GROSS mean R of the baseline, same side (removes market drift).
- **Direction value** = GROSS mean R (model side) − GROSS mean R (opposite side), on the same bars.
- **Actual geometry:** ENTRY and TRADE are also measured with the engine's own entry and SL.

### A3. Statistics
- **Intervals:** 95 % day-block bootstrap (days resampled, 1,000 resamples, seed 20261002). Observations from the same pattern episode are serially dependent.
- **Per-model figures:**
  - observations; valid patterns, setups, triggers, directions, entries and trades;
  - wins / losses; expectancy R; PF;
  - MFE / MAE; 1.70 R reach;
  - max DD (R, sequential).
- **Weak strategies:** no model is removed or hidden.

### A4. Stage attribution of every losing TRADE (rule conformance, pipeline order, first failure wins)
- **PATTERN_ERROR:** stage(m, s) = 0.
- **SETUP_ERROR:** stage(m, s) = 1.
- **TRIGGER_ERROR:** stage(m, s) = 2.
- **DIRECTION_ERROR:** `m+s` ∉ row.trig, or candidate side ≠ signal side.
- **LOCATION_ERROR:** |entry − anchor| > 2.5 ATR.
- **SL_ERROR:** SL on the wrong side, or R < 0.5 ATR.
- **RR_ERROR:** engine RR < 1.70, or RR inconsistent with TP2.
- **UNKNOWN:** no stage trace, or a > 3 h data gap at the entry bar.
- **Otherwise VALID_LOSING_TRADE.**

**Hindsight outcome labels** for valid losing trades (labels only, never rules):
- ADVERSE_FROM_START: MFE < 0.5 R;
- FAVOURABLE_THEN_LOST: 0.5 ≤ MFE < 1.2 R;
- NEAR_TARGET_REVERSAL: MFE ≥ 1.2 R.

**Mirror counterfactual:** would the opposite side, with the same SL distance, have reached 1.70 R?
- An OUTCOME direction miss = adverse from the start AND the mirror wins.
- Adverse from the start with the mirror also losing = noise.

### A5. Timing and location (descriptive, pre-entry features only, every valid entry with its own geometry)
- **Features:** bars from the setup origin; |entry − anchor| / ATR; SL size R / ATR; BO bars since the breakout event; MR bars since the sweep.
- **Bins:** quartiles defined on DEV per model, reported on DEV and HOLD.
- **Not filters:** these bins are not filters.

### A6. Correction-candidate protocol (strict; information-time test first)
**Admissible candidates** must be:
- fully known at entry time; AND
- defined by a model's own existing rule or a pre-V12 boundary band of that rule.

**Pre-registered list (no others):**
- **C1 LOCATION_MARGINAL:** |entry − anchor| in 2.0–2.5 ATR (V8 class MARGINAL).
- **C2 LATE_TRIGGER:** bars from origin above the DEV per-model 75th percentile.
- **C3 EARLY_TRIGGER:** bars from origin at or below the DEV per-model 25th percentile.

**Pass rules:**
- **Pass on DEV:** the group's mean NET R (own geometry, every valid entry) is below the rest, with the 95 % day-block CI of the difference entirely below 0.
- **Holdout:** passing candidates are frozen and tested once on HOLD with the same rule.

**Not admissible:** SL-width or cost/R exclusions.
- Their effect was already observed on HOLD in V10 / V11, so the HOLD split is contaminated for them.
- Excluding high-cost trades deletes trades without creating gross edge.

**A passing candidate is documented, never implemented.**

### A7. ENTRY_EDGE_STATUS (first match wins)
1. **EDGE_CORRECTION_SUPPORTED:** a candidate passes on DEV and HOLD.
2. **EDGE_CORRECTION_NOT_SUPPORTED:** a candidate passed DEV but failed HOLD.
3. **EDGE_FAILURE_ISOLATED:** either
   - a pooled stage transition (PATTERN → SETUP → TRIGGER → DIRECTION → ENTRY) lowers the GROSS stage edge with the CI of the change entirely below 0 on both DEV and HOLD; or
   - a rule-error class accounts for ≥ 10 % of losing trades.
   The stage is named.
4. **EDGE_FAILURE_NOT_ISOLATED:** otherwise. ENTRY_FAILURE_STAGE = NO DETERMINISTIC FAILURE IDENTIFIED.
5. **INCONCLUSIVE:** fewer than 30 trades in a split.

Also reported: whether any stage carries a positive GROSS stage edge (CI > 0) on both splits. If not: "the existing strategy has no demonstrated edge".

## PART B — REALIZED RISK HARDENING

### B1. Realized-loss models (per accepted losing trade)
- **SCENARIO_{NORMAL, MODERATE, SEVERE}:** as in V11 (simulator; SEVERE adds a 0.5 R gap on every 10th stop-out).
- **REALISTIC_{NORMAL, MODERATE, SEVERE}:** the scenario's spread and slippage, plus:
  - **swap:** calendar UTC midnights crossed × 0.5674 USD/oz/night (the largest platform swap-long observed, −567.4 points; SELL swap 0);
  - **gap-through:** at broker-SL exits, the fill is at the bar open when the bar opens beyond the broker level (data-measured);
  - no deterministic gap.

### B2. Envelope (frozen on DEV)
**Formula:** worst plausible loss per oz = 1.5 R + spread + 0.10 + SLIPPAGE_BUFFER + GAP_BUFFER + SWAP_BUFFER.

**SLIPPAGE_BUFFER = 0.20** (to the MODERATE slippage level 0.30 in total).
- Evidence: 3 recorded fills (entry slippage 0 / 0 / −0.06) and no stop-out fill data, so this buffer is an ASSUMPTION, not calibrated.
- SEVERE (0.60) is the stress level.

**GAP_BUFFER = DEV p99 of (gap-through ÷ R) × R** among broker-SL exits of all valid entries (NORMAL cost).

**SWAP_BUFFER:**
- BUY: nights possible × 0.5674, where nights possible = calendar UTC midnights between the entry and bar i + 288. The trading calendar is known at entry.
- SELL: 0.
- If the swap rate is unavailable → FAIL_CLOSED.

### B3. Sizing models (V10 library unchanged, through the V11 integration firewall)
- **H0:** V10 sizing (slippage allowance 0.10).
- **H1 (envelope):** the same library, with a per-entry slippage allowance = 0.10 + SLIPPAGE_BUFFER + GAP_BUFFER + SWAP_BUFFER. Lots therefore satisfy lots × worst plausible loss ≤ equity × r.
- **Below the minimum lot:** RISK_REJECTED_MINIMUM_LOT, with VALID_ENTRY preserved.
- **Grid:** r ∈ {0.10, 0.25, 0.50, 1.00} % (candidates only; no selection; RISK_PERCENTAGE = UNRESOLVED), accounts 1,000 / 5,000 / 10,000 USD, six realized-loss models.

### B4. RISK_STATUS (HOLD, H1, REALISTIC models, cells with ≥ 30 losing trades)
- **RISK_HARDENED:** all of
  - NORMAL and MODERATE: share of losing trades with realized loss > approved risk ≤ 1 %, and max multiplier ≤ 1.10;
  - SEVERE: max multiplier ≤ 1.50;
  - every buffer evidence-calibrated.
- **RISK_PARTIALLY_HARDENED:** the NORMAL and MODERATE criteria are met, but SEVERE is not met or a buffer is not evidence-calibrated.
- **RISK_FAILED:** the NORMAL or MODERATE criterion is not met under H1.
- **RISK_INCONCLUSIVE:** no cell has ≥ 30 losing trades.

### B5. Studies reported
- **Swap:** intraday vs overnight vs weekend, each with planned risk, swap, total exposure and multiplier.
- **Slippage levels** and the recorded fills.
- **Gap-through distribution and stress.**
- **Minimum-lot rejections:** H0 vs H1, by risk %, account, model and SL quartile.
- **Max plausible exposure of H0 trades** vs approved.
- **Risk replay:** determinism and restart for H1.

## Protocol
- **DEV phase:** Part A on DEV; candidate tests on DEV; buffer derivation on DEV.
- **Freeze:** candidates, buffers and code hashes.
- **FULL phase:** HOLD once.
- **No tuning on HOLD.**

## AMENDMENT 1 (2026-10-02; written after the DEV phase, BEFORE any HOLDOUT outcome was computed)
Original pre-registration sha 529a0ed5590d97d1aa7d2b5723be62675b10ac9e054d5ac15cac77070df6c599 (see AMENDMENT_LOG.md).

**DEV evidence that motivated the amendment** (DEV only):
- **Where gap-through occurs.** Every gap-through at a broker-SL exit happened at a market reopen:
  - 20 of 34 exits after a closure > 24 h (weekend / holiday), max 3.71 R;
  - 9 of 14 exits after the daily session break, max 0.70 R;
  - 0 of 1,209 in-session exits.
- **Why H1 fell short.** Under H1 (gap buffer = DEV p99 = 0.27 R) single-trade realized loss still reached 1.8–2.1× the approved risk.
- **Known at entry.** Whether a position can still be open across a market closure is known at entry from the trading calendar.

**Additions (Part B only; Part A unchanged):**
- **CLOSURE_REACHABLE:** the 288-bar horizon from the entry contains a bar gap > 24 h (weekend / holiday closure; trading calendar).
- **Gap buffers (DEV maxima, frozen):**
  - SESSION_GAP_BUFFER_R = DEV max of gap-through ÷ R at exits after gaps ≤ 24 h;
  - CLOSURE_GAP_BUFFER_R = DEV max at exits after gaps > 24 h.
- **H3 (amended primary):** H1 with gap buffer = CLOSURE_GAP_BUFFER_R when CLOSURE_REACHABLE, else SESSION_GAP_BUFFER_R. It sizes down, or rejects at the minimum lot.
- **H2 (alternative):** CLOSURE_REACHABLE → RISK_REJECTED (CLOSURE_GAP_EXPOSURE, valid entry preserved), else as H3.

**RISK_STATUS (B4):**
- **Primary:** evaluated on H3, with the B4 criteria unchanged.
- **Also reported:** H1 under the original rule and H2. The original pre-registered H1 status is never hidden.
