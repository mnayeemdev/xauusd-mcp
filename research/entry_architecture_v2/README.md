# Entry Architecture V2 research (2026-09-30) — RESEARCH ONLY

Question: is production suppressing executable opportunity because contextual conditions act as sequential binary gates, and would a "strong setup leads, safety vetoes stay" architecture do better? Answer on the 17-month Edge Lab replay (holdout 2026-01 → 09-29, 2026-09-30 excluded): **no**. Production stayed the best of the family; no gate is over-restrictive; strong setups do not survive context conflicts; borderline RR and the quality boundary hide no positive population.

| Architecture | Holdout independent N | mean R | PF | Trades vs A0 | Status |
|---|---|---|---|---|---|
| A0 current production | 1,249 | −0.050 | 0.93 | 1.00× | control |
| A1 lead signal + context score | 1,374 | −0.079 | 0.89 | 1.08× | REJECTED |
| A2 lead signal + tiered confirmation | 1,297 | −0.047 | 0.94 | 1.03× | NO_IMPROVEMENT |
| A3 model-specific confirmation | 1,249 | −0.050 | 0.93 | 1.00× | identical to A0 (no veto met the drop rule) |

Median 6 trades per session for production, 12% zero-trade sessions. Most protective gates: ATR floor (−0.28 R rejected pop) and 30m two-factor veto (−0.24, −0.57 inside strong setups). Redundant by frequency: fresh-CHoCH veto (0.9%). RR 1.5–1.7 negative (−0.21 in strong setups). Quality 65–69 ≈ 0; quality-to-expectancy curve non-monotonic (75+ worst).

Files: `PREREGISTRATION.md` (+ sha256), `scripts/enrich_candidates.mjs` (recomputes geometry/quality/context for 23,950 candidate candles with frozen engine functions), `scripts/arch_study.mjs` (controls, attrition, conditional value, bands, A0–A3), `results/study_results.json`, `tests/study_integrity.test.js`. Production untouched; strategy fingerprint 356e4189… unchanged. Handoff: `handoff/ENTRY_ARCHITECTURE_V2/` (gitignored) + `CHATGPT_HANDOFF_ENTRY_ARCHITECTURE_V2.zip`.

Reproduce: regenerate Edge Lab data if absent (`handoff/edge_discovery_lab/scripts/fetch_lab_bars.py`, `lab_replay.mjs`), then `node research/entry_architecture_v2/scripts/enrich_candidates.mjs && node research/entry_architecture_v2/scripts/arch_study.mjs`.
