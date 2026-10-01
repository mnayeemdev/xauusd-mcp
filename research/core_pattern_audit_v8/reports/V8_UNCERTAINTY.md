# V8_UNCERTAINTY

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Source | Assessment |
|---|---|
| Sampling | trade-bootstrap 95 % CI (HOLD) CONTROL [-0.167, 0.041], corrected [-0.121, 0.068]; session-block CI [-0.172, 0.047] / [-0.115, 0.069] — both include 0 and are mostly negative |
| Month-shuffle drawdown (500 paths) | corrected HOLD p50 102.91 R, p90 131.41 R; loss streak p90 18 |
| Split instability | D1 alone: DEV -0.119 vs HOLD -0.024; context-lag outcomes change sign between splits |
| Feed | replay = Exness MT5 bars; live engine = TradingView OANDA bars; 97 % action agreement on the live log |
| Execution | replay fills at the signal close (DRIFT variant at the next open); real fills, spread spikes and the live safety layer (news, spread, drift, margin, breaker) are not replayed |
| D6 | emulated with the production staleness rule; live staleness also depends on TradingView snapshot behaviour |
| Multiple corrections | six corrections evaluated together and singly; no selection by outcome, so no multiple-testing inflation of the decision; interaction effects reported |
| Wrong-direction attribution | a trade is attributed to a defect when the corrected engine does not reproduce it; this is a counterfactual attribution, not proof that the loss was caused by the defect |
