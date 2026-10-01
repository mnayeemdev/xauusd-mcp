# V10_REJECTED_PARAMETERS

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Risk percentages (pre-registered stage 1, DEV)
| Parameter | Status | Reason |
|---|---|---|
| risk 0.10 % | REJECTED | (f) ≥ 90 % sizeable |
| risk 0.25 % | REJECTED | (d) MC P(DD ≥ 20 %) ≤ 5 %; (f) ≥ 90 % sizeable; (b) historical DD ≤ 15 %; (c) severe DD ≤ 25 % |
| risk 0.50 % | REJECTED | (b) historical DD ≤ 15 %; (c) severe DD ≤ 25 %; (d) MC P(DD ≥ 20 %) ≤ 5 %; (f) ≥ 90 % sizeable |
| risk 0.75 % | REJECTED | (b) historical DD ≤ 15 %; (c) severe DD ≤ 25 %; (d) MC P(DD ≥ 20 %) ≤ 5 %; (f) ≥ 90 % sizeable |
| risk 1.00 % | REJECTED | (b) historical DD ≤ 15 %; (c) severe DD ≤ 25 %; (d) MC P(DD ≥ 20 %) ≤ 5 %; (f) ≥ 90 % sizeable |

## Controls (DESCRIPTIVE: no risk % was supported, so none could be selected)
| Parameter | Status | Evidence |
|---|---|---|
| daily_1 | NOT SUPPORTED | passes the stage-2 rule on DEV in 4/9 and on HOLD in 4/9 risk × account cells, both in 4/9 |
| daily_2 | NOT SUPPORTED | passes the stage-2 rule on DEV in 1/9 and on HOLD in 2/9 risk × account cells, both in 1/9 |
| daily_3 | NOT SUPPORTED | passes the stage-2 rule on DEV in 0/9 and on HOLD in 2/9 risk × account cells, both in 0/9 |
| pause_3 | NOT SUPPORTED | passes the stage-2 rule on DEV in 7/9 and on HOLD in 2/9 risk × account cells, both in 2/9 |
| pause_5 | NOT SUPPORTED | passes the stage-2 rule on DEV in 4/9 and on HOLD in 0/9 risk × account cells, both in 0/9 |
| weekly_5 | NOT SUPPORTED | passes the stage-2 rule on DEV in 3/9 and on HOLD in 3/9 risk × account cells, both in 1/9 |

## Margin caps
| Parameter | Status | Evidence |
|---|---|---|
| cap 10 % / 25 % / 50 % | NOT SELECTED | Stage 3 not executed (no supported risk %). Descriptively, 25 % and 50 % never bind; 10 % binds only at 1.00 % risk (≤ 0.20 % of trades). |

## Production assumptions examined (not changed; RESEARCH finding)
| Assumption | Status | Evidence |
|---|---|---|
| Fixed −50 USD maximum loss per trade (0.01 lot) as the risk definition | REJECTED as a risk model | It is a universal fixed-dollar assumption, and the % risk varies with account and SL. HOLD median 1.1 % at 1,000 USD vs 4.5 % at 250 USD. The monetary SL lies inside the structural SL on 0.78 % of HOLD signals. |
| Fixed 0.01 lot for every account size | REJECTED as capital-safe for small accounts | HOLD drawdown 88.4 % (250 USD), 82.1 % (500 USD), 51.4 % (1,000 USD); negative equity at 250 USD under MODERATE cost |
| Margin veto as risk permission | REJECTED | It allows trading down to ≈ 72.54 USD of equity, where one median loss is 15.6 % of equity |
| Worst-case loss without a swap allowance | REJECTED for any future spec | All NORMAL-cost overshoots (max ×1.13) are overnight BUY swap |

## Prohibited by design (not researched as options)
Martingale, recovery sizing, averaging down, profit-based escalation, AUTO_SCALING and moving the structural SL to fit a dollar amount.
