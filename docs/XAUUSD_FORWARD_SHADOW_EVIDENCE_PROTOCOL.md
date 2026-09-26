# XAUUSD_FORWARD_SHADOW_EVIDENCE_PROTOCOL — Stage 11C (pre-declared before any forward outcome existed)

Written 2026-09-26 from HEAD a715ae6 (News Protection V2 active, REAL watcher v8, lot USER_FIXED 0.01, scaling OFF). The forward shadow system is OBSERVATION ONLY: it records what was known at an exact time and what happened afterwards. It has no execution authority, no path to an order, and no influence on production entries, quality, risk, the breaker or News Protection V2.

## 1. Why prospective evidence

Every retrospective programme so far has re-used the same broker history: the 5m 2026 sessions (Master Edge Validation, Improvement Lab, Redesign V2), the 15m/1H history 2022–2026 (V3 structural events, V5 scheduled news, the V2 protection replay, Stage 11B session and cross-asset study) and the daily history 2014–2026 (V4). Each found either no directional edge or an effect that failed its validation partition, and each inspection consumed a little more of the data's independence. No remaining partition of that history can be called unseen. The only evidence that is genuinely independent from here on is time-forward: observations timestamped when they occur, labelled only after their horizon elapses, with their provenance fixed at creation. This stage builds that collection so future decisions can ask: what information was known at that exact time, which candidate condition existed, what did the production engine decide, and what happened afterwards.

## 2. Record classes (explicitly distinct)

| Class | Record type | What it is | Never |
|---|---|---|---|
| A. Production signal | `PRODUCTION_SIGNAL` (candidate `SC2_PRODUCTION_SIGNAL_v1`) | a genuine BUY/SELL the unchanged engine produced, with its geometry and the executor's decision (EXECUTED / SKIPPED:<reason> / UNKNOWN), read from production's own files | modified, re-scored, or re-decided by the observer |
| B. Shadow candidate | `CANDIDATE_TRIGGER` (candidate `SC1_SILVER_LEAD_v1`) | a frozen research condition evaluated on completed data with a hypothesis side | a signal; it cannot reach the executor, block or permit an entry, or change risk |
| C. Market/context observation | `CANDLE_5M` | every completed XAUUSDm 5m bar with 15m/30m/1H context, ATR/realized-vol, spread and feed age, cross-asset snapshots, the production engine snapshot for that bar, and the news/shock/safety state | forward-filled: missing data is recorded as unavailable |
| D. Safety observation | `NEWS_V2_EVENT` plus the `news` block of every candle | production's own news/shock/protection transitions (tier, cluster anchor, clock minimum, block reasons, normalization shadow, last_block_cleared_at) mirrored read-only | a news direction |
| E. Outcome label | `outcome` records | future metrics per pre-declared horizon, linked by observation_id, written only after the horizon elapsed | a modification of the observation |

## 3. Data contract (schema `shadow-1.0`, `src/shadow/schema.js`)

Envelope: schema_version, record (observation|outcome), observation_id (sha256 of version|type|candidate|symbol|timeframe|bar_time), type, candidate_id/version, provenance, source, created_at_utc, decision_time_utc (the candle close or event time; nothing newer is known to the record), symbol/feed/timeframe, bar_time and bar_close_time (unix seconds, broker UTC clock), session (UTC date/hour/weekday). CANDLE_5M payload: market {bar OHLCV, atr14_5m, atr14_15m, rv20_5m, last 15m/30m/1H closes, spread_usd, feed_age_sec, feed_state FRESH|STALE|UNKNOWN}, cross_asset {DXYm, XAGUSDm, USTECm: available flag, bar_time, bar_close_time (≤ decision time, validated), close, 15m return, z-score vs trailing 96 bars} or {available:false, reason}, production {available, action BUY|SELL|WAIT, wait_reason, model, quality, rr, signal_id, regime_5m, structure_5m, structure_event_5m, session, volatility_state, direction_bias, htf_alignment, pre_entry_state, blocked_by per timeframe, observed_at, source file mtimes} or {available:false}, news {computed_from_snapshot: state, event (name, tier, time, clock_min_end, cluster_anchor, press_conference if the provider supplied the row), next_event, block_ends; production_reported: news_state, tier, shock_state, block_reasons, blocking, last_block_cleared_at, spread_ratio, feed_stale, normalization_shadow}. Outcome payload: horizon, horizon_end_time, last_bar_time_used (≤ horizon end), labeled_at (≥ horizon end, validated), status LABELED|INCOMPLETE_PATH, ref_price, end_close, move (USD, ATR), side-signed move, MFE/MAE, first touch ±0.5 ATR, geometry {touch TP1|SL|BOTH_SAME_BAR|NONE, r_multiple} for production signals.

