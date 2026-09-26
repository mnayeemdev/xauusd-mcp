# XAUUSD_V5_RESEARCH_PROTOCOL — pre-declared before any event-performance result was computed

Written 2026-09-26 after the Phase-0 data inventory and the timestamp-integrity checks, and before `validation/v5_news_edge/v5_news.mjs` was run. Offline research only. Production, the live News/Shock protection, the breaker, the lot (USER_FIXED 0.01) and the executor are untouched; nothing under `validation/v5_news_edge/` is imported by production. The owner capital mandate (USD 6,000,000 / 600,000,000 destinations) has no influence on any definition, gate or ranking below.

## 1. Question

Do scheduled high-impact USD macro releases create repeatable, out-of-sample conditional behaviour in XAUUSD beyond what normally happens at the same clock time on the same weekday? No news direction is assumed. Five effect types are distinguished: directional (Type 1), volatility/magnitude (Type 2), reversal (Type 3), continuation (Type 4), safety (Type 5).

## 2. Data (inventory result; provenance in `docs/XAUUSD_V5_NEWS_DATA_INTEGRITY.md`)

**Event timestamps (official primary sources only):**
- CPI, Employment Situation (NFP cluster), PPI: BLS archived news-release index (filename = release date) with the release time verified verbatim from archived release pages ("embargoed until 8:30 a.m. (ET)").
- JOLTS: same index; time verified verbatim ("For release 10:00 a.m. (ET)").
- FOMC statements: Federal Reserve calendar page; each statement page's printed "For release at 2:00 p.m. EDT/EST" line is used as the time; press-conference existence from the calendar links (all 38 statements since 2022 have one). The press-conference start (2:30 p.m. ET) is not printed on the archived pages and is used only to segment the post-statement path descriptively.
- PCE (Personal Income and Outlays) and GDP advance estimates: BEA news-release archive; each release page's printed "EMBARGOED UNTIL RELEASE AT h:mm a.m. EDT/EST, Weekday, Month d, yyyy" line. Releases whose page did not yield that line are excluded (16 pages, listed in the event file).
- Not available through any trustworthy accessible path and therefore **not analysed**: Retail Sales (Census archive not accessible for past years), ISM, ADP, jobless claims, Consumer Confidence, average hourly earnings / unemployment rate as separate series (they are inside the NFP cluster). **Consensus forecasts: not available from any trustworthy source in this environment** (Forex Factory publishes only the current week; FRED needs an API key; no local archive). Studies F, G, the surprise parts of I and J are therefore not performed.

**Price:** Exness MT5 XAUUSDm (V3 snapshot) 15m 2022-07-04 → 2026-09-25 (100,000 bars), 5m 2025-05-06 → 2026-09-25 (99,000 bars), plus 1m 2026-06-26 → 2026-09-25 with the broker spread column (90,000 bars, fetched read-only for this study). Production trades OANDA:XAUUSD on TradingView: FEED_MISMATCH = YES, no feeds merged. Historical ticks are not available on this terminal (0 ticks returned), so spread/executability can be described only from the 1m spread column since 2026-06-26.

**Overlap:** events with 15m coverage 2022-07-27 → 2026-09-16: CPI 50, NFP 50 (48 with a bar at release; two Good-Friday releases have no bar), PPI 50, JOLTS 43, FOMC 34, PCE 42, GDP advance 12. 4.1 years.

## 3. Time normalisation and integrity (done before this protocol was finalised)

- All ET times converted to UTC with an explicit US DST rule (second Sunday of March → first Sunday of November). The computed EDT/EST label agrees with the printed label on all 93 pages that print one (38 FOMC, 55 BEA): 0 mismatches. No event falls on a weekend.
- Broker timestamps are UTC (V3 verification; the last 1m bar of 2026-09-25 is stamped 20:57 UTC against the 21:00 UTC Friday close).
- Price-spike check on 15m bars (largest-range bar within ±2 h of the release): the release bar is the largest for CPI 70 %, NFP 69 %, JOLTS 56 %, PPI 52 %, FOMC 41 % (the 14:30 press-conference bars compete), PCE 41 %, GDP 42 %; the bar one hour earlier (a mis-zoned calendar would put the spike there) is the largest in **0 of 279** events; the bar one hour later (09:30 ET equity open) is the largest in 23. Median release-bar range vs the pre-release median: CPI 7.8×, NFP 6.7×, FOMC 4.6×, PPI 3.4×, PCE 2.6×, JOLTS 2.0×. TIMESTAMP_ALIGNMENT_VERIFIED = YES.

