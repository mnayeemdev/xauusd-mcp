# XAUUSD_V4_RESEARCH_PROTOCOL — pre-declared before any state result was computed

Written 2026-09-26, before `validation/v4_market_state_edge/v4_states.mjs` was run. Research only; production untouched. Nothing under `validation/v4_market_state_edge/` is imported by production.

## 1. Premise under test

Does XAUUSD exhibit measurable, repeatable market-state persistence (daily/weekly direction, volatility state) that provides directional or magnitude expectancy beyond the unconditional drift? This is not an entry study, not a strategy, not a capital study.

## 2. Data

- Source: Exness MT5 XAUUSDm daily bars, read-only (`validation/v4_market_state_edge/xauusdm_daily_bars.json`, copied from the V3 fetch), 3,909 bars, 2014-01-14 → 2026-09-25, stamped 00:00 UTC. Weekly periods are derived deterministically from daily bars (calendar week Sunday-session through Friday, completed only when its last bar has closed).
- Verified semantics: 302–312 bars per year (six bars per week including the short Sunday session; 2017 has 275 because Sunday bars are missing for part of the year), no gap longer than 4 days, average daily range 10–29 USD 2014–2024 and 53–110 USD in 2025–2026 (gold above 4,000), no zero-range bars except one in 2018. The 2014–2016 daily bars are genuine daily bars (the V3 caveat concerned hourly bars only).
- Feed mismatch with production (TradingView OANDA:XAUUSD) is stated; no feeds are merged. DST does not affect daily bars; the Sunday session bar is retained as a regular bar.

## 3. Chronological regions (whole years)

| Region | Period | Purpose |
|---|---|---|
| DISCOVERY | 2014-01-14 → 2020-12-31 | definitions are fixed here; no tuning |
| VALIDATION | 2021-01-01 → 2023-12-31 | pass/fail of discovery candidates |
| V4 RESEARCH HOLDOUT | 2024-01-01 → 2026-09-25 | chronological holdout for these hypotheses; NOT a pristine unseen sample (the same data was used by V3 for structural research); the only unseen proof after V4 is future data |

Broad-period stability panels (fixed): pre-2020 (2014–2019), 2020–2022, 2023+.

## 4. No lookahead

Every state at observation day t uses only bars ≤ t. Weekly states use only weeks whose last bar closed on or before day t. Rolling volatility quantiles use only the trailing 500 completed days. Forward measures start at the close of day t.

## 5. Unconditional baseline

At every daily close t (with ATR14 defined): forward close-to-close return at 1, 2, 3, 5, 10, 20 bars, in percent and in ATR14 units; positive probability; MFE and MAE (long convention and short convention) over each horizon; MFE/MAE; P(+0.5 ATR before −0.5 ATR) and P(+1 ATR before −1 ATR) in both conventions; time to MFE / MAE. Weekly baseline from Friday closes at 1, 2, 4 weeks. Reported per region and per year.

## 6. State definitions (single, fixed; not re-tuned after results)

Daily (evaluated at each daily close t; ATR = 14-day ATR at t):
- **D1 previous-day direction:** UP if C_t − C_{t−1} > +0.1 ATR; DOWN if < −0.1 ATR; else NEUTRAL.
- **D2 three-day direction:** UP if C_t − C_{t−3} > +0.3 ATR; DOWN if < −0.3 ATR; else FLAT.
- **D3 daily trend state:** UPTREND if C_t > SMA50_t and SMA50_t > SMA50_{t−10}; DOWNTREND if C_t < SMA50_t and SMA50_t < SMA50_{t−10}; else NO_TREND.

Weekly (evaluated at the last close of each completed week; weekly ATR = 8-week ATR of weekly bars):
- **W1 previous-week direction:** UP if weekly close change > +0.25 weekly ATR; DOWN if < −0.25; else NEUTRAL.
- **W2 two-week persistence:** ALIGNED_BULL if the last two completed weeks are both UP; ALIGNED_BEAR if both DOWN; else MIXED.
- **W3 weekly trend state:** UPTREND if weekly close > SMA20w and SMA20w > SMA20w_{−4}; DOWNTREND mirror; else NO_TREND.

