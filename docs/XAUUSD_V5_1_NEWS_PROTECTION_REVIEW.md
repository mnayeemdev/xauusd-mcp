# XAUUSD_V5_1_NEWS_PROTECTION_REVIEW

Offline review (2026-09-26) of the CURRENT production News + Volatility Shock Protection V1 against the V5 scheduled-news evidence. REVIEW ONLY: no production code, config, state, breaker, lot, watcher or protection behaviour was changed. News remains a safety layer and is not, and must not become, BUY/SELL authority (V5: DIRECTIONAL / REVERSAL / CONTINUATION news edge = NO; VOLATILITY edge and SAFETY finding = YES).

Sources read: `src/engine/newsRisk.js`, `newsMonitor.js`, `newsCalendar.js`, `marketShock.js`, `protectionGuards.js`, `mt5Executor.js` (protection evaluation, monitor loop, emergency handling), `mt5RealPolicy.js`, `docs/XAUUSD_NEWS_SHOCK_PROTECTION.md`, `tests/news_shock_protection.test.js` (56/56 pass), the REAL audit log `state/xauusd_mt5_real_trade_log.jsonl` (read-only) and the V5 documents.

## 1. Current production behaviour (verified from code and the live audit log)

**Calendar layer.** Provider `http_json` (Forex Factory weekly JSON, 15-min cadence, snapshot persisted). Gold relevance = currency USD AND impact HIGH, plus always-relevant patterns `FOMC Statement / Press Conference / Economic Projections`, `Federal Funds Rate`, `Fed Chair`. Windows are generic for every relevant event: PRE_NEWS 30 min → NEWS_ACTIVE 5 min → POST_NEWS_COOLDOWN 30 min, i.e. a 65-minute entry block per event (35 min after the release), overlapping windows merge, `block_ends_utc` = latest end. `DATA_UNAVAILABLE` (provider error with no fresh cache, calendar older than 6 h, malformed events) blocks entries (policy BLOCK, default, cannot be disabled for REAL; `ALLOW` would still audit). `DISABLED` only via provider `none`. The live v7 process confirms these values (`PROTECTION_STARTED`: pre 30 / active 5 / cooldown 30, stale 21600 s, BLOCK, provider http_json, calendar OK at start).

**Shock layer.** Samples one bid/ask per monitor pass (~3 s), also while flat. Triggers: SPREAD_SHOCK (≥ 3× 30-min median AND ≥ 0.5 USD), VELOCITY_SHOCK (60-s mid move ≥ 1.5 × ATR(5m,14)), JUMP_SHOCK (sample-to-sample ≥ 1.0 ATR, confirmed by ≥ 0.5 ATR level change), RANGE_SHOCK (last confirmed 5m true range ≥ 3 ATR, or 5-min sample window ≥ 3 ATR), FEED_STALE (quote age > 90 s, blocks only). VOLATILITY_SHOCK needs 2 consecutive positive evaluations; it clears only after 600 s without any trigger AND spread ≤ 1.5× baseline AND velocity ≤ 0.75 ATR. INSUFFICIENT_DATA (fewer than 20 samples in the 30-min window or fewer than 16 confirmed 5m bars) allows entries with the absolute gates only, audited. The live log shows the detector working: one `NORMAL → VOLATILITY_SHOCK (RANGE_SHOCK)` → `NORMALIZED` cycle on 2026-09-25, and the weekend `FEED_STALE` block now in force.

**Entry guards (after every existing REAL gate):** news → shock → feed → relative spread (≥ 2× baseline AND ≥ 0.35 USD rejects; absolute 0.6 USD applied earlier) → normalisation (`PROTECTION_BLOCK_ACTIVE`; a signal calculated before `last_block_cleared_at` is never executed). The block clears only when no reason remains (news window over AND shock not VOLATILITY_SHOCK AND feed fresh); `maxSignalAgeSec` 600 also applies.

**Open position:** never closed by news, spread, shock or stale feed. Protection = broker SL/TP (fail-safe SL = min(monetary −50 USD, structural stop × 1.5 + spread)), adaptive thesis exit on confirmed candles, monetary monitor (+30 / −50 USD net), fast safety monitor (restore a vanished broker SL; close through the governed path if bid/ask is beyond the broker SL by > 0.5 USD while still open), kill switch.

## 2. Event-specific audit against V5 evidence

V5 numbers are 15m-bar ratios to matched same-weekday same-clock-time controls (discovery / validation / holdout where opened). "Normalisation" = first 15m bar whose range is back within 1.5× the control median.

