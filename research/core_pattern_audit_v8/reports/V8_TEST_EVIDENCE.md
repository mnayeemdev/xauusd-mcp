# V8_TEST_EVIDENCE

| Run | Command | Result | File |
|---|---|---|---|
| V8 deterministic tests | `node --test tests/core_pattern_audit_v8.test.js` | **33 / 33 pass**, 0 skipped | results/core_pattern_audit_v8_test_output.txt |
| Full offline regression suite | `npm run test:unit` | **2504 / 2504 pass**, 615 suites, 0 fail | results/test_unit_full_suite.txt |
| Lint | `npx eslint tests/core_pattern_audit_v8.test.js research/core_pattern_audit_v8/scripts/*.mjs` | 0 errors, 0 warnings | results/eslint.txt |
| Strategy fingerprint | `npm run xauusd:fingerprint` | ok true, 356e4189… unchanged | results/fingerprint.txt |
| Replay fidelity (study gate) | `EDGE_PHASE=DEV/FULL node scripts/v8_study.mjs` | Edge Lab parity 0 mismatches on 99,381 bars; copy = production; stage parity 0 mismatches; CONTROL = V7 (DEV and HOLD) | results/v8_results_FULL.json |
| Live-path parity | `node scripts/v8_live_parity.mjs` | 2,245 bars / 266 signals, 0 mismatches; stale-snapshot check | results/live_parity.json |
| Symmetry | `node scripts/v8_symmetry.mjs` | 3,000 bars × 4 engines; corrected + neutralised 3000 / 3000 | results/symmetry.json |

`npm run test:all` was not run: it contains the end-to-end suite, which must never run beside the live REAL watcher. `test:unit` is the same list without it.

## Required coverage → test
| Requirement | Test (describe block) |
|---|---|
| candle classification | candle structure: rejection candle needs shape AND location |
| breakout / retest | breakout + retest + reclaim (BO) |
| pullback | pullback continuation (PB, D3) |
| rejection | candle structure (SR) |
| structure / BOS / CHoCH | structure: pivots, confirmation latency, BOS / CHoCH chronology (D1) |
| setup / trigger | MC, PB, BO, MR blocks (setup without trigger → WAIT) |
| eligibility | model eligibility, context conflicts |
| location | mean reversion location (D4); BO overextension rule via risk tests |
| SL / RR | structural SL, TP and RR (D5) |
| BUY / SELL / WAIT | mirrored SR, BO, SL/TP; WAIT cases in every model block |
| timing / no-lookahead | pivot latency; forming bar never used (live orchestrator) |
| replay parity | replay parity and symmetry evidence (local results) |
| restart / duplicate prevention | duplicates, restart and stale signals |
| data unavailable | live orchestrator: data failure, stale data (D6) |
| context conflict | fresh CHoCH, 30m two-factor, 1H vetoes |
| production untouched | corrections apply to the unchanged production source; no execution path |
