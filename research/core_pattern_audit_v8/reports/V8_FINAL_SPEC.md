# V8_FINAL_SPEC — what the engine should do, what was wrong, what V8 recommends

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed) · no order placed

## 1. Answer to the central question
When the XAUUSD 5m chart produces one of the five production patterns, the engine **mostly** recognises it correctly, at the correct time (confirmed candles only, no look-ahead), with the correct direction rules, trigger, location and structural stop. V8 found **six confirmed implementation defects**. Each defect breaks the engine's own specification in a specific, reproducible case:

| ID | Category | One-line defect | Correction |
|---|---|---|---|
| D1 | PATTERN (structure) | structure direction / last BOS-CHoCH taken from the newest broken pivot instead of the most recent break; can read BULLISH after a bearish break; source of the only BUY/SELL code asymmetry | walk breaks in time order |
| D2 | TRIGGER (sweep) | the "last sweep" can be many bars old while a fresh sweep exists → MR / SR basis miss fresh sweeps | most recent sweep in time |
| D3 | SETUP (PB) | pullback depth measured at the current close → deep pullbacks with a decisive reclaim never qualify | depth = extreme → deepest point after it |
| D4 | LOCATION (MR) | mean-reversion entries on the wrong side of their own midpoint target | require the far side of the midpoint |
| D5 | RR | RR gate on a rounded value lets 1.695 ≤ RR < 1.70 through | gate on the unrounded RR |
| D6 | DATA | a stale 15m/30m snapshot (older than 4 bars) is used instead of failing closed | fail closed with the stale reason |

No eligibility, SL, timing, context-lag, stale-signal or replay defect was found. Duplicate and restart protection works.

## 2. Corrected rule set (V8 specification; implementation = patches/ALL_V8_CORRECTIONS.patch)
Everything not listed is the unchanged production rule (src/engine/intraday/*, docs/XAUUSD_MCP_ENGINE.md intraday_5m profile): RR gate 1.70, TP1 1 R, TP2 nearest structural objective ≥ 1.70 R capped 3 R, SL = invalidation anchor ∓ 0.25 ATR (floor 0.5 ATR), quality 65/70, overextension 2.5 ATR, the 15m bias, model eligibility and priority MC > PB > BO > SR > MR, the fresh-CHoCH / 30m two-factor / 1H vetoes, lot 0.01, Capital Harvest OFF, AUTO_SCALING OFF, News V2, spread / drift / breaker / broker protection.

1. **Structure (D1):** for every confirmed pivot take its first confirmed close-break; process those breaks in order of the break bar (ties: pivot index). The running direction and `lastEvent` (BOS when in the running direction or first, CHoCH when against) come from that time-ordered walk.
2. **Sweep (D2):** `lastSweep` = the most recent bar (any pivot) whose wick exceeded a confirmed pivot by > 0.05 % and closed back inside; ties → the more recent pivot.
3. **PB (D3):** setup = the deepest retracement after the 20-bar extreme ≥ 1.0 × 5m ATR (the extreme bar itself excluded); trigger unchanged (2 closes back on the bias side of EMA20, entry ≤ 3 bars after).
4. **MR (D4):** the 15m range midpoint must exist and lie beyond the entry in the trade direction (SELL above the midpoint, BUY below).
5. **RR (D5):** the RR to TP2 must be ≥ 1.70 before rounding.
6. **Data (D6):** a 5m / 15m / 30m snapshot whose last confirmed bar is older than 4 bar durations makes the whole call DATA_UNAVAILABLE with the reason "<tf>: stale data (N s old)".

## 3. Evidence
- Replay fidelity: the research replay reproduces the Edge Lab production-faithful replay on all 99,381 DEV + HOLD bars, with 0 field mismatches. The production live orchestrator, driven offline with garbage forming bars, matches the replay on 2,245 bars (266 signals) with 0 mismatches. CONTROL reproduces V7 exactly.
- Corrections were selected by specification, pre-registered (sha256 fbd6b655…) and frozen before the HOLDOUT replay.
- With the corrections, 55 (DEV) and 84 (HOLD) move events missed only because of defects are captured. Wrong-direction trades attributable to defects: DEV 50 of 262, HOLD 59 of 345. All others are valid losing trades: the rules were followed and the market went the other way.

## 4. Economics (production geometry, EXIT_F, normal cost; sequential one position)
| | DEV CONTROL | DEV corrected | HOLD CONTROL | HOLD corrected |
|---|---|---|---|---|
| Trades | 878 | 1,034 | 1,163 | 1,364 |
| Expectancy (R) | −0.055 | −0.099 | −0.064 | −0.027 |
| PF | 0.94 | 0.89 | 0.93 | 0.97 |
| Max DD (R) | 81.16 | 155.91 | 98.89 | 88.75 |
| Wrong-direction | 29.8 % | 30.2 % | 29.7 % | 29.3 % |
| Stress expectancy (R) | −0.185 | −0.241 | −0.157 | −0.112 |

**EDGE_DEMONSTRATED = NO.** The corrected engine is better than CONTROL on HOLDOUT but still negative (CI [−0.121, +0.068]), worse on DEV, positive in only 2 of 6 quarters, and negative under stress costs. The largest correction (D1) moves DEV and HOLD in opposite directions. Correct chart reading does not by itself create an edge for these five models.

## 5. Recommendation (owner decision; nothing is deployed)
1. **Low-footprint correctness fixes (D2, D4, D5, D6).** Each changes few decisions, removes rule-breaking entries or stale-data decisions, and matches the system's own specification. These are reasonable to adopt as a deliberate new strategy version, with a fingerprint update and the usual safety review.
2. **D1, structure chronology.** It is a genuine defect and the source of a BUY/SELL asymmetry. However, it changes the structure read on about 45 % of bars and more than 4,000 decisions per period, with an unstable economic effect. If adopted, it should be adopted as a new strategy version and observed forward (shadow, then DEMO under a separate approval), not switched on in REAL.
3. **D3, PB depth.** It aligns PB with its documented definition and its economic effect is small. Adopt it together with D1 or on its own, under the same forward-observation rule.
4. **Open owner decisions.**
   - **C1:** should TP be fixed at 1.70 R, as the owner states, or the structural objective ≥ 1.70 R, as implemented? Holdout expectancy is −0.022 R with a fixed 1.70 R target and −0.027 R with the objective target. Both are negative, so neither is an edge.
   - **C6:** the range comment says levels are "not yet broken"; the code ignores that.
   - **Quality terms:** two quality terms are direction-agnostic.
5. DEMO stays OFF and REAL stays unchanged. There is no Capital Harvest, no RR change and no new indicator. The next legitimate research question is not more entry filtering, since V1–V8 show no stable entry edge. It is whether any of these models has a positive forward expectancy at all, which the running measure-only shadow observer can answer without risk.