| Family | Release-bar range × control | 60-min range × control | Normalisation (median) | Generic 35-min post window covers the observed risk? | Shock detector independent cover | Event-specific cooldown would materially improve safety? | Longer cooldown suppresses valid trading? |
|---|---|---|---|---|---|---|---|
| CPI | 4.3 / 2.7 / 3.0 | 2.8 / 1.8 / 1.7 | 60 / 30 / 30 min | **Partly.** The median in 2022–24 was 60 min; 2025–26 median 30 min. A 35-min post block ends inside the elevated-volatility tail in about half of the 2022–24 cases. | Yes for the burst: a 4× release bar exceeds the RANGE_SHOCK threshold (3 ATR) in most cases, so VOLATILITY_SHOCK adds ≥ 10 min of quiet before clearing. Not guaranteed for the tail (bars at 1.5–3× do not re-trigger). | Moderate: cooldown 60 min aligns the block with the observed normalisation. | 25 extra minutes × 12/yr = 5 h/yr; negligible. |
| NFP | 3.1 / 4.1 / 3.8 | 2.2 / 2.4 / 2.1 | 45 / 30 / 30 min | **Partly** (same reasoning; most stable magnitude family). | Same as CPI. | Moderate: 60 min. | 5 h/yr. |
| FOMC | 7.0 / 4.0 (n 13 / 9) | 5.8 / 3.9 | 150 / 105 min; 31 % / 11 % not normal within 4 h | **No.** With the Forex Factory rows (Statement + Federal Funds Rate at 14:00, Press Conference at 14:30) the merged block is 13:30–15:05 ET, i.e. 65 min after the statement, while the press-conference window [30, 90) is as volatile as the statement window and normalisation takes 105–150 min. | Partial: RANGE_SHOCK / VELOCITY_SHOCK re-trigger during the press conference, but each clear needs only 10 quiet minutes; the detector can normalise between waves. | **Yes**: an FOMC cluster rule (block to +150 min after the statement, press conference always covered) closes the largest gap found. | 85 extra minutes × 8/yr = 11 h/yr. |
| PCE | 1.6 / 1.2 | 1.35 / 1.04 | 30 / 15 min | **Yes** (validation ≈ control). | Rarely triggers (1.6× bar). | No. | — |
| PPI | 1.7 / 1.3 | 1.34 / 1.26 | 22 / 15 min | **Yes.** | Rarely. | No. | — |
| JOLTS | 1.8 / 1.3 | 1.47 / 1.10 | 15 / 15 min | **Yes.** | Rarely. | No. | — |
| GDP advance | 1.5 / 1.1 (n 7 / 4) | 1.4 / 1.2 | 15 min | **Yes** (thin sample). | Rarely. | No. | — |

Pre-event: V5 found only mild compression (8–13 % quieter in the hour before BLS/BEA releases, none in the last 15 min, expansion before FOMC) and no predictive value. The 30-min PRE_NEWS window is therefore not justified by pre-event behaviour itself; its justification remains the one in V1 (a setup taken in the last half hour is resolved by the release, not by structure), which V5's release-bar sizes (10–25 USD moves at 2025 price levels) support.

Not in the V5 evidence and therefore unchanged by this review: retail sales, ISM, ADP, claims, Fed Chair appearances (FF grading decides; the `Fed Chair` pattern keeps testimonies covered).

## 3. Shock detector coverage

| Requirement | Current | Assessment |
|---|---|---|
| abnormal velocity | 60-s move ≥ 1.5 ATR(5m) | adequate for release bursts (a CPI/NFP release bar is 3–5 × a 5m ATR) |
| abnormal range / ATR | last confirmed 5m TR ≥ 3 ATR or 5-min sample window ≥ 3 ATR | adequate; fires on CPI/NFP/FOMC bars (V5 5m release bar ≈ 5 × ATR_ref on average), usually not on PPI/PCE/JOLTS (≈ 2.5 ×) |
| spread expansion | ≥ 3× 30-min median AND ≥ 0.5 USD (shock); ≥ 2× AND ≥ 0.35 USD (entry) | adequate in design; V5 could not verify release-second spreads (no tick history; bar spread column shows 0.24–0.26 USD unchanged) — coverage is untested, not disproved |
| quote / feed staleness | > 90 s → FEED_STALE block; never closes | adequate; observed working over the weekend |
| normalisation | condition-based: 600 s quiet AND spread ≤ 1.5× AND velocity ≤ 0.75 ATR | adequate for bursts; **10 quiet minutes is short relative to the 30–150 min elevated-range tails** V5 measured, which is why the calendar cooldown still matters |
| fresh-signal requirement after normalisation | normalisation guard: signal must be calculated after `last_block_cleared_at`; `maxSignalAgeSec` 600 | adequate |

Answer to the Part-11 question: event-specific calendar windows add meaningful safety **only** where the observed tail outlasts both the generic 35-min post window and a 10-minute shock clearance: FOMC (clearly) and CPI/NFP (moderately). For PCE/PPI/JOLTS/GDP the generic window already exceeds the observed normalisation, and adding event-specific rules there would be redundant blocking.

