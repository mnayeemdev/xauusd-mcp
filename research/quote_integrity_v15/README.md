# V15 — LIVE QUOTE AGE + RISK DATA INTEGRITY (data-integrity study, research only)

RESEARCH ONLY.
- **Unchanged:** REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE.
- **Frozen strategies:** V8 corrected core · structural SL unchanged · RR 1.70.
- **Settings:** CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED.
- **No edge claimed:** V15 does not create an entry edge.

## Outcome
**DATA_INTEGRITY_PARTIALLY_VALIDATED.**
- **What is now in place:** quote freshness is a first-class field everywhere it is needed. That covers the read-only reader (broker tick time in ms + receive time), every new forward-shadow decision record (`quote-v15-1`), and the gate path (`live_gate.mjs`).
- **Fail-closed behaviour:** missing, invalid, future, out-of-order or stale quotes fail closed.
- **Historical replays:** quote age is UNAVAILABLE and never fabricated.
- **What keeps it partial:** this PC's clock is not synchronized (it lags NTP by about 1.23 s; the broker clock ≈ NTP). Every live quote age is therefore negative, and the system correctly refuses to trade.
- **The fix:** enabling Windows time sync is an owner action (see `reports/V15_CLOCK_INTEGRITY.md`).

## Layout
| Path | Content |
|---|---|
| `V15_PREREGISTRATION.md` (+ `.sha256`) | data contract, validation rules, decision criteria (frozen before the live capture) |
| `scripts/quote.mjs` | pure, dependency-free contract: build / validate / side-of-market price / legacy record |
| `scripts/live_gate.mjs` | the unchanged V14 gate with quote integrity first (+ production executable-geometry recheck and entry-drift limit) |
| `scripts/live_capture.mjs` | read-only live observation through the existing shadow reader |
| `scripts/v15_study.mjs` | replay, clock analysis, historical replay, forward-shadow audit, decision |
| `scripts/write_reports.mjs` | the 15 reports |
| `results/` | live capture (raw + summary), clock evidence (read-only w32tm), study results, test outputs |

## Also changed (outside this folder)
- `mt5/mt5_shadow_reader.py`: the `tick` response adds `time_msc`, `flags` and `received_ms` (backward compatible; still read-only).
- `research/v8_forward_shadow/scripts/runner.mjs`: writes `quote_contract`, `quote` and `quote_check` into every decision record. The runner was restarted (PID 50540 → 49200).

## Reproduce
```
node research/quote_integrity_v15/scripts/live_capture.mjs 180 250   # read-only, market hours
node research/quote_integrity_v15/scripts/v15_study.mjs
node research/quote_integrity_v15/scripts/write_reports.mjs
node --test tests/quote_integrity_v15.test.js
```
