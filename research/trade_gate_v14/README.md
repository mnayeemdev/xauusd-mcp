# V14 — NO-EDGE BEHAVIOUR & TRADE GATE (architecture / safety study, research only)

RESEARCH ONLY.
- **Unchanged:** REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · PRODUCTION_CHANGED NO.
- **Frozen strategies:** MC PB BO SR MR (V8 corrected core) · structural SL unchanged · RR 1.70.
- **Settings:** CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED.

## Outcome
**TRADE_GATE_STATUS = GATE_PARTIALLY_VALIDATED.**
- **What it is:** a deterministic gate that never creates, redirects or modifies an entry. It maps the frozen engine's own result and the existing production safety limits to TRADE_ELIGIBLE or a WAIT state with a reason.
- **Result under PRIMARY (risk unresolved):** 0 eligible trades. All 11,411 valid entries are VALID_ENTRY + RISK_REJECTED.
- **Checks:** 0 invariant violations, deterministic, restart-equal, no lookahead, exact V11 parity.
- **Why only partially validated:** the live forward-shadow records lack quote age, so a risk-model run fails closed.
- **Where to read more:** `reports/V14_FINAL_DECISION.md`.

## Layout
| Path | Content |
|---|---|
| `V14_PREREGISTRATION.md` (+ `.sha256`) | gate specification and pre-registered validation / decision rules |
| `scripts/gate.mjs` | pure gate: adapters (replay row, forward-shadow record), `decideGate`, `applyClose`, `invariantViolations` |
| `scripts/v14_study.mjs` | chronological replays (PRIMARY + 2 illustrative), invariant sweep, determinism, restart, no-lookahead, V11 parity, live forward-shadow run |
| `scripts/write_reports.mjs` | the 12 reports |
| `results/v14_results.json`, `results/audit_hashes.json` | results; sha256 of every full audit log |
| `results/audit_samples/` | audit-log samples, per-state examples, live gate decisions |
| `results/audit/` | full audit logs (≈ 70 MB; kept out of git, included in the handoff zip) |

## Reproduce
```
node research/trade_gate_v14/scripts/v14_study.mjs
node research/trade_gate_v14/scripts/write_reports.mjs
node --test tests/trade_gate_v14.test.js
```
