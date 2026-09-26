# XAUUSD_STRATEGY_V2_ARCHITECTURE — offline challenger design

Research only (2026-09-26). Everything described here lives under `validation/strategy_redesign_v2/` and `docs/`; nothing is deployed, connected to execution, or imported by production. The production MCP, watcher, executor, breaker, lot lock and protections are unchanged.

## 1. Why a challenger, and what it is not

The Master Edge Validation classified the current intraday_5m strategy EDGE_NOT_DEMONSTRATED (1,406 outcomes, mean +0.001 R, PF 1.07) and the Strategy Improvement Lab showed that small deterministic patches do not create an out-of-sample edge. V2 was therefore built as a separate architecture, price/structure/event first, with WAIT as the default. It reuses only one production primitive, the confirmed-pivot structure computation (`computeStructure`: 5-bar left/right pivots, BOS/CHoCH, range extremes), because it is deterministic and confirmed-candle safe; everything else (states, events, gates, geometry, exits) is new and minimal.

## 2. Decision order

1. **DATA_VALID:** 500 confirmed 5m bars, ATR14 > 0.
2. **Market state** (label, derived from confirmed price only): COMPRESSION (ATR14 ≤ 0.7 × 100-bar mean ATR), EXPANSION (≥ 1.4 ×), TREND_CONTINUATION (a confirmed BOS within 20 bars), otherwise BALANCED. SWEEP and RECLAIM are transient event states inside the families rather than standing states.
3. **Structural event** (one of the three families' triggers).
4. **Confirmation** on a later confirmed close (reclaim close, retest hold close, acceptance close). No forming-bar authority.
5. **Invalidation**: a structural level (sweep extreme, retest extreme, opposite box edge) plus 0.1 ATR. Never derived from balance; never widened or tightened to fit a lot.
6. **Objective**: opposite range boundary, next confirmed pivot beyond 1 R, or a measured move. Never a fixed dollar amount.
7. **RR_VALID**: planned RR ≥ 1.7 (the production reference, deliberately not re-tuned). Natural RR distribution is recorded.
8. Otherwise **WAIT**.

Boolean gates only (STRUCTURE_VALID, EVENT_VALID, CONFIRMATION_VALID, STOP_VALID, OBJECTIVE_VALID, RR_VALID, DATA_VALID). No additive quality score; a score cannot rescue a failed gate because no score exists.

## 3. Timeframe authority

| TF | Role in V2 |
|---|---|
| 5m | primary structure and entry authority; all events, confirmations, stops and objectives |
| 15m | context only: structure state and range extremes recorded per signal (no lock, no veto) |
| 30m | context only (recorded) |
| 1H | context only (recorded) |
| 2H+ | not used |

No HTF layer can silently veto a 5m event. Any HTF veto would have to be added explicitly and tested; none was, and the results by 15m/1H context were reported for observation only.

## 4. Families (maximum three; not renamed copies of MC/PB/BO/SR/MR)

**V2-A Liquidity sweep + reclaim (range extreme).** Sweep bar: intrabar pierce of the confirmed range low/high (lowest/highest of the last five confirmed pivots) by more than 0.1 ATR with the close back inside. Confirmation within 3 bars: a confirmed close back beyond the level and beyond the sweep bar's high (bull) or low (bear), which is the local structural confirmation; no close beyond the level allowed in between. Stop: sweep extreme ∓ 0.1 ATR. Objective: opposite range boundary or nearest confirmed pivot with ≥ 1 R. Reversal trades therefore require their own structural evidence; no 15m-bias shortcut exists.

**V2-B Structural break + retest.** Trigger: a confirmed BOS (continuation, not CHoCH) whose break bar closed ≥ 0.5 ATR beyond the level (displacement). Retest hold within 1–10 bars: touch within 0.3 ATR of the level on the retest side, no close back through the level since the break, close on the break side, entry not more than 1.0 ATR from the level (no chasing). Stop: retest extreme ∓ 0.1 ATR. Objective: next confirmed pivot beyond 1 R or the range boundary.

**V2-C Compression → expansion with acceptance.** Compression gate: ATR14 on the bar before the break ≤ 0.7 × its 100-bar mean. Box: the 12 bars before the break bar. Break: a confirmed close beyond the box edge by ≥ 0.1 ATR. Acceptance: the next confirmed close still beyond the edge; entry at that close. Stop: opposite box edge ∓ 0.1 ATR. Objective: measured move of twice the box height from the broken edge.

## 5. Exit stack (thesis first, emergency separate)

STRUCTURAL_TARGET (intrabar) → THESIS_INVALIDATION_CLOSE (confirmed close beyond the stop) → THESIS_DETERIORATION_OPPOSITE_STRUCTURE (a confirmed 5m structure event against the trade formed after entry while losing on the close) → TIME_STOP_48_BARS → EMERGENCY_BROKER_SL at stop ∓ 0.5 ATR, the only intrabar loss mechanism, explicitly separated from the thesis exit so that broker protection cannot become the normal loss. Optional profit protection (MFE ≥ 1.5 R then a close back to ≤ 0.5 R) was evaluated on discovery and frozen OFF. Realized R is always measured against the initial structural risk.

## 6. Research protocol

Same five-month XAUUSDm dataset (2026-04-29 → 2026-09-25, 129 sessions, 29,500 confirmed candles) and the same whole-session boundaries as the Improvement Lab: A discovery 64 sessions (to 12 Jul), B validation 32 (13 Jul → 18 Aug), C untouched holdout 33 (19 Aug → 25 Sep). Phase 1 event study on A only; families and exits designed on A only; spec frozen with the implementation hash before B; pre-declared B and C gates; no rule changes after B; C opened for a decision only if B passes, otherwise reported after the fact for transparency only. Feed caveat: MT5 XAUUSDm bars, not OANDA; class-A live records exist only for the current production strategy, so V2 has no live cross-check yet.

## 7. What the challenger deliberately excludes

The 15m directional lock, counter-structure entries without structural confirmation, the additive quality score, the +30 USD monetary target, the 1.5 × broker fail-safe as the routine loss, any capital or 6,000,000 USD objective input, and any trade-frequency target.
