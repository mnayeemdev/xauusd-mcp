# Capital Harvest Master — integrated capital + position-management research (research only)

Stage of 2026-09-30 (HEAD 7227ca3 → this commit). Pre-registered (`PREREGISTRATION.md`, sha 02d6b1b3…) study of ONE integrated architecture: percentage-of-equity capital eligibility on the ACTUAL protective-SL exposure + adaptive loss control + deterministic HOLD/PROTECT/HARVEST/EXIT profit control, on production's own 9,617 historical signals (Edge Lab replay 2025-05 → 2026-09-29), DEV/HOLDOUT split, normal/stress/drift costs, six reference equities. Production untouched (RR 1.70, lot 0.01, AUTO_SCALING OFF, fingerprint 356e4189…).

## Result
Every candidate (CH-A production-like, CH-B simple bank, CH-C protected run, CH-D1/D2/D3 adaptive) is REJECTED under the frozen decision rule at every equity: negative under stress costs everywhere; max drawdown above 30 % of starting equity up to 1000 USD; at 62.07 USD no percentage policy of the frozen family admits a sustainable trade set. The management layer does not beat production's own exit stack on the same entries (holdout no-cap expectancy: CONTROL +0.33, CH-A +0.18, CH-C +0.12, CH-D3 +0.10, CH-D2 +0.09, CH-B +0.11, CH-D1 +0.03 USD/trade; all CIs span zero). EDGE_DEMONSTRATED = NO; FORWARD_SHADOW_ELIGIBLE = NO.

## Code
- `src/engine/capitalHarvest/riskPolicy.js` — percentage eligibility (pure), production −50 veto for comparison.
- `src/engine/capitalHarvest/positionManager.js` — state machine (pure, serialisable, audit records), `simulatePosition`, re-entry guard, mode gate (`XAUUSD_CAPITAL_HARVEST_MODE`: CONTROL | CAPITAL_HARVEST_SHADOW; DEMO/REAL refuse).
- `scripts/chm_study.mjs` — study runner (controls, per-signal sims, sequential capital paths, decisions); `scripts/write_tables.mjs` — handoff tables.
- `tests/capital_harvest_master.test.js` (31 tests) — percentage risk, equity changes, margin, minimum lot, structural/broker SL, thesis exit, milestone detection, HOLD/PROTECT/HARVEST/EXIT, ratchet monotonicity, spread/slippage, give-back, runners, re-entry/dedup, restart recovery, feed failure, broker truth, modes, production preservation.
- Engine convention note (pre-outcome, not a spec change): the broker SL distance is computed from the PLANNED entry (production `computeProtectiveStops`), the R unit from the fill; a first draft used the fill for both and was corrected before the first result was read (the first run's console was discarded; the committed results are from the corrected engine).

Not wired into REAL execution. Handoff: `handoff/CAPITAL_HARVEST_MASTER/` + `CHATGPT_HANDOFF_CAPITAL_HARVEST_MASTER.zip` (gitignored).
