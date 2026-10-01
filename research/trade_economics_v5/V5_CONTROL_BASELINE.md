# TRADE ECONOMICS V5 — CONTROL BASELINE (frozen 2026-10-01 ~05:35Z, before any V5 computation)

| Field | Value |
|---|---|
| git HEAD | 186c427f55216ff3342fbcfeb1c535bf792fb672 (master = nayeem/master) |
| Strategy fingerprint | 356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed (`npm run xauusd:fingerprint` ok:true) |
| Entry architecture (CONTROL) | production intraday_5m signals (MC > PB > BO > SR > MR, 15m bias, quality 65/70, minRR 1.70, overextension 2.5 ATR, MTF vetoes): 9,617 BUY/SELL signals, DEV 4,098 / HOLD 5,519 (`research/entry_architecture_v2/results/candidates.jsonl`, hashed) |
| SL methodology (CONTROL) | production `computeIntradayRisk`: structural anchor (model slAnchor or structural fallback) − 0.25 ATR buffer, floored at 0.5 ATR; broker fail-safe = 1.5 × structural distance + spread (`brokerStructuralSlMultiple` 1.5) intrabar; thesis invalidation at a confirmed close beyond the structural stop |
| TP methodology (CONTROL) | production objective-aware TP2: nearest genuine structural objective ≥ 1.0 R, capped at 3.0 R, default 2.0 R when no objective; RR must be ≥ 1.70 (RR_NOT_ACCEPTABLE otherwise). RR = 1.70 is the frozen minimum and the fixed-target reference for V4 entry populations |
| Exit logic (CONTROL) | EXIT_F: SL before TP on the same bar; broker SL intrabar; TP2 touch; thesis invalidation on close; 288-bar horizon; swap −0.56 USD per BUY night. No break-even, partial, floor, trailing or time exit in CONTROL |
| Lot / scaling | 0.01 USER_FIXED; AUTO_SCALING OFF |
| Cost assumptions | NORMAL spread 0.24 + slippage 0.10 USD; STRESS 0.60 + 0.20; DRIFT next-open fill |
| Safety (unchanged, outside the replay) | News V2, spread ≤ 0.60, drift ≤ 2.00, breakers, identity lock, MARGIN_SAFETY_VETO (+30/−50 USD policy, margin budget 50 %), broker SL 1.5× |
| V4 entry populations (frozen research populations, NOT a claim of entry edge) | `research/entry_core_v4/configs/finalists.json` (sha 599db53a…): S1 A2|wA3|xA1.5, S2 B2|aB6, S3 C1, S4 D1|dD0.8, S5 E1|mE1, S6 F1|wF4, S7 G1|dG1.5 — regenerated deterministically from the same bars; HOLD n 182 / 1,269 / 912 / 1,037 / 30 / 405 / 35 with the V4 control exit (structural stop, TP 1.70 R) |
| CONTROL figures to reproduce exactly | HOLD n 1,163, −0.064 R, PF 0.93, DD 98.89 R; DEV n 878, −0.055 R, PF 0.94, DD 81.16 R; V4 S3 HOLD n 912, −0.034 R, PF 0.95, DD 69.69 R |
| Data | MT5 XAUUSDm 5m bars 99,990 (2025-05-05 → 2026-09-30); replay rows 99,381; DEV 2025-05-07 → 2025-12-31 (205 sessions); HOLDOUT 2026-01-01 → 2026-09-29 (232 sessions) |
| Input hashes | `results/control_inputs.sha256` (28 lines: V2/V3/V4 inputs, results, finalists, pre-registrations) |

The CONTROL (entry, SL, TP, exit, lot, costs, safety) is not altered during V5. Every V5 exit policy is a research simulation on top of frozen entries; nothing is deployed.
