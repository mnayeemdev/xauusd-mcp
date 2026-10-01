# V8_CONTEXT_LAG_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

Test: on WAIT bars where a 5m model's own trigger is present (bias-agnostic, stage 3) and the would-be trade passes risk, RR, quality 65 and the cross-timeframe vetoes with an aligned bias, record when the pattern was valid, the real context, the blocker and whether the 15m bias aligned within 6 bars (episodes collapse repeats of the same side/model within 3 bars). Outcomes are descriptive only; **no context rule is changed by V8.**

## DEV — CONTROL: 867 episodes
| BLOCKED_BY | Episodes | Bias aligned within 6 bars | Descriptive mean R (EXIT_F, normal cost) | Wrong-direction | Models |
|---|---|---|---|---|---|
| 15m BEARISH bias opposes BUY | 109 | 2 | -0.284 | 33.0 % | BO 68, PB 21, MC 16, SR 4 |
| priority: other side selected | 44 | 0 | -0.002 | 22.7 % | MR 16, PB 16, SR 8, MC 3, BO 1 |
| 15m NEUTRAL bias : model not eligible | 612 | 77 | -0.101 | 29.6 % | PB 391, MC 174, SR 47 |
| 15m BULLISH bias opposes SELL | 102 | 1 | -0.218 | 35.3 % | BO 46, PB 44, MC 10, SR 2 |

## DEV — ALL: 1024 episodes
| BLOCKED_BY | Episodes | Bias aligned within 6 bars | Descriptive mean R (EXIT_F, normal cost) | Wrong-direction | Models |
|---|---|---|---|---|---|
| 15m BEARISH bias opposes BUY | 128 | 2 | -0.324 | 38.3 % | BO 68, PB 38, MC 16, SR 6 |
| priority: other side selected | 45 | 1 | 0.188 | 15.6 % | PB 19, MR 16, SR 6, MC 2, BO 2 |
| 15m NEUTRAL bias : model not eligible | 737 | 96 | -0.089 | 29.0 % | PB 488, MC 198, SR 51 |
| 15m BULLISH bias opposes SELL | 114 | 1 | 0.060 | 33.3 % | PB 51, BO 48, MC 11, SR 4 |

## HOLD — CONTROL: 1219 episodes
| BLOCKED_BY | Episodes | Bias aligned within 6 bars | Descriptive mean R (EXIT_F, normal cost) | Wrong-direction | Models |
|---|---|---|---|---|---|
| 15m NEUTRAL bias : model not eligible | 857 | 88 | -0.061 | 33.1 % | PB 561, MC 206, SR 90 |
| 15m BULLISH bias opposes SELL | 148 | 5 | 0.557 | 20.3 % | BO 77, PB 51, MC 13, SR 7 |
| 15m BEARISH bias opposes BUY | 158 | 3 | 0.085 | 24.7 % | BO 89, PB 40, SR 16, MC 13 |
| priority: other side selected | 54 | 1 | -0.018 | 20.4 % | MR 24, PB 17, SR 11, MC 2 |
| 15m CHOP | 2 | 1 | -1.399 | 0.0 % | BO 1, PB 1 |

## HOLD — ALL: 1453 episodes
| BLOCKED_BY | Episodes | Bias aligned within 6 bars | Descriptive mean R (EXIT_F, normal cost) | Wrong-direction | Models |
|---|---|---|---|---|---|
| priority: other side selected | 53 | 2 | 0.312 | 30.2 % | PB 19, MR 16, SR 15, MC 3 |
| 15m NEUTRAL bias : model not eligible | 1034 | 112 | -0.113 | 31.6 % | PB 704, MC 241, SR 89 |
| 15m BULLISH bias opposes SELL | 166 | 2 | 0.290 | 22.3 % | BO 79, PB 65, MC 13, SR 9 |
| 15m BEARISH bias opposes BUY | 199 | 5 | -0.066 | 30.7 % | BO 90, PB 73, SR 22, MC 14 |
| 15m CHOP | 1 | 0 | -1.733 | 0.0 % | PB 1 |

