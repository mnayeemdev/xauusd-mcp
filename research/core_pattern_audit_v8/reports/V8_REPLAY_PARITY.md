# V8_REPLAY_PARITY

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Comparison | Bars | Fields | Mismatches |
|---|---|---|---|
| Research replay (CONTROL) vs Edge Lab production-faithful replay (`lab_rows.jsonl`) | 99,381 (all DEV + HOLD) | action, wait reason, model, candidate side, quality, threshold, RR | 0 |
| Unchanged engine copy vs production engine | 99,381 | full row | 0 |
| Stage decomposition vs production model functions | 8,944,290 model checks (9 variants) | trigger present per model and side | 0 |
| LIVE-STYLE (production `calculateEntry`, injected bars, garbage forming bar) vs research replay | 2,245 (1656 = every bar 2026-09-22 → 29 + 600 seeded) incl. 266 signals | action, reason, model, entry, SL, TP1, TP2, RR | 0 |
| Live production records (TradingView OANDA feed) vs replay (Exness feed) — wait log | 205 logged decisions | action / reason | 6 action / 16 reason differences — feed, not code |
| Live production 5m signals vs replay | 11 in range | same side, same bar | 1 (replay WAIT 1, opposite 0) |

**REPLAY_PARITY = PASS** (code paths identical). Feed differences (OANDA vs Exness prices) explain the remaining live-record differences: 2026-09-21T11:45 live WAIT/insufficient/invalid market data / replay WAIT/NO_ELIGIBLE_STRATEGY; 2026-09-21T12:00 live WAIT/insufficient/invalid market data / replay WAIT/NO_ELIGIBLE_STRATEGY; 2026-09-21T12:15 live WAIT/insufficient/invalid market data / replay WAIT/RR_NOT_ACCEPTABLE; 2026-09-21T13:25 live WAIT/insufficient/invalid market data / replay WAIT/NO_ELIGIBLE_STRATEGY; 2026-09-22T14:10 live WAIT/insufficient/invalid market data / replay WAIT/NO_ELIGIBLE_STRATEGY; 2026-09-23T10:50 live WAIT/insufficient/invalid market data / replay SELL/null.
