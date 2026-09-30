# CAPITAL HARVEST MASTER — PRE-REGISTRATION (frozen before any outcome is inspected)

Written 2026-09-30 ~20:10Z, HEAD 7227ca3, fingerprint 356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed. Owner directive: "CAPITAL HARVEST MASTER BUILD — FINAL CONSOLIDATED OWNER DIRECTIVE". Research only. Production (RR 1.70, lot 0.01, AUTO_SCALING OFF, News V2, breaker, drift, spread, identity, broker SL, one position) is not modified by this study. Any runtime module built here is unwired from REAL execution and refuses the REAL/DEMO modes.

## 1. Question
Does ONE integrated capital + position-management architecture (percentage-of-equity capital eligibility + adaptive loss control + adaptive HOLD/PROTECT/HARVEST/EXIT profit control) produce better after-cost economics and better capital preservation than current production management on the SAME production entries, without destroying strong winners, and does it survive DEV→HOLDOUT and cost stress?

## 2. Data (unchanged from V1/V2; read-only)
- Entries: production BUY/SELL signals from the Edge Lab replay of the frozen engine (`research/entry_architecture_v2/results/candidates.jsonl`, `act ∈ {BUY, SELL}`, with `geo.entry/sl/tp1/tp2/rr`, `atr`), 2025-05-07 → 2026-09-29. 2026-09-30 excluded (live day, audited separately).
- Bars: Exness XAUUSDm 5m (`handoff/edge_discovery_lab/data/XAUUSDm_bars.json`), index `i` aligned with candidates.
- CONTROL outcomes: Edge Lab production-stack simulation (`lab_trades.json` `prod`: broker structural/monetary stops, +30 USD TP, adaptive management), as in V1 H0.
- Splits (chronological, frozen): DEV = 2025-05-07 → 2025-12-31; HOLDOUT = 2026-01-01 → 2026-09-29. Forward-shadow evidence (if ever produced) is a third, separate provenance and is never mixed into these.
- Broker facts (read-only, 2026-09-30): 0.01 lot = 1 oz = 1 USD per 1.00 move; margin = price × 100 × 0.01 / 200 (≈ 20.8 USD); margin call 60 %, stop-out 0 %; swap long −0.56 USD/night, short 0; volume_min 0.01.

## 3. Costs (frozen)
NORMAL: spread 0.24 (BUY fill = signal close + spread; SELL exits pay the spread), slippage 0.10 per round trip on every exit, swap on BUY overnight. STRESS: spread 0.60, slippage 0.20. DRIFT variant: fill at the next bar's open (+spread for BUY). A candidate profitable only under zero cost or only under NORMAL but negative under STRESS is REJECTED.

## 4. Capital-risk policy family (frozen; no other percentages)
R ∈ {1 %, 2 %, 3 %, 5 %, 7.5 %, 10 %} of CURRENT equity. For every candidate: structural stop distance d = |entry − sl|; governed exposure X = 1.5 × d + spread + slippage (the broker protective SL production actually sends, plus costs; the −50 USD monetary cap is NOT used); lot 0.01 fixed. ELIGIBLE iff X ≤ R × E AND margin m ≤ 0.5 × E AND (E − X) ≥ m (margin level ≥ 100 % at the protective stop) AND m ≤ free margin. No stop is tightened to fit; an ineligible trade is NO TRADE (reason CAPITAL_RISK_TOO_HIGH / MARGIN_UNSAFE). Reference equities: 62.07, 75, 100, 250, 500, 1000 USD; sequential paths use the running equity for eligibility (equity read before each trade). Also reported: the current production veto (E − 50 ≥ m) for comparison.

## 5. Management candidates (frozen family; Bonferroni α = 0.05 / 6)
All candidates enter at the signal close (BUY + spread), keep the structural stop as thesis reference, send the protective broker SL at 1.5 × d + spread (fail-safe, never widened, never moved adversely), and apply THESIS_INVALIDATION (a CONFIRMED 5m close beyond the structural stop → EXIT at that close) — this is production's rule A. Decisions are taken only at completed 5m closes using bars ≤ that close; the protective floor takes effect from the next bar. Horizon 288 bars; OPEN_AT_HORIZON closes at the horizon close.
- CONTROL: Edge Lab production-stack outcomes (H0), no capital filter (production's −50 veto is reported separately).
- CH-A: capital policy + production-like management: thesis invalidation, deterioration exit (§6), production PROFIT_PROTECT rule (progress ≥ 1.0 R and retrace ≥ 0.5 of the best excursion, or adverse break, → close at that close), +30 USD monetary target, broker SL.
- CH-B: capital policy + simple early bank: HARVEST at the first close after MFE ≥ 1.0 R (bank at that close), deterioration exit, thesis invalidation, broker SL.
- CH-C: capital policy + protected run: at the first close with MFE ≥ 1.0 R activate floor F = min(max(0.20 R, MFE − 0.5 ATR), closeP&L); ratchet F = max(F, min(MFE − 0.5 ATR, closeP&L)) at every later close; exit when price touches fill + F (BUY) / fill − F (SELL) (bank F − slippage); deterioration exit before activation; thesis invalidation; broker SL; no fixed target.
- CH-D (adaptive): states OPEN_UNPROTECTED → PROFIT_AVAILABLE (first close with MFE ≥ T) → continuation evaluation (§7) → weak: HARVEST at that close; strong: PROTECTED (F as in CH-C with buffer B) → PROTECTED_RUN (ratchet as CH-C; at each later close re-evaluate: adverse 6-bar break, or 2 consecutive weak evaluations, or remaining reward to TP2 < 0.5 ATR → HARVEST at that close) → CLOSED. Before PROFIT_AVAILABLE: deterioration exit (§6), thesis invalidation, broker SL. Variants: D1 T = 0.75 R, B = 0.5 ATR; D2 T = 1.0 R, B = 0.5 ATR; D3 T = 0.75 R, B = 1.0 ATR.
Every candidate's floor is monotone (never lowered; violation count must be 0) and never above the market (capped at the close-based P&L; if the cap would put F ≤ 0.20 R at activation the trade is HARVESTED at that close instead).

## 6. Loss-control rules (frozen; used by CH-A/B/C/D)
NORMAL_RISK: default. THESIS_DETERIORATING → EXIT at the close iff the last 3 completed closes are each adverse (lower for BUY) AND the last close ≤ fill − 0.5 R AND the last close is beyond the entry bar's adverse extreme (BUY: below the signal bar's low). THESIS_INVALIDATED → EXIT at the close iff the close is beyond the structural stop. Broker protective SL (1.5 × d + spread) is the fail-safe and is hit intrabar. The maximum loss is never a target; the stop is never widened; no averaging, no martingale, lot fixed.

