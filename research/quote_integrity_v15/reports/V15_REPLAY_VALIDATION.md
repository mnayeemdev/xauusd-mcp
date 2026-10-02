# V15_REPLAY_VALIDATION

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

| Check | Result |
|---|---|
| Recorded live observations replayed twice: identical quote-age decisions | PASS |
| Replay reproduces the capture-time validation counts exactly | PASS |
| Restart (first half, carry the last accepted quote, second half) = uninterrupted | PASS |
| Same input + same state = same decision (unit test) | PASS |
| Historical replay: deterministic and never fabricates quote age | PASS (0 fabricated) |

What the replay reproduces: quote_timestamp, decision_timestamp, quote_age_ms, bid, ask, spread and the decision, from the raw capture (`results/live_capture_raw.jsonl`).
