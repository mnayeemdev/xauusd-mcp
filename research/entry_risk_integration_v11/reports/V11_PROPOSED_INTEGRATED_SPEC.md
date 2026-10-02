# V11_PROPOSED_INTEGRATED_SPEC

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## Status
- **Kind of document:** a PROPOSED research specification. It is NOT a deployment authorisation: EXECUTION_AUTHORITY NONE, REAL OFF, DEMO OFF, production unchanged (LOT 0.01).
- **Why it can be written:** all required integration mechanics are validated (with the documented fault-harness correction C1).
- **RISK_PERCENTAGE = UNRESOLVED.** No percentage is supported and none is invented, so this spec cannot be run as a sizing policy.

## A. ENTRY RULES (frozen; owned by the entry engine only)
1. **Engine:** entry validity comes from the frozen V8 corrected core (MC > PB > BO > SR > MR; 15m bias; quality 65 / 70).
2. **Stop:** the structural SL = the model anchor ∓ 0.25 ATR, at least 0.5 ATR from the entry.
3. **Location:** entry ≤ 2.5 ATR from the anchor.
4. **Objective:** engine RR ≥ 1.70; the research objective is exactly 1.70 R.
5. **Immutability:** the entry record is immutable and hashed. Nothing downstream may change pattern, setup, trigger, direction, entry location or SL.
6. **Visibility:** every valid entry is recorded with exactly one outcome.

## B. RISK RULES
1. **Equity:** platform account equity at the decision (never free margin, never a fixed amount).
2. **Risk per trade:** equity × r, with r = **UNRESOLVED**.
3. **Worst case:** the worst-case loss per lot at the hard stop = (1.5 R + spread + slippage allowance + **swap allowance for positions that can cross the rollover**) × contract.
4. **Size:** lots rounded DOWN to the step. Below the minimum lot → RISK_REJECTED; never round up.
5. **Recalculation:** actual risk recalculated and cross-checked through the tick value; above approved → FAIL_CLOSED.
6. **Exposure:** MAX_SIMULTANEOUS_TRADES = 1; no martingale, no averaging down, no risk increase after losses, no profit-based escalation.
7. **Controls:** no daily / streak / weekly control (none supported).

## C. BROKER RULES
1. **Spec source:** contract, volume min / step / max, point, digits, stops / freeze level, leverage and margin call are read from the platform; missing → FAIL_CLOSED.
2. **Tick value:** the platform value, or tick size × contract only when the profit currency = the account currency; otherwise FAIL_CLOSED.
3. **Order check:** the lot is a step multiple within [min, max]; the structural and broker SLs are on the protective side, outside the stops and freeze levels.
4. **Broker SL:** placed at the hard fail-safe 1.5 R + spread, never a fixed-dollar distance.
5. **Margin:** margin ≤ 50 % of equity and margin level after the worst-case loss ≥ margin call + 40. Margin is never risk permission.
6. **Broker rejection:** recorded; no retry, no resize.

## D. SAFETY RULES
1. **Fail closed:** on unavailable equity, SL, spec or tick value; quote > 90 s; signal > 600 s; spread > 0.60 USD; entry geometry defect; invalid size; inconsistent risk; margin insufficient.
2. **Restart:** from serialized state, deterministically; duplicates rejected, also after restart.
3. **No bypass:** no fail-safe may be bypassed by altering the entry.
4. **Capital Harvest:** OFF, and it may not touch entry validity or risk validation.

## Prerequisites before any sizing policy could be proposed
1. An entry stream with demonstrated positive expectancy after costs. Currently DEV -0.077 R and HOLD -0.022 R (PF 0.90 / 0.97).
2. A risk percentage supported by a new pre-registered study on that stream.
3. A realized-risk buffer (swap, slippage, gap) shown to keep realized loss within plan under stress.
4. Owner review and explicit authorisation.
