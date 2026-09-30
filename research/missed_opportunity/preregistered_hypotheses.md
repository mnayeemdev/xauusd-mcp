# PRE-REGISTERED HYPOTHESES — Missed-Opportunity Edge Research

Stage: MISSED-OPPORTUNITY EDGE RESEARCH (30m conflict veto + impulse-without-retest)
Written: 2026-09-30 11:46 UTC, BEFORE any outcome statistic for H1 or H2 was computed.
Status of production: FROZEN. Nothing in this document proposes or permits a production change.
Frozen strategy fingerprint at time of writing: `356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed` (commit 1d20e0a).

Motivating example: 2026-09-30 10:00 UTC BO SELL (entry 4189.64, SL 4191.96, TP2 4182.99, RR 2.87, quality 79/70) vetoed by the 30m two-factor rule. It is tagged **MOTIVATING_EXAMPLE_ONLY** and is excluded from every sample below. The replay dataset ends 2026-09-30 08:35 UTC, so no candle of the motivating session that follows the watcher start (07:30Z) is used; the 07:30–08:35Z candles are also excluded by the date rule below.

What was already known when this was written (disclosure): the Edge Lab replay row schema, the count of candles per wait reason (399 two-factor vetoes: 199 BUY / 200 SELL), and one sample candidate record printed while inspecting the schema (a 2025-05-07 MR SELL vetoed by a fresh CHoCH, not an H1 member). No aggregate outcome of any H1 or H2 population was seen.

---

## 0. Data, provenance, splits (shared by H1 and H2)

- Dataset: existing Edge Lab dataset only (`handoff/edge_discovery_lab/data/XAUUSDm_bars.json`, MT5 Exness XAUUSDm, read-only fetch, 5m 2025-05-05 → 2026-09-30 08:35 UTC; 15m/30m/1H deeper history for context). No new data is introduced.
- Replay: `handoff/edge_discovery_lab/data/lab_rows.jsonl` (99,490 confirmed 5m bars, frozen production engine, 80 s fetch lag, 499-bar windows) and `lab_trades.json` (every candidate that reached the risk stage, with the production-stack simulation from `lab_replay.mjs`). Replay fidelity vs the live watcher was 186/191 (97%) and 43/43 for today's v9 candles (forensic audit).
- Splits (chronological, identical to the Edge Lab registry):
  - DEVELOPMENT (= Edge Lab DISCOVERY): 2025-05-07 → 2025-12-31
  - EVALUATION_A (= Edge Lab VALIDATION): 2026-01-01 → 2026-05-31
  - EVALUATION_B (= Edge Lab HOLDOUT): 2026-06-01 → 2026-09-29
  - EXCLUDED: 2026-09-30 (MOTIVATING_EXAMPLE_ONLY)
  - Nothing in this study is tuned on any split. The split is used only to report stability. Neither evaluation window is pristine (see Edge Lab DATA_PROVENANCE.md §3); this is disclosed, not hidden.
- Clustering (anti-inflation): defined per hypothesis below. Both RAW_EVENT_COUNT and INDEPENDENT_CLUSTER_COUNT are reported. All inferential statistics use the independent set.
- Cost model (from the Edge Lab registry, unchanged): normal cost 0.34 USD per round trip (spread 0.24 + slippage 0.10); stress cost 0.80 USD; delay stress = entry at the NEXT bar's open instead of the signal close.
- Outcome horizon: 288 confirmed 5m bars (24 h). A trade that resolves neither SL nor TP2 within the horizon is marked at the horizon close and counted as OPEN_AT_HORIZON (reported separately).
- Gap rule: a trade whose path crosses a bar gap > 3 h before resolution is flagged GAP_SPANNING and excluded from the primary statistics (reported separately), as in the Edge Lab.
- Same-bar ambiguity: if SL and TP2 are both touched in the same bar, the trade is scored as SL (conservative).
- Bootstrap: 2,000 resamples over independent clusters (cluster bootstrap), 95% percentile CI of mean R. Chronological day-block structure is preserved by resampling clusters, which are already non-overlapping.
- Nothing is optimized. Each hypothesis has exactly one specification (H2 has a two-member family, declared below). No grid search, no iteration after outcomes.

## 1. H1 — 30m two-factor conflict veto

### Population (frozen)
A confirmed 5m candle i is an H1 member iff, in the production replay:
- `intraday` produced a candidate that passed the model trigger, the risk gates (`gate == 'OK'`, RR ≥ 1.7) and the quality threshold (i.e. `intraday.decision.action` was BUY or SELL), AND
- `combineIntraday` returned `WAIT / ENTRY_CONFLICT` with the conflict text matching exactly
  `30m regime <BEAR_TREND|BULL_TREND> AND 30m structure <BEARISH|BULLISH> both oppose a <BUY|SELL> (two-factor conflict)`.
