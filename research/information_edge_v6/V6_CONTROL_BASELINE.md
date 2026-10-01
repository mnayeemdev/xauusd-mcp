# INFORMATION EDGE V6 — CONTROL BASELINE (frozen 2026-10-01 ~06:20Z, before any V6 computation)

| Field | Value |
|---|---|
| git HEAD | 80b426be1d1cf09a2548110d652a4927774790ca (master = nayeem/master) |
| Strategy fingerprint | 356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed (`npm run xauusd:fingerprint` ok:true) |
| Symbol / timeframe | XAUUSDm (Exness MT5), 5m decision candle; 15m / 30m / 1H / 4H context as recorded by the production engine at the confirmed 5m close (replay rows) |
| Data source | `handoff/edge_discovery_lab/data/XAUUSDm_bars.json` (99,990 5m bars incl. MT5 tick volume and spread points, 2025-05-05 → 2026-09-30); `lab_rows.jsonl` (99,381 in-range rows: 5m regime/structure, 15m bias/regime/structure/correction, 30m regime/structure, 1H regime/structure, 4H regime, session, sweep, structure event); `research/entry_architecture_v2/results/candidates.jsonl` (9,617 production signals with geometry); `validation/v5_news_edge/events_usd_official.json` (305 official USD macro release timestamps from primary sources, 107 inside the research range) |
| Date range / split | DEV 2025-05-07 → 2025-12-31 (205 sessions); HOLDOUT 2026-01-01 → 2026-09-29 (232 sessions); HOLDOUT opened once after `configs/finalists.json` is hashed |
| Entry rules (CONTROL) | production intraday_5m: MC > PB > BO > SR > MR, 15m bias eligibility, quality 65/70, minRR 1.70, overextension 2.5 ATR, fresh-CHoCH / 30m two-factor / 1H vetoes; one candidate per confirmed candle |
| SL / RR / exit (CONTROL) | structural SL − 0.25 ATR (min 0.5 ATR); objective TP2 ≥ 1.0 R capped 3 R with RR ≥ 1.70; EXIT_F (broker 1.5 R + spread intrabar, thesis invalidation on close, TP2 touch, 288 bars, SL before TP); swap −0.56 USD per BUY night. RR 1.70 CONTROL; no exit change in V6 |
| Lot / scaling | 0.01 USER_FIXED; AUTO_SCALING OFF |
| Costs | NORMAL spread 0.24 + slippage 0.10 USD; STRESS 0.60 + 0.20; DRIFT next-open fill |
| News / spread / drift / breaker / broker rules (unchanged, outside the replay) | News V2 tiers (A FOMC, B CPI/NFP, C others), spread ≤ 0.60, drift ≤ 2.00, breakers, identity lock, MARGIN_SAFETY_VETO, broker SL 1.5× structural |
| Secondary population (frozen research population, no entry-edge claim) | V4 S3 = first structure break (C1), regenerated verbatim from `research/entry_core_v4/configs/finalists.json`; control exit = structural stop + TP 1.70 R |
| CONTROL figures to reproduce exactly | HOLD n 1,163, −0.064 R, PF 0.93, DD 98.89 R, move capture 26.6 %, wrong direction (events) 20.2 %; DEV n 878, −0.055 R, PF 0.94, DD 81.16 R, capture 19.6 %; S3 HOLD n 912, −0.034 R |
| Input hashes | `results/control_inputs.sha256` (32 lines: V2–V5 inputs/results/finalists/pre-registrations + the news-event file) |

CONTROL entries, SL, RR, exit, lot, costs and safety are not altered during V6. V6 only adds information-time eligibility (WAIT) on top of frozen entries.
