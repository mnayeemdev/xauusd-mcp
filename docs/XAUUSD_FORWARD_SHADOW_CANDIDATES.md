# XAUUSD_FORWARD_SHADOW_CANDIDATES — frozen shadow candidate definitions (Stage 11C)

Frozen 2026-09-26 before prospective collection began. Code of record: `src/shadow/candidates.js`; hashes: `src/shadow/candidates.frozen.json` (verified at every observer start and by tests). A change to any field of an existing id is refused; a change is a NEW id/version (e.g. `_v2`) with its own frozen hash, and old records keep their original candidate_version. All candidates are MEASURE_ONLY: no BUY/SELL authority, no quality input, no blocking/permitting of production entries, no risk change.

## SC1_SILVER_LEAD_v1 (hash e5216ec3…05c0)

| Field | Frozen value |
|---|---|
| Hypothesis | a large 15m decline in silver (XAGUSDm) is followed by a decline in gold over the next 1–4 h; SELL side only (Stage 11B discovery near-miss D2:SELL: +0.20 ATR at 2 h, all years positive, first-touch 50 % < gate; the BUY side showed nothing) |
| Data source | Exness MT5 XAGUSDm 15m completed bars, same broker clock as XAUUSDm; read-only |
| Trigger | z ≤ −1.5 where z = log close-to-close return of the completed 15m bar closing exactly at the decision time, standardised by the mean/σ of the previous 96 returns |
| Side interpretation | SELL (hypothesis only; recorded, never acted on) |
| Timeframe | 15m; evaluated on the 5m cycle whose close is a 15m boundary |
| Minimum data freshness | the silver bar must close exactly at the decision time and the gold bar must be complete; nothing newer is used; both must be ≤ decision time |
| Duplicate suppression | observation_id = hash(schema, CANDIDATE_TRIGGER, SC1_SILVER_LEAD_v1, XAUUSDm, 15m, bar_time): one trigger per 15m bar |
| Invalid/missing data | no silver bars, stale silver (last close < decision − 900 s), or < 97 bars ⇒ no trigger; the candle record shows cross_asset.XAGUSDm.available=false |
| Observation frequency | every completed 15m bar |
| Outcome horizons | h4 (1 h), h8 (2 h, primary), h16 (4 h) in 15m bars, from the gold close at the decision time; MFE/MAE, first touch ±0.5 ATR14(15m) |
| Cost assumptions | spread 0.26 USD round trip (stress 0.40), slippage 0.10 USD |
| Success / failure metrics | side-signed move in ATR and USD, P(win), P(+0.5 before −0.5), net of cost, mean without top 5, monthly stability; forward gate in the protocol §7 |

## SC2_PRODUCTION_SIGNAL_v1 (hash 4414f814…6afd)

| Field | Frozen value |
|---|---|
| Hypothesis | production intraday_5m BUY/SELL signals have positive forward expectancy at their own geometry (TP1 before SL) and at fixed horizons; blocked signals are measured identically so each block reason can be audited |
| Data source | production signal store `validation/mcp_engine_signals.json` (read-only) and the REAL executor audit log (read-only) for EXECUTED / SKIPPED:<reason> / UNKNOWN; outcome bars XAUUSDm 5m via the read-only MT5 reader |
| Trigger | a new signal_id in the signal store (side, signal_bar_time, entry, stop_loss, tp1, tp2, rr, quality, model) |
| Side interpretation | as signalled by production (recorded, never re-decided) |
| Timeframe | 5m |
| Minimum data freshness | FORWARD_LIVE only if observed ≤ 15 min after the signal's created_at; older signals at observer start are not observed (they are historical) |
| Duplicate suppression | one observation per signal_id (observation_id from the signal bar time) |
| Invalid/missing data | executor status UNKNOWN when the audit log has no record for the signal (never guessed); no fill is fabricated: the engine entry price is the reference, executed trades additionally carry the real fill from the audit |
| Observation frequency | as signals occur |
| Outcome horizons | h12 (1 h), h24 (2 h, primary), h48 (4 h) in 5m bars from the engine entry; geometry: first touch of tp1 vs stop_loss within 48 bars, R = reward/risk on TP1, −1 on SL, mark-to-market R at 48 bars otherwise, BOTH_SAME_BAR recorded as undecidable |
| Cost assumptions | spread 0.26 USD round trip |
| Success / failure metrics | expectancy R, P(TP1 first), excess move at h12/h24/h48, split by executed vs block reason and by model, mean without top 5, monthly stability; forward gate in the protocol §7 |

## Not included (and why)

- USD-index (DXYm) and Nasdaq (USTECm) lead-lag: Stage 11B found no lag effect (h8 excess ≈ 0 on 4.9 k / 4.2 k events); they are recorded as context in every candle (z-scores) but carry no hypothesis.
- Economic surprise: no trustworthy consensus-forecast source exists in this environment; omitted rather than sourced unreliably.
- Session/opening-range/reference-level families: failed 11B discovery; not measured prospectively.

## Versioning rule

`verifyFrozenRegistry()` compares the in-code definitions with the frozen hashes; any mismatch aborts the observer. To change a candidate: add a new frozen object with a new id (`_v2`), re-freeze, and document the reason here with the date; the old definition stays in code for the records already collected.