## Examples (CONTROL, HOLD)
| PATTERN_VALID_AT | Side | Model | CONTEXT_STATE_AT | BLOCKED_BY | WOULD_HAVE_BEEN_VALID | Bias aligned ≤ 6 bars | R |
|---|---|---|---|---|---|---|---|
| 2026-01-02T09:40 | BUY | PB | 15m NEUTRAL/COMPRESSION, 5m BULL_TREND, 30m BULL_TREND, 1H TRANSITION | 15m NEUTRAL bias (COMPRESSION): PB not eligible | YES | NO | 2.145 |
| 2026-01-02T10:20 | BUY | PB | 15m NEUTRAL/COMPRESSION, 5m COMPRESSION, 30m BULL_TREND, 1H TRANSITION | 15m NEUTRAL bias (COMPRESSION): PB not eligible | YES | NO | 1.77 |
| 2026-01-02T13:45 | SELL | PB | 15m BULLISH/BULL_TREND, 5m HIGH_VOLATILITY, 30m COMPRESSION, 1H BULL_TREND | 15m BULLISH bias opposes SELL | YES | NO | 2.972 |
| 2026-01-02T19:50 | BUY | PB | 15m BEARISH/BEAR_TREND, 5m COMPRESSION, 30m BEAR_TREND, 1H BEAR_TREND | 15m BEARISH bias opposes BUY | YES | NO | -1.212 |
| 2026-01-05T13:00 | SELL | BO | 15m BULLISH/BULL_TREND, 5m BEAR_TREND, 30m COMPRESSION, 1H BULL_TREND | 15m BULLISH bias opposes SELL | YES | NO | -1.588 |
| 2026-01-05T13:25 | SELL | BO | 15m BULLISH/BULL_TREND, 5m BEAR_TREND, 30m COMPRESSION, 1H BULL_TREND | 15m BULLISH bias opposes SELL | YES | NO | -1.155 |
| 2026-01-05T13:30 | SELL | MC | 15m NEUTRAL/TRANSITION, 5m BEAR_TREND, 30m COMPRESSION, 1H BULL_TREND | 15m NEUTRAL bias (TRANSITION): MC not eligible | YES | NO | -1.156 |
| 2026-01-05T19:40 | BUY | PB | 15m NEUTRAL/COMPRESSION, 5m COMPRESSION, 30m BULL_TREND, 1H BULL_TREND | 15m NEUTRAL bias (COMPRESSION): PB not eligible | YES | NO | -1.58 |
| 2026-01-05T20:20 | BUY | PB | 15m NEUTRAL/COMPRESSION, 5m COMPRESSION, 30m BULL_TREND, 1H COMPRESSION | 15m NEUTRAL bias (COMPRESSION): PB not eligible | YES | NO | -1.58 |
| 2026-01-05T21:20 | BUY | PB | 15m NEUTRAL/COMPRESSION, 5m COMPRESSION, 30m BULL_TREND, 1H COMPRESSION | 15m NEUTRAL bias (COMPRESSION): PB not eligible | YES | NO | 1.574 |
| 2026-01-06T01:35 | SELL | PB | 15m NEUTRAL/COMPRESSION, 5m BEAR_TREND, 30m COMPRESSION, 1H COMPRESSION | 15m NEUTRAL bias (COMPRESSION): PB not eligible | YES | NO | -1.273 |
| 2026-01-06T02:00 | BUY | MC | 15m NEUTRAL/COMPRESSION, 5m TRANSITION, 30m COMPRESSION, 1H COMPRESSION | 15m NEUTRAL bias (COMPRESSION): MC not eligible | YES | NO | 1.975 |
| 2026-01-06T03:15 | BUY | MC | 15m NEUTRAL/RANGE, 5m BULL_TREND, 30m COMPRESSION, 1H COMPRESSION | 15m NEUTRAL bias (RANGE): MC not eligible | YES | NO | -1.059 |
| 2026-01-06T08:05 | SELL | PB | 15m NEUTRAL/COMPRESSION, 5m COMPRESSION, 30m COMPRESSION, 1H COMPRESSION | 15m NEUTRAL bias (COMPRESSION): PB not eligible | YES | NO | -1.199 |
| 2026-01-06T08:40 | BUY | PB | 15m NEUTRAL/COMPRESSION, 5m TRANSITION, 30m TRANSITION, 1H COMPRESSION | 15m NEUTRAL bias (COMPRESSION): PB not eligible | YES | NO | -1.668 |
| 2026-01-06T09:20 | SELL | MC | 15m NEUTRAL/COMPRESSION, 5m TRANSITION, 30m RANGE, 1H COMPRESSION | 15m NEUTRAL bias (COMPRESSION): MC not eligible | YES | NO | -1.042 |
| 2026-01-06T11:00 | SELL | PB | 15m NEUTRAL/TRANSITION, 5m BEAR_TREND, 30m COMPRESSION, 1H COMPRESSION | 15m NEUTRAL bias (TRANSITION): PB not eligible | YES | NO | -1.565 |
| 2026-01-06T13:50 | BUY | MR | 15m NEUTRAL/RANGE, 5m TRANSITION, 30m COMPRESSION, 1H COMPRESSION | priority: BO SELL selected | YES | NO | 2.369 |
| 2026-01-06T18:45 | SELL | PB | 15m BULLISH/BULL_TREND, 5m COMPRESSION, 30m TRANSITION, 1H BULL_TREND | 15m BULLISH bias opposes SELL | YES | NO | -1.081 |
| 2026-01-06T19:25 | SELL | PB | 15m NEUTRAL/RANGE, 5m TRANSITION, 30m TRANSITION, 1H BULL_TREND | priority: MR BUY selected | YES | NO | -1.496 |
| 2026-01-06T19:30 | BUY | MR | 15m NEUTRAL/RANGE, 5m TRANSITION, 30m RANGE, 1H BULL_TREND | priority: BO SELL selected | YES | NO | 1.996 |
| 2026-01-06T20:15 | BUY | PB | 15m NEUTRAL/RANGE, 5m RANGE, 30m RANGE, 1H BULL_TREND | 15m NEUTRAL bias (RANGE): PB not eligible | YES | NO | -1.158 |
| 2026-01-06T20:50 | SELL | SR | 15m NEUTRAL/COMPRESSION, 5m TRANSITION, 30m RANGE, 1H BULL_TREND | 15m NEUTRAL bias (COMPRESSION): SR not eligible | YES | NO | -1.64 |
| 2026-01-07T00:15 | SELL | PB | 15m BULLISH/BULL_TREND, 5m COMPRESSION, 30m TRANSITION, 1H BULL_TREND | 15m BULLISH bias opposes SELL | YES | NO | 2.948 |
| 2026-01-07T01:00 | SELL | PB | 15m NEUTRAL/RANGE, 5m TRANSITION, 30m COMPRESSION, 1H BULL_TREND | 15m NEUTRAL bias (RANGE): PB not eligible | YES | NO | -1.682 |

Reading: the 15m bias rarely aligns within 6 bars of a blocked 5m pattern, and the sign of the descriptive outcome of blocked trades flips between DEV and HOLDOUT (DEV: every blocker negative; HOLD: opposing-bias SELLs positive). This is not stable evidence that the context gate is wrong. **CONTEXT_LAG_ERRORS = 0** (lag documented, not a defect).
