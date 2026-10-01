# V8_BREAKOUT_AUDIT (BO; MC uses the same break definition)

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Question | Answer from the implementation |
|---|---|
| Which level is broken? | the price of the confirmed 5m pivot in `structure.lastEvent` (BO); MC: the last confirmed 5m swing high/low |
| Which candle confirms the break? | the first confirmed bar that CLOSES beyond the pivot after the pivot's own confirmation (pivot index + 5) |
| Does wick penetration count? | no — a wick beyond with the close back inside is a sweep, not a break |
| Does close beyond the level count? | yes, by any amount |
| Displacement required? | none for the break; the entry may not be more than 2.5 ATR from the level (OVEREXTENDED) |
| What invalidates the breakout? | no retest within 10 bars, or the current close not back beyond the level; a close back through the level BEFORE the reclaim does NOT invalidate it (reported ambiguity) |
| When is the retest valid? | any bar after the break whose close is within 0.3 ATR of the level, or whose wick reaches level ± 0.3 ATR |
| Too extended? | entry > 2.5 ATR from the level → OVEREXTENDED WAIT |
| Unfinished candle? | never: the forming bar is stripped (garbage-forming-bar test on 2245 bars, 0 changes) |
| Too late? | entry ≤ 10 bars after the break by rule (BO); MC ≤ 3 bars |
| Rejected by a lagging context gate? | BO is eligible under every 15m regime except CHOP; context blocks are measured in V8_CONTEXT_LAG_AUDIT |
| **Defect found** | **D1**: the "last event" was the break of the newest-INDEXED broken pivot, not the most recent break in time, so BO could retest a stale level or miss the current breakout, and the BOS/CHoCH label could be wrong |

Effect of D1 alone (decision changes vs CONTROL): DEV 4,130 bars (primitive changed on 44.8 % of bars), HOLD 4,444; BO signals DEV 2881 → 3420, HOLD 3930 → 4623. Top changes (HOLD): WAIT:NO_ELIGIBLE_STRATEGY -> BUY:BO 584; WAIT:NO_ELIGIBLE_STRATEGY -> SELL:BO 490; WAIT:OVEREXTENDED -> WAIT:NO_ELIGIBLE_STRATEGY 448; WAIT:RR_NOT_ACCEPTABLE -> WAIT:NO_ELIGIBLE_STRATEGY 410; WAIT:NO_ELIGIBLE_STRATEGY -> WAIT:RR_NOT_ACCEPTABLE 337; SELL:BO -> WAIT:NO_ELIGIBLE_STRATEGY 336. D1 changes many decisions because the structure primitive feeds every timeframe — FLAGGED as a wide correction; every change is explained by a changed primitive (unexplained 0).
