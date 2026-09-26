# XAUUSD_STRATEGY_V2_EVENT_STUDY — Phase 1 (discovery region A only)

Research only (2026-09-26). Script: `validation/strategy_redesign_v2/v2_events.mjs`; results: `v2_event_study_A.json`. Region A = 2026-04-29 → 2026-07-12, 14,393 confirmed 5m bars (XAUUSDm). Regions B and C were not used.

## Method

Events are detected on the confirmed bar i using production-grade confirmed pivots (5 bars each side) and explicit price rules; forward behaviour is measured after bar i closes, at 1, 2, 3, 6 and 12 bars, in ATR14 units and in the event's expected direction: mean signed move, 95 % CI, follow-through probability (move > 0), and the ratio of mean MFE to mean MAE over the horizon (a directionless random event gives ≈ 1.0). The period had a bearish drift of −0.091 ATR per 12 bars, so a drift-adjusted mean (event mean minus the direction-weighted unconditional drift) is reported alongside the raw mean. A baseline (direction of the current bar) is included as a sanity check: its mean is ≈ 0 and ratio ≈ 1.05.

## Results (drift-adjusted mean move in ATR; CI on the raw mean; n)

| Event | n | h1 | h3 | h6 | h12 | Verdict |
|---|---|---|---|---|---|---|
| Baseline bar direction | 2,056 | −0.01 | +0.02 | +0.01 | +0.04 | none (as expected) |
| SWEEP of any confirmed pivot (intrabar pierce, close back) | 504 | −0.05 | −0.07 | −0.02 | +0.01; ratio 0.83–0.92 | **no edge; sweeps tend to continue, not reverse** |
| RANGE_SWEEP (pierce of the 5-pivot range extreme) | 531 | +0.05 | +0.12 (CI [+0.003, +0.23]) | +0.11 | +0.05 | marginal at 3 bars only |
| RANGE_SWEEP bear side (sweep of the range high) | 225 | +0.10 (CI [+0.01, +0.20]) | +0.26 (CI [+0.11, +0.46]) | +0.40 (CI [+0.18, +0.71]) | +0.33 (CI [+0.03, +0.81]); ratio 1.33–1.42 | positive |
| RANGE_SWEEP bull side (sweep of the range low) | 306 | +0.01 | +0.02 | −0.10 | −0.16; ratio 0.79–0.94 | negative |
| RANGE_SWEEP then confirmed reclaim close | 295 | +0.01 | +0.07 | +0.07 | −0.07 | none symmetric; bear side +0.19/+0.37 (CI excludes 0 at h3/h6), bull side −0.22 (CI excludes 0 at h6) |
| RECLAIM (first close back through a level after 1–6 closes beyond) | 1,729 | −0.02 | −0.01 | −0.03 | +0.02; ratio 0.97–1.01 | none; bear +0.08–0.11, bull −0.06 to −0.13 |
| BOS (confirmed break of a pivot) | 406 | +0.03 | −0.13 | −0.14 | −0.15; ratio 0.97–1.14 | **no continuation; weak-displacement BOS fades: h3 −0.215 (CI [−0.35, −0.08], n 265)** |
| BOS with ≥ 0.5 ATR displacement | 141 | +0.18 | +0.03 | −0.07 | −0.08 | one-bar impulse only |
| CHoCH | 304 | 0.00 | +0.02 | +0.01 | +0.11 | none (bear +0.10 to +0.16, bull negative, CIs include 0) |
| RETEST_HOLD after a BOS | 598 | −0.03 | −0.05 | −0.01 | +0.25 (CI [+0.06, +0.45]) | weak, late (12 bars) only |
| RETEST_HOLD after a CHoCH | 366 | +0.03 | −0.02 | +0.13 | −0.08 | none |
| COMP_BREAK (12-bar box ≤ 1.5 ATR, close outside, range ≥ 0.8 ATR) | 9 | +0.21 | +0.11 | +0.38 | +0.89; ratio 1.3–2.2 | promising direction but n = 9 |
| COMP20_BREAK (20-bar box ≤ 2 ATR and ATR ≤ 0.8 × 100-bar mean) | 0 | — | — | — | — | definition never triggers on this feed |

## Interpretation

1. **No 5m event shows symmetric, direction-independent asymmetry.** Every event whose bear side looks favourable has a bull side that looks unfavourable by a similar amount even after removing the linear drift. Discovery-period conditions (a bearish, high-volatility gold tape) explain the pattern better than event mechanics.
2. **Breakout continuation is not supported on 5m.** BOS follow-through is negative at 3–12 bars; only strong-displacement breaks show a one-bar impulse. This contradicts the premise of a break-and-retest family and, by extension, the production BO model's rationale.
3. **Sweeps of range extremes are the only structural event with confidence intervals excluding zero at several horizons (bear side).** Because the bull side is negative, a symmetric family built on it should be expected to show its edge only when the tape trends down, which is what the strategy phase then found.
4. **Compression events are rare** under box definitions (9 and 0 events in 14,393 bars); the strategy phase used an ATR-contraction gate instead, which produced 27 discovery signals.

Premise decision at the end of Phase 1: proceed to a minimal strategy build because two events (range-extreme sweep with confirmation; compression break) showed CI-excluding-zero asymmetry on at least one side, while explicitly recording that the asymmetry was one-sided and drift-coincident. The strategy phase (`XAUUSD_STRATEGY_V2_VALIDATION.md`) tested whether that survives out of sample.
