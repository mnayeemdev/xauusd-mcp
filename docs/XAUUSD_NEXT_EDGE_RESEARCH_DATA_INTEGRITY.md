# XAUUSD_NEXT_EDGE_RESEARCH_DATA_INTEGRITY — Stage 11B

Audit run 2026-09-26 (`validation/next_edge_session/data_integrity.mjs` → `data_integrity.json`) before any outcome was computed. Research only; production untouched.

| Series | Source | Bars | First → last (UTC) | Duplicates / non-monotonic / bad OHLC | Weekend daytime bars | Non-weekend gaps > 3 bars | Largest gaps | Previously inspected? |
|---|---|---|---|---|---|---|---|---|
| XAUUSDm 15m | Exness MT5 (V3 snapshot `validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json`) | 100,000 | 2022-07-04 15:45 → 2026-09-25 20:45 | 0 / 0 / 0 | 0 | 656 (daily 1-hour close break + holidays) | Christmas 2024/2025 (28.8 h), New Year (25.3 h), Thanksgiving (5 h) | **YES** — V3 (structure events), V5 (news), V2 protection replay |
| XAUUSDm 1D | Exness MT5 (V4 snapshot) | 3,909 | 2014-01-14 → 2026-09-25 | 0 / 0 / 0 | 617 Sunday-session bars (regular, kept) | 4 (Christmas/New Year 2016–17) | 96 h | YES — V4 |
| DXYm 15m (USD-index CFD) | Exness MT5, fetched read-only 2026-09-26 (`fetch_cross_asset.py`; Market Watch restored after the fetch) | 101,020 | 2022-09-05 00:00 → 2026-09-25 20:45 | 0 / 0 / 0 | 475 (the CFD trades some Sunday hours; excluded from events) | 7 | Christmas/New Year (24.3 h) | **NO** |
| XAGUSDm 15m (silver) | same | 101,207 | 2022-06-15 → 2026-09-25 | 0 / 0 / 0 | 0 | 664 (same breaks as gold) | 29 h Christmas | **NO** |
| USTECm 15m (Nasdaq CFD) | same | 100,536 | 2022-05-25 → 2026-09-25 | 0 / 0 / 0 | 0 | 676 | 29 h | **NO** |

**Alignment with gold timestamps** (share of cross-asset bars whose start time also exists as a gold bar over the common range): DXYm 94.9 % (the rest are DXY Sunday hours), XAGUSDm 100.0 %, USTECm 99.9 %. Cross-asset events are evaluated only on matched timestamps; no interpolation.

**Timezone / DST:** all bars are UTC. The gold daily close gap starts at 20:00 UTC in April–September and 21:00 UTC in October–March, i.e. the 17:00 New-York close under EDT/EST: broker clock verified against the US DST rule. Session clocks are derived with explicit rules (Europe/London: last Sunday of March → last Sunday of October at 01:00 UTC; America/New_York: `validation/v5_news_edge/et_time.mjs`), never from wall-clock assumptions.

**Bar completeness:** 15m bars are complete OHLC with tick volume; no forming bars are used (all analysis is on the historical snapshot). Prior-day levels come from completed daily bars.

**Spread / ticks:** no tick history on the terminal; spread known only from the 1m spread column since 2026-06-26 (median 0.24–0.26 USD). Cost panels use 0.26 USD base, 0.40 USD stress, 0.10 USD slippage, 1-bar delay; a 1.5 USD reopen-spread stress and the published long swap (−0.55 USD per night per 0.01 lot) are applied in the H21 diagnosis.

**Feed differences:** research on Exness XAUUSDm; production trades OANDA:XAUUSD through TradingView. Feeds are not mixed. Cross-asset CFDs (DXYm, USTECm) are broker instruments, not the ICE index or the cash Nasdaq.

**Regions:** DISCOVERY 2022-09-05 → 2024-06-30, VALIDATION 2024-07-01 → 2025-08-31, RESEARCH HOLDOUT 2025-09-01 → 2026-09-25 (reused data; never opened in this stage). PREVIOUSLY_INSPECTED_DATA = YES for all gold price outcomes; only the cross-asset conditioning series are new.
