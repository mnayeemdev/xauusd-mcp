# V11_RISK_TRANSLATION

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## Pipeline (fixed order; the risk layer is strictly downstream)
1. **ENTRY:** frozen engine record (deep-frozen; hashed fields: id, bar, time, model, side, candidate side, entry, structural SL, anchor, engine TP2 / RR, risk / ATR, trigger).
2. **ENTRY GEOMETRY CHECK:** verification only; a defect → FAIL_CLOSED ENTRY_GEOMETRY_DEFECT (the entry is never repaired).
3. **EXPOSURE:** MAX_SIMULTANEOUS_TRADES = 1 and the unchanged re-entry guard → EXPOSURE_BLOCKED.
4. **FAIL-SAFE PRECHECKS:**
   - equity;
   - SL present;
   - broker spec complete;
   - tick value (platform or same-currency derivation);
   - quote age ≤ 90 s and signal age ≤ 600 s;
   - spread ≤ 0.60 USD (production REAL limits);
   - otherwise FAIL_CLOSED.
5. **RISK TRANSLATION:** the V10 library, unchanged (sha 2fc1806a1e14748e…).
   - cash risk = equity × r;
   - worst-case loss per lot = (1.5 R + spread + 0.10) × 100;
   - lots rounded DOWN to the step;
   - < 0.01 → RISK_REJECTED RISK_BELOW_MIN_LOT;
   - margin cap 50 % plus margin level after loss ≥ 100 %.
6. **RISK CONSISTENCY:**
   - independent recomputation through the tick value: ((1.5 R + spread + 0.10) ÷ tick size) × tick value × lots must equal the library's actual risk within 1e-6 USD;
   - PCT actual ≤ approved;
   - lots finite and > 0;
   - otherwise FAIL_CLOSED.
7. **BROKER VALIDATION:**
   - lot step multiple, min / max;
   - structural and broker SL on the protective side and outside the stops / freeze level;
   - broker rejection → RISK_REJECTED (no retry, no resize).
8. **Outcome:** RISK_ACCEPTED with lots, planned risk, approved cash, margin, broker SL (= entry ∓ (1.5 R + spread)), research target (= entry ± 1.70 R) and tick-value source.

## What the risk layer may and may never do
| May | May never |
|---|---|
| accept, reject (with a reason), size, record | change pattern, setup, trigger, direction, entry location or structural SL; create an entry; weaken an entry rule; round a size up; retry a broker rejection with a different size; increase risk after a loss |

## Verified on every replay record
- Entry-hash mismatches: **0** (all 90 split × account × model × cost cells).
- Identity (each valid entry exactly once): **holds** in all cells.
- PCT planned risk above approved: **0**.
- Broker-invalid accepted trades: **0**.
- The integrated replay reproduces the V10 walk on every configuration (same entries, sizes, equity), and V10 outcome P&L matches for all three costs: DEV identical (0 mismatches), HOLD identical (0 mismatches).