- Candles vetoed by the *fresh opposing 15m CHoCH* rule are NOT H1 (they are the other ENTRY_CONFLICT branch and are reported only as a side table).
- No upstream requirement is weakened. The candidate geometry is exactly the production geometry recorded for that candle: `entry` (close), `sl` (engine stop), `tp1`, `tp2`, `rr`, `q`, `model`, `side`.

### Counterfactual (frozen)
CONTROL = production behaviour (no trade, R = 0).
COUNTERFACTUAL = the same candidate allowed through the veto and entered at the candle close with the production geometry. No new entry is created; nothing else changes.

Two outcome measurements, reported separately and never mixed:
1. **STRUCTURAL_R** (primary): first touch of the engine `sl` or `tp2` from bar i+1 onward using bar highs/lows; BUY fills at close + 0.24 spread, SELL pays the spread on exit; R = (signed exit − fill − slippage 0.10) / |entry − sl|. TP1 reach is recorded as a flag, not an exit.
2. **MANAGED_R** (secondary, APPROXIMATE): the Edge Lab production-stack simulation already stored in `lab_trades.json` (`prod.r`: broker structural/monetary stops, +30 USD broker TP, adaptive thesis/deterioration/profit-protect management). This is an approximation of REAL behaviour and is labelled as such everywhere.

### Clustering
Consecutive H1 candles of the same side whose signal bars are ≤ 12 bars (60 min) apart belong to one cluster. INDEPENDENT = the first candle of each cluster (that is the entry production would have taken). Correlation with production's own open positions is measured as: fraction of independent H1 clusters that begin while a taken production signal (from `lab_trades.json`, `taken == true`) is still open.

### Pre-registered metrics
N raw, N independent; mean R, median R, win rate, loss rate, profit factor, 95% cluster-bootstrap CI of mean R; MFE and MAE in R; TP1 reach %, TP2 reach %, SL-first %; time to exit (bars, median); top-winner dependence (mean R after removing the top 1 and top 3 winners); OPEN_AT_HORIZON and GAP_SPANNING counts.
Breakdowns (descriptive, independent set): BUY/SELL; model (MC/PB/BO/SR/MR); 5m regime; 15m bias direction and regime; 30m regime; 1H regime; session (ASIA/LONDON/NEW_YORK/OTHER) and UTC hour bucket; volatility bucket (atrRatio < 0.9, 0.9–1.1, > 1.1); year-month.

### Decision rule (frozen, judged on the independent set with normal cost, STRUCTURAL_R)
- NEGATIVE: mean R ≤ −0.10, or PF < 0.90.
- NO_EDGE: not NEGATIVE, and (mean R < +0.10 or CI includes 0).
- WEAK_INTEREST: mean R ≥ +0.10 and PF ≥ 1.10, but at least one of: N independent < 30; CI lower bound ≤ 0; sign differs between DEVELOPMENT and (EVALUATION_A ∪ EVALUATION_B); mean R after removing top 3 winners ≤ 0; stress-cost mean R ≤ 0.
- ROBUST_INTEREST: N independent ≥ 30; mean R ≥ +0.15; PF ≥ 1.25; CI lower bound > 0; positive mean R in DEVELOPMENT and in EVALUATION_A ∪ EVALUATION_B separately; positive after removing the top 3 winners; positive under stress cost and under delay stress; MANAGED_R also positive.
- PROVEN_EDGE is not an allowed output of this study.

Phase-7 mapping: NEGATIVE → REJECTED; NO_EDGE → REJECTED or INSUFFICIENT_EVIDENCE (INSUFFICIENT_EVIDENCE only if N independent < 30); WEAK_INTEREST → INTERESTING_RESEARCH_LEAD; ROBUST_INTEREST → ELIGIBLE_FOR_FORWARD_SHADOW_VALIDATION.

## 2. H2 — impulse-without-retest continuation

### Coverage gap being tested
Production's five models require one of: a fresh swing break after 3 progressing closes (MC), a resolved pullback (PB), a retest+reclaim of the break level (BO), a rejection candle at a swing level (SR), a sweep+reclaim at a range boundary (MR). H2 asks whether a confirmed directional break that keeps extending WITHOUT retesting the level and WITHOUT a pullback forms a repeatable, positive-expectancy population that none of the five expresses.

