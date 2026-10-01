# V10_DAILY_LOSS_CONTROL

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Definition (research library)
- **Day:** the UTC calendar day. The day-start equity is the equity at the first decision or settlement of the day.
- **Limit reached:** once the realized daily loss ≥ limit % × day-start equity → DAILY_LOSS_LIMIT_REACHED.
- **Capacity check:** if the realized loss plus the next trade's planned (actual) risk would exceed the limit → DAILY_CAPACITY_INSUFFICIENT. The size is never increased to "use" the remaining capacity.
- **Reset:** trading resumes the next UTC day. The limit is a percentage of the day-start equity, never a fixed dollar amount.
- **States:**
  - NORMAL: trading allowed;
  - PROTECTED: the daily limit or the loss-streak pause is active, no new trade until the next UTC day;
  - HALTED: the weekly limit is active, no new trade until the next ISO week.
- **CAUTION was not introduced.** No size reduction after losses was pre-registered, and no control earned a place (smallest effective structure).

## Pre-registered stage 2
Not executed: it runs only at a SUPPORTED risk %, and none exists (V10_DEVELOPMENT_RESULTS). The tables below are **DESCRIPTIVE_ONLY_NOT_SELECTION**.
The stage-2 rule: DD reduced ≥ 10 % relative, and the blocked trades are not better than the taken trades by more than 0.05 R.

