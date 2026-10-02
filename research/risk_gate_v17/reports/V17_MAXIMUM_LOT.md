# V17_MAXIMUM_LOT

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Rule
- **Over the maximum:** if the rounded size is above volume_max (200 lots, live broker data), the result is RISK_REJECTED_BROKER_LIMIT.
- **No silent cap:** V10's `sizePosition` capped silently at volume_max. V17 rejects, because a capped size was never part of the approved risk model.
- **Tests:** a 1e9 USD account at 1 % with a 0.5 USD stop is rejected; `checkVolume(201)` is rejected.

## Replay
- **Not binding.** The maximum lot never binds at 10,000 USD: the largest size is far below 200 lots. There are no BROKER_LIMIT rejections in any walk.
- **The rule is in force, not exercised:** it exists for completeness and is test-covered.