## 7. Continuation evidence (frozen; from V1 H2a, now R/ATR-based)
At a completed close j: E1 bar closed in the trade direction; E2 close beyond the previous bar's extreme in the trade direction; E3 bar range ≥ ATR14 at entry. STRONG iff ≥ 2 of 3; WEAK otherwise. Adverse 6-bar break: close beyond the adverse extreme of the previous 6 completed bars (BUY: close < min(low of bars j−6..j−1)).

## 8. Re-entry (frozen; V1 rule)
After a close the system is FLAT. Next trade requires a fresh production signal on a later candle than the exit candle, not the same (model, side, anchor rounded 0.01) within 12 bars, no same-side entry within 3 bars after a loss, and capital eligibility at the current equity. One position at a time. Trade count is an output.

## 9. Metrics (per architecture, per split, per cost case)
trades, independent trades, trades/session (P10/median/P90), zero-trade sessions, average hold, win rate, average win/loss, expectancy USD and R, PF, 95 % bootstrap CI (2000 draws, seed 20260930), max DD and min balance from each reference equity, loss streak, recovery, MFE/MAE, profit-available rate, protect rate, harvest rate, protected-run rate, profit give-back (MAX_FLOATING − REALIZED: mean, median, P75, P90, share of MFE), early-exit rate, premature-exit cost (for HARVEST/deterioration exits: counterfactual P&L had the trade run to thesis invalidation/broker SL/horizon minus realized), additional profit from runners (realized on PROTECTED_RUN exits minus the bank-at-T counterfactual), cost as % of gross profit, capital risk %, margin burden, wins erased by one average loss, eligibility rate per policy per equity, month-shuffled margin-floor depletion (500 draws, seed 7).

## 10. Controls (all must pass before interpretation)
Leak (future-direction entries must be strongly positive), null (random-direction entries ≈ 0), cost accounting (slip 0 vs 0.10 differs by exactly 0.10 on identical paths), ratchet monotonicity (0 violations), same-candle re-entry (0), revenge guard (0), structural-stop integrity (protective SL never widened: assert in engine), confirmed-candle (decisions use bars ≤ j; unit test), timestamp alignment (bars monotone, 300 s spacing apart from session gaps; entry bar index = candidate index), percentage-risk arithmetic and minimum-lot constraint (unit tests against hand-computed values), deterministic repeatability (two runs, identical results hash), live/replay parity carried from the parity audit (103/106) and the P1 repair (PRE == POST bars). News/drift/breaker/stale-feed preservation is by construction (no production file changed; asserted by fingerprint).

## 11. Decision rule (frozen)
For each candidate, per risk policy, on HOLDOUT at the reference equity where the policy first becomes non-empty (≥ 300 trades):
REJECTED if expectancy ≤ 0, or PF < 1.0, or STRESS expectancy ≤ 0, or wins-erased-by-one-loss > 5, or max DD > 30 % of the starting equity of that path, or month-shuffled margin-floor touch > 5 %.
Otherwise SUPPORTED_RESEARCH_LEAD if CI lower bound > 0 and PF ≥ 1.15 and DEV expectancy > 0 and DRIFT expectancy > 0 and months positive ≥ 60 % and top-5 share of gross profit ≤ 30 % and (for adaptive candidates) P90 give-back ≤ 2 × average win and additional profit from runners ≥ 0; otherwise NO_IMPROVEMENT / INCONCLUSIVE.
FORWARD_SHADOW_ELIGIBLE = YES only if at least one candidate is SUPPORTED_RESEARCH_LEAD at 62.07 USD OR at the smallest reference equity ≤ 250 USD, with the capital requirement stated. DEMO_ELIGIBLE and REAL_ELIGIBLE are NO in this study by construction (they require forward evidence and owner approval).
Comparisons against CONTROL: a candidate must not have a worse PF and a worse max DD than CONTROL at the same equity to be called an improvement. Higher win rate, more trades or more green closes are never success by themselves.

## 12. What this study does NOT do
No RR change (1.70 frozen), no lot change, no dynamic sizing, no change to News V2/shock/spread/drift/breaker/identity, no production file edits, no REAL/DEMO order, no restart. Percentages are the frozen family above; management parameters are the frozen values above. Any correction made after this hash is logged in §13 with old/new hash and reason; no outcome-driven tuning.

## 13. Correction log
(empty at freeze)