| Split | Risk % | Account | Control | Trades | Return | Max DD | DD change vs none | Blocked | Blocked mean R | Taken mean R | Stage-2 rule |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DEV | 0.25 % | 1000 | none | 128 | -4.0 % | 4.7 % | — | 0 | — | -0.267 | — |
| DEV | 0.25 % | 1000 | daily_1 | 128 | -4.0 % | 4.7 % | 0.0 % | 0 | — | -0.267 | fail |
| DEV | 0.25 % | 1000 | daily_2 | 128 | -4.0 % | 4.7 % | 0.0 % | 0 | — | -0.267 | fail |
| DEV | 0.25 % | 1000 | daily_3 | 128 | -4.0 % | 4.7 % | 0.0 % | 0 | — | -0.267 | fail |
| DEV | 0.25 % | 1000 | weekly_5 | 128 | -4.0 % | 4.7 % | 0.0 % | 0 | — | -0.267 | fail |
| DEV | 0.25 % | 5000 | none | 1155 | -17.7 % | 19.1 % | — | 0 | — | -0.129 | — |
| DEV | 0.25 % | 5000 | daily_1 | 1121 | -17.8 % | 19.3 % | 0.7 % | 127 | -0.262 | -0.137 | fail |
| DEV | 0.25 % | 5000 | daily_2 | 1155 | -17.7 % | 19.1 % | 0.0 % | 0 | — | -0.129 | fail |
| DEV | 0.25 % | 5000 | daily_3 | 1155 | -17.7 % | 19.1 % | 0.0 % | 0 | — | -0.129 | fail |
| DEV | 0.25 % | 5000 | weekly_5 | 1155 | -17.7 % | 19.1 % | 0.0 % | 0 | — | -0.129 | fail |
| DEV | 0.25 % | 10000 | none | 1154 | -12.5 % | 15.3 % | — | 0 | — | -0.078 | — |
| DEV | 0.25 % | 10000 | daily_1 | 1105 | -11.8 % | 14.6 % | -4.7 % | 186 | -0.102 | -0.079 | fail |
| DEV | 0.25 % | 10000 | daily_2 | 1154 | -12.5 % | 15.3 % | 0.0 % | 0 | — | -0.078 | fail |
| DEV | 0.25 % | 10000 | daily_3 | 1154 | -12.5 % | 15.3 % | 0.0 % | 0 | — | -0.078 | fail |
| DEV | 0.25 % | 10000 | weekly_5 | 1154 | -12.5 % | 15.3 % | 0.0 % | 0 | — | -0.078 | fail |
| DEV | 0.50 % | 1000 | none | 586 | -22.8 % | 24.6 % | — | 0 | — | -0.177 | — |
| DEV | 0.50 % | 1000 | daily_1 | 506 | -23.4 % | 24.0 % | -2.2 % | 155 | 0.124 | -0.208 | fail |
| DEV | 0.50 % | 1000 | daily_2 | 592 | -21.6 % | 23.4 % | -4.8 % | 16 | -0.223 | -0.165 | fail |
| DEV | 0.50 % | 1000 | daily_3 | 586 | -22.8 % | 24.6 % | 0.0 % | 0 | — | -0.177 | fail |
| DEV | 0.50 % | 1000 | weekly_5 | 575 | -22.7 % | 24.5 % | -0.2 % | 112 | -0.340 | -0.179 | fail |
| DEV | 0.50 % | 5000 | none | 1150 | -21.6 % | 26.7 % | — | 0 | — | -0.075 | — |
| DEV | 0.50 % | 5000 | daily_1 | 829 | -13.9 % | 17.7 % | -33.7 % | 1246 | 0.037 | -0.063 | fail |
| DEV | 0.50 % | 5000 | daily_2 | 1115 | -23.3 % | 28.9 % | 8.0 % | 161 | -0.032 | -0.087 | fail |
| DEV | 0.50 % | 5000 | daily_3 | 1149 | -23.0 % | 28.3 % | 6.0 % | 36 | 0.315 | -0.081 | fail |
| DEV | 0.50 % | 5000 | weekly_5 | 1138 | -22.6 % | 27.9 % | 4.4 % | 101 | -0.233 | -0.079 | fail |
| DEV | 0.50 % | 10000 | none | 1141 | -21.7 % | 28.4 % | — | 0 | — | -0.070 | — |
| DEV | 0.50 % | 10000 | daily_1 | 809 | -11.4 % | 16.7 % | -41.4 % | 1327 | -0.022 | -0.048 | pass |
| DEV | 0.50 % | 10000 | daily_2 | 1076 | -22.3 % | 29.4 % | 3.2 % | 315 | -0.029 | -0.076 | fail |
| DEV | 0.50 % | 10000 | daily_3 | 1134 | -20.6 % | 27.4 % | -3.7 % | 23 | -0.488 | -0.067 | fail |
| DEV | 0.50 % | 10000 | weekly_5 | 1117 | -23.0 % | 29.4 % | 3.5 % | 111 | -0.184 | -0.076 | fail |
| DEV | 1.00 % | 1000 | none | 958 | -47.5 % | 52.0 % | — | 0 | — | -0.134 | — |
| DEV | 1.00 % | 1000 | daily_1 | 535 | -6.7 % | 19.2 % | -63.1 % | 1751 | -0.132 | -0.037 | pass |
| DEV | 1.00 % | 1000 | daily_2 | 770 | -46.1 % | 50.2 % | -3.6 % | 521 | 0.123 | -0.152 | fail |
| DEV | 1.00 % | 1000 | daily_3 | 925 | -45.9 % | 53.0 % | 1.9 % | 196 | -0.113 | -0.128 | fail |
| DEV | 1.00 % | 1000 | weekly_5 | 876 | -36.4 % | 41.5 % | -20.2 % | 658 | -0.335 | -0.101 | pass |
| DEV | 1.00 % | 5000 | none | 1149 | -44.2 % | 52.0 % | — | 0 | — | -0.075 | — |
| DEV | 1.00 % | 5000 | daily_1 | 499 | -3.3 % | 15.3 % | -70.5 % | 2597 | -0.064 | -0.014 | pass |
| DEV | 1.00 % | 5000 | daily_2 | 809 | -21.7 % | 29.1 % | -44.0 % | 1318 | -0.019 | -0.043 | pass |
| DEV | 1.00 % | 5000 | daily_3 | 982 | -38.9 % | 49.3 % | -5.1 % | 630 | 0.077 | -0.080 | fail |
| DEV | 1.00 % | 5000 | weekly_5 | 979 | -28.2 % | 40.1 % | -22.9 % | 657 | -0.300 | -0.053 | pass |
| DEV | 1.00 % | 10000 | none | 1132 | -43.8 % | 53.0 % | — | 0 | — | -0.079 | — |
| DEV | 1.00 % | 10000 | daily_1 | 446 | -20.6 % | 28.0 % | -47.2 % | 2651 | -0.035 | -0.079 | pass |
| DEV | 1.00 % | 10000 | daily_2 | 782 | -28.4 % | 36.3 % | -31.6 % | 1414 | 0.012 | -0.065 | fail |
| DEV | 1.00 % | 10000 | daily_3 | 955 | -37.4 % | 50.0 % | -5.7 % | 705 | -0.035 | -0.075 | fail |
| DEV | 1.00 % | 10000 | weekly_5 | 962 | -30.0 % | 42.4 % | -20.2 % | 682 | -0.294 | -0.057 | pass |
| HOLD | 0.25 % | 1000 | none | 8 | -0.3 % | 0.5 % | — | 0 | — | -0.165 | — |
| HOLD | 0.25 % | 1000 | daily_1 | 8 | -0.3 % | 0.5 % | 0.0 % | 0 | — | -0.165 | fail |
| HOLD | 0.25 % | 1000 | daily_2 | 8 | -0.3 % | 0.5 % | 0.0 % | 0 | — | -0.165 | fail |
| HOLD | 0.25 % | 1000 | daily_3 | 8 | -0.3 % | 0.5 % | 0.0 % | 0 | — | -0.165 | fail |
| HOLD | 0.25 % | 1000 | weekly_5 | 8 | -0.3 % | 0.5 % | 0.0 % | 0 | — | -0.165 | fail |
| HOLD | 0.25 % | 5000 | none | 1372 | -14.3 % | 15.2 % | — | 0 | — | -0.078 | — |
| HOLD | 0.25 % | 5000 | daily_1 | 1321 | -15.7 % | 16.6 % | 9.2 % | 110 | 0.452 | -0.094 | fail |
| HOLD | 0.25 % | 5000 | daily_2 | 1372 | -14.3 % | 15.2 % | 0.0 % | 0 | — | -0.078 | fail |
| HOLD | 0.25 % | 5000 | daily_3 | 1372 | -14.3 % | 15.2 % | 0.0 % | 0 | — | -0.078 | fail |
| HOLD | 0.25 % | 5000 | weekly_5 | 1372 | -14.3 % | 15.2 % | 0.0 % | 0 | — | -0.078 | fail |
| HOLD | 0.25 % | 10000 | none | 1590 | -7.1 % | 8.3 % | — | 0 | — | -0.028 | — |
| HOLD | 0.25 % | 10000 | daily_1 | 1527 | -10.1 % | 11.3 % | 35.9 % | 225 | 0.118 | -0.037 | fail |
| HOLD | 0.25 % | 10000 | daily_2 | 1590 | -7.1 % | 8.3 % | 0.0 % | 0 | — | -0.028 | fail |
| HOLD | 0.25 % | 10000 | daily_3 | 1590 | -7.1 % | 8.3 % | 0.0 % | 0 | — | -0.028 | fail |
| HOLD | 0.25 % | 10000 | weekly_5 | 1590 | -7.1 % | 8.3 % | 0.0 % | 0 | — | -0.028 | fail |
| HOLD | 0.50 % | 1000 | none | 511 | -10.1 % | 18.0 % | — | 0 | — | -0.085 | — |
| HOLD | 0.50 % | 1000 | daily_1 | 437 | -10.2 % | 14.6 % | -18.7 % | 84 | 0.120 | -0.094 | fail |
| HOLD | 0.50 % | 1000 | daily_2 | 511 | -10.1 % | 18.0 % | 0.0 % | 0 | — | -0.085 | fail |
| HOLD | 0.50 % | 1000 | daily_3 | 511 | -10.1 % | 18.0 % | 0.0 % | 0 | — | -0.085 | fail |
| HOLD | 0.50 % | 1000 | weekly_5 | 511 | -10.1 % | 18.0 % | 0.0 % | 0 | — | -0.085 | fail |
| HOLD | 0.50 % | 5000 | none | 1589 | -14.1 % | 16.6 % | — | 0 | — | -0.023 | — |
| HOLD | 0.50 % | 5000 | daily_1 | 1102 | -12.9 % | 15.2 % | -8.4 % | 1632 | -0.067 | -0.034 | fail |
| HOLD | 0.50 % | 5000 | daily_2 | 1524 | -17.1 % | 19.7 % | 18.9 % | 228 | 0.206 | -0.035 | fail |
| HOLD | 0.50 % | 5000 | daily_3 | 1588 | -14.2 % | 16.7 % | 0.8 % | 1 | -1.445 | -0.022 | fail |
| HOLD | 0.50 % | 5000 | weekly_5 | 1543 | -13.3 % | 14.8 % | -10.5 % | 148 | -0.295 | -0.022 | pass |
| HOLD | 0.50 % | 10000 | none | 1541 | -11.2 % | 17.6 % | — | 0 | — | -0.020 | — |
| HOLD | 0.50 % | 10000 | daily_1 | 993 | -6.5 % | 14.7 % | -16.4 % | 2132 | -0.028 | -0.014 | pass |
| HOLD | 0.50 % | 10000 | daily_2 | 1436 | -15.7 % | 18.2 % | 3.3 % | 377 | 0.025 | -0.032 | fail |
| HOLD | 0.50 % | 10000 | daily_3 | 1532 | -13.0 % | 18.2 % | 3.5 % | 24 | 0.039 | -0.022 | fail |
| HOLD | 0.50 % | 10000 | weekly_5 | 1484 | -9.4 % | 14.3 % | -18.6 % | 177 | -0.275 | -0.012 | pass |
| HOLD | 1.00 % | 1000 | none | 1161 | -28.2 % | 31.6 % | — | 0 | — | -0.071 | — |
| HOLD | 1.00 % | 1000 | daily_1 | 517 | -20.0 % | 27.5 % | -12.9 % | 1495 | -0.078 | -0.102 | pass |
| HOLD | 1.00 % | 1000 | daily_2 | 888 | -31.3 % | 37.2 % | 17.8 % | 589 | 0.003 | -0.097 | fail |
| HOLD | 1.00 % | 1000 | daily_3 | 1049 | -35.3 % | 37.3 % | 18.1 % | 192 | 0.013 | -0.097 | fail |
| HOLD | 1.00 % | 1000 | weekly_5 | 1144 | -17.7 % | 24.7 % | -21.7 % | 369 | -0.244 | -0.047 | pass |
| HOLD | 1.00 % | 5000 | none | 1541 | -24.4 % | 33.2 % | — | 0 | — | -0.020 | — |
| HOLD | 1.00 % | 5000 | daily_1 | 581 | -12.2 % | 25.2 % | -24.1 % | 3955 | -0.054 | -0.024 | pass |
| HOLD | 1.00 % | 5000 | daily_2 | 1006 | -16.1 % | 27.0 % | -18.5 % | 2057 | -0.028 | -0.016 | pass |
| HOLD | 1.00 % | 5000 | daily_3 | 1310 | -23.3 % | 28.7 % | -13.5 % | 884 | 0.003 | -0.023 | pass |
| HOLD | 1.00 % | 5000 | weekly_5 | 1255 | -30.0 % | 33.6 % | 1.3 % | 1242 | 0.001 | -0.037 | fail |
| HOLD | 1.00 % | 10000 | none | 1522 | -20.7 % | 32.1 % | — | 0 | — | -0.018 | — |
| HOLD | 1.00 % | 10000 | daily_1 | 532 | -9.6 % | 27.8 % | -13.2 % | 4130 | -0.059 | -0.022 | pass |
| HOLD | 1.00 % | 10000 | daily_2 | 965 | -5.8 % | 22.4 % | -30.1 % | 2301 | -0.081 | -0.003 | pass |
| HOLD | 1.00 % | 10000 | daily_3 | 1229 | -17.5 % | 27.3 % | -15.0 % | 1130 | -0.004 | -0.020 | pass |
| HOLD | 1.00 % | 10000 | weekly_5 | 1210 | -30.7 % | 36.3 % | 13.1 % | 1312 | -0.006 | -0.043 | fail |

