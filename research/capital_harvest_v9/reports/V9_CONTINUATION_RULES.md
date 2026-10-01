# V9_CONTINUATION_RULES

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

Simple deterministic states from completed bars (BUY shown; SELL mirrored; priority INVALIDATED → WEAK → STRONG → MODERATE), active only once profit is available (loss side unchanged):

| State | Rule | Mapping |
|---|---|---|
| INVALIDATED | close beyond the most recent confirmed 3/3 pivot formed after entry | EXIT |
| WEAK | close beyond the 5m EMA20 against the trade, OR an opposite rejection candle (wick ≥ 50 % of range, close in the far third), OR two consecutive closes against the trade | HARVEST if open profit ≥ harvestMinR, else PROTECT |
| STRONG | a new best close within the last 3 bars AND close on the trade side of EMA20 AND ≥ 2 of the last 3 bars closed with the trade | HOLD / PROTECT + RUN |
| MODERATE | otherwise | PROTECT (target active) |

No scoring system. Tests (tests/capital_harvest_v9.test.js) assert each state on fixtures and their BUY/SELL symmetry. Evidence: the states do not separate continuation from reversal well enough to keep the tail — most harvests and floor exits are followed by further favourable movement (mean post-exit continuation 5.16 / 4.78 / 5.26 R on HOLD).
