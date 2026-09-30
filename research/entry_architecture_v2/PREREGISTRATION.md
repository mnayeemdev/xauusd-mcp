# PRE-REGISTRATION — ENTRY ARCHITECTURE V2 (lead signal + safety veto)

Written: 2026-09-30 14:52 UTC, BEFORE any experimental outcome statistic of this stage was computed.
Production: FROZEN (REAL v9, fingerprint `356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed`, commit 81b8241). Nothing here proposes or permits a production change.

Disclosure of prior knowledge: the author knows (a) the Edge Lab replay schema and its per-wait-reason counts (9,624 production signals; 6,430 RR_NOT_ACCEPTABLE; 2,179 NO_GOOD_ENTRY; 2,483 OVEREXTENDED; 2,133 VOLATILITY_INSUFFICIENT; 609 HTF_CONFLICT; 492 ENTRY_CONFLICT), (b) the completed H1/H2 results (30m two-factor veto let-through −0.237 R; impulse-without-retest ≈ 0 R), (c) the Edge Lab finding that production signals themselves carry ≈ +0.01 R structural expectancy on 2025-05→2026-04. No outcome of any RR band, quality band, conditional gate cell or alternative architecture has been seen.

Motivating examples (2026-09-30: 11:20 SELL veto, 12:25 BUY drift skip, 13:50 RR 1.62, 14:15 RR 1.43, 14:20/14:30 quality 54/59) are MOTIVATING_EXAMPLES_ONLY and are excluded from every sample; the dataset ends 2026-09-30 08:35 UTC and all 2026-09-30 rows are dropped.

---

## 1. Data, splits, costs, outcomes (fixed)

- Data: Edge Lab `handoff/edge_discovery_lab/data/` only (MT5 XAUUSDm bars; `lab_rows.jsonl` 99,490 confirmed 5m bars 2025-05-07 → 2026-09-30 08:35 replayed with the frozen engine). No new data.
- Splits: DEVELOPMENT 2025-05-07 → 2025-12-31; HOLDOUT 2026-01-01 → 2026-09-29; UNSEEN/FORWARD: none exists (2026-09-30 excluded). Development outcomes may inform ONLY the A3 selection procedure defined in §6; every other rule is fixed here.
- Costs: normal 0.34 USD per round trip (0.24 spread + 0.10 slippage), stress 0.80 USD, delay stress = entry at next bar open. Applied identically to every architecture.
- Outcome (STRUCTURAL_R): entry at candle close (BUY pays spread on entry, SELL on exit), first touch of engine SL or engine TP2 from bar i+1, same-bar both → SL, horizon 288 bars (mark at horizon, counted OPEN_AT_HORIZON), trades crossing a > 3 h bar gap before resolution are GAP_SPANNING and excluded from primary statistics.
- Clustering: consecutive candidates of the same side ≤ 12 bars apart form one cluster; INDEPENDENT = first candidate of the cluster. RAW_N and INDEPENDENT_N are both reported; inference uses INDEPENDENT.
- Sequential portfolio simulation (for frequency, drawdown, loss streak): one position at a time; a new signal is taken only if no simulated position is open; exits by STRUCTURAL_R. Sessions = UTC trading days with ≥ 1 processed candle.
- Bootstrap: 2,000 cluster resamples, 95% percentile CI.
- Multiple testing: the architecture family is A1, A2, A3 (3 tests against A0); Bonferroni α = 0.05/3 for any significance statement. Band tables (§7, §8) are descriptive and produce no rule.

## 2. Candidate enrichment (measurement only, no rule)

For every replay candle where production produced a model candidate (production `wr` ∈ {NO_GOOD_ENTRY, RR_NOT_ACCEPTABLE, ENTRY_CONFLICT, HTF_CONFLICT, OVEREXTENDED, VOLATILITY_INSUFFICIENT} or `act` ∈ {BUY, SELL}) the frozen engine functions are re-run at that candle to record: model, side, anchor, production geometry (`computeIntradayRisk` with production params), production quality (`scoreQuality` + HTF penalty + `resolveQualityThreshold`), and the context factors below. For OVEREXTENDED and VOLATILITY_INSUFFICIENT candidates, which production rejects before geometry exists, geometry is obtained by calling the same risk function with the overextension bound and the ATR floor disabled, **for measurement of the rejected population only**; this is not a proposed rule and those candidates remain rejected in every architecture below.

Context factors (each computed from bars ≤ i as production does; alignment ∈ {−1, 0, +1} = opposed / neutral / aligned with the candidate side):
`a15` 15m bias direction; `a30r` 30m regime (BULL/BEAR_TREND); `a30s` 30m structure state; `a1h` 1H regime; `a5r` 5m regime; `mom` = +1 if 5m ADX ≥ 20 else 0; `vol` = +1 if 5m ATR ratio ∈ [0.7, 1.3] else 0; `fresh_opp` = 1 if a fresh (≤ 3 bars) opposing 15m CHoCH exists.

