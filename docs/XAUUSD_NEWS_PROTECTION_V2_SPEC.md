# XAUUSD NEWS PROTECTION V2 — FROZEN SPECIFICATION

Frozen 2026-09-26 before any production code was edited. Evidence: V5 (`docs/XAUUSD_V5_*`), V5.1 (`docs/XAUUSD_V5_1_NEWS_PROTECTION_REVIEW.md`, `docs/XAUUSD_NEWS_PROTECTION_POLICY_V2_PROPOSAL.md`). Current behaviour authority: production code (V1, `docs/XAUUSD_NEWS_SHOCK_PROTECTION.md`). V2 is a SAFETY layer change only: no direction, no sentiment, no surprise logic, no entry-strategy change, no sizing change.

## 0. Decisions taken in this stage (technical, evidence-based)

**Open-position policy = O1 (preserve existing position management; strengthen NEW-ENTRY protection only).** Reasons: (1) V5 found no directional, continuation or reversal effect, so a scheduled release is not evidence that an existing BUY or SELL is wrong; (2) there is no historical tick/slippage evidence to quantify gap risk, so a forced close cannot be shown to be safer than the broker SL + emergency boundary + monetary limits already in force, while its cost (a certain, spread-paying exit of every position that happens to be open, on 2–3 releases a month) is known; (3) forced liquidation would be a new exit authority driven by the calendar, i.e. a strategy change outside this stage's scope; (4) deterministic behaviour and the V1 principle "news never closes" are preserved; (5) capital risk is unchanged (no SL widening, no larger loss tolerance, no hedge, no averaging, no reversal). Entry-side risk is reduced instead by the longer Tier-A/Tier-B protection below, which also reduces how often a position is opened close enough to a release to be carried through it. The pre-window stays 30 min (not shortened: the V1 safety rationale stands; not lengthened: no evidence that a longer generic pre-block adds safety proportional to its cost).

## 1. Tiers (deterministic, name-pattern based; relevance unchanged from V1)

Relevance (V1, unchanged): currency USD AND (impact HIGH OR always-relevant pattern). Every relevant event is then assigned exactly one tier:

| Tier | Pattern on `event_name` (case-insensitive) | Members |
|---|---|---|
| A | `FOMC Statement`, `FOMC Press Conference`, `FOMC Economic Projections`, `Federal Funds Rate` | the FOMC decision cluster |
| B | `CPI` (word) or `Consumer Price Index`; `Non-Farm` / `Nonfarm` / `Employment Situation`; `Unemployment Rate`; `Average Hourly Earnings` | CPI cluster rows; Employment Situation cluster rows |
| C | every other relevant event (including `Fed Chair`, PPI, PCE, retail sales, ISM, JOLTS, GDP, unknown USD HIGH) | generic V1 treatment |

UNKNOWN USD HIGH → Tier C = V1 windows (safe fallback; "not studied" keeps the existing protection, never less). Tiers never influence direction, model, quality or sizing.

## 2. Windows (minutes; all configurable within hard ranges, env names in §7)

| Phase | Tier C (V1) | Tier B | Tier A |
|---|---|---|---|
| PRE_NEWS | T − 30 → T | T − 30 → T | anchor − 30 → anchor (anchor = earliest Tier-A row of the cluster) |
| NEWS_ACTIVE | T → T + 5 | T → T + 5 | each row's T → T + 5 |
| POST_NEWS_COOLDOWN (clock minimum) | T + 5 → T + 35 | T + 5 → **T + 60** (cooldown 55) | → **max(anchor + 150, latest row T + 35, press-conference T + 90)** |
| POST_NEWS_COOLDOWN (normalisation extension) | none | until §3 satisfied, ≤ +120 beyond the clock minimum | same |

Tier-A cluster: Tier-A rows whose times are within 120 min of each other form one cluster; the cluster's protection interval is one merged interval (no duplicate/contradictory states); the press-conference term applies only when a Tier-A row named `FOMC Press Conference` exists in trustworthy calendar data (its real time is used); no press-conference time is ever invented. With no press-conference row, anchor + 150 already covers a 14:30 conference to 16:30 (+120 after its start). Overlapping windows of different events merge exactly as in V1 (state precedence NEWS_ACTIVE > PRE_NEWS > POST_NEWS_COOLDOWN; `block_ends_utc` = latest end currently in force).

## 3. Normalisation confirmation (Tier A and Tier B only)

Inputs: completed 15m bars, deterministically aggregated by the executor from the confirmed 5m bars it already receives every cycle (`primary_confirmed_bars`, evidence only): a 15m bucket = floor(time / 900) × 900; a bucket counts only when it holds exactly three 5m bars and its end (bucket + 900 s) ≤ now (no forming or partial candle, no look-ahead).

- Reference = median 15m true range of completed buckets with bucket start in [T − 25 h, T − 60 min] (T = release time; Tier A: anchor). Requires ≥ 24 buckets (6 h); otherwise `REFERENCE_UNAVAILABLE`.
- Normalised when, after the clock minimum, the **two** most recent completed buckets that start at or after T both have true range ≤ 1.5 × reference (`confirmBars` = 2; one quiet bar is not enough).
- If not normalised: the state stays POST_NEWS_COOLDOWN with `normalization.status = PENDING` until it is, or until clock minimum + 120 min (`MAX_EXTENSION_REACHED`, audited), whichever comes first.
- If bars are missing (`BARS_UNAVAILABLE`) or the reference cannot be built (`REFERENCE_UNAVAILABLE`): the block ends at the clock minimum, audited; the shock, spread and feed guards remain independent protection. The clock minimum can never be shortened by any normalisation result.
- Threshold 1.5 and confirmBars 2 are the V5 definition and a robustness choice; they are not tuned to P&L.

