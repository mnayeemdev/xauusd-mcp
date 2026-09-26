# XAUUSD_SHADOW_VALIDATION_PLAN

Design only (2026-09-26). **Status: NOT JUSTIFIED YET, NOT ACTIVATED.** The Strategy Improvement Lab produced no candidate that passed discovery, validation, final holdout and robustness (`XAUUSD_STRATEGY_IMPROVEMENT_LAB.md`). This document records the shadow design so it is ready if a future candidate ever does pass, and it defines the evidence bar for that gate.

## 1. Activation gate (all required before any shadow build is even proposed for approval)

1. A candidate with a logical market rationale, frozen before validation, that improves mean R and total R in discovery AND validation, does not worsen validation drawdown or losing streak, improves the untouched holdout, and survives bootstrap (P(mean ≤ 0) < 20 % over the later regions) and friction (positive at spread 0.40 with 0.15 USD slippage).
2. The improvement must not depend on the five largest winners (total R excluding the top 5 must remain positive in the later regions).
3. Written user approval of the shadow build. Shadow is never auto-activated.

None of the current candidates meets item 1 (best: COMBO-2, holdout +0.013 R per trade, P(mean ≤ 0) = 70 % on B+C, negative under friction).

## 2. Shadow architecture (design)

- Production continues to make every authoritative decision exactly as now; the REAL watcher, executor, breaker, protections and lot lock are untouched.
- The shadow candidate runs beside production as a separate read-only process (like the replay harness) consuming the same confirmed bars from the watcher's own bar snapshots (no second chart sweep; the CDP lock is never taken by the shadow).
- The shadow cannot send orders, cannot write to any file under `state/` that production reads, cannot write the signal store, and cannot import or be imported by anything under `src/` that the executor uses. It writes only `validation/shadow/<candidate>/shadow_log.jsonl`.
- Outcomes are resolved deterministically from later confirmed bars with the same exit-stack simulator used in the lab (production exits unless the candidate is an exit-stack candidate), and reconciled against the live store's class-A resolution where the CONTROL decision was a live signal.

## 3. Shadow log record (per confirmed 5m candle)

```
timestamp_utc, candle_time, control_decision (BUY/SELL/WAIT + reason), shadow_decision (+ reason),
difference_reason (e.g. PB-A blocked | QUALITY-D admitted | identical), model, side,
entry, structural_stop, stop_distance_usd, target_tp1, target_tp2, planned_rr, effective_rr_at_close,
quality_control, quality_shadow, threshold_basis, 15m_bias, 5m_regime, 5m_structure, 30m_regime, 1H_regime,
lag_flag, news_state, shock_state (from the live protection log), breaker_state,
eventual_outcome_r, outcome_usd_at_0_01, exit_reason, mae_r, mfe_r, hold_bars, resolved_at
```

## 4. Minimum forward evidence before any approval stage

- At least 20 trading sessions AND at least 20 candidate-specific opportunities (candles where CONTROL and SHADOW differ), whichever is later.
- For low-frequency models (MR-type, ≈ 1 signal per 2.3 sessions): at least 40 sessions and at least 30 model-specific opportunities.
- Shadow mean R on the differing opportunities must be positive with a bootstrap CI whose lower bound is not below −0.05 R, and the shadow's sequential drawdown must not exceed CONTROL's over the same period.
- Zero runtime incidents attributable to the shadow (no CDP contention, no state file conflicts, no memory growth).
- The forward period must not be used to re-tune the candidate; a changed candidate restarts the clock.

## 5. Explicitly excluded

No demo or live orders from the shadow, no automatic promotion, no capital-policy coupling, no use of the 6,000,000 USD objective in any shadow decision or evaluation, no change to USER_FIXED 0.01, the breaker, RR 1.7, quality thresholds, or News/Shock protection.

SHADOW_VALIDATION_JUSTIFIED = NO (as of 2026-09-26)
