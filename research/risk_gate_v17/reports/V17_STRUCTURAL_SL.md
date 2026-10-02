# V17_STRUCTURAL_SL

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Authority
- **The V8 structural SL is an input only.** It is never widened, tightened or moved to fit a dollar-risk target.
- **The structural stop acts on a confirmed 5m close beyond it** (thesis invalidation, exit at that close).
- **The hard broker stop** sits at the fill ∓ (1.5 × structural distance + spread). That is production `LOSS_CONTROL.structuralMultiple` = 1.5, and it is the stop exposure sized for.
- **An SL that is missing, non-finite or on the wrong side** of the entry or the execution price → RISK_REJECTED_SL_INVALID.
- **An SL that cannot produce a safe size** → rejected: MINIMUM_LOT / MARGIN / STOPS_LEVEL.

## Evidence
- **Accepted trades:** in every one, the recorded `sl_price` equals the engine SL, and RR = 1.70 from the execution price (0 violations).
- **Risk firewall:** the entry hash is recorded and re-checked; any change throws.