## 4. Chronological regions (whole months; same as the V3 15m regions because the price history is the same and is not pristine)

| Region | Event dates | Purpose |
|---|---|---|
| DISCOVERY | 2022-07-04 → 2024-06-30 | fixed definitions, candidate identification |
| VALIDATION | 2024-07-01 → 2025-08-31 | pass/fail for every candidate |
| V5 RESEARCH HOLDOUT | 2025-09-01 → 2026-09-25 | evaluated **only** for candidates that passed validation; a machine-written artifact `validation/v5_news_edge/validation_pass_<candidate>.json` must exist, the script refuses otherwise; no manual override |

Controls for validation events are restricted to dates before 2025-09-01. The 5m sub-study is restricted to 2025-05-06 → 2025-08-31 unless the holdout is opened. The 1m spread description uses only the spread column (no price returns) and is declared executability-only.

## 5. Event handling (fixed)

- One observation per release timestamp. Two listed releases at the same minute form one cluster observation labelled by the set (none occurred). NFP is itself a cluster (payrolls, unemployment rate, earnings, revisions) and is treated as one family.
- Any event with another listed event within ±240 min is CONTAMINATED: excluded from single-family inference, counted once (earliest) in the pooled cluster. Contamination by non-listed releases (retail sales, claims, ISM, ADP) cannot be flagged; weekday-matched controls carry the same unlisted releases where they are regular (claims every Thursday 08:30).
- Pooled family **USD_0830** = CPI + NFP + PPI + PCE + GDP advance releases at 08:30 ET (deduplicated). Used because single families have 22–24 discovery events, below the directional minimum.
- Events are ≥ 1 day apart; forward windows (≤ 240 min) never overlap between events. Event-level bootstrap is therefore used (no block needed).

## 6. Matched baseline (fixed)

For each event at ET clock time c on weekday w: controls = every day within ±42 calendar days that is the same weekday, is not the event day, has no listed event within ±240 min of clock time c on that day, and has a 15m bar at the same ET clock time (converted with the same DST rule). Minimum 4 controls, else the event is dropped from control-relative statistics. Each control is measured with its own volatility reference. Control-relative statistics use the paired difference or ratio (event vs the mean of its own controls); pooled control distributions are also reported.

## 7. Volatility reference and measures (fixed)

ATR_ref = mean 15m true range over the 96 bars ending 60 min before the release (the 24 h before the event, excluding the last hour so that pre-event compression is not in the reference). All moves and ranges are in ATR_ref units; USD is reported alongside.

Pre-event windows (15m): [−60, −30), [−30, −15), [−15, 0), and [−60, 0): realized range (sum of true ranges) and absolute net move. The [−15, −5) and [−5, 0) windows are measurable only on 5m data (2025-05-06 onward) and are reported in the 5m sub-study.

Post-event windows: [0, 15), [0, 30), [0, 60), [0, 120), [0, 240): signed move (close at window end − open of the release bar), absolute move, realized range, max range, MFE and MAE (long convention), P(positive). Release-bar displacement |close − open| and range (Study C; first 5m and first 1m only where those data exist).

