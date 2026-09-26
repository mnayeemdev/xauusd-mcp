# XAUUSD NEWS PROTECTION POLICY V2 — PROPOSAL (DESIGN ONLY)

Status: HISTORICAL PROPOSAL — IMPLEMENTED as News Protection V2 (commit e46b3be, active on the REAL watcher since 2026-09-26 09:05 UTC; see `docs/XAUUSD_NEWS_PROTECTION_V2.md`). Evidence: `docs/XAUUSD_V5_NEWS_BEHAVIOUR_STUDY.md`, `docs/XAUUSD_V5_NEWS_EDGE_MATRIX.md`, review in `docs/XAUUSD_V5_1_NEWS_PROTECTION_REVIEW.md`. News stays a SAFETY layer: V2 contains no BUY/SELL authority, no direction, no surprise logic. NFP/CPI/FOMC are RISK INFORMATION only.

## 1. Current production (V1) vs proposed V2

| Item | CURRENT PRODUCTION (V1) | PROPOSED V2 |
|---|---|---|
| Event classes | one class: relevant (USD HIGH or FOMC/Fed-Chair pattern) | three classes: **TIER_A** = FOMC cluster (statement, rate decision, projections, press conference); **TIER_B** = CPI, Employment Situation (NFP); **TIER_C** = every other relevant event (PPI, PCE, JOLTS, GDP, retail sales, ISM, ADP, Fed Chair, etc.) |
| Pre-window | 30 min, all | TIER_C 30 min (unchanged); TIER_B 30 min (unchanged; optional 60 min, see §5); TIER_A 30 min before the statement |
| Active window | 5 min, all | unchanged 5 min |
| Minimum post cooldown | 30 min, all (block ends +35) | TIER_C 30 min (unchanged, +35); **TIER_B 55 min (block ends +60)**; **TIER_A: block ends at statement +150 min, and never before press-conference start +90 min** |
| Normalisation condition to lift the block | window over AND shock ≠ VOLATILITY_SHOCK AND feed fresh (V1 already condition-based) | unchanged, plus an explicit **post-event range check** for TIER_A/B: the last confirmed 15m range ≤ 1.5 × the pre-event reference (median 15m range of the 24 h before the event, excluding the last hour) — the V5 normalisation definition — before the block may end (a clock minimum, then a condition) |
| FOMC press conference | covered only if the provider publishes a `FOMC Press Conference` row (30/5/30 around 14:30) | **cluster rule**: any TIER_A row defines a cluster anchored at the statement time; press conference assumed at +30 min if no row is present; block covers statement −30 → statement +150 (or later per normalisation) |
| Fresh-signal requirement | signal calculated after `last_block_cleared_at`, age ≤ 600 s | unchanged |
| DATA_UNAVAILABLE | BLOCK (default, cannot be disabled) | unchanged BLOCK; add: if a TIER_A/B release is known from the last good snapshot to fall inside the stale period, keep TIER windows active from the snapshot (fail-closed on remembered events even while the provider is down) |
| Spread gate | relative 2×/0.35 USD + absolute 0.6 USD | unchanged; V5 could not measure release-second spreads (no ticks), so no evidence-based change |
| Open position | never closed by news | unchanged (no news-driven close); see §5 for the pre-event exposure options that need an owner decision |
| Shock detector | unchanged | unchanged (bursts are covered; tails are handled by the calendar tiers above) |

Everything else in V1 (guard order, audit fields, DISABLED semantics, provider abstraction, timezone policy) is unchanged.

## 2. Evidence for each change

- **TIER_B cooldown 55 (+60 total):** CPI/NFP 60-min realized range 1.7–2.8 × control in every region; normalisation median 30–60 min (2022–24) and 30 min (2025–26); the 35-min V1 window ends inside the tail in roughly half of the 2022–24 releases. Release bar 3–4 × normal; V5 holdout confirmed (CPI 1.67 ×, NFP 2.06 × at 60 min).
- **TIER_A +150 with press-conference floor:** FOMC 60-min range 5.8 / 3.9 × control; [30, 90) window as volatile as [0, 30); normalisation median 150 / 105 min; 31 % / 11 % of meetings not normal within 4 h. n 13 / 9 (below the V5 gate minimum; this is a safety setting, not an edge claim).
- **No change for TIER_C:** PPI/PCE/JOLTS/GDP normalise in 15–30 min and are ≈ control in validation; longer windows would be pure overblocking.
- **Normalisation condition:** V5 measured that elevated range, not the release minute, defines the risk period; the shock detector's 10-minute clearance is short relative to it.
- **Pre-window unchanged:** V5 found no pre-event behaviour that justifies a longer or shorter generic pre-window (mild 8–13 % compression, none in the last 15 min, expansion before FOMC).
- **DATA_UNAVAILABLE snapshot rule:** the weekend `CALENDAR_STALE` episode in the live log shows the provider can go stale; remembered TIER_A/B times should still block.

## 3. State machine (proposed additions only)