## 4. Independence of layers (unchanged contract, made explicit)

ENTRY_ALLOWED only when: calendar CLEAR (no PRE/ACTIVE/COOLDOWN incl. normalisation extension; DATA_UNAVAILABLE handled per §5) AND shock ≠ VOLATILITY_SHOCK AND feed healthy AND relative + absolute spread acceptable AND signal calculated after `last_block_cleared_at` and within `maxSignalAgeSec` AND every pre-existing REAL gate passes. Calendar expiry never overrides shock/spread/feed; shock normalisation never shortens a Tier-A/Tier-B clock minimum.

## 5. DATA_UNAVAILABLE and remembered events

Fail-closed BLOCK stays the default and cannot be disabled through `XAUUSD_NEWS_PROTECTION` (see the clarification in `XAUUSD_NEWS_PROTECTION_V2.md` §6 about the audited ALLOW/none configuration values). Addition (deterministic, no invented timestamps): when the calendar is DATA_UNAVAILABLE (stale/error/missing) but the last accepted event list exists (previously normalised, deduplicated, timestamped provider data kept in the monitor cache and persisted snapshot), the state machine still computes the Tier windows over that list and reports `remembered_block` (active flag, contributing events, block end). Under `dataUnavailablePolicy = ALLOW` an active remembered Tier-A/B/C window blocks with reason `NEWS_REMEMBERED_EVENT_BLOCK`. Remembered windows expire by their own clock; stale records cannot become permanent (an old snapshot's events are in the past and open no window); duplicates are controlled by `event_id`; restart restores the snapshot exactly as V1 does. Under BLOCK (production default) everything is blocked anyway; the remembered block is still reported for audit.

## 6. Fresh signal after protection (unchanged, verified)

`last_block_cleared_at` is set only when every block reason (news incl. normalisation extension, shock, feed) has cleared; a signal whose `calculated_at` ≤ `last_block_cleared_at` is rejected (`SIGNAL_PREDATES_NORMALIZATION`); `PROTECTION_BLOCK_ACTIVE` rejects during the block; dedup by `signal_id` and `maxSignalAgeSec` 600 apply unchanged; the analysis `calculated_at` is the confirmed-candle analysis timestamp.

## 7. Configuration (added to `mt5RealPolicy.js`; hard ranges; the layer still cannot be disabled)

| Field | Default | Env | Range |
|---|---|---|---|
| `newsTierBCooldownMin` | 55 | `XAUUSD_NEWS_TIER_B_COOLDOWN_MIN` | 30–120 (must be ≥ generic cooldown) |
| `newsTierAPostMin` | 150 | `XAUUSD_NEWS_TIER_A_POST_MIN` | 65–240 |
| `newsTierAPressConfCoverMin` | 90 | `XAUUSD_NEWS_TIER_A_PRESSCONF_COVER_MIN` | 30–180 |
| `newsTierAClusterGapMin` | 120 | `XAUUSD_NEWS_TIER_A_CLUSTER_GAP_MIN` | 30–240 |
| `newsNormalizationRatio` | 1.5 | `XAUUSD_NEWS_NORMALIZATION_RATIO` | 1.2–3.0 |
| `newsNormalizationConfirmBars` | 2 | `XAUUSD_NEWS_NORMALIZATION_CONFIRM_BARS` | 1–4 |
| `newsNormalizationMaxExtensionMin` | 120 | `XAUUSD_NEWS_NORMALIZATION_MAX_EXTENSION_MIN` | 0–240 |

Generic `newsPreWindowMin` 30 / `newsActiveWindowMin` 5 / `newsCooldownMin` 30 / `newsStaleSec` / `newsDataUnavailablePolicy` unchanged.

## 8. Audit additions

Contributing events carry `tier`, `cluster_anchor_utc` (Tier A), `clock_min_end_utc`; the state carries `normalization` {status, reference_range, last_ranges, confirm_bars, ratio, extension_min, max_extension_min} and `remembered_block` when applicable; `PROTECTION_STARTED` reports the V2 parameters; `NEWS_STATE_CHANGED` unchanged.

## 9. Out of scope (unchanged by V2)

5m entry models, 15m/30m/1H/2H+ authority, quality thresholds, RR ≥ 1.7, structural stops/targets, adaptive trade management, thesis exits, monetary ±, consecutive-loss breaker, daily ceiling, USER_FIXED 0.01, scaling (OFF), kill switch, DEMO profile (no protection layer).

## Amendment A1 (2026-09-26, before commit; evidence-driven, robustness not P&L)

The offline replay of the frozen §3 normalisation rule on the real V5 event set (`validation/v5_news_edge/v2_reference_variants.mjs`, `v2_slot_profile.mjs`) showed that the only references computable from the executor's ~41 h of bars are not robust: the 24 h reference is session-biased for 08:30 ET releases (New-York-morning bars are normally busier than the Asian/European bars before them), so the extension hit its 120-min cap in 65 % of Tier-A/B events and about half of the extra blocked bars were normal by the V5 same-slot definition; a previous-day same-slot reference is a single noisy day (unavailable on Mondays, contaminated by the previous day's releases). The slot profile also shows the systematic elevation of CPI ends near T+90 and of FOMC near anchor+150, while NFP and FOMC keep a mild plateau for hours that a bar-based extension would chase to the cap.

Decision: the Tier-A/B clock minimums stand (Tier B T+60, Tier A anchor+150 / press conference+90); the normalisation extension is implemented, tested and configurable but **disabled by default** (`newsNormalizationMaxExtensionMin = 0`). Its decision is still computed and audited as `normalization_shadow` for 2 h after every Tier-A/B clock minimum so that a future unbiased same-slot baseline can be calibrated from live audits before the extension is ever enforced. No other section changes.
