# V10_POSITION_SIZING

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Sizing chain (research library `scripts/risk.mjs`, pure)
1. **Equity:** account equity at the decision (see V10_TOTAL_EXPOSURE for the definition).
2. **Maximum cash risk** = equity × approved risk %.
3. **Worst-case loss per 1.0 lot** = (1.5 × |entry − structural SL| + spread + slippage allowance) × contract size.
   - 1.5 × structural is the hard broker fail-safe distance; the thesis exit is a confirmed close beyond the structural SL.
4. **Raw lots** = cash risk ÷ worst-case loss per lot.
5. **Rounding:** DOWN to the broker volume step (0.01), capped at the broker maximum (200).
6. **Below the minimum:** if the lot is < the broker minimum (0.01), REJECT (RISK_BELOW_MIN_LOT). Never round up.
7. **Actual risk** = lots × worst-case loss per lot, recalculated after rounding; asserted ≤ the approved cash risk.
8. **Margin check:** see V10_MARGIN_PROTECTION.
9. **Account controls:** daily, streak and weekly; see their reports.
10. **Outcome:** ACCEPT or REJECT with a reason. The structural SL is an input and is never moved.

## Risk table (HOLD prices: entry 4507.08; SL = median and 90th-percentile HOLD structural distance; NORMAL spread 0.24 + allowance 0.10; margin cap 50 %)
| Equity | Risk % | Max risk $ | SL case | SL distance $ | Worst loss / 0.01 lot $ | Calculated size | Rounded size | Actual risk $ | Actual risk % | Margin $ | Remaining margin $ | Margin level after loss | Eligibility |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 0.10 % | 0.10 | SL_p50 | 7.34 | 11.35 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 100.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 11.35 %) |
| 100 | 0.10 % | 0.10 | SL_p90 | 17.97 | 27.30 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 100.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 27.30 %) |
| 100 | 0.25 % | 0.25 | SL_p50 | 7.34 | 11.35 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 100.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 11.35 %) |
| 100 | 0.25 % | 0.25 | SL_p90 | 17.97 | 27.30 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 100.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 27.30 %) |
| 100 | 0.50 % | 0.50 | SL_p50 | 7.34 | 11.35 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 100.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 11.35 %) |
| 100 | 0.50 % | 0.50 | SL_p90 | 17.97 | 27.30 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 100.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 27.30 %) |
| 100 | 0.75 % | 0.75 | SL_p50 | 7.34 | 11.35 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 100.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 11.35 %) |
| 100 | 0.75 % | 0.75 | SL_p90 | 17.97 | 27.30 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 100.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 27.30 %) |
| 100 | 1.00 % | 1.00 | SL_p50 | 7.34 | 11.35 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 100.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 11.35 %) |
| 100 | 1.00 % | 1.00 | SL_p90 | 17.97 | 27.30 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 100.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 27.30 %) |
| 250 | 0.10 % | 0.25 | SL_p50 | 7.34 | 11.35 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 250.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 4.54 %) |
| 250 | 0.10 % | 0.25 | SL_p90 | 17.97 | 27.30 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 250.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 10.92 %) |
| 250 | 0.25 % | 0.63 | SL_p50 | 7.34 | 11.35 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 250.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 4.54 %) |
| 250 | 0.25 % | 0.63 | SL_p90 | 17.97 | 27.30 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 250.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 10.92 %) |
| 250 | 0.50 % | 1.25 | SL_p50 | 7.34 | 11.35 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 250.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 4.54 %) |
| 250 | 0.50 % | 1.25 | SL_p90 | 17.97 | 27.30 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 250.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 10.92 %) |
| 250 | 0.75 % | 1.88 | SL_p50 | 7.34 | 11.35 | 0.002 | 0.00 | 0.00 | 0.000 % | 0.00 | 250.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 4.54 %) |
| 250 | 0.75 % | 1.88 | SL_p90 | 17.97 | 27.30 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 250.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 10.92 %) |
| 250 | 1.00 % | 2.50 | SL_p50 | 7.34 | 11.35 | 0.002 | 0.00 | 0.00 | 0.000 % | 0.00 | 250.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 4.54 %) |
| 250 | 1.00 % | 2.50 | SL_p90 | 17.97 | 27.30 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 250.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 10.92 %) |
| 500 | 0.10 % | 0.50 | SL_p50 | 7.34 | 11.35 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 500.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 2.27 %) |
| 500 | 0.10 % | 0.50 | SL_p90 | 17.97 | 27.30 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 500.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 5.46 %) |
| 500 | 0.25 % | 1.25 | SL_p50 | 7.34 | 11.35 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 500.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 2.27 %) |
| 500 | 0.25 % | 1.25 | SL_p90 | 17.97 | 27.30 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 500.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 5.46 %) |
| 500 | 0.50 % | 2.50 | SL_p50 | 7.34 | 11.35 | 0.002 | 0.00 | 0.00 | 0.000 % | 0.00 | 500.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 2.27 %) |
| 500 | 0.50 % | 2.50 | SL_p90 | 17.97 | 27.30 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 500.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 5.46 %) |
| 500 | 0.75 % | 3.75 | SL_p50 | 7.34 | 11.35 | 0.003 | 0.00 | 0.00 | 0.000 % | 0.00 | 500.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 2.27 %) |
| 500 | 0.75 % | 3.75 | SL_p90 | 17.97 | 27.30 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 500.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 5.46 %) |
| 500 | 1.00 % | 5.00 | SL_p50 | 7.34 | 11.35 | 0.004 | 0.00 | 0.00 | 0.000 % | 0.00 | 500.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 2.27 %) |
| 500 | 1.00 % | 5.00 | SL_p90 | 17.97 | 27.30 | 0.002 | 0.00 | 0.00 | 0.000 % | 0.00 | 500.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 5.46 %) |
| 1000 | 0.10 % | 1.00 | SL_p50 | 7.34 | 11.35 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 1000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 1.14 %) |
| 1000 | 0.10 % | 1.00 | SL_p90 | 17.97 | 27.30 | 0.000 | 0.00 | 0.00 | 0.000 % | 0.00 | 1000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 2.73 %) |
| 1000 | 0.25 % | 2.50 | SL_p50 | 7.34 | 11.35 | 0.002 | 0.00 | 0.00 | 0.000 % | 0.00 | 1000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 1.14 %) |
| 1000 | 0.25 % | 2.50 | SL_p90 | 17.97 | 27.30 | 0.001 | 0.00 | 0.00 | 0.000 % | 0.00 | 1000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 2.73 %) |
| 1000 | 0.50 % | 5.00 | SL_p50 | 7.34 | 11.35 | 0.004 | 0.00 | 0.00 | 0.000 % | 0.00 | 1000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 1.14 %) |
| 1000 | 0.50 % | 5.00 | SL_p90 | 17.97 | 27.30 | 0.002 | 0.00 | 0.00 | 0.000 % | 0.00 | 1000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 2.73 %) |
| 1000 | 0.75 % | 7.50 | SL_p50 | 7.34 | 11.35 | 0.007 | 0.00 | 0.00 | 0.000 % | 0.00 | 1000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 1.14 %) |
| 1000 | 0.75 % | 7.50 | SL_p90 | 17.97 | 27.30 | 0.003 | 0.00 | 0.00 | 0.000 % | 0.00 | 1000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 2.73 %) |
| 1000 | 1.00 % | 10.00 | SL_p50 | 7.34 | 11.35 | 0.009 | 0.00 | 0.00 | 0.000 % | 0.00 | 1000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 1.14 %) |
| 1000 | 1.00 % | 10.00 | SL_p90 | 17.97 | 27.30 | 0.004 | 0.00 | 0.00 | 0.000 % | 0.00 | 1000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 2.73 %) |
| 5000 | 0.10 % | 5.00 | SL_p50 | 7.34 | 11.35 | 0.004 | 0.00 | 0.00 | 0.000 % | 0.00 | 5000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 0.23 %) |
| 5000 | 0.10 % | 5.00 | SL_p90 | 17.97 | 27.30 | 0.002 | 0.00 | 0.00 | 0.000 % | 0.00 | 5000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 0.55 %) |
| 5000 | 0.25 % | 12.50 | SL_p50 | 7.34 | 11.35 | 0.011 | 0.01 | 11.35 | 0.230 % | 22.54 | 4977.46 | 22137 % | ELIGIBLE |
| 5000 | 0.25 % | 12.50 | SL_p90 | 17.97 | 27.30 | 0.005 | 0.00 | 0.00 | 0.000 % | 0.00 | 5000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 0.55 %) |
| 5000 | 0.50 % | 25.00 | SL_p50 | 7.34 | 11.35 | 0.022 | 0.02 | 22.70 | 0.450 % | 45.07 | 4954.93 | 11043 % | ELIGIBLE |
| 5000 | 0.50 % | 25.00 | SL_p90 | 17.97 | 27.30 | 0.009 | 0.00 | 0.00 | 0.000 % | 0.00 | 5000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 0.55 %) |
| 5000 | 0.75 % | 37.50 | SL_p50 | 7.34 | 11.35 | 0.033 | 0.03 | 34.05 | 0.680 % | 67.61 | 4932.39 | 7345 % | ELIGIBLE |
| 5000 | 0.75 % | 37.50 | SL_p90 | 17.97 | 27.30 | 0.014 | 0.01 | 27.30 | 0.550 % | 22.54 | 4977.46 | 22066 % | ELIGIBLE |
| 5000 | 1.00 % | 50.00 | SL_p50 | 7.34 | 11.35 | 0.044 | 0.04 | 45.40 | 0.910 % | 90.14 | 4909.86 | 5496 % | ELIGIBLE |
| 5000 | 1.00 % | 50.00 | SL_p90 | 17.97 | 27.30 | 0.018 | 0.01 | 27.30 | 0.550 % | 22.54 | 4977.46 | 22066 % | ELIGIBLE |
| 10000 | 0.10 % | 10.00 | SL_p50 | 7.34 | 11.35 | 0.009 | 0.00 | 0.00 | 0.000 % | 0.00 | 10000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 0.11 %) |
| 10000 | 0.10 % | 10.00 | SL_p90 | 17.97 | 27.30 | 0.004 | 0.00 | 0.00 | 0.000 % | 0.00 | 10000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 0.27 %) |
| 10000 | 0.25 % | 25.00 | SL_p50 | 7.34 | 11.35 | 0.022 | 0.02 | 22.70 | 0.230 % | 45.07 | 9954.93 | 22137 % | ELIGIBLE |
| 10000 | 0.25 % | 25.00 | SL_p90 | 17.97 | 27.30 | 0.009 | 0.00 | 0.00 | 0.000 % | 0.00 | 10000.00 | — | REJECT RISK_BELOW_MIN_LOT (0.01 lot = 0.27 %) |
| 10000 | 0.50 % | 50.00 | SL_p50 | 7.34 | 11.35 | 0.044 | 0.04 | 45.40 | 0.450 % | 90.14 | 9909.86 | 11043 % | ELIGIBLE |
| 10000 | 0.50 % | 50.00 | SL_p90 | 17.97 | 27.30 | 0.018 | 0.01 | 27.30 | 0.270 % | 22.54 | 9977.46 | 44254 % | ELIGIBLE |
| 10000 | 0.75 % | 75.00 | SL_p50 | 7.34 | 11.35 | 0.066 | 0.06 | 68.10 | 0.680 % | 135.21 | 9864.79 | 7345 % | ELIGIBLE |
| 10000 | 0.75 % | 75.00 | SL_p90 | 17.97 | 27.30 | 0.028 | 0.02 | 54.59 | 0.550 % | 45.07 | 9954.93 | 22066 % | ELIGIBLE |
| 10000 | 1.00 % | 100.00 | SL_p50 | 7.34 | 11.35 | 0.088 | 0.08 | 90.80 | 0.910 % | 180.28 | 9819.72 | 5496 % | ELIGIBLE |
| 10000 | 1.00 % | 100.00 | SL_p90 | 17.97 | 27.30 | 0.037 | 0.03 | 81.89 | 0.820 % | 67.61 | 9932.39 | 14670 % | ELIGIBLE |

