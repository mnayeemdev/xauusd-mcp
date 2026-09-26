# XAUUSD MCP — NEWS PROTECTION V2 (implemented 2026-09-26)

Production documentation for the tiered calendar protection that replaces the generic V1 windows on the REAL MT5 profile. V2 is a SAFETY layer change only. It contains no direction, no news sentiment, no surprise logic; it does not touch the 5m entry models, the 15m/30m/1H/2H+ authority, quality thresholds, RR ≥ 1.7, structural stops/targets, adaptive management, thesis exits, monetary limits, the consecutive-loss breaker, the daily ceiling, USER_FIXED 0.01, scaling (OFF) or the kill switch. The DEMO profile has no protection layer and is unchanged.

Companion documents: V1 (unchanged parts: shock detector, guards, emergency handling, audit) `docs/XAUUSD_NEWS_SHOCK_PROTECTION.md`; evidence `docs/XAUUSD_V5_NEWS_BEHAVIOUR_STUDY.md`, `docs/XAUUSD_V5_NEWS_EDGE_MATRIX.md`; review `docs/XAUUSD_V5_1_NEWS_PROTECTION_REVIEW.md`; proposal `docs/XAUUSD_NEWS_PROTECTION_POLICY_V2_PROPOSAL.md`; frozen spec + amendment `docs/XAUUSD_NEWS_PROTECTION_V2_SPEC.md`. Tests: `tests/news_protection_v2.test.js` (28), `tests/news_shock_protection.test.js` (56, updated for Tier B).

## 1. V1 (historical) vs V2 (implemented)

| Item | V1 (2026-09-25 → V2 activation) | V2 (this document) |
|---|---|---|
| Relevance | USD HIGH, or FOMC Statement / Press Conference / Economic Projections / Federal Funds Rate / Fed Chair patterns | unchanged |
| Tiers | none | A = FOMC decision cluster; B = CPI cluster, Employment Situation (NFP) cluster; C = everything else incl. unknown USD HIGH |
| PRE_NEWS | T−30 → T | unchanged for every tier (Tier A: anchor−30) |
| NEWS_ACTIVE | T → T+5 | unchanged |
| POST_NEWS_COOLDOWN | T+5 → T+35 for every row | Tier C: T+35 (V1); **Tier B: T+60**; **Tier A: one merged interval to max(anchor+150, last row+35, press conference+90)** |
| Normalisation extension | none | implemented, **disabled by default**, shadow-audited (§4) |
| DATA_UNAVAILABLE | BLOCK (default), ALLOW allowed-and-audited | BLOCK unchanged; under ALLOW a window remembered from the last accepted calendar still blocks (§6) |
| Open position | never closed by news | unchanged (policy O1, §7) |
| Shock / feed / spread / fresh-signal guards | as V1 | unchanged, independent (§5) |
| Audit | news state, event, provider, shock evidence, guards | plus tier, cluster anchor, clock-minimum end, normalisation (or shadow), remembered block |

## 2. Evidence (not reinterpreted)

V5: DIRECTIONAL / REVERSAL / CONTINUATION news edge = NO; VOLATILITY edge and SAFETY finding = YES (CPI/NFP release bar 3–4 × and 60-min range 1.7–2.8 × matched control, confirmed on the holdout; FOMC 60-min range 3.9–5.8 ×, press-conference window as volatile as the statement, normalisation 105–150 min; surprise behaviour untested for lack of forecast data). V5.1: CPI and NFP protection PARTIAL, FOMC INSUFFICIENT under the generic 35-min post window; PCE/PPI/JOLTS/GDP adequate. The slot profile computed for this stage (`validation/v5_news_edge/v2_slot_profile_results.json`; share of releases whose 15m bar exceeds 1.5 × the same-slot control median, background 16 %): CPI 0.90 → 0.36 at T+60 → 0.22 at T+90 → ≈ 0.18 after; NFP 0.96 → 0.29 at T+60 with a mild 0.3–0.4 plateau for hours; FOMC ≥ 0.9 through +90, 0.76 to +135, 0.56 at +150, ≈ 0.45–0.5 plateau to the close; PPI/PCE/JOLTS/GDP back near background by T+45–60.

