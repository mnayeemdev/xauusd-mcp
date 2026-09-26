# Research data intentionally excluded from Git

Checkpoint 2026-09-26. The research chain (Master Edge Validation, Strategy Improvement Lab, Strategy Redesign V2, V3 multi-year event study, V4 market-state study, V5 scheduled-news study) is committed as reproducible scripts, compact derived artifacts (event lists, results JSON, console logs, validation-pass artifacts) and docs. The following raw inputs are excluded because they are large broker price snapshots or fetched web pages that the committed scripts regenerate; results were NOT altered.

| Excluded path | Size | How to regenerate |
|---|---|---|
| validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json | 27 MB | `python validation/v3_multiyear_event_study/fetch_multiyear.py` (MT5 terminal logged in, read-only) |
| validation/strategy_improvement_lab/lab_dataset.json | 12 MB | `node validation/strategy_improvement_lab/lab_stage1.mjs` (derived from the master bars) |
| validation/master_edge_validation/xauusdm_bars_master.json | 5 MB | `python validation/master_edge_validation/fetch_bars_master.py` |
| validation/master_edge_validation/master_edge_results.json | 10 MB | `node validation/master_edge_validation/master_edge.mjs` (kept: see note) |
| validation/replay_audit_2026-09-25/xauusdm_bars_extended.json, xauusdm_bars_snapshot.json | 2 MB | `python validation/replay_audit_2026-09-25/fetch_bars_ext.py` |
| validation/v5_news_edge/xauusdm_m1_recent.json | 5 MB | `python validation/v5_news_edge/fetch_m1_recent.py` |
| validation/v5_news_edge/raw/*.htm, raw/*.pdf, raw/bea/, raw/bea_releases/, raw/fed_statements/ | 9 MB | re-fetch from the URLs recorded in docs/XAUUSD_V5_NEWS_DATA_INTEGRITY.md; the extracted facts are committed in raw/*.json and raw/bea_release_times.txt and in events_usd_official.json |

Note: master_edge_results.json (10 MB) IS committed because it is a result, not an input. Nothing under validation/ is imported by production. Broker price data are Exness XAUUSDm; production trades OANDA:XAUUSD (feed mismatch documented in each study).