## Minimum equity for one 0.01 lot (worst-case loss of 0.01 lot ÷ risk %)
| Risk % | DEV SL p50 | DEV SL p90 | DEV SL p99 | HOLD SL p50 | HOLD SL p90 | HOLD SL p99 |
|---|---|---|---|---|---|---|
| 0.10 % | 7465.00 | 16150.00 | 30610.00 | 11350.00 | 27295.00 | 68440.00 |
| 0.25 % | 2986.00 | 6460.00 | 12244.00 | 4540.00 | 10918.00 | 27376.00 |
| 0.50 % | 1493.00 | 3230.00 | 6122.00 | 2270.00 | 5459.00 | 13688.00 |
| 0.75 % | 995.33 | 2153.33 | 4081.33 | 1513.33 | 3639.33 | 9125.33 |
| 1.00 % | 746.50 | 1615.00 | 3061.00 | 1135.00 | 2729.50 | 6844.00 |

## Notes
- **Rounding is always down,** so the actual risk is always ≤ the approved risk. Across 5,000 random property cases the lot was always a step multiple and never above the approved risk; every PCT replay trade in every scenario also passed (V10_REPLAY_RESULTS).
- **Margin availability is not risk permission:** leverage never enters the size (test "more leverage never increases the size").
- Dynamic sizing is RESEARCH_ONLY. Production remains LOT = 0.01 and AUTO_SCALING = OFF.
