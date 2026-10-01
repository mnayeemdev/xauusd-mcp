# INFORMATION EDGE V6 — PRE-REGISTRATION (frozen before any V6 outcome is inspected)

Written 2026-10-01 ~06:20Z. HEAD 80b426b. Fingerprint 356e4189…. Research only. CONTROL per V6_CONTROL_BASELINE.md.

## 1. Question
Can additional market context, available at the confirmed close, improve the DIRECTIONAL ACCURACY of the frozen entry streams and reduce the wrong-trade population before an entry is authorised — with better after-cost economics, not merely fewer trades? Not a frequency, win-rate or indicator-collection project; exits, RR, setups and triggers are frozen.

## 2. Architecture under test (research only)
MARKET CONTEXT → DIRECTIONAL BIAS → OPPORTUNITY ELIGIBILITY → SETUP → CONFIRMED TRIGGER → ENTRY LOCATION → TRADE GEOMETRY → RISK / MARGIN → NEWS / SPREAD / SAFETY → BUY / SELL / WAIT. The setup/trigger streams are the frozen CONTROL (production) and the frozen V4 S3 (first structure break) populations; V6 layers add only WAIT decisions. Nothing may force a direction.

## 3. Information-time rule (hard)
Every feature at decision candle t uses bars ≤ t, replay-row context recorded at the close of t, and macro release timestamps that were published in advance (official schedules). Forward movement labels research outcomes only. Controls: leak / null / first exit ≥ t + 1 / prefix invariance (feature at t unchanged when later bars are altered) / CONTROL reproduces V5 exactly.

## 4. Outcome labels (frozen)
Open path = structural stop only (EXIT_F semantics), no target, 288 bars. WRONG_DIRECTION trade = open-path MFE < 0.5 R and the structural stop (close or broker) is reached. BAD_ENTRY = open-path never reaches +1.0 R before invalidation. RIGHT_DIRECTION = open-path reaches ≥ +1.0 R. Event-level wrong direction = V1–V4 definition (signal opposite to an objective move event within ± 6 bars; events ≥ 3 ATR14 before 1 ATR adverse). Economics = control exit (production TP2 for CONTROL; 1.70 R for S3), sequential one-position with the production re-entry guard, NORMAL costs.

## 5. Information families and feature definitions (frozen; relative to the signal side where directional)
- **A HTF structure**: 30m structure (`m30s`), 1H structure (`h1s`), 15m structure (`b15s`), 15m bias (`b15d`); HTF_ALIGNED = 30m and 1H structure both agree with the side; HTF_CONFLICTING = both oppose; else HTF_MIXED (30m null counts as mixed). HTF trend regimes (`m30r`, `h1r`) reported separately (trend-with / trend-against / no-trend).
- **B Session / time**: session (`ses` ASIA / LONDON / NEW_YORK / OTHER), UTC hour from the bar time, OVERLAP = 13:00–15:59 UTC, SESSION_OPEN = first 60 min of ASIA (22:00), LONDON (07:00), NEW_YORK (12:00) UTC, US_DATA_WINDOW = 12:30–13:29 UTC.
- **C Volatility**: ATR14 percentile over 288 bars: LOW < 0.25, NORMAL 0.25–0.75, HIGH > 0.75; ATR ratio (`atrR`) ≥ 1.5 or any bar range ≥ 3 ATR in the last 3 bars = SHOCK; 12-vs-previous-12 range ratio < 0.7 = CONTRACTION, > 1.4 = EXPANSION, else STABLE.
- **D Regime**: production 5m regime (`rg5`) × side: TREND_WITH (BULL_TREND & BUY / BEAR_TREND & SELL), TREND_AGAINST, RANGE, TRANSITION, COMPRESSION, HIGH_VOLATILITY.
- **E Momentum**: mom6 = (close − close[−6]) / ATR, mom12, accel = mom6 − mom6[−3], run = consecutive closes on one side of EMA20. SUPPORTIVE = sign(mom6) = side and |mom6| ≥ 0.3; OPPOSING = sign(mom6) ≠ side and |mom6| ≥ 0.3; FLAT otherwise. EXHAUSTION = |mom12| ≥ 2.0 ATR in the side's direction with accel against it. PERSISTENT = run ≥ 6 in the side's direction.
- **F Range / compression**: 24-bar range width in ATR; position in the 24-bar range (0 = low, 1 = high): for BUY INSIDE_LOW < 0.3, MID 0.3–0.7, EDGE_HIGH > 0.7 (mirrored for SELL: EDGE = near the range low); COMPRESSION = 12-bar range ≤ 2.5 ATR; POST_BREAK = a close beyond the 36-bar range within the last 6 bars in the side's direction; POST_RECLAIM = a sweep in the side's favour within the last 6 bars.
- **G Structural location**: opposing-swing distance ratio = distance from entry to the last confirmed opposing 3/3 swing ÷ structural risk: GOOD ≥ 1.7, NEUTRAL 1.0–1.7, BAD < 1.0 (or no opposing swing within 6 ATR = GOOD); supporting-swing distance in ATR; risk / ATR; displacement from the 12-bar origin.
- **H Liquidity / sweep**: production sweep (`swT`, `swAge` ≤ 6): IN_FAVOUR (SWEEP_LOW & BUY / SWEEP_HIGH & SELL), AGAINST, NONE; equal highs/lows within 0.2 ATR among confirmed swings of the last 48 bars.
- **I News / macro**: official USD release timestamps (FOMC, CPI, NFP, GDP, PCE…; `events_usd_official.json`): PRE_NEWS = release within the next 60 min, POST_NEWS = release within the last 60 min, else NORMAL. Production News V2 remains authoritative and is not weakened.
- **J Cross-timeframe agreement**: directions of 5m structure (`st5`), 15m structure (`b15s`), 30m structure (`m30s`), 1H structure (`h1s`); agreement count with the side 0–4: FULL = 4, PARTIAL = 2–3, CONFLICT ≤ 1.
- **K Volume / activity**: MT5 tick volume (NOT exchange volume — the symbol is a CFD): relative volume = bar volume ÷ mean of the previous 48 bars: LOW < 0.7, NORMAL, HIGH > 1.5. Tested for independent value only.
- **L Shock state**: SHOCK if any bar range ≥ 3 ATR in the last 3 bars, or ATR ratio ≥ 1.5, or spread points ≥ the trailing-288 99th percentile; else NORMAL. Shock is a BLOCK/WAIT candidate only, never a trigger.

