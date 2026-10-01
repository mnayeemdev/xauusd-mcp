# ENTRY CORE V4 — CONTROL BASELINE (frozen 2026-10-01 ~05:05Z, before any V4 computation)

| Field | Value |
|---|---|
| git HEAD | 7a46a1fee0287fe793ac09f5696183805796d4dc (master = nayeem/master) |
| Strategy fingerprint | 356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed (`npm run xauusd:fingerprint` ok:true) |
| Data source | MT5 XAUUSDm 5m bars captured by the Edge Lab (`handoff/edge_discovery_lab/data/XAUUSDm_bars.json`, 99,990 bars, 2025-05-05 → 2026-09-30); replay rows of the frozen production engine at every confirmed 5m close (`lab_rows.jsonl`, 99,381 in-range rows: regime, 15m bias, 30m/1H regime, structure state, production action/wait reason); production candidates with geometry (`research/entry_architecture_v2/results/candidates.jsonl`, 9,617 BUY/SELL signals) |
| Symbol / timeframe | XAUUSDm (Exness), 5m decision candle; 15m / 30m / 1H context only as recorded at the confirmed 5m close |
| Date ranges | DEVELOPMENT 2025-05-07 → 2025-12-31 (205 sessions); HOLDOUT 2026-01-01 → 2026-09-29 (232 sessions); HOLDOUT opened once, after `configs/finalists.json` is hashed |
| CONTROL | production intraday_5m signals (V1 = V2 = V3 CONTROL): DEV n 878, −0.055 R, PF 0.94, DD 81.16 R; HOLD n 1,163, −0.064 R, PF 0.93, DD 98.89 R, stress −0.157 R; move capture DEV 19.6 % / HOLD 26.6 %; NO_SETUP_OR_TRIGGER DEV 38.0 % / HOLD 32.5 %; wrong direction DEV 18.5 % / HOLD 20.2 %. Must be reproduced exactly by the V4 study (assertion, abort otherwise). |
| RR | 1.70 (CONTROL uses the production objective ≥ 1.70; V4 triggers use TP = entry ± 1.70 × structural risk, no optimisation) |
| Exit methodology | EXIT_F: structural stop; broker fail-safe 1.5 × |entry − sl| + spread intrabar; thesis invalidation at a confirmed close beyond sl; TP touch; 288-bar horizon; SL before TP on the same bar; swap −0.56 USD per BUY night |
| Cost model | NORMAL spread 0.24 + slippage 0.10 USD; STRESS 0.60 + 0.20; DRIFT = next-open fill; USD at 0.01 lot reported separately (capital neutrality) |
| Sequencing | one position at a time; production re-entry guard `canReenter` (same/earlier candle, same setup within 12 bars, 3 bars after a loss) |
| Safety rules (unchanged, outside the replay) | News V2, spread ≤ 0.60, drift ≤ 2.00, breakers, identity lock, MARGIN_SAFETY_VETO, broker SL 1.5×, lot 0.01 USER_FIXED, AUTO_SCALING OFF. Inside the replay the production ATR floor (ATR14 ≥ 2.0 USD) is kept as a fixed gate for every V4 candidate. |
| Input hashes | `results/control_inputs.sha256` (25 lines: V2 inputs + V2 results/finalists/prereg + V3 results/finalists/prereg) |

The CONTROL is not re-fitted, re-weighted, re-costed or re-geometried during V4.
