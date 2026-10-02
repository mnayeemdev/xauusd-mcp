# V17_RISK_GATE_HARDENING

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Scope
The owner's eight items: planned vs realized risk, gap exposure, slippage, swap, minimum-lot constraints, margin, risk rejection, fail-safe behaviour. Nothing else changed.

## The gate (`scripts/riskgate.mjs`, pure; every step can only reject)
1. Broker data validated → RISK_REJECTED_BROKER_DATA.
2. Equity, SL, risk inputs, quote (V16 timing) → EQUITY_UNAVAILABLE / SL_INVALID / INVALID_RISK / QUOTE.
3. Duplicate, open exposure (max 1), production breakers, existing re-entry guard.
4. PRIMARY: risk % UNRESOLVED → VALID_ENTRY + RISK_PERCENTAGE_UNRESOLVED.
5. Sizing:
   - equity × research risk % → cash risk;
   - exposure per oz = 1.5 × structural distance + spread + 0.10 (+ envelope swap);
   - lots rounded DOWN to the step;
   - **actual exposure recalculated after rounding** → MINIMUM_LOT / BROKER_LIMIT (no silent cap) / INVALID_SIZE / INCONSISTENT / STOPS_LEVEL / MARGIN_REJECTED.
6. The entry is hashed before and after. The SL is an input only.

## What is new compared with V10 / V11
- **Owner reject codes.** Every rejection now uses the owner's code (MINIMUM_LOT, BROKER_LIMIT, INVALID_SIZE, BROKER_DATA, MARGIN_REJECTED, …).
- **No silent maximum-lot cap.** V10 capped silently at volume_max; V17 rejects.
- **Live broker data:** a read-only capture, validated against MT5's own calculators and the REAL bridge record.
- **Realized risk is decomposed per trade:** stop loss, commission, swap, slippage, gap. The exceedance is classified.
- **Swap** follows the broker calendar (triple Wednesday, no weekend charges) instead of a flat rate.
- **Gap** is measured from data. No invented multiplier: V10's "every 10th stop gaps 0.5 R" is retired.
- **Envelope sizing:** the gate sizes on planned + commission + the known maximum swap. The gap tail is reported separately.

## Status
**RISK_GATE_VALIDATED.** Separately reported:
- GAP_RISK = UNRESOLVED;
- SLIPPAGE_RISK = UNRESOLVED;
- RISK_PERCENTAGE = UNRESOLVED;
- DAILY_LOSS_POLICY = UNRESOLVED.
