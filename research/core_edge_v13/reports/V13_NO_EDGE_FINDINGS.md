# V13_NO_EDGE_FINDINGS

V13 CORE EDGE RECONSTRUCTION · LEAN STRATEGY AUDIT · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · engine frozen (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · pre-registration 22f3109e020335b1… · freeze 2026-10-02T13:20:50.942Z

## NO_DEMONSTRATED_EDGE records
None of these strategies is modified, disabled or deleted.
| Strategy | Status | DEV net R (CI) | HOLD net R (CI) | Cost label DEV / HOLD |
|---|---|---|---|---|
| MC momentum continuation | EDGE_NOT_DEMONSTRATED | -0.135 [-0.371, 0.088] | -0.086 [-0.292, 0.118] | NO_COST_RESILIENT_EDGE / NO_COST_RESILIENT_EDGE |
| PB pullback continuation | EDGE_NOT_DEMONSTRATED | 0.073 [-0.125, 0.269] | -0.046 [-0.193, 0.098] | NOT_DEMONSTRATED / NO_COST_RESILIENT_EDGE |
| BO breakout retest | EDGE_NOT_DEMONSTRATED | -0.099 [-0.219, 0.006] | -0.036 [-0.110, 0.053] | NO_COST_RESILIENT_EDGE / NO_COST_RESILIENT_EDGE |
| SR structure rejection | EDGE_NOT_DEMONSTRATED | -0.222 [-0.523, 0.069] | -0.186 [-0.401, 0.021] | NO_COST_RESILIENT_EDGE / NO_COST_RESILIENT_EDGE |
| MR mean reversion | EDGE_NOT_DEMONSTRATED | -0.193 [-0.429, 0.081] | 0.009 [-0.285, 0.369] | NO_COST_RESILIENT_EDGE / NOT_DEMONSTRATED |
| ALL (combined engine, reference) | EDGE_NOT_DEMONSTRATED | -0.089 [-0.184, 0.010] | -0.043 [-0.118, 0.030] | NO_COST_RESILIENT_EDGE / NO_COST_RESILIENT_EDGE |

## STOP_COMPLEXITY_RECOMMENDATION
**1. What was tested (V8 → V13, same frozen engine, same data):**
- implementation correctness: 6 defects found and corrected in V8; stage parity 0 mismatches;
- profit management: Capital Harvest (V9);
- risk sizing and capital control: V10;
- entry-risk integration: V11;
- the stage-by-stage funnel, timing, location, direction and realized risk: V12;
- each strategy separately, each stage, direction, location, cost resilience and 66 simple pre-entry subgroups: V13.

**2. What was rejected:**
- every risk percentage (V10);
- every daily, streak and weekly control (V10);
- every Capital Harvest policy (V9);
- every pre-entry correction candidate (V12 C1–C3; V13 the one DEV candidate);
- every directional preference (it flips with the market regime);
- every stage as an edge source.

**3. Why further filtering is unsupported:**
- The gross expectancy is ≈ 0 at every stage of every strategy.
- A filter can only remove trades from a stream with no gross edge. It cannot create edge; it only changes which zero-edge trades remain, and the subgroups that look good on one split do not repeat on the other.
- More filters would add parameters that fit noise, which the owner principle rejects.

**4. What evidence would actually be required before any further strategy work:**
- A strategy definition that produces positive GROSS expectancy with a day-block interval above 0 on a development period AND on an untouched holdout. HOLD has now been viewed many times, so this requires new data: forward shadow observation or a period outside 2025-05 → 2026-09.
- That edge surviving NORMAL and STRESS costs (spread, slippage, swap).
- Replay parity and a frozen rule written before the test.
- Only then: risk sizing (V10 / V11 mechanics) and the reopen-gap problem (V12), which remain open on their own.

**5. Status of the current strategy:**
- **RESEARCH-ONLY.** It should remain research-only: no DEMO and no REAL authorisation is supported by the evidence.
- **The V8 forward shadow** can keep measuring rule correctness, as evidence, not as a target.
- **No V14 filter-research project** is recommended.
