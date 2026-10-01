# V8_CANDLE_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

The production decision path computes these candle quantities, from completed 5m candles only:

| Quantity | Where | Formula | BUY / SELL |
|---|---|---|---|
| open / high / low / close | all | confirmed bar fields; forming bar stripped | — |
| range | SR | high − low (must be > 0) | same |
| lower / upper wick | SR | min(open, close) − low / high − max(open, close) | mirror (tested: mirrored candle → SR SELL with mirrored stop) |
| wick / range | SR | ≥ 0.50 | same threshold |
| close position | SR | BUY close ≥ high − range/3; SELL close ≤ low + range/3 | mirror |
| direction / progression | MC | 3 consecutive closes beyond EMA20, each beyond the previous close | mirror |
| breakout candle | structure (BO, MC) | a confirmed CLOSE beyond the pivot; a wick alone never counts | mirror |
| rejection beyond a level | sweep (MR, SR basis) | wick beyond pivot + 0.05 % and close back inside | mirror |
| pullback candles | PB | closes relative to EMA20 (resolution), lows/highs after the 20-bar extreme (depth) | mirror |
| inside bar / engulfing | — | NOT used by the decision path (only by the analysis presenter `candlesticks.js`) | — |
| consecutive candles | MC, PB | runs of closes vs EMA20 | mirror |

Data-wide (bias-agnostic, every confirmed bar): rejection-candle SHAPE on 4,860 BUY / 4,060 SELL DEV bars, at a level 734 / 646, triggered 340 / 258: a long wick without a level stays WAIT, as specified.

Mirror test (V8_BUY_SELL_SYMMETRY): with the three price-relative terms neutralised, production candle/structure logic mirrors 2999 of 3000 bars; the single residual is the D1 tie-order case, absent in the corrected engine (3000 of 3000). No candle-level defect found.
