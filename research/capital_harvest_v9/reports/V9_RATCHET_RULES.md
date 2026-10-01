# V9_RATCHET_RULES

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

| Rule | Implementation | Verified by |
|---|---|---|
| Floor may move up | the new floor replaces the old one only if it is better for the trade | unit test (monotone sequence) |
| Never loosened | no code path lowers an armed floor | unit test + code review |
| Minimum protection | an armed floor is at least break-even (fill + slippage) | unit test |
| Never above the market | capped at the current close (BUY) / close + spread (SELL) | unit test |
| Next-bar effect | a floor set at close j is a hard level from bar j + 1 | unit test |
| Structural SL / broker fail-safe | never widened, always active | baseline reproduction (exact) |

Armed share (HOLD): 55.7 % / 45.9 % / 55.7 %. Additional profit after protection (realized R − open R at arming): -0.027 / -0.016 / -0.007 R — on average the trade realizes slightly LESS than it showed when protection armed.