### Event definition (frozen; every ingredient is a frozen production constant or a production feature computed from bars ≤ i)
A confirmed 5m candle i is an H2 event iff ALL of:
1. Production had **no candidate at all**: replay `wr == 'NO_ELIGIBLE_STRATEGY'` (so MC, PB, BO, SR and MR all returned null at i). This is what makes the event unrepresentable by the current family.
2. Fresh confirmed 5m structural break: `structure.lastEvent.type ∈ {BOS, CHOCH}`, with age `0 ≤ i − lastEvent.bar ≤ 10` (`boMaxEntryLateBars`). Side = BUY for a BULLISH event, SELL for BEARISH.
3. **No retest yet**: production's own BO retest predicate is FALSE for every bar since the break (no close within 0.3 ATR of the level and no wick reaching level ± 0.3 ATR; `boRetestAtrTol`). This is the explicit "not BO" condition.
4. Displacement: signed distance (close − level)/ATR14 on the break side is ≥ 1.0 (the frozen 1.0-ATR scale used by `pbCorrAtrMultiplier` / `mcMinAtrRatio`) and ≤ 2.5 (`overextendAtrMult`; production's own "do not chase" bound).
5. Momentum on side: close is on the break side of the 5m EMA20 (`e20d` sign) and `atrRatio ≥ 1.0` (`mcMinAtrRatio`, expansion not contraction).
6. 5m regime is not CHOP_UNCERTAIN (already implied by condition 1) and 15m bias status OK.
7. Production's downstream vetoes are applied EXACTLY as `combineIntraday` would: excluded if a fresh opposing 15m CHoCH (`freshChochMaxAgeBars` 3) opposes the side; excluded if 30m regime AND 30m structure both oppose the side (two-factor); excluded if the 1H regime opposes the side and the side is not aligned with a directional 15m bias (HTF_CONFLICT rule).
8. 15m bias family (the ONLY declared variation, two members, both reported, neither selected after the fact):
   - **H2a (aligned)**: 15m bias direction equals the side (BULLISH for BUY, BEARISH for SELL). Under H2a MC and PB were eligible and still did not trigger.
   - **H2b (non-opposing)**: 15m bias does not oppose the side (aligned OR NEUTRAL). H2b ⊇ H2a.

### Geometry (frozen; production functions only)
Synthetic candidate `{ side, anchor: lastEvent.level, slAnchor: extreme of the impulse leg = min low (BUY) / max high (SELL) over bars [lastEvent.bar − 2 .. i] (mcLegBaseLookback 2) }`, passed to production `computeIntradayRisk` (slAtrBuffer 0.25, minRiskAtr 0.5, structural objectives from 5m/15m pivots, objectiveMinR 1.0, tp2 cap 3R, **minRR 1.7 gate applied**) and to production `scoreQuality` + `resolveQualityThreshold` (threshold 65 with directional bias, 70 neutral unsupported, HTF penalty 5) — **quality gate applied**. Events failing RR or quality are counted as PRE_GATE events and excluded from the qualified population; both counts are reported. The `qTrigger` term in `scoreQuality` uses `candidate.model`; the synthetic candidate is given model code `IMP` so it scores like a non-BO/SR/MR model (falls back to the structure event term: BOS 15 / CHoCH 12), which is the conservative reading.

### Clustering
One structural break = one cluster: cluster key = (lastEvent.bar, side). INDEPENDENT = the first qualified candle of each cluster. RAW = all qualified candles.

### Outcomes, metrics, breakdowns, decision rule
Identical to H1 (STRUCTURAL_R primary with the same cost, horizon, gap and same-bar rules; no MANAGED_R exists for H2 because production never produced the candidate — an approximate managed outcome is NOT computed). Metrics, breakdowns and the NEGATIVE / NO_EDGE / WEAK_INTEREST / ROBUST_INTEREST rule are the same as §1, applied to H2a and H2b separately. Additional concentration checks (pre-registered): share of total positive R contributed by the top 5 winners; per-year, per-session, per-direction and per-volatility-bucket sign; a result is called UNSTABLE if any single year, session or direction accounts for > 60% of the positive R or if the sign flips between DEVELOPMENT and EVALUATION.

### Positive and negative controls (run before reading H1/H2 results)
- Leak control: same outcome function with the side chosen from the FUTURE sign of the H-bar return must give a large positive R (proves the plumbing detects an effect).
- Null control: random side at the H2b event bars must give mean R ≈ −cost (proves no accidental look-ahead).

## 3. +30 USD target observability (measurement only)
For every production signal in `lab_trades.json` (`signal == true`): `30_USD_TARGET_IN_ATR = 30 / ATR14(i)`; structural TP2 distance in USD and in ATR; ratio 30 / |tp2 − entry|; percentage of signals whose structural TP2 was reached before +30 USD MFE (MFE ≥ |tp2 − entry| in the production simulation, using `prod.mfe` and `prod.exit`); distribution of `prod.mfe` in USD; hold duration. No monetary policy change is proposed. The comment beside `minAtrUsd` in `src/engine/intraday/params.js` ("+3 USD overlay target") is reconciled as a documentation note only.

## 4. What this study will NOT do
No parameter search; no threshold tuning; no reading of outcomes before this file exists; no production file edited; no watcher/executor/MT5/TradingView action; no trade; no use of 2026-09-30 in any sample; no claim of PROVEN_EDGE.
