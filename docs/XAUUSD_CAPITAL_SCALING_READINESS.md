# XAUUSD_CAPITAL_SCALING_READINESS

Research / design only (2026-09-26). Production remains USER_FIXED 0.01, breaker 2/2, RR 1.7, all protections unchanged. Nothing enabled.

Precondition from `XAUUSD_MASTER_EDGE_VALIDATION.md`: the current strategy is classified **EDGE_NOT_DEMONSTRATED** (mean R +0.001, CI [−0.082, +0.085], PF 1.07, validation half PF 0.95). Capital scaling of any kind is therefore not a live question yet; this document records what the data says about SEED risk and what must be true before USER_FIXED could ever become APPROVED_SCALING.

---

## PART 18 — SEED CAPITAL POLICY RESEARCH (62.07 USD, 0.01 minimum, leverage 1:200, margin ≈ 21.5 USD per 0.01, contract 100 oz)

Simulation: CURRENT-strategy signals (1,447 on 129 sessions), production exits, single position, production breaker, cost allowance 0.60 USD, V2 tier-0 margin rules (margin ≤ 40 % of equity, free margin ≥ 55 %, margin level at stop ≥ 200 %), governor 8 / 12 / 20 %. Percentages are applied to CURRENT simulated equity at every signal. Five loss-state designs were compared.

| Risk % | Loss-state design | Taken | Refused (risk) | Ending | Max DD % | Participation % | Margin-locked at end |
|---|---|---|---|---|---|---|---|
| 3 | any | 2 | 1,404 | 62.69 | 0 | 0.14 | no |
| 4 | none / day-roll / cooling 4h | 13 | 1,392 | 62.21 | 10.6 | 0.93 | no |
| 4 | signal-decay 10 | 8 | 1,397 | 63.81 | 8.4 | 0.57 | no |
| 4 | V2 as written | 1 | 1,405 | 59.52 | 4.1 | 0.07 | no |
| 5 | any | 1–2 | 1,404–1,405 | 55.06–58.51 | 5.7–11.3 | 0.07–0.14 | no |
| 6 | any | 2–3 | 1,397–1,404 | 53.10–54.04 | 13–14.5 | 0.14–0.21 | yes (except V2/day-roll: 53.96–54.04, one signal from lock) |
| 7.5 | signal-decay 10 | 6 | 1,399 | 76.00 | 13.2 | 0.43 | no |
| 7.5 | other designs | 2 | 1,397–1,404 | 53.10–55.05 | 11.3–14.5 | 0.14 | yes / borderline |
| 10 | any | 2 | 1,397–1,404 | 53.10–54.04 | 12.9–14.5 | 0.14 | yes / borderline |

Monte Carlo (3,000 seeded paths × 1,200 presented signals, breaker ignored, identical sequences): median ending equity 3 % 62.4, 4 % 57.1, 5 % 56.9, 6 % 56.8, 7.5 % 54.9, 10 % 54.6; ending below start in 78–82 % of paths for 4–10 %; margin-locked at the end in 42 % (4 %) to 66 % (7.5 %) of paths; median trades taken 4–5 per 1,200 presented. The loss-state design barely changes these figures because a second lock dominates (below).

**Two deadlocks, not one.** The V2 "× 0.5 after a loss until a win" rule locks the account after one loss (a win can never occur if nothing is affordable). Fixing it with a day-roll reset, a 10-signal decay or a 4-hour cooling period removes that lock, but the **drawdown governor produces the same deadlock**: after two losses the drawdown exceeds 8 %, risk halves, nothing is affordable, and the equity-based recovery condition can never be met without trades. In the 129-session path every design at 5–10 % took its first two affordable trades in late April, lost both, and then sat locked for five months.