## 3. Gate inventory and classification (from code, not outcomes)

| Gate (production order) | Where | Class | Treatment in this study |
|---|---|---|---|
| Feed available / confirmed candle / DATA_UNAVAILABLE | watcher | A HARD SAFETY | not relaxable; not in replay |
| 15m bias status OK, bars ≥ MIN | pipeline5m | A HARD SAFETY | not relaxable |
| CHOP_UNCERTAIN / empty eligible list | bias.js, pipeline5m | C SETUP VALIDITY (regime) | kept |
| Model trigger geometry (MC/PB/BO/SR/MR incl. freshness, retest, rejection, sweep) | models5m | C SETUP VALIDITY | kept unchanged in all architectures |
| Side allowed by 15m bias (directional bias forbids counter-side) | bias.js | D CONTEXT (embedded in trigger eligibility) | kept (removing it changes the models; out of scope) |
| ATR ≥ 2.0 USD (VOLATILITY_INSUFFICIENT) | risk5m | B ECONOMIC VIABILITY | kept hard |
| Overextension ≤ 2.5 ATR from anchor | risk5m | B ECONOMIC VIABILITY (chase control) | kept hard |
| Stop geometry valid, min risk 0.5 ATR | risk5m | B ECONOMIC VIABILITY | kept hard |
| RR ≥ 1.7 to structural objective | risk5m | B ECONOMIC VIABILITY | kept hard in A1–A3; bands measured in §7 |
| Quality ≥ 65 (directional) / 70 (neutral unsupported) incl. HTF penalty 5 | pipeline5m | D CONTEXT/CONFIRMATION (composite: structure, trigger, location, momentum, volatility, 30m MTF, session, RR) | binary cutoff in A0; used as confidence in A1/A2; bands measured in §8 |
| Fresh opposing 15m CHoCH veto | combineIntraday | D CONTEXT | under test |
| 30m two-factor conflict veto | combineIntraday | D CONTEXT | under test (H1 already showed unconditional removal loses) |
| 1H HTF_CONFLICT veto (non-aligned or MR) | combineIntraday | D CONTEXT | under test |
| Signal freshness ≤ 600 s, dedup, one position, pending intent | executor | E EXECUTION INTEGRITY | hard; sequential sim enforces one position |
| Halt, kill switch, breaker 2 consecutive losses, daily ceiling | executor | A HARD SAFETY | hard; not in replay |
| REAL identity verification, terminal connected, algo enabled | executor | A / E | hard; not in replay |
| Quote fresh ≤ 90 s, spread ≤ 0.60 USD, entry drift ≤ 2.00 USD | executor | E EXECUTION INTEGRITY | hard; not in replay |
| News V2, volatility shock, feed-stale, relative spread guards | executor protection | A HARD SAFETY | hard; not in replay (all architectures are measured before these gates, identically) |

Redundancy is not assumed; §9/§10 measure it.

## 4. Architectures (frozen; exactly these)

**A0 CURRENT** = production decision from the replay (`act` BUY/SELL).

**A1 LEAD SIGNAL + CONTEXT SCORE** — candidate must have a model trigger and pass every B gate (ATR floor, overextension, geometry, RR ≥ 1.7). The three D vetoes (fresh-CHoCH, 30m two-factor, HTF_CONFLICT) are removed and replaced by a bounded context score
`cs = a15 + a30r + a30s + a1h − 2·fresh_opp` (range −6 … +4).
Confidence `conf = q_base + 5·cs`, where `q_base` is production quality BEFORE the HTF penalty (the HTF factor enters through `a1h` instead) and 5 points is production's own existing per-factor penalty constant. Decision: trade iff `conf ≥ threshold` with the production threshold (65 directional / 70 neutral-unsupported). One specification, no variants.

**A2 LEAD SIGNAL + TIERED CONFIRMATION** — tiers from signal-time information only: STRONG = production quality ≥ 80 AND RR ≥ 2.0 (80 = the existing q80+ band edge, 2.0 = `tp2RMultipleDefault`); NORMAL = quality ≥ production threshold but not STRONG; WEAK = below threshold. STRONG trades pass with B gates only (the three D vetoes are not applied); NORMAL trades follow A0 exactly; WEAK = WAIT. One specification.

**A3 MODEL-SPECIFIC CONFIRMATION** — for each model m ∈ {MC, PB, BO, SR, MR} and each D veto v ∈ {fresh_choch, two_factor_30m, htf_conflict}: the veto is DROPPED for model m iff, on DEVELOPMENT only, the independent population that production rejected solely at that veto (all earlier gates passed) has n ≥ 30, mean STRUCTURAL_R ≥ +0.10 and bootstrap CI lower bound > 0; otherwise the veto is KEPT. The resulting per-model rule set is then evaluated on HOLDOUT without change. One procedure; the selection table is published.

