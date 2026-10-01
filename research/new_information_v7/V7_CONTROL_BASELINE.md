# NEW INFORMATION V7 — CONTROL BASELINE (frozen 2026-10-01 ~07:20Z, before any V7 computation)

| Field | Value |
|---|---|
| git HEAD | 195ecc9da0afa78071c71d42b09992b196c74ff7 (master = nayeem/master) |
| Strategy fingerprint | 356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed (`npm run xauusd:fingerprint` ok:true) |
| Symbol / timeframe | XAUUSDm (Exness MT5), 5m decision candle |
| Entry rules (CONTROL) | production intraday_5m signals: 9,617 (DEV 4,098 / HOLD 5,519) with production geometry; secondary frozen stream V4 S3 (first structure break) regenerated verbatim |
| SL / RR / TP / exit (CONTROL) | structural SL − 0.25 ATR (min 0.5 ATR); objective TP2 ≥ 1.70 R capped 3 R; EXIT_F (broker 1.5 R + spread intrabar, thesis invalidation on close, TP touch, 288 bars); RR 1.70; no exit change; Capital Harvest OFF |
| Lot / scaling | 0.01 USER_FIXED; AUTO_SCALING OFF |
| Costs | NORMAL spread 0.24 + slippage 0.10 USD; STRESS 0.60 + 0.20; DRIFT next-open fill |
| Safety (unchanged, outside the replay) | News V2, spread ≤ 0.60, drift ≤ 2.00, breakers, identity lock, MARGIN_SAFETY_VETO, broker SL 1.5× |
| Split | DEV 2025-05-07 → 2025-12-31 (205 sessions); HOLDOUT 2026-01-01 → 2026-09-29 (232 sessions); HOLDOUT opened once after `configs/finalists.json` is hashed |
| CONTROL figures to reproduce exactly (V6) | HOLD n 1,163, −0.064 R, PF 0.93, DD 98.89 R, wrong-direction 29.7 % (trade-level) / 20.2 % (events), capture 26.6 %; DEV n 878, −0.055 R, wrong-direction 29.8 % / 18.5 %; S3 HOLD n 912, −0.034 R |
| Existing (V6) information set — NOT new | 5m/15m/30m/1H/4H regime, structure and bias labels; session/time; ATR percentile and range state; regime; momentum; range position; structural location; production sweeps and equal levels; scheduled-release windows; cross-TF agreement; XAUUSDm tick volume; shock (3-ATR bar, ATR ratio, abnormal XAUUSD spread) |
| NEW DATA available in this environment (captured read-only from the Exness MT5 server on the same broker clock, hashed) | XAGUSDm 5m (99,990 bars, 2025-05-02 → 2026-09-30) and 15m (2022-07 →); DXYm 5m (99,990 bars, 2025-05-27 → 2026-09-30) and 15m (2022-09 →); USTECm 15m (2022-06 →); each with open/high/low/close, tick volume, spread points. Official USD macro release timestamps (`validation/v5_news_edge/events_usd_official.json`, no release values). Live shadow-observer records (`state/shadow/observations.jsonl`, 756 records 2026-09-25 → 2026-10-01) carrying the LIVE-read XAGUSDm / DXYm / USTECm 15m close, 96-bar z-score and 15m return per 5m decision — used for live/replay parity only |
| NOT available (no fabrication) | exchange / futures volume (COMEX GC), order flow, bid/ask depth history, Treasury yields, release surprise values, news sentiment feeds, latency/slippage logs |
| Input hashes | `results/control_inputs.sha256` (38 lines: V2–V6 inputs/results/finalists/pre-registrations, the news-event file, the three cross-asset bar files) |

CONTROL entries, SL, RR, exit, lot, costs and safety are not altered during V7. V7 only adds information-time WAIT decisions from NEW data on top of frozen entries.
