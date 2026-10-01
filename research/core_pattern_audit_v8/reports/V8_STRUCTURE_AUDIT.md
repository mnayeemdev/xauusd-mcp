# V8_STRUCTURE_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Element | Implementation | Status |
|---|---|---|
| swing high / low | pivot = highest high (lowest low) of a 5-left / 5-right window | CONFIRMED only: reported once 5 confirmed bars exist after it (latency 5 bars, tested); no provisional pivots are used |
| HH / HL / LH / LL | each pivot vs the previous pivot of the same type | correct |
| BOS / CHoCH | first confirmed close beyond a pivot after its confirmation; BOS if in the running direction (or first), CHoCH if against | **D1**: walked in pivot-index order instead of time order → wrong last event / label / direction |
| reclaim / failed break | not modelled as events (BO reclaim is a model condition) | — |
| sweep | wick beyond pivot + 0.05 % with the close back inside | **D2**: the reported sweep was the last sweep of the newest swept pivot, not the most recent sweep |
| range high / low | max / min of the last five pivots | conflict C6 with the comment "not yet broken" (reported) |
| future pivots | never: the function only receives confirmed bars; pivots need 5 right bars | PASS |

D1 is a CHRONOLOGY defect with a symmetry side effect: when one bar is both a pivot high and a pivot low (outside bar), the processing order (highs before lows at equal index) differs between a chart and its mirror image. The mirror test found exactly this: 2025-12-08T03:55:00.000Z: production original BEARISH, mirrored BEARISH; D1 original BULLISH, mirrored BEARISH.

Prevalence: the D1 correction changes the 5m/15m/30m/1H structure primitives recorded per bar on 44.8 % (DEV) / 45.4 % (HOLD) of bars; D2 on 66.9 % / 68.2 % (the sweep field changes often because the sweep is now the most recent one).
