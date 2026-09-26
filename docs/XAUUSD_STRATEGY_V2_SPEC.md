# XAUUSD_STRATEGY_V2_SPEC — FROZEN BEFORE VALIDATION

**Frozen at:** 2026-09-26 after DISCOVERY (region A) only. Regions B and C had not been evaluated or inspected when this file was written.
**Implementation:** `validation/strategy_redesign_v2/v2_strategy.mjs`, invoked as `node validation/strategy_redesign_v2/v2_strategy.mjs <A|B|C> --families=C`
**SHA-256 of the frozen implementation:** `4fa5e069973d48d727797b66182632fcf00e1beb3a37512ebdb2f052ec1b8f6a`
**Status:** research only. Not deployed, not connected to any execution path, never imported by production.

## 1. What V2 is (after discovery)

Three candidate families were built from the discovery-only event study. Two were rejected on discovery and are NOT part of V2:

| Family | Discovery result (region A, one position at a time) | Decision |
|---|---|---|
| V2-A Liquidity sweep + reclaim at the range extreme | n 102, PF 0.77, mean −0.171 R, both sides negative, 32 % of trades ended at the emergency stop | REJECTED (obviously negative) |
| V2-B BOS with ≥ 0.5 ATR displacement + retest hold | n 22, PF 1.24, mean +0.271 R but median −1.25 R; all profit on one side (13 SELL, +20.6 R) and the total is negative without the single largest winner | REJECTED (outlier-dependent, one-sided) |
| **V2-C Compression → expansion with acceptance** | n 27 (rerun alone), PF 2.10, mean +0.374 R, median +0.057, CI [−0.114, +0.862], max DD 3.79 R, loss streak 5, total ex-top-1 +8.2 R, ex-top-3 +4.4 R, ex-top-5 +0.7 R, bootstrap P(mean ≤ 0) = 6.6 %, spread-0.40 mean +0.36 R | **FROZEN AS V2** |

V2 = family C only. All numbers below are the exact rules as implemented.

## 2. Frozen rules (confirmed 5m bars, XAUUSDm feed, no forming-bar authority, no lookahead)

Notation: bar i is the most recent confirmed 5m bar; ATR = 14-period ATR on 5m; ATR100 = mean of ATR over the 100 bars before the bar in question.

**Market state (label only, used as a gate for V2-C):**
COMPRESSION if ATR(i−1) ≤ 0.7 × ATR100(i−1); EXPANSION if ATR ≥ 1.4 × ATR100; TREND_CONTINUATION if the last confirmed 5m structure event is a BOS within 20 bars; otherwise BALANCED.

**Trigger (compression break) — evaluated on bar i−1:** box = bars i−13 … i−2 (12 bars); box high BH, box low BL. Bullish break when close(i−1) > BH + 0.1 × ATR(i−1) and the compression gate holds; bearish when close(i−1) < BL − 0.1 × ATR(i−1).

**Confirmation (acceptance) — bar i:** close(i) > BH (bullish) or close(i) < BL (bearish). Entry at close(i).

**Stop (structural invalidation):** bullish stop = BL − 0.1 × ATR(i); bearish stop = BH + 0.1 × ATR(i). If |entry − stop| < 0.3 × ATR(i) → WAIT (geometry too tight; never widened).

**Objective (structural, measured move):** bullish target = BH + 2 × (BH − BL); bearish target = BL − 2 × (BH − BL). Planned RR = |target − entry| / |entry − stop|. Require RR ≥ 1.7 (control reference, not re-tuned) else WAIT.

**Boolean gates (all must be true):** DATA_VALID (500 confirmed bars, ATR > 0), STRUCTURE_VALID (5m structure state resolvable), EVENT_VALID (compression gate + break close), CONFIRMATION_VALID (acceptance close), STOP_VALID (≥ 0.3 ATR), OBJECTIVE_VALID (measured move exists), RR_VALID (≥ 1.7). No quality score. No HTF veto (15m / 30m / 1H structure is recorded as context only).

**Position rule:** one position at a time; a new signal while a V2 position is open is skipped.

**Exit stack (thesis first, emergency separate):**
1. STRUCTURAL_TARGET: intrabar touch of the target.
2. THESIS_INVALIDATION_CLOSE: a confirmed close beyond the structural stop.
3. THESIS_DETERIORATION_OPPOSITE_STRUCTURE: a confirmed 5m structure event (BOS/CHoCH) against the trade, formed after entry, while the trade is losing on the close.
4. TIME_STOP_48_BARS: exit at the close of the 48th bar after entry.
5. EMERGENCY_BROKER_SL: intrabar level = stop ∓ 0.5 × ATR(entry bar), the only intrabar loss mechanism; it is not the expected loss.
Profit protection (exit when MFE ≥ 1.5 R and a close retraces to ≤ 0.5 R) was tested on discovery and FROZEN OFF (mean +0.369 vs +0.374, no benefit).

**Fill and cost model:** BUY fills at close + 0.24 spread, SELL at close; realized R = P&L at 0.01 lot / initial structural risk. Friction sensitivity: spread 0.40, and spread 0.40 with 0.15 USD slippage per side.

## 3. Pre-declared gates (written before B was run)

**Validation gate (region B, 32 sessions):** PASS iff n ≥ 12, mean R > 0, PF ≥ 1.2, total R without the top 3 winners > 0, max drawdown ≤ 8 R. If B fails, V2 FAILS and C is not opened for a pass/fail decision (C may be reported only for transparency, after the fact, and cannot rescue V2).

**Final holdout gate (region C, 33 sessions), opened only if B passes:** n ≥ 12, mean R > 0, PF ≥ 1.2, total R without the top 3 winners > 0, max loss streak ≤ 6, bootstrap P(mean R ≤ 0) < 25 %, mean R > 0 at spread 0.40 with 0.15 slippage. Additional labelling: if the total without the top 5 winners is ≤ 0, the result is labelled OUTLIER_DEPENDENT regardless of the other criteria.

**Post-B rule:** no modification of any rule after B is examined. Any change would create V2.1 and would require a fresh untouched holdout.

## 4. What V2 deliberately does not do

No 15m directional lock; no counter-structure shortcut (the family only trades in the direction of its own confirmed expansion); no additive quality score; no fixed-dollar target; no capital, lot or 6,000,000 USD objective input anywhere in the rules or the gates.