## 4. DATA_UNAVAILABLE fail-safe

Confirmed correct and safety-first: provider error without a fresh cache, calendar older than 6 h, missing/malformed events, monitor missing or throwing → `DATA_UNAVAILABLE` → entries blocked (`NEWS_DATA_UNAVAILABLE_BLOCK`), audited on every decision; the layer cannot be disabled for REAL; `ALLOW` is an explicit operator choice that still audits. Live log: `NORMAL → DATA_UNAVAILABLE (CALENDAR_STALE) → NORMAL` observed on 2026-09-25/26 as designed. One consequence to be aware of, not a defect: after a weekend with failed refreshes the first Monday entries stay blocked until one successful fetch (≤ 15 min). No weakening proposed.

## 5. Post-news re-enablement

The conceptual gate "calendar cooldown complete AND shock NORMAL AND feed healthy AND spread acceptable AND fresh confirmed post-normalisation signal" is **already the current behaviour**, with two qualifications: (a) shock `INSUFFICIENT_DATA` (first minutes after a restart, or fewer than 16 confirmed bars) is treated as allowed-with-absolute-gates, audited; (b) the relative spread gate needs 20 samples in the trailing 30 min, otherwise only the absolute 0.6 USD cap applies. Both are reasonable and audited. Fixed clock alone is not what production does; no change needed here.

## 6. Open-position safety before / through a release

Current: a position opened more than 30 min before a release is carried through it. Protection = broker SL (typically the structural stop × 1.5 + spread, a few USD for a 5m setup), thesis exit on confirmed candles (acts after the fact), monetary −50 USD, emergency close if price is already beyond the broker SL by > 0.5 USD, kill switch. News state never closes.

Gap identified (documented, not fixed): CPI/NFP/FOMC release bars are 4–7 × a normal 15m bar (10–25 USD at 2025 levels, occasionally more). A few-USD broker SL inside such a bar is filled with slippage or gapped; the emergency boundary close is the backstop, and on a 62 USD account with 0.01 lot a 10–20 USD adverse fill is a 15–30 % drawdown from one release. V5 shows no directional bias (holding through is not systematically wrong), so this is an execution/gap risk, not an expectancy problem. The 30-min PRE_NEWS window does not address it because typical 5m-trade holding times exceed 30 min. Options for owner decision are listed in the V2 proposal (§5); none widens the SL or raises the monetary tolerance.

## 7. FOMC special case

The calendar layer understands both waves only through provider rows: Forex Factory publishes `FOMC Statement` and `Federal Funds Rate` (14:00 ET) and `FOMC Press Conference` (14:30 ET), all matched by the always-relevant patterns, so the merged block is 13:30–15:05 ET. Architectural gaps: (1) the second wave's coverage depends on the provider publishing and grading the press-conference row (a `file` provider or a renamed row would silently drop it); (2) no cluster concept: cooldown is per row, 30 min, whereas V5 measured normalisation at 105–150 min with 11–31 % of meetings still elevated at 4 h and the [30, 90) window as volatile as [0, 30). Not fixed here.

## 8. Findings

- CURRENT_POLICY_STATUS = ACTIVE in v7 (PID 23064), values as documented, tests 56/56, live transitions audited; generic 30/5/30 windows.
- CPI_PROTECTION = PARTIAL (35-min post window vs 30–60 min observed normalisation; shock detector covers the burst).
- NFP_PROTECTION = PARTIAL (same).
- FOMC_PROTECTION = INSUFFICIENT (65 min after the statement vs 105–150+ min observed; press-conference coverage provider-dependent).
- PCE_PROTECTION = ADEQUATE. OTHER_EVENT_PROTECTION (PPI, JOLTS, GDP) = ADEQUATE; retail sales / ISM / ADP / claims = NOT ASSESSED (no V5 data), left to FF grading.
- SHOCK_DETECTOR_COVERAGE = ADEQUATE for bursts, SHORT for tails (10-min clearance); spread coverage untested at the release second.
- DATA_UNAVAILABLE_FAIL_SAFE = CORRECT (blocks, audited, cannot be disabled).
- POST_NEWS_REENABLEMENT = ADEQUATE (condition-based, fresh-signal enforced).
- OPEN_POSITION_PROTECTION = GAP (positions carried into CPI/NFP/FOMC with a few-USD SL; slippage/gap exposure on a 62 USD account).
- PROTECTION_GAP_FOUND = YES (FOMC cluster length; CPI/NFP cooldown length; pre-event open-position exposure).
- POLICY_V2_JUSTIFIED = YES → `docs/XAUUSD_NEWS_PROTECTION_POLICY_V2_PROPOSAL.md` (design only).
- NEXT_GATE = B (owner review required before any implementation).
