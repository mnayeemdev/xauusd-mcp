# V8 FORWARD SHADOW VALIDATION (measure-only, started 2026-10-01 11:58Z)

This folder forward-validates the frozen V8 corrected core in real time, with production CONTROL evaluated on the same inputs. Observation runs until the owner stops it. There is no sample-size gate and no trade target. Execution authority is NONE, REAL and DEMO are OFF, and every trade is HYPOTHETICAL_NOT_EXECUTED. The pre-registration is `V8F_PREREGISTRATION.md`, with its hash in `.sha256`.

| File | Role |
|---|---|
| `scripts/lib.mjs` | frozen-engine loader and hash check, evaluation of both engines, WAIT taxonomy, stage decomposition, D1–D6 oracles, safety stage, hypothetical outcomes, forensics, move events |
| `scripts/runner.mjs` | live loop: read-only MT5 reader, first-seen bar archive, one decision per engine per completed 5m bar, outcome labelling, missed-setup classification, replay cross-check, daily evidence snapshots; `--report <dir>` renders reports |
| `scripts/report.mjs` | the 16 evidence reports; no automatic verdict, DEMO only by explicit owner review |
| `reports/` | the latest rendered reports (accumulated evidence; no sample-size gate, no trade target) |

The forward store lives in `state/v8_shadow/`, which is gitignored:
- `decisions.jsonl`, `outcomes.jsonl`, `events.jsonl`, `parity.jsonl`
- `archive_<tf>.jsonl`, `revisions.jsonl`
- `status.json`, `runner.log`, `snapshots/` (daily evidence snapshots)

Operate it with these commands:
- Check: `type state\v8_shadow\status.json`
- Reports: `node research/v8_forward_shadow/scripts/runner.mjs --report research/v8_forward_shadow/reports`
- Stop: Ctrl+C on its console. The lock is `state/v8_shadow/runner.lock`. Never start a second copy; the lock refuses one.
- Requires: `research/core_pattern_audit_v8/engines/ALL` (regenerate with `node research/core_pattern_audit_v8/scripts/build_engines.mjs`). The runner refuses to start if any file differs from `research/core_pattern_audit_v8/configs/engines.sha256`.
