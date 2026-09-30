# Missed-Opportunity Edge Research (2026-09-30) — RESEARCH ONLY

Isolated research on two hypotheses raised by the 2026-09-30 no-trade forensic audit. Nothing here is imported by production; production strategy, watcher, executor and REAL configuration were not modified (strategy fingerprint `356e4189…` unchanged).

| Hypothesis | Population (independent) | mean R | PF | 95% CI | Status |
|---|---|---|---|---|---|
| H1 — 30m two-factor conflict veto: let vetoed, otherwise-qualified candidates through | 152 clusters (399 raw) | −0.237 | 0.72 | [−0.48, +0.03] | **NEGATIVE → REJECTED** (veto is net protective) |
| H2a — impulse without retest, aligned 15m bias | 88 breaks (232 raw) | −0.016 | 0.98 | [−0.30, +0.28] | **NO_EDGE → REJECTED** |
| H2b — impulse without retest, non-opposing 15m bias | 192 breaks (503 raw) | −0.004 | 0.99 | [−0.20, +0.21] | **NO_EDGE → REJECTED** |

+30 USD REAL target observability (measurement only): median 6.4 five-minute ATRs, twice the median structural objective; 8.9% of simulated production signals reach it; both REAL closes to date were stops.

## Files
- `preregistered_hypotheses.md` + `.sha256` — frozen definitions, thresholds, splits and decision gates, written before any outcome was computed.
- `scripts/study.mjs` — one-shot study: streams the Edge Lab replay (`handoff/edge_discovery_lab/data/`, gitignored, regenerable), reuses production pure functions read-only, runs leak/null controls, writes `results/`.
- `results/study_results.json` — every metric, split, breakdown, control and decision; `*_independent_events.json` — per-event rows.
- `tests/study_integrity.test.js` — deterministic checks (hash match, controls, exclusion of 2026-09-30, frozen constants, allowed statuses, unchanged engine files). Run: `node --test research/missed_opportunity/tests/study_integrity.test.js`.

## Reproduce
1. Regenerate the Edge Lab dataset if absent: `python handoff/edge_discovery_lab/scripts/fetch_lab_bars.py` then `node handoff/edge_discovery_lab/scripts/lab_replay.mjs` (read-only MT5; never run beside `xauusd mt5-real-status`).
2. `node research/missed_opportunity/scripts/study.mjs`.

Owner handoff package: `handoff/MISSED_OPPORTUNITY_EDGE_RESEARCH/` (gitignored) and `CHATGPT_HANDOFF_MISSED_OPPORTUNITY_EDGE_RESEARCH.zip`.