## 6. Family evaluation (DEV diagnosis; HOLD reporting)
For every family and population: per-state N, expectancy, PF, win rate, avg win/loss, WRONG_DIRECTION rate, BAD_ENTRY rate, MFE/MAE, DD, cost; CONTROL vs CONTROL + FAMILY where FAMILY acts as a WAIT filter. Two filter forms: (a) FIXED hypothesis rules (no DEV fitting): A-fixed = exclude HTF_CONFLICTING; J-fixed = require agreement ≥ 2; E-fixed = exclude OPPOSING momentum; G-fixed = exclude BAD location; L-fixed = exclude SHOCK; I-fixed = exclude PRE/POST news; (b) DEV-DERIVED state sets = the states with DEV N ≥ 150 whose DEV expectancy exceeds the population's and whose WRONG_DIRECTION rate is below the population's (none → family UNSUPPORTED). A family has INCREMENTAL VALUE on a split if the filtered population has expectancy ≥ +0.05 R above the unfiltered one AND a lower WRONG_DIRECTION rate AND N ≥ 200. Redundancy = pairwise phi coefficient between binary "supportive" flags (|phi| ≥ 0.5 = REDUNDANT).

## 7. Candidates (≤ 8; frozen; all on CONTROL entries, reported also on S3)
C1 V6-HTF = A-fixed. C2 V6-AGREE = J-fixed. C3 V6-MOM = E-fixed. C4 V6-LOC = G-fixed. C5 V6-SAFETY = L-fixed ∩ I-fixed. C6 V6-DIR (directional bias engine) = at least one of 30m/1H structure aligned and none opposing, momentum not OPPOSING, location not BAD; conflict → WAIT. C7 V6-SIMPLE = intersection of the ≤ 3 fixed rules with the largest DEV expectancy improvement among those with DEV incremental value (if none, V6-SIMPLE = the single best fixed rule). C8 V6-COMPOSITE = intersection of all DEV-derived state sets of DEV-supported families. Ablation: remove one component at a time from the best candidate.

## 8. Neighbourhoods (frozen)
momentum threshold 0.3 → 0.2 / 0.5; location ratio 1.7 → 1.5 / 2.0; agreement count 2 → 1 / 3; news window 60 → 30 / 90 min; shock bar range 3 → 2.5 / 3.5 ATR; ATR percentile bands 0.25/0.75 → 0.2/0.8 and 0.3/0.7; session windows ± 1 h. ROBUST = all neighbours positive; SENSITIVE / FRAGILE / NEGATIVE_CENTRE as before.

## 9. Success gate (§41; HOLDOUT, sequential, control exit, NORMAL costs, same population as its control)
(1) WRONG_DIRECTION rate (trade-level) < CONTROL's AND event-level wrong-direction share < CONTROL's; (2) BAD_ENTRY rate < CONTROL's; (3) expectancy > 0; (4) PF > 1.10; (5) expectancy ≥ CONTROL + 0.10 R and DD ≤ CONTROL; (6) N ≥ 200; (7) ≥ 60 % of quarters positive; (8) every threshold ROBUST; (9) no model × side × regime cell with N < 30 contributing > 30 % of net R; (10) STRESS expectancy > 0; (11) trade-bootstrap AND session-block 95 % CI lower bounds > 0; (12) move capture ≥ 50 % of CONTROL's (opportunity not destroyed); (13) live/replay compatible, deterministic, no safety degradation (by construction); DEV expectancy > 0. INFORMATION_INCREMENTAL_VALUE = YES if some family has incremental value on BOTH splits; INCONCLUSIVE if on one; NO otherwise. DIRECTIONAL_ACCURACY_IMPROVED = YES if the best candidate lowers both wrong-direction measures on HOLD by ≥ 3 percentage points with N ≥ 200; INCONCLUSIVE if one; NO otherwise. ENTRY_ECONOMICS_IMPROVED = YES if the best candidate's HOLD CI lower bound > CONTROL point estimate and expectancy > 0; INCONCLUSIVE if the point estimate is higher; NO otherwise. EDGE_DEMONSTRATED = YES only with a passing candidate; INCONCLUSIVE if some candidate has N ≥ 200, positive HOLD expectancy, lower wrong direction and a CI through zero; else NO. DEMO_ELIGIBLE = YES only with EDGE = YES. 99 % CIs reported.

## 10. Controls
Leak / null / cost 0.10 / first exit ≥ t + 1 / prefix invariance / CONTROL (n, expectancy, DD, capture) reproduces V5 and V4 exactly / S3 reproduces V4 / repeatability (DEV phase ≡ FULL phase on DEV).

## 11. Correction log
Kept in `results/CORRECTION_LOG.md` (this file stays frozen).