States unchanged (`NORMAL`, `PRE_NEWS`, `NEWS_ACTIVE`, `POST_NEWS_COOLDOWN`, `DATA_UNAVAILABLE`, `DISABLED`). Additions: each contributing event carries `tier`; `POST_NEWS_COOLDOWN` for TIER_A/B ends at max(clock minimum, normalisation condition met); `block_ends_utc` reports the clock minimum and a `normalization_pending: true|false` flag; audit adds `tier`, `cluster_anchor_utc`, `post_event_range_ratio`. Tier assignment by event-name patterns (`Consumer Price Index|CPI`, `Non-Farm|Nonfarm|Employment Situation`, `FOMC|Federal Funds Rate`) with the provider's impact grade as the fallback to TIER_C; unmatched relevant events stay TIER_C (fail to the generic rule, never to "not relevant").

Configuration (all bounded, env-overridable like V1): `newsTierBCooldownMin` (default 55, range 30–120), `newsTierAPostMin` (150, 65–240), `newsTierAPressConfOffsetMin` (30, 15–60), `newsPostNormalizationRatio` (1.5, 1.2–3.0), `newsSnapshotFailClosed` (true).

## 4. Overblocking analysis (approximate; historical frequencies)

Assumptions: XAUUSD active ≈ 23 h/day × 5 days ≈ 115 h/week ≈ 500 h/month. Relevant-event windows per year under V1 grading (FF HIGH USD + patterns): CPI 12, NFP 12, PPI 12, retail sales 12, PCE 12, GDP advance 4, JOLTS 12, ISM ×2 24, FOMC meetings 8 (statement + press-conference rows merged: 95-min block), FOMC minutes 8, Fed Chair appearances ≈ 12, consumer confidence 12, UoM/ADP partly HIGH ≈ 12 → ≈ 150 windows/yr ≈ 12.5/month; ≈ 10 % share a merged window (same-day 08:30 clusters).

| Policy | Blocked time / month | Share of active time |
|---|---|---|
| CURRENT V1 | ≈ 11.3 windows × 65 min + FOMC extra (8 × 30 min / 12) ≈ **12.6 h** | ≈ 2.5 % |
| V2 TIER_B rule (CPI, NFP +25 min each) | + 24 × 25 min / 12 ≈ **+0.8 h** | +0.2 % |
| V2 TIER_A rule (FOMC block 180 min vs 95) | + 8 × 85 min / 12 ≈ **+0.9 h** | +0.2 % |
| V2 normalisation condition (data-driven extension beyond the clock) | + ≈ 0.3–0.6 h (about a quarter of CPI/NFP/FOMC events extend 15–30 min) | +0.1 % |
| **V2 total** | ≈ **14.6–14.9 h** | ≈ **2.9–3.0 %** |
| Optional §5 pre-window 60 min for TIER_A/B | + 32 × 30 min / 12 ≈ +1.3 h | +0.3 % |

Incremental blocking ≈ 2–2.3 h/month (≈ 0.4–0.5 % of active time), concentrated in the 20 highest-volatility hours of the month. No reduction of any existing window is proposed (not optimised for trade frequency).

## 5. Open-position exposure before TIER_A/B releases — options for owner decision (none implemented, none widens SL or raises loss tolerance)

Gap: a position opened > 30 min before CPI/NFP/FOMC is carried through a release bar of 4–7 × normal size with a broker SL of a few USD; fills may slip or gap, and the emergency boundary close is the only backstop. V5 found no directional bias (holding through is not systematically wrong); the concern is execution risk on a 62 USD account.

| Option | Behaviour | Cost / trade-off |
|---|---|---|
| O1 — keep V1 | hold through with broker SL + emergency boundary close | slippage/gap risk on the ≈ 2–3 releases per month that matter |
| O2 — extended TIER_A/B pre-window (60 min) | fewer positions still open at the release; no news-driven close | +1.3 h/month blocking; still carries positions opened earlier than −60 |
| O3 — pre-release exposure review | a documented owner rule such as "no new TIER_A/B-crossing entries when the planned holding time would cross the release" | needs the REAL ledger's holding-time distribution (to be measured before deciding; not assumed here) |
| O4 — flatten before TIER_A/B release | close an open REAL position at −5 min | a strategy-exit change and a departure from the V1 principle that news never closes; V5 gives no expectancy reason for it; owner decision only |

Recommendation for the review meeting: decide between O1 and O2/O3 first; O4 only if the owner prioritises gap-risk elimination over the V1 principle.

## 6. Implementation prerequisites (if approved)

1. Owner approval of the tier definitions, the TIER_B 55 / TIER_A 150 minimums and the normalisation ratio.
2. Tests before code: tier classification (including provider-name variants and the press-conference-absent case), cluster anchoring, clock-then-condition cooldown, DATA_UNAVAILABLE snapshot fail-closed, audit fields; replay against the V5 event list to confirm block lengths.
3. Deployment only with the REAL account FLAT, after the usual stop/start procedure; counters, lot 0.01, breaker and all other authorities unchanged.
4. Post-deployment verification on the first CPI, NFP and FOMC after activation (audit log: tier, block start/end, normalisation ratio).

## 7. Permanent owner capital mandate (unchanged, for the record)

Objectives USD 6,000,000 then USD 600,000,000 are destinations, never signals. CURRENT_REAL_LOT = USER_FIXED 0.01, hard lock. Owner examples (USD 20,000 → consider 0.02; USD 500,000 → consider 0.04) are not automatic rules. Any exposure increase requires demonstrated edge, forward validation, adequate sample, acceptable drawdown, capital-preservation gate, execution/liquidity capacity, broker/margin safety and explicit owner approval. Nothing in this proposal touches sizing.