## Consistency across splits (stage-2 rule pass counts over 3 risk % × 3 accounts)
| Control | Pass on DEV | Pass on HOLD | Pass on both | DEV-only |
|---|---|---|---|---|
| daily_1 | 4 / 9 | 4 / 9 | 4 | 0 |
| daily_2 | 1 / 9 | 2 / 9 | 1 | 0 |
| daily_3 | 0 / 9 | 2 / 9 | 0 | 0 |
| weekly_5 | 3 / 9 | 3 / 9 | 1 | 2 |

## Conclusion
- **No daily or weekly limit is supported.** Stage 2 is defined only at a supported risk %, and there is none.
- **Descriptively:**
  - daily 1 % passes the stage-2 rule on BOTH splits only at 0.50 % / 10000, 1.00 % / 1000, 1.00 % / 5000, 1.00 % / 10000. Those risk levels fail the capital-safety gate themselves, and there it works mainly by cutting trades on a negative-expectancy stream (trades fall from 1522 to 532 at 1.00 % / 10,000 USD on HOLD).
  - At 0.25 % daily 1 % does not pass on either split; on HOLD at 10,000 USD it worsens the drawdown by 35.9 %.
  - Daily 2 % / 3 % pass on both splits at 1.00 % / 5000 / none; weekly 5 % at 1.00 % / 1000.
- **Future test:** daily 1 % and pause 3 (V10_CONSECUTIVE_LOSS_RESEARCH) are the candidates worth pre-registering, and only together with a risk % that is itself supported.
- **The mechanism is validated by tests:** limit reached, capacity insufficient, next-day reset.
