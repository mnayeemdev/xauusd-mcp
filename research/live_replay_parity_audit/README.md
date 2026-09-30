# Live vs Replay Parity Audit — zero-trade root cause (research only, read-only)

Stage of 2026-09-30. Reconciles the REAL v9 watcher's live decisions (07:30–16:40Z, 110 candles) with a frozen-engine replay on MT5 bars, candle by candle and gate by gate, and reconciles the V2 "trades per session" metric with production semantics. Production was not modified; no trade was placed; RR 1.70 / lot 0.01 / AUTO_SCALING OFF / fingerprint 356e4189… unchanged.

## Result
PRIMARY: **A. VALID_STRATEGY_WAIT** (live 1 signal, replay 1 signal, 103/106 decision matches, the rest explained). Secondary: P1 data-acquisition reliability fault (4 of 110 candles lost to TradingView read stalls; fail-closed; no signal lost today; REPAIR_SPEC written, not applied); P2 V2 metric label mismatch (H2a sequential trades ≠ production semantics; production median 7 executed / 11 theses per full session, zero-day rate 0.3%); today at the 1st percentile of historical signal frequency (high-volatility, neutral-bias, post-news day).

## Layout
- `scripts/parity_audit.mjs` — builds LIVE/REPLAY ledgers and the diff, funnels, RR/quality/MTF/news counts, data parity, reliability. Args: `<mt5_bars.json> [tradingview_30m_bars.json]`. Window frozen at `PARITY_END_CANDLE` (default 16:35Z candle).
- `scripts/historical_reconciliation.mjs` — production-semantics per-session frequency from the Edge Lab replay (`handoff/edge_discovery_lab/data/`), zero-day distribution, today's percentiles and market-context comparison. Arg: `<parity_results.json>`.
- `tests/parity_integrity.test.js` — 11 integrity tests (`node --test research/live_replay_parity_audit/tests/`).
- `results/` — `parity_results.json`, `LIVE_LEDGER.csv`, `REPLAY_LEDGER.csv`, `LIVE_REPLAY_DIFF.csv`, `historical_reconciliation.json`, console captures, and the read-only TradingView 30m bar snapshot used for data parity.

Inputs not in git: production logs under `state/` (read-only), MT5 bars fetched read-only into the session scratchpad, Edge Lab data under `handoff/`. Reports and the single zip are under `handoff/LIVE_REPLAY_PARITY_AUDIT/` (gitignored).
