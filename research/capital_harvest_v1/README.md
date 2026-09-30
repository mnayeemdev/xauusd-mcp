# Capital Harvest V1 research (2026-09-30) — RESEARCH ONLY

Question: can XAUUSD be traded more effectively on the REAL account (62.07 USD, 0.01 lot) by harvesting small profits, protecting them, and letting strong moves run, than by production's current exit stack? Tested once, pre-registered (`PREREGISTRATION.md`, three logged corrections in §9), on production's own 9,617 historical signals (Edge Lab replay, holdout 2026-01 → 09-29, 2026-09-30 excluded), with broker-verified 0.01-lot economics.

**Result: every variant REJECTED under the frozen rule, and production itself would be too, because at 0.01 lot the median structural stop risks 10.7% of the account and no exit design keeps drawdown inside the 31 USD survival bound.** Within that constraint: fixed small-profit banking (H1) is negative at every milestone; banking at 3 USD only on weak continuation evidence and otherwise trailing a protected floor 1 USD behind MFE (H2a) is the best architecture on holdout (+0.66 USD/trade, PF 1.29, CI [0.33, 0.96], 9 trades/session, avg loss 1.4 avg wins) but ≈ 0 on development and thin under stress; removing the bank/run decision (H2b) makes it negative. No forward-shadow candidate; no production change.

| Variant | HOLD expectancy (USD) | PF | Avg win / loss | Max DD | Status |
|---|---|---|---|---|---|
| H0 production stack | +0.16 | 1.03 | 10.06 / 9.84 | 498 | control |
| H1 bank 2 / 3 / 5 USD | −0.49 / −0.34 / −0.17 | 0.73 / 0.85 / 0.94 | 1.9–4.9 / 6.4–6.8 | 401–1,004 | REJECTED |
| H1 0.5 R / 1.0 R | −0.30 / −0.23 | 0.91 / 0.95 | | 762 / 863 | REJECTED |
| H2a bank/run 3 USD | **+0.66** | **1.29** | 4.48 / 6.37 | 130 | REJECTED (capital survival only) |
| H2b always run | −0.05 | 0.98 | 4.54 / 5.90 | 332 | REJECTED |
| H3a 0.5 ATR / H3b 0.75 ATR | +0.54 / +0.39 | 1.22 / 1.12 | | 154 / 220 | REJECTED (capital survival) |
| H4a 1 R trail / H4b 0.5 R trail | +0.60 / +0.07 | 1.14 / 1.02 | 10.3 / 8.7 | 359 / 367 | REJECTED |

Files: `scripts/harvest_engine.mjs` (pure simulation primitives), `scripts/harvest_study.mjs` (controls, capital bands, milestones, 11 variants, decisions), `results/study_results.json`, `tests/harvest.test.js` (13 tests). Handoff: `handoff/CAPITAL_HARVEST_V1/` (gitignored) + `CHATGPT_HANDOFF_CAPITAL_HARVEST_V1.zip`. Reproduce: run the Entry Architecture V2 enrichment first (needs the Edge Lab data), then `node research/capital_harvest_v1/scripts/harvest_study.mjs`.