## 3. Tiers and windows (code: `src/engine/newsCalendar.js` `classifyNewsTier`, `src/engine/newsRisk.js` `buildProtectionIntervals`)

- **Tier A** patterns: `FOMC Statement`, `FOMC Press Conference`, `FOMC Economic Projections`, `Federal Funds Rate`. Rows within `tierAClusterGapMin` (120) of each other form one cluster anchored at the earliest row. Only rows at the anchor minute carry a PRE_NEWS phase (a press-conference row never opens a contradictory PRE state inside the cluster). Clock minimum = max(anchor + 150, latest row + 35, press conference + 90 when a `FOMC Press Conference` row exists in accepted calendar data). No press-conference time is ever invented: without the row, anchor + 150 already covers a 14:30 ET conference to 16:30 ET.
- **Tier B** patterns: `CPI`, `Consumer Price Index`, `Non-Farm`/`Nonfarm`, `Employment Situation`, `Unemployment Rate`, `Average Hourly Earnings`. Cooldown 55 → block ends T+60. Cluster rows at the same minute (payrolls, unemployment rate, earnings) contribute individually and end together.
- **Tier C**: every other relevant event, including provider-rated USD HIGH releases that V5 did not study (retail sales, ISM, …) and `Fed Chair` appearances: V1 windows unchanged (T+35). Note: `ADP Non-Farm Employment Change` matches the Tier B `Non-Farm` pattern in code and is therefore protected as Tier B (more protection; documented 2026-09-26). "Not studied" never means "less protection".
- Overlaps merge as in V1: state precedence NEWS_ACTIVE > PRE_NEWS > POST_NEWS_COOLDOWN; `block_ends_utc` = latest end of the phases currently in force; each contributing event also reports `clock_min_end_utc`, `tier`, `cluster_anchor_utc`, `press_conference_utc`.

## 4. Normalisation confirmation (implemented, shadow-only by default)

`evaluateNormalization` compares the last `normalizationConfirmBars` (2) COMPLETED 15m bars after the release (aggregated by the executor from its confirmed 5m bars: exactly three 5m bars per bucket, bucket end ≤ now, never a forming candle) with `normalizationRatio` (1.5) × the median 15m true range of [T−25 h, T−1 h] (≥ 24 bars). Statuses: `BARS_UNAVAILABLE`, `REFERENCE_UNAVAILABLE`, `PENDING`, `NORMALIZED`, `MAX_EXTENSION_REACHED`. When `newsNormalizationMaxExtensionMin` > 0 the Tier-A/B block persists after the clock minimum while `PENDING`, bounded by that maximum; a missing reference or missing bars end the block at the clock minimum (audited); the clock minimum can never be shortened; Tier C is never extended.

**Default = 0 (off).** The offline replay (spec amendment A1) showed the 24-hour reference is session-biased for 08:30 ET releases (extension to the cap in 65 % of Tier-A/B events; half of the extra blocked bars normal by the V5 same-slot definition) and that a previous-day same-slot reference is a single noisy day. Enforcing it would over-block by ≈ 2 h per CPI/NFP without a proportional safety gain, while the clock minimums already capture the systematic elevation. Instead, for 2 h after every Tier-A/B clock minimum the decision is computed and written to the audit as `normalization_shadow` (`enforced: false`), so a future same-slot baseline can be calibrated from live data before anything is enforced. Enabling the extension is a configuration change (`XAUUSD_NEWS_NORMALIZATION_MAX_EXTENSION_MIN`, 0–240) that must follow that calibration.

## 5. Independence of layers (unchanged contract)