**V2_LOSS_MULTIPLIER_DEADLOCK_FIX_DESIGN (deterministic, for a floor-lot tier):**
1. A multiplier may never reduce permitted risk below the affordability level of the broker minimum for the tier's reference stop set; if it would, the state becomes a PAUSE, not a reduced size.
2. Loss state: after a loss, PAUSE until the next UTC day roll (identical to the production breaker's own reset) or until 10 presented signals have passed, whichever is later; then resume at base risk. No win is required.
3. Drawdown governor at floor-lot tiers: CAUTION = PAUSE for the remainder of the session plus one full session; DEFENSIVE = PAUSE for 3 sessions and require that no new equity low is made during the pause; CAPITAL_PRESERVATION = PAUSE until a dated user acknowledgement. Recovery is time- and evidence-based (no new low, elapsed sessions), never "equity recovered", because equity cannot recover without trades.
4. At tiers where the lot can actually be reduced (tier 3 and above), multiplicative reduction is allowed exactly as in V2, with the same floor rule.
5. Invariants preserved: LOSS → same or lower permitted risk (a pause is risk 0), and lot(n+1) ≤ lot(n) after a loss.

**SEED_RISK_SUPPORTED_RANGE = 3 % to 5 %** on survival grounds only (nothing above 5 % avoided the margin lock at 53.7 USD in the historical path or in more than half of the Monte Carlo paths). **SEED_FINAL_PERCENTAGE_JUSTIFIED = NO**: within 3–5 % the account takes 2–13 trades in five months, the outcomes are pure path luck, and with an undemonstrated edge the expected value of participating is not positive. A percentage cannot be selected by evidence until expectancy is established.

Recovery reference (equal-percentage losses from 62.07): five losses leave 53.30 (3 %), 50.61 (4 %), 48.03 (5 %), 45.55 (6 %), 42.03 (7.5 %), 36.65 (10 %); the 40 % margin cap locks 0.01 below 53.7 USD at gold ≈ 4,300.

---

## PART 19 — CAPITAL GROWTH ARCHITECTURE (tier review)

The tier table of `CAPITAL_GROWTH_ARCHITECTURE_62_TO_6M.md` (V2) stands with these corrections from this program:

| Tier band | Risk ceiling | Lot ceiling | Margin reserve | Promotion evidence (raised) | Demotion trigger | Profit reserve | Reviews |
|---|---|---|---|---|---|---|---|
| 0–2 (62 → 500) | 3–5 %, floor-lot PAUSE governor (above), 0.01 only when structural risk + 0.60 ≤ permitted | 0.01 | margin ≤ 40 → 20 % of equity, free ≥ 55 % | **no promotion of risk % until the strategy classification reaches at least PROMISING with ≥ 300 out-of-sample trades**; balance thresholds as before | balance below tier floor, drawdown PAUSE states | none | none |
| 3–6 (500 → 10k) | 3 → 1.5 % | 0.02 → 0.10 | ≤ 15 → 10 %, free ≥ 55–60 % | 30–40 trades AND 45–60 days, mean R ≥ +0.15 with n ≥ 30, PF ≥ 1.2, both walk-forward halves positive | as V2 (immediate) | 10 % of gain from tier 4 | none |
| 7–10 (10k → 250k) | 1.25 → 0.75 % | 0.16 → 1.00 (existing absolute ceiling) | ≤ 8 → 5 %, free ≥ 60–65 % | 40–60 trades AND 90–120 days, 10 daily-close confirmation | as V2 | 15–25 % | BROKER EXPOSURE (tier 8), LIQUIDITY/SLIPPAGE (tier 10) |
| 11–18 (250k → 6M) | 0.6 → 0.25 % | 2.0 → 18.0 | ≤ 4 → 2.5 %, free ≥ 65–75 % | 60–100 trades AND 120–180 days, 20 daily-close confirmation | as V2 | 30–40 % | REQUIRES INSTITUTIONAL-SCALE REVIEW at every tier; multi-venue from tier 13 |

The 6M objective remains reporting-only: no deadline, no growth rate, no trade quota, no dependency path into any decision file (verified: no such reference exists in `src/`, `mt5/`, `docs/`).

---

## PART 20 — SCALING READINESS (dormant `mt5RealScaling.js`, `mt5CapitalPolicy.js`, executor hook, python bridge)

| Required property | Status | Detail |
|---|---|---|
| Structural-stop sizing | MISSING | fixed 25 USD price envelope instead of the signal's stop |
| Cost-aware risk | MISSING | spread only in a min-distance check |
| Broker minimum refusal | SUPPORTED | `LOT_BELOW_BROKER_MIN` |
| Margin / reserve | PARTIAL | margin ≤ free margin and 50 % budget; no reserve fraction, no margin-level-at-stop test |
| Drawdown governor | MISSING | none; and the V2 design must use the PAUSE form at floor-lot tiers (Part 18) |
| Loss state | MISSING inside sizing (breaker separate) | must use the deadlock-free design |
| HWM / confirmation / stabilization | MISSING | sizes immediately from current equity |
| Promotion / demotion | MISSING | continuous function |
| Absolute exposure caps | SUPPORTED (1.0 lot; env can only lower) | keep until institutional review |
| Objective isolation | MISSING (no test) | design requires dependency + determinism tests |
| Determinism | SUPPORTED | pure function |
| No martingale / no averaging / no recovery sizing | SUPPORTED by construction (lot non-decreasing in equity) | keep |
| Same-or-lower risk after loss | NOT ENFORCED in code | needs the post-loss lot cap and the monotone multipliers |
| Lot authority switch | NEEDS USER APPROVAL | executor `LOT_NOT_USER_APPROVED`, python `REQUIRED_EXACT_VOLUME`, `FORBIDDEN_ENV`; `LOT_AUTHORITY.APPROVED_SCALING` unused |
| Strategy edge | **NOT DEMONSTRATED** | the blocking precondition |

**CAPITAL_SCALING_READY = NO.** EXACT_BLOCKERS: (1) strategy classification EDGE_NOT_DEMONSTRATED; (2) the six MISSING properties above; (3) the deadlock-free governor/loss-state design not yet approved; (4) lot-authority switch not approved; (5) leverage 1:200 makes 0.01 unaffordable by margin below ≈ 54 USD, so the SEED account is one drawdown away from being unable to trade at all.

---

## PART 21 — REQUIRED TEST MATRIX BEFORE ANY STRATEGY OR CAPITAL-POLICY CHANGE

| Area | Tests |
|---|---|
| Unit | every sizing step (risk base, permitted risk, lot floor, caps, margin, reserve, margin level), every governor state and transition, every promotion condition individually |
| Property | LOSS → permitted_risk(n+1) ≤ permitted_risk(n) and lot(n+1) ≤ lot(n) under randomized inputs; floor-lot PAUSE never yields a reduced size below affordability; lot never rounds up |
| Replay | the master harness reproduces the live store's signals (≥ 90 % match on the OANDA feed); any proposed strategy change replayed on ≥ 60 sessions |
| Walk-forward | chronological 60/40 split; a change must improve the validation segment, not only discovery; no shuffling |
| Determinism | identical inputs → identical outputs; objective 100k / 1M / 6M → identical decisions and lots |
| Objective isolation | dependency test that the milestone module is imported by no engine/executor/guard file |
| Broker minimum | sized lot < 0.01 → NO_TRADE with reason; never 0.01 by rounding |
| Margin | 1:200 footprint, gold-price-driven margin growth, margin cap, reserve, margin level at stop, stop-out buffer |
| Loss state | day-roll / signal-decay / pause semantics; no deadlock (a path with only losses must still present affordable trades after the pause) |
| Drawdown | thresholds per tier band, PAUSE recovery by elapsed sessions and no-new-low, PRESERVATION acknowledgement record |
| Promotion / demotion | all 11 conditions required; demotion immediate; HWM regression on a close below threshold; floating profit never counts |
| Executor integration | sizing runs after every existing gate; `LOT_NOT_USER_APPROVED` remains until the approval token; python exact-volume rule changes only under the same token; News/Shock/feed/spread guards untouched |
| News / Shock | guard behaviour unchanged under sizing; blocked signals never sized |
| Feed failure | CANDLE_READ_FAILED streaks, FEED_STALLED alert, stale-signal (600 s) rejection, no replay of missed candles |
| Duplicate prevention | same-thesis folding, one position, no re-entry on the same signal id |
| Restart / recovery | state rebuild from broker history after crash and after controlled stop; counters never reset; lock reclaim |
| Live-shadow observation | at least 60 sessions of shadow sizing (computed, logged, never executed) compared with the replay before enablement |

---

STRATEGY_CHANGE_JUSTIFIED = NO (candidates for a later approval stage are listed in the master document)
NEXT_PRODUCTION_CHANGE_RECOMMENDED = NONE

PRODUCTION_CODE_CHANGED = NO
PRODUCTION_CONFIG_CHANGED = NO
USER_FIXED_0_01_CHANGED = NO
AUTO_SCALING_ENABLED = NO
BREAKER_CHANGED = NO
LIVE_ENGINE_RESTARTED = NO
TRADE_PLACED = NO
