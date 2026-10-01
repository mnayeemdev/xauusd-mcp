# V8_CORE_PIPELINE_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Stage | Input | Output | Rule (file) | Failure mode found | Test coverage | Verdict |
|---|---|---|---|---|---|---|
| 5m OHLCV | TradingView bars (live) / Exness bars (replay) | 499 confirmed bars | last bar = forming, stripped (`validateAndSplit`) | none: forming bar never used (garbage forming bar on 2245 bars changed nothing) | live-path parity, fixture test | OK |
| Candle structure | confirmed bars | body/wick/close location, progressing closes | SR `rejectionAt`, MC closes, sweeps | none (symmetric; see V8_CANDLE_AUDIT) | SR / MC tests | OK |
| Pattern detection (structure) | bars | pivots, BOS/CHoCH, last event, sweep, range | `structure.js` | **D1** event chronology, **D2** sweep recency, C6 range comment | D1/D2 fixtures | DEFECT → corrected |
| Regime / context | 5m/15m/30m/1H bars | regimes, 15m bias, eligible models | `regime.js`, `bias.js` | none in the mapping; context lag documented (V8_CONTEXT_LAG_AUDIT) | eligibility tests | OK |
| Model eligibility | bias | eligible model set | `eligibleModelsFor` | 0 eligibility errors (mapping = documentation) | mapping test + per-bar trace | OK |
| Setup | model context | setup present | per model | **D3** PB depth measured at the current close | PB fixtures | DEFECT → corrected |
| Trigger | setup | candidate (model, side, anchor, slAnchor, origin) | per model | **D2** (MR/SR use a stale sweep) | sweep fixture, stage parity on 993,810 model checks | DEFECT → corrected |
| Location | candidate | overextension gate | `risk5m.js` 2.5 ATR | **D4** MR entry on the wrong side of its own target | MR fixtures | DEFECT → corrected |
| Structural invalidation | slAnchor | SL | `risk5m.js` | none (buffer 0.25 ATR, floor 0.5 ATR, wrong-side fallback 1.5 ATR) | SL tests | OK |
| RR = 1.70 | SL, objectives | TP1, TP2, RR | `risk5m.js` | **D5** gate on the rounded RR; C1 TP2 vs fixed 1.70 R | RR tests | DEFECT → corrected |
| Safety gates | decision | WAIT/BUY/SELL | quality, CHoCH, 30m, 1H vetoes; live: news, spread, drift, margin | none in replay scope; **D6** stale 15m/30m snapshot not fail-closed (orchestrator) | veto tests, D6 live-path test | DEFECT → corrected |
| Final decision | all | BUY / SELL / WAIT + reason | `combineIntraday`, `calculateEntry` | replay = Edge Lab on 99,381 bars; live orchestrator = replay on 2245 bars | parity tests | OK |