Provenance vocabulary (closed): FORWARD_LIVE (created by the live observer ≤ 15 min after the decision time, enforced by the validator), BACKFILL (created later, ≤ 24 h), HISTORICAL_REPLAY, TEST. **Only FORWARD_LIVE counts toward any forward gate.** A candidate definition change is a new candidate id/version; the committed hash registry (`src/shadow/candidates.frozen.json`) is verified at every observer start and by tests.

## 4. Anti-lookahead guarantees (tested in `tests/shadow_observer.test.js`)

Only bars whose close ≤ decision time are used for any snapshot or trigger; the forming candle is structurally excluded; cross-asset bars newer than the decision time are rejected by the validator; stale feeds are recorded as STALE and cannot produce FORWARD_LIVE records outside the freshness window; outcomes return null before the horizon end and use only bars inside (decision, horizon end]; duplicate observation/outcome ids are rejected and the index is rebuilt from disk at restart; replay/backfill records carry their provenance and are excluded from forward statistics.

## 5. Storage

Append-only JSONL under `state/shadow/` (gitignored): `observations.jsonl`, `outcomes.jsonl`, `observer_status.json`, `observer.log`, `observer.lock`. One line per record, never rewritten; a partial trailing line after a crash is skipped and counted, never repaired. Export/snapshot: `node src/shadow/report.js --export <path>` writes a self-contained JSON snapshot (observations + outcomes + report) for research checkpoints. Only schema, code, tests, frozen definitions and documentation are committed.

## 6. Runtime architecture

```
PRODUCTION WATCHER (v8, unchanged)  ──writes──►  state/xauusd_wait_opportunity_log.jsonl, validation/mcp_engine_signals.json,
        │                                        state/xauusd_mt5_real_trade_log.jsonl, state/xauusd_news_calendar_snapshot.json
        └── REAL bridge (unchanged)                          │ read-only
                                                             ▼
SHADOW OBSERVER (separate process, node src/shadow/observer.js)
        ├── read-only MT5 reader (separate python process, mt5/mt5_shadow_reader.py: rates/tick/select/ping/quit only)
        ├── builds observations, evaluates frozen triggers, labels outcomes after horizons
        └── writes only under state/shadow/
```
There is no SHADOW → MT5 ORDER path: the observer imports nothing from the engine, watcher, executor, policy or bridge (static test), the reader protocol is a closed read-only command list (test), the python reader contains no trading function (test), and no production module imports src/shadow (test). Production output cannot depend on the observer because the dependency is one-directional and the observer only reads files production already writes. The observer does not touch the TradingView chart (the watcher's data path) at all.

## 7. Forward validation gates (pre-declared; `src/shadow/report.js` FORWARD_GATES)

| Requirement | SC1_SILVER_LEAD_v1 | SC2_PRODUCTION_SIGNAL_v1 |
|---|---|---|
| minimum FORWARD_LIVE observations with the primary horizon labeled | 150 | 100 |
| minimum independent sessions (UTC days) | 60 | 60 |
| minimum elapsed calendar period | 120 days | 120 days |
| maximum missing/incomplete-outcome share | 10 % | 10 % |
| primary horizon | h8 (2 h, 15m bars) | h24 (2 h, 5m bars) + geometry (TP1 vs SL within 48 bars) |
| effect | side-signed move in ATR units, bootstrap 95 % CI lower bound > 0 | same, plus geometry expectancy (R) > 0 |
| path | P(+0.5 ATR before −0.5 ATR) ≥ 0.53 | — |
| cost | mean USD move net of 0.26 USD > 0 | net of 0.26 USD > 0 (executed trades also carry the real fill) |
| top-winner dependence | mean without the top 5 winners > 0 | same |
| stability | ≥ 60 % of months (≥ 10 labeled) positive, ≥ 4 months | same |

Statuses (no automatic production state exists): COLLECTING (< 20 labeled primary outcomes), INSUFFICIENT_FORWARD_EVIDENCE (labeled but below the minimums), PROMISING_UNPROVEN (minimums met, positive mean, CI includes zero), FAILED_FORWARD_GATE (minimums met and negative or CI upper bound ≤ 0), ELIGIBLE_FOR_INDEPENDENT_VALIDATION (all requirements met). Eligibility only makes a candidate eligible for a separate, owner-approved validation stage on further forward data; it never authorises trading, sizing or any production change.

## 8. News Protection V2 forward safety evidence

Every production news/shock/protection transition is mirrored as a NEWS_V2_EVENT with its protection fields (tier, clock_min_end_utc, cluster_anchor_utc, block_reasons, normalization_shadow, last_block_cleared_at); every candle carries the calendar-derived state (including press_conference_utc when the provider supplied the row) and production's last reported state; every PRODUCTION_SIGNAL carries its execution status and block reason, so the first fresh signal after a clearance is identifiable (signal created_at vs last_block_cleared_at). This complements, and does not replace, the Stage 11 monitoring workflow.

## 9. Capital

Nothing here changes EDGE_DEMONSTRATED = NO or CAPITAL_SCALING_READY = NO. The owner destinations (USD 6 M, then 600 M) do not lower any threshold above.
