# V12_REALIZED_RISK_HARDENING

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

## Question
Can percentage risk with the structural SL be sized so that realized loss stays within the approved risk, including execution cost, swap, slippage and gaps, without touching the entry or the SL?

## Verdict
**RISK_STATUS = RISK_FAILED** (pre-registered B4, primary sizing H3 per Amendment 1).

Status by sizing (HOLD):
- H1: RISK_FAILED;
- H2: RISK_FAILED;
- H3: RISK_FAILED.

### Frequency is controlled
With any envelope (H1 / H2 / H3), at most 0.74 % of losing trades exceed the approved risk at NORMAL cost on HOLD (criterion ≤ 1 %). This is down from up to 1.53 % without one.

### Magnitude is not controlled
Single trades still reach the following multiples of the approved risk on HOLD (REALISTIC NORMAL; criterion ≤ 1.10):
- H0 (no buffer): ×7.31;
- H1: ×5.64;
- H2: ×1.47;
- H3: ×2.02.

### Cause: gaps at market reopens
- **Where gaps happen:** 0 of 1548 in-session HOLD stop-outs gapped (DEV: 0 of 1209). Every gap-through happened at a reopen:
  - weekend / holiday: 14 of 16, max 10.67 R, 45.64 USD/oz;
  - daily session break: 7 of 26, max 1.92 R.
- **Why the buffers fall short:** HOLD reopen gaps exceeded the DEV maxima (closure 3.71 R, session 0.70 R). No buffer frozen on DEV bounds them.
- **Why H2 still fails:** rejecting closure-reachable entries leaves the daily-break gaps.

## What is hardened
- **Planned risk:** 0 trades above the approved risk.
- **Swap:** a calendar-night buffer known at entry; the swap is small.
- **Slippage:** the MODERATE level is buffered (an assumption; 3 fills of evidence).
- **Exceedance frequency:** ≤ 1 %.
- **The risk firewall:** 0 entry-hash mismatches, and entry validity is preserved in every rejection.

## What is not hardened
- **Reopen gap tail risk.** The broker SL cannot fill inside a gap.
- **Bounding it would need a deterministic holding rule** (no position across a market break), which is exit / holding-time management, not sizing. That rule is documented as a requirement (V12_RISK_ENVELOPE), not implemented.

Reports: V12_PLANNED_VS_REALIZED_RISK · V12_SWAP_ANALYSIS · V12_SLIPPAGE_ANALYSIS · V12_GAP_STRESS · V12_MINIMUM_LOT_ANALYSIS · V12_RISK_ENVELOPE · V12_RISK_HOLDOUT · V12_RISK_REPLAY
