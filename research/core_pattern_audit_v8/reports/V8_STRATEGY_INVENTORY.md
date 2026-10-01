# V8_STRATEGY_INVENTORY — the production intraday_5m models (implementation is the authority)

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

The production REAL profile (`intraday_5m`, docs/XAUUSD_MCP_ENGINE.md) has exactly **five** 5m entry models in `src/engine/intraday/models5m.js`, evaluated in priority order MC > PB > BO > SR > MR (first eligible model that triggers wins, one candidate per confirmed 5m bar). The reference_15m profile (TC/PB/BO/MR/SR in `src/engine/models.js`) is not the production decision layer and is out of scope. No model was renamed, added or removed.

Common to every model: inputs are CONFIRMED 5m bars (499-bar window, forming bar stripped), the 15m bias (`bias.js`: direction from the 15m regime, eligible model set, fresh-CHoCH veto), 5m regime/structure/ATR14/EMA20; entry = close of the signal bar; risk gate (`risk5m.js`): 5m ATR ≥ 2.00 USD, entry ≤ 2.5 ATR from the setup anchor, SL = slAnchor ∓ 0.25 ATR (wrong side → entry ∓ 1.5 ATR; never closer than 0.5 ATR), TP1 = 1 R, TP2 = nearest structural objective ≥ 1.0 R (5m/15m pivots, 15m range), capped 3 R, else 2 R; RR (to TP2) ≥ 1.70; quality ≥ 65 (70 under a NEUTRAL bias without 1H support); then cross-timeframe vetoes (fresh opposing 15m CHoCH, 30m regime AND structure opposed, 1H opposed for MR or unaligned trades).

| Field | MC Momentum Continuation | PB Pullback Continuation | BO Breakout + Retest + Reclaim | SR Structure / Rejection | MR Controlled Mean Reversion |
|---|---|---|---|---|---|
| Purpose | join an expanding move in the 15m bias direction | buy/sell the end of a 5m correction against the 15m bias | trade the first retest of a confirmed 5m structure break | fade a level with a rejection candle | fade a liquidity sweep inside a 15m range toward its midpoint |
| Eligible when | 15m bias BULLISH/BEARISH | 15m bias BULLISH/BEARISH | any 15m regime except CHOP; 5m regime not CHOP | directional, RANGE or TRANSITION 15m | 15m RANGE only, 30m not trending, 5m not HIGH_VOLATILITY |
| Pattern | 3 consecutive 5m closes on the bias side of EMA20, each progressing | a 5m correction of ≥ 1.0 ATR against the bias inside the 20-bar window | 5m BOS/CHoCH: confirmed close beyond a confirmed pivot (structure.lastEvent) | rejection candle: wick ≥ 50 % of range, close in the outer third | 5m liquidity sweep: wick beyond a confirmed pivot by > 0.05 %, close back inside |
| Setup | pattern + 5m ATR ratio ≥ 1.0 (expansion) | correction RESOLVED: 2 consecutive closes back on the bias side of EMA20 | retest: a bar within 0.3 ATR of the broken level (close or wick) | the candle's wick reaches a 15m/5m swing level (−0.6 / +0.3 ATR) and it closes back beyond the level | the sweep is ≤ 3 bars old and the regime conditions hold |
| Trigger | close beyond the prior 5m swing, the break ≤ 3 bars old | resolution ≤ 3 bars old (fresh) | the current bar closes back beyond the level (reclaim), ≤ 10 bars after the break | the rejection itself; against 5m structure only with a supporting 15m bias or a fresh sweep at the level | the sweep + reclaim |
| Entry | signal-bar close | signal-bar close | signal-bar close | signal-bar close | signal-bar close |
| Invalidation / SL anchor | low (BUY) / high (SELL) of the momentum leg from 2 bars before the break | pullback extreme | retest extreme after the break | rejection wick | sweep-bar extreme |
| RR | ≥ 1.70 to TP2 (all models) | idem | idem | idem | TP2 = 15m range midpoint (capped 3 R) |
| Exclusions | NEUTRAL bias; ATR contraction; late > 3 bars | NEUTRAL bias; correction ACTIVE/NONE; late | CHOP; no retest; no reclaim; > 10 bars | no level; mid-bar close; counter-structure without basis | trending 30m; HIGH_VOL 5m; stale sweep |
| BUY | BULLISH bias, closes above EMA20, close > last 5m swing high | BULLISH bias, pullback down, 2 closes back above EMA20 | bullish break, retest from above, close > level | lower-wick rejection at a swing low | SWEEP_LOW (wick below a pivot low, close back above) |
| SELL | mirror | mirror | mirror | upper-wick rejection at a swing high | SWEEP_HIGH |
| WAIT | any condition false → next model; none → NO_ELIGIBLE_STRATEGY | idem | idem | idem | idem |

## Documentation vs implementation conflicts (reported, not silently resolved)
| # | Documentation says | Implementation does | Treatment |
|---|---|---|---|
| C1 | owner: "TP = entry ± 1.70 × structural risk" | TP2 = nearest structural objective ≥ 1.70 R (RR gate), capped 3 R; TP1 = 1 R | reported; PRIMARY economics keep production geometry, SECONDARY = fixed 1.70 R |
| C2 | structure.js comment: walk breaks forward with a running direction | pivots processed in pivot-index order | **D1** (corrected) |
| C3 | "Liquidity sweep: the most recent …" | the last sweep of the newest pivot ever swept | **D2** (corrected) |
| C4 | params: "5m pullback depth in 5m ATR"; reason "pullback of X ATR" | depth measured from the extreme to the CURRENT close | **D3** (corrected) |
| C5 | MR reason: "sweep + reclaim at a 15m range boundary", target = midpoint | no location check; SELL possible below the midpoint | **D4** (corrected: entry must lie on the far side of its own midpoint target) |
| C6 | structure.js comment: range high/low "not yet broken by a confirmed close" | max/min of the last five pivots, broken or not | reported only (behaviour when all are broken unspecified) |
| C7 | engine docs: NEUTRAL-bias 65 bar when the 1H "regime or structure" supports the side | only a directional 1H regime (audit PART 7) | documentation stale; code kept |
| C8 | engine docs WAIT-gate list (reference profile) includes TRANSITION / CORRECTION_ACTIVE hard WAITs | intraday profile treats them as bias inputs (documented in the profile table) | consistent with the intraday section |