ENTRY_ALLOWED only when: every pre-existing REAL gate passes (halt, kill switch, account, connectivity, pending intent, dedup, `maxSignalAgeSec` 600, one position, breakers, quote age, absolute spread, drift) AND calendar clear (no PRE/ACTIVE/COOLDOWN; DATA_UNAVAILABLE per §6) AND shock ≠ VOLATILITY_SHOCK AND feed healthy (≤ 90 s) AND relative spread acceptable AND signal calculated after `last_block_cleared_at`. Calendar expiry never clears a shock; shock normalisation never shortens a Tier-A/B clock minimum; `last_block_cleared_at` moves only when the last reason (news, remembered event, shock, feed) clears. Verified by tests: shock during news, shock persisting after the calendar block, spread abnormal after cooldown, stale feed after cooldown, signal calculated inside a block or extension rejected as `SIGNAL_PREDATES_NORMALIZATION`, quiet bars and a NORMAL shock cannot end a Tier-B block before T+60.

## 6. DATA_UNAVAILABLE and remembered events

Fail-closed BLOCK stays the default and cannot be disabled through `XAUUSD_NEWS_PROTECTION`. Clarification (2026-09-26): the REAL config does accept `XAUUSD_NEWS_DATA_UNAVAILABLE_POLICY=ALLOW` and `XAUUSD_NEWS_PROVIDER=none` inside its hard ranges (both audited in `PROTECTION_STARTED`; the pre-market report flags them as WARN); the frozen baseline runs BLOCK / http_json, and an empty or entirely unusable calendar payload is now rejected like a failed fetch (never fail-open). New: while the calendar is not trusted (stale > 6 h, provider error without a fresh cache, malformed), the state machine still computes the tier windows over the last ACCEPTED event list (previously normalised, deduplicated, timestamped provider records restored from the persisted snapshot) and reports `remembered_block` {active, contributing, block_ends_utc, source_timestamp}. Under `ALLOW` an active remembered window blocks with `NEWS_REMEMBERED_EVENT_BLOCK` (audit reason `NEWS:REMEMBERED_EVENT`); once it expires by its own clock, `ALLOW` permits and audits as before. Remembered windows use clock minimums only (no bars while untrusted), expire deterministically, cannot become permanent (old snapshots open no window), keep `event_id` dedup and restore identically after a restart. No timestamp is ever invented.

## 7. Open-position policy (O1, selected in this stage)

A position that is open before a release stays under its existing management: broker SL/TP (fail-safe SL = min(monetary −50 USD, structural stop × 1.5 + spread)), adaptive thesis exit on confirmed candles, monetary monitor, fast safety monitor (restore a vanished SL; governed close if price is beyond the broker SL by > 0.5 USD), kill switch. News never closes, reverses, hedges, averages or modifies a position; `open_position_action: 'NONE'` is audited on every block. Reasons: V5 found no directional/continuation/reversal effect, so a release is not evidence that an existing position is wrong; no tick/slippage history exists to show a forced close is safer than the broker boundary; a forced close would be a calendar-driven exit authority (a strategy change) with a known cost; capital risk is unchanged (no SL widening, no larger loss tolerance). Entry-side exposure is reduced by the longer Tier-A/B windows instead. Residual gap (documented, unchanged): a position opened more than 30 min before a Tier-A/B release is carried through a 3–7 × release bar with a few-USD broker SL; the owner may revisit options O2–O4 of the proposal with the live-audit evidence V2 now produces.

## 8. Fresh-signal contract (unchanged, verified)

`SIGNAL_PREDATES_NORMALIZATION` rejects any signal whose `calculated_at` ≤ `last_block_cleared_at`; `PROTECTION_BLOCK_ACTIVE` rejects during a block; `DUPLICATE_SIGNAL` and `STALE_SIGNAL` (600 s) apply first; `calculated_at` is the confirmed-candle analysis timestamp.

## 9. Configuration (REAL profile, `src/engine/mt5RealPolicy.js`)