Initial direction (Study D/E): sign of the first completed 15m bar (release bar close − open); fixed, not re-tuned. Continuation = move in the initial direction from the release-bar close over the next 15, 30 and 60 min (bars 1, 1–2, 1–4). Persistence at h = sign of the [0, h) move equals the initial direction. Full reversal within 60 (120) min = the [0, 60) ([0, 120)) close is on the opposite side of the release-bar open from the initial direction. Retracement = maximum adverse excursion against the initial direction during bars 1–4 divided by the release-bar displacement. Second leg = among full reversals within 60 min, P(the [0, 240) move is in the reversal direction). Time to peak = minutes to the largest absolute cumulative move within 240 min. Volatility normalisation = first post-release bar whose range is ≤ 1.5 × the control median range for the same slot; reported as minutes.

Study H (FOMC): statement-only window [0, 30), press-conference window [30, 90), full [0, 240); same measures. Study I: the NFP cluster is the NFP family. Studies F, G, J (surprise): not performed (no forecast data).

## 8. Statistics (fixed)

Per family × region × measure: N, mean, median, event-level bootstrap 95 % CI (2,000 resamples) of the mean and of the ratio to the matched control, P(effect ≤ control) from the bootstrap, MFE/MAE, continuation and reversal probabilities with Wilson 95 % intervals. Outlier panel for any candidate: mean without the single largest |value| event (2 % of a 50-event sample) and 5/95 winsorized mean. Year-by-year: 2022 H2, 2023, 2024 H1 (discovery) and 2024 H2, 2025 (validation) with n per year. Multiple testing: 8 families × 5 windows × 5 effect types = 200 discovery cells; ~10 spurious CI exclusions expected at 5 %. Single-region, single-window results are never treated as evidence; the gate below requires the same result in validation.

## 9. Minimum samples (fixed)

Directional, continuation, reversal claims: discovery N ≥ 30 and validation N ≥ 15 (only USD_0830 and possibly none of the single families can reach this; single families are INCONCLUSIVE by construction for these types). Volatility, pre-compression and safety claims: discovery N ≥ 15 and validation N ≥ 8 (FOMC can reach this).

## 10. Promotion gates (fixed)

- **Type 2 volatility:** [0, 60) realized-range ratio vs matched control ≥ 1.5 with the bootstrap CI excluding 1.0 in discovery and in validation; ratio > 1 in every year with ≥ 5 events.
- **Pre-compression (Study B):** [−60, 0) realized-range ratio ≤ 0.85 with CI excluding 1.0 in discovery and validation. Compression → expansion link: Spearman correlation between the pre ratio and the [0, 60) post ratio, same sign in discovery and validation with |ρ| ≥ 0.25 and a permutation p < 0.05 in discovery.
- **Type 4 continuation:** in discovery, P(continuation over 60 min > 0) ≥ 0.58 (Wilson lower bound > 0.50) and mean continuation ≥ +0.15 ATR_ref with CI excluding 0; in validation the same sign, P ≥ 0.55 and mean > 0; in both regions the event P exceeds the matched-control P (the control's own first-bar continuation) by ≥ 0.05; ≥ 60 % of years positive; outlier panels positive.
- **Type 3 reversal:** the mirror of Type 4 on the reversal direction: P(full reversal within 60 min) ≥ 0.55 (Wilson lower bound > 0.50) and mean 60-min move against the initial direction ≥ +0.15 ATR_ref with CI excluding 0 in discovery; same sign and P ≥ 0.52 in validation; exceeds control by ≥ 0.05; year and outlier checks as above.
- **Type 1 directional:** mean signed [0, 60) move with CI excluding 0 in discovery, same sign with CI excluding 0 in validation, P(sign) ≥ 0.58 in both, year and outlier checks.
- **Type 5 safety:** release-bar range ratio ≥ 3 vs control in discovery and validation, or (1m, descriptive) spread at the release minute ≥ 2 × control. A safety finding is reported as protection information only, never as a trading edge.
- A candidate that fails validation stops; the holdout is not opened for it. No parameter (confirmation bar, window, threshold) is changed after results.

Classification per family: NO_EFFECT / VOLATILITY_ONLY / SAFETY_ONLY / REGIME_DEPENDENT (sign flips between regions or years) / CANDIDATE (passes discovery and validation; holdout then evaluated) / INCONCLUSIVE (N below §9).