## 5. Gate attrition and conditional gate value (measurement)

Funnel over all replay candles: completed → eligible (non-empty model list, not CHOP) → candidate (setup + trigger) → ATR floor → overextension → RR → quality → fresh-CHoCH → 30m two-factor → HTF → signal. For each gate: CANDIDATES_ENTERING, REJECTED, REJECTION_RATE, FORWARD_EXPECTANCY_OF_REJECTED (independent STRUCTURAL_R, normal cost), INDEPENDENT_CLUSTER_COUNT, and the label
PROTECTIVE (rejected mean R ≤ −0.10), NEUTRAL (−0.10 < mean R < +0.10), POSSIBLY_OVER_RESTRICTIVE (mean R ≥ +0.10 with CI lower > 0 and n ≥ 30), REDUNDANT (rejects < 1% of entrants, or the rejected set is ≥ 90% also rejected by a later gate).
Conditional value: each D veto is re-measured inside the STRONG subset (quality ≥ 75 AND RR ≥ 2.0 AND all B gates passed), overall and per model; cells with independent n < 30 are reported as UNDERPOWERED and draw no conclusion.

## 6. RR boundary (§7 of the brief) and quality boundary (§8)

RR bands, fixed: < 1.4, 1.4–1.5, 1.5–1.6, 1.6–1.7, ≥ 1.7. Measured on candidates that passed ATR floor, overextension and geometry (so RR is the first failing gate or passed), overall and inside the STRONG subset (quality ≥ 75 computed with the production formula). Quality bands, fixed: < 55, 55–59, 60–64, 65–69, 70–74, 75–79, ≥ 80, measured on candidates that passed all B gates (RR ≥ 1.7), overall and after the D vetoes. Metrics per band: N, independent N, mean R, median R, PF, CI, MFE, MAE, stress-cost mean R. No threshold is chosen from these tables; the decision rule is fixed: retain 1.7 and 65/70 unless a band adjacent to the boundary shows independent n ≥ 100, mean R ≥ +0.10 and CI lower > 0 in BOTH splits, in which case the finding is reported as INTERESTING_RESEARCH_LEAD only.

## 7. Metrics for A0–A3

Signals, independent signals, sequential trades, trades per session (P10/P25/median/P75/P90), zero-trade session rate, BUY/SELL and model split, mean/median R, PF, win rate, CI, MFE/MAE, max drawdown (R, sequential), max loss streak, top-1/top-3 removal, top-5 share, stress cost, delay, monthly sign stability, split stability, session and volatility stability; OPPORTUNITY_GAIN = trades / A0 trades; EDGE_DEGRADATION = mean R − A0 mean R.

## 8. Decision rule (frozen)

Evaluated on HOLDOUT with normal cost, independent set:
- REJECTED: mean R < A0 mean R − 0.05, or mean R ≤ −0.05, or PF < 0.90, or max drawdown > 1.5 × A0.
- NO_IMPROVEMENT: not REJECTED, and (mean R < A0 + 0.05 or trades < 1.2 × A0).
- INTERESTING_RESEARCH_LEAD: mean R ≥ A0 + 0.05 and ≥ +0.05 absolute and trades ≥ 1.2 × A0, but fails any promotion check.
- ELIGIBLE_FOR_FORWARD_SHADOW_VALIDATION: independent N ≥ 100 in HOLDOUT; mean R ≥ +0.10 with CI lower > 0; PF ≥ 1.20; trades ≥ 1.2 × A0; max drawdown ≤ 1.25 × A0; mean MAE ≤ 1.2 × A0; max loss streak ≤ A0 + 2; positive after removing the top 3 winners; positive under stress cost and under delay; positive in DEVELOPMENT as well; ≥ 60% of holdout months positive; no session bucket below −0.20 R; no leakage flagged by the controls.
PROVEN_EDGE is not an allowed output.

## 9. Controls (acceptance frozen)

Leak control (future 12-bar sign chooses the side; structural exits 1 ATR / 2 ATR) must give mean R > +0.30. Null control (random side) must give |mean R| < 0.25. Look-ahead: all features/decisions come from bars ≤ i at T = close + 80 s (asserted by construction; verified by the controls). Timestamp alignment: the same slicing reproduced 43/43 and 37/38 live v9 decisions today. Cost check: mean R at zero cost minus mean R at 0.34 USD must equal the mean of 0.34/risk over the same trades (tolerance 0.001). Cluster independence: no two independent events of the same side within 12 bars (asserted). The study aborts if a control fails.

## 10. What this stage will not do
No tuning, no threshold search, no reopening of H1/H2 as rules, no production edit, no watcher/executor/MT5/TradingView action, no trade, no use of 2026-09-30 in samples, no PROVEN_EDGE claim. The TradingView chart-read stall is documented separately as TRADINGVIEW_CDP_RELIABILITY_ISSUE and excluded from strategy analysis.