| Field | Default | Env | Range |
|---|---|---|---|
| newsPreWindowMin / newsActiveWindowMin / newsCooldownMin | 30 / 5 / 30 | as V1 | as V1 |
| newsTierBCooldownMin | 55 | `XAUUSD_NEWS_TIER_B_COOLDOWN_MIN` | 30–120, ≥ newsCooldownMin |
| newsTierAPostMin | 150 | `XAUUSD_NEWS_TIER_A_POST_MIN` | 65–240 |
| newsTierAPressConfCoverMin | 90 | `XAUUSD_NEWS_TIER_A_PRESSCONF_COVER_MIN` | 30–180 |
| newsTierAClusterGapMin | 120 | `XAUUSD_NEWS_TIER_A_CLUSTER_GAP_MIN` | 30–240 |
| newsNormalizationRatio | 1.5 | `XAUUSD_NEWS_NORMALIZATION_RATIO` | 1.2–3.0 |
| newsNormalizationConfirmBars | 2 | `XAUUSD_NEWS_NORMALIZATION_CONFIRM_BARS` | 1–4 |
| newsNormalizationMaxExtensionMin | **0** (off, shadow) | `XAUUSD_NEWS_NORMALIZATION_MAX_EXTENSION_MIN` | 0–240 |

`XAUUSD_NEWS_PROTECTION` still cannot disable the layer; provider `none` is still audited as DISABLED.

## 10. Historical safety simulation (V1 vs V2, `validation/v5_news_edge/v2_reference_variants.mjs`, 278 official events 2022-07 → 2026-09, ground truth = 15m true range > 1.5 × same-slot matched-control median)

| Policy | Abnormal-bar coverage [0, 240 min] | Residual abnormal bars after unblock | Events with residual | Blocked h/month (7 families) | Over-block share of post-release blocked bars |
|---|---|---|---|---|---|
| V1 generic | 35.5 % | 990 | 241 / 278 | 6.32 | 0.395 |
| **V2 as deployed (clock tiers, extension off)** | **47.7 %** | **804** | 232 | **8.08 (+1.76)** | **0.374** |
| V2 + extension, 24 h reference (frozen spec, rejected) | 63.4 % | 562 | 200 | 12.04 (+5.72) | 0.495 |
| V2 + extension, previous-day slot reference (rejected) | 58.6 % | 636 | 215 | 10.55 (+4.23) | 0.439 |

Per family (V1 → V2 deployed): CPI coverage 38 % → 45 %, block 65 → 90 min per event; NFP 35 % → 42 %, 65 → 90 min; FOMC 40 % → 76 %, 95 → 180 min per meeting; PPI, PCE, JOLTS, GDP unchanged. Incremental blocking of the deployed V2 ≈ 1.8 h/month for these families (≈ 0.35 % of ≈ 500 active hours); other provider-rated USD HIGH rows are Tier C and unchanged. Residual exposure remains because the elevated plateau after NFP and FOMC lasts for hours at a level a fixed window cannot separate from normal activity without over-blocking; it is covered by the independent shock detector and the spread/feed guards. Release-second executability (spread, slippage) is not claimed: no tick history exists.

## 11. Known limitations

- Tier assignment depends on provider event names; unmatched relevant rows fall to Tier C (V1 protection), never to "not relevant".
- The press-conference term needs the provider's `FOMC Press Conference` row; without it the cluster still covers anchor + 150.
- The normalisation reference available in the executor is session-biased (§4); the extension therefore stays off until a same-slot baseline is calibrated from the shadow audits.
- Remembered windows only cover events that were in the last accepted calendar (typically the current week); a provider outage across a week boundary yields DATA_UNAVAILABLE → BLOCK (unchanged fail-closed behaviour).
- Executability at the release second is unmeasured (no tick history); the spread guards act on the bar/quote spread the executor observes.

## 12. Activation

The V2 code is loaded only when the REAL watcher process is restarted (`RESTART_REQUIRED_FOR_V2 = YES`). Activation must follow the documented stop/start procedure with the REAL account FLAT (no open position, no pending intent), preserving counters, lot 0.01, breaker state and the feed-stall safeguards; `PROTECTION_STARTED` then reports the V2 parameters. Post-activation verification: the first CPI, NFP and FOMC audits (tier, `clock_min_end_utc`, `normalization_shadow`, block start/end).
