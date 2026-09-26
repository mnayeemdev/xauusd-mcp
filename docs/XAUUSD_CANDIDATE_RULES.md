# XAUUSD_CANDIDATE_RULES

Research register of every deterministic candidate rule tested in the Strategy Improvement Lab (2026-09-26). **None is implemented, deployed, or recommended for production.** Definitions are exact so that any future shadow build can reproduce them; region results use the chronological A (discovery, 64 sessions) / B (validation, 32) / C (final holdout, 33) split. CONTROL mean R by region: A +0.056, B −0.168, C +0.050.

| ID | Family | Exact deterministic definition (evaluated on the CONTROL signal at its confirmed close) | Concept changed | A Δmean / Δtotal R | B Δmean / Δtotal R | Pre-declared rule | C (after the fact) mean R | Status |
|---|---|---|---|---|---|---|---|---|
| SR-A | SR | reject SR when `structure.state` ≠ trade direction (5m structure opposes the trade) | counter-structure allowance | +0.028 / +18.8 | −0.002 / +0.9 | FAIL (B loss streak 11 > 9) | +0.049 | rejected |
| SR-B | SR | accept SR only when 5m structure = trade direction AND 15m bias = trade direction | alignment strength | +0.035 / +22.1 | −0.011 / −1.5 | FAIL | +0.061 | rejected |
| SR-C | SR | accept SR only when `structure.lastSweep` exists and is ≤ 3 bars old | sweep confirmation | +0.019 / +11.0 | +0.024 / +11.1 | FAIL (streak) | +0.067 | rejected |
| SR-D | SR | SR model disabled (benchmark only) | model removal | +0.042 / +24.7 | +0.007 / +7.0 | FAIL (streak); benchmark never selectable | +0.082 | benchmark |
| QUALITY-A | QUALITY | research score = quality − qEntryLocation; pass if ≥ threshold − 8 (shift calibrated on A to keep CONTROL's pass count) and not combiner-vetoed | drop inverted component | −0.008 / −5.7 | +0.001 / +0.5 | FAIL | +0.050 | rejected |
| QUALITY-B | QUALITY | research score = quality − max(0, qEntryLocation − 7.5); shift 2 | cap component | −0.014 / −10.2 | −0.010 / −2.9 | FAIL | +0.048 | rejected |
| QUALITY-C | QUALITY | research score = quality − qEntryLocation + 10.55; shift −2.5 | eligibility-neutral component | −0.008 / −5.7 | +0.001 / +0.5 | FAIL | +0.050 | rejected |
| QUALITY-D | QUALITY | research score = (qTrigger + qMtf + qSession) / 40 × 100; pass if ≥ 64 (calibrated on A) and not combiner-vetoed | reduced score | +0.002 / +0.8 | +0.022 / +8.5 | PASS | +0.056 | passed selection; holdout gain +0.006 R/trade (noise) |
| LAG-B | LAG | reject any signal when the 15m bias is directional AND `structure.state` (5m) opposes the bias direction (lag episode); never authorize the opposite side | block continuation during lag | +0.024 / +14.7 | +0.030 / +12.2 | FAIL (B streak 10) | +0.076 | rejected by rule; most consistent filter in sign |
| LAG-A | LAG | bias neutralized only when 15m `structure.state` opposes the 15m regime AND 5m regime trend agrees with 5m structure (Master variants A∧B) | strict neutralization | ≤ +0.009 total | none | not selected | — | rejected |
| EXIT-C | EXIT | broker fail-safe SL at 1.0 × structural distance + spread (monetary boundary, thesis and adaptive exits unchanged) | fail-safe geometry | +0.036 / +27.5 | +0.047 / +14.4 | FAIL (streak) | **−0.012**, loss streak 16 | rejected |
| EXIT-B | EXIT | fail-safe at 1.25 × structural + spread | fail-safe geometry | +0.012 / +9.1 | −0.001 / −0.8 | FAIL | +0.065 | rejected |
| EXIT-D | EXIT | once intrabar MFE ≥ 1 R, exit at entry ± 0.25 R | profit lock | −0.218 / −161.3 | −0.155 / −55.4 | FAIL | −0.159 | rejected (destroys winners) |
| PB-A | PB | reject PB when the 5m regime is BULL_TREND for a BUY or BEAR_TREND for a SELL | late continuation | +0.013 / +7.2 | +0.011 / +8.0 | PASS | +0.067 | passed selection; holdout +0.017 R/trade |
| PB-C | PB | PB disabled (benchmark only) | model removal | +0.014 / +2.5 | +0.042 / +21.5 | PASS but benchmark | +0.075 | benchmark |
| BO-A | BO | reject BO when `risk.sl_source` contains `min_risk` (stop widened to the 0.5-ATR floor) | no genuine structural stop | +0.012 / +7.2 | **−0.045 / −12.2** | FAIL | +0.092 | rejected (unstable) |
| MR-* | MR | no rule (stability study only) | — | — | — | — | — | MR_EDGE_STABLE = INCONCLUSIVE (positive in A/B/C, top-5 winners = 102 % of total) |
| MC-* | MC | no rule: no causal subfilter with adequate sample on discovery | — | — | — | — | — | none |

## Frozen combinations and holdout

| Combination | Members | C holdout n / mean R / PF / total R / max DD R / streak | vs CONTROL (n 351, +0.050, 1.11, +17.6, 31.1, 9) |
|---|---|---|---|
| COMBO-1 | QUALITY-D | 347 / +0.056 / 1.07 / +19.5 / 26.5 / 9 | +0.006 R per trade |
| COMBO-2 | QUALITY-D + PB-A | 326 / +0.063 / 1.11 / +20.7 / 25.2 / 8 | +0.013 R per trade, CI [−0.131, +0.258] |
| COMBO-3 | same as COMBO-2 (no third candidate passed) | same | same |

Robustness of COMBO-2 across all regions: mean +0.021 R, bootstrap CI [−0.069, +0.116], P(mean ≤ 0) = 33 %; regions B+C only −0.032 R, P(≤ 0) = 70 %; spread 0.40: −0.023 R; spread 0.40 + 0.15 slippage: −0.066 R.

## Verdict

SUPPORTED_CHANGES = none. No rule or combination demonstrates holdout edge; the strongest consistent filters (LAG-B, PB-A, SR removal) reduce losses by a few R per month without creating positive expectancy net of friction. All entries in this register remain research hypotheses. Any future use requires: re-test on sessions after 2026-09-25 with the same A/B/C discipline, OANDA-feed confirmation, and a separate user approval stage.