Alignment (evaluated at each daily close using D3 and the latest completed week's W3): ALIGNED_BULL, ALIGNED_BEAR, CONFLICT_DAILY_UP_WEEKLY_DOWN, CONFLICT_DAILY_DOWN_WEEKLY_UP, NEUTRAL_OR_MIXED.

Volatility (daily, past-only): V = ATR14_t relative to the trailing 500-day distribution of ATR14: LOW if ≤ 33rd percentile, HIGH if ≥ 67th percentile, else NORMAL. Transition: ATR14_t vs ATR14_{t−5}: RISING if > 1.15×, FALLING if < 0.87×, else STABLE. Transition cells studied: LOW→RISING, NORMAL→RISING, HIGH→FALLING, LOW→STABLE, HIGH→STABLE. Magnitude targets: forward realized range (sum of true ranges over h) / ATR_t, forward |return| / ATR_t, ATR14 at t+h / ATR_t.

Direction × volatility matrix (fixed, 15 cells): alignment state (ALIGNED_BULL, ALIGNED_BEAR, CONFLICT any, NEUTRAL) × V (LOW, NORMAL, HIGH).

## 7. Excess, drift adjustment, uncertainty

- Directional excess in ATR units at horizon h = dir × (mean forward move of the state − mean forward move of the baseline in the same region), dir = +1 for bullish states, −1 for bearish states. Raw moves are reported alongside.
- Uncertainty: moving-block bootstrap over the state's chronologically ordered observations with block length max(3, 2h) observations, 1,000 resamples, for the state mean; the excess CI subtracts the fixed region baseline mean; P(excess ≤ 0) from the bootstrap. Overlapping horizons are flagged; the count of approximately independent trials N/h is reported next to N.
- Outlier panel: full mean, mean without the top 1 % absolute moves, winsorized 1/99 mean, median.
- Year-by-year: excess at the 10-day horizon (5-day for weekly states use the 2-week horizon) per calendar year, and share of positive years with n ≥ 20.

## 8. Promotion gate (fixed before results)

A directional state is promoted only if ALL hold:
1. discovery N ≥ 150 daily observations (≥ 40 weekly observations);
2. positive directional excess at ≥ 2 of the horizons {5, 10, 20} days (weekly: ≥ 2 of {1, 2, 4} weeks) in discovery, with the block-bootstrap 95 % CI of the excess excluding zero at ≥ 1 of them;
3. MFE/MAE in the state's direction ≥ 1.10 at the 10-day horizon in discovery;
4. validation: excess positive at the same ≥ 2 horizons;
5. V4 research holdout: excess positive at the same ≥ 2 horizons;
6. year-by-year: excess at 10 days positive in ≥ 60 % of years with n ≥ 20, and not more than 40 % of the total excess from any single year;
7. outlier: excess remains positive without the top 1 % and after winsorizing, and the state's median forward move exceeds the baseline median in the state's direction;
8. economic interpretation stated in one sentence and not contradicted by the data;
9. no dependence on a single arbitrary parameter: the state is defined by one fixed rule and no variant was tested.

A volatility state is promoted for magnitude prediction only if the forward realized-range ratio (state / baseline) differs from 1.0 by ≥ 15 % in the same direction in all three regions with the bootstrap CI excluding 1.0 in discovery and validation. Direction × volatility cells are promoted only if a directional state already passed and the cell's excess exceeds the parent state's excess in discovery, validation and holdout with N ≥ 60 per cell.

Bull/bear classification: SYMMETRIC_DIRECTIONAL_EFFECT if bullish and bearish states both pass; BULL_ONLY / BEAR_ONLY if one passes and survives drift adjustment in all regions; REGIME_DEPENDENT if signs flip across regions; NO_EFFECT otherwise.

No definition will be changed after results are seen. Any later variant would be a new, separately declared study.
