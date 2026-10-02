# V12_RISK_ENVELOPE

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

## Envelope (frozen on DEV)
**Formula:** APPROVED_RISK ≥ lots × (1.5 R + spread + MAX_SLIPPAGE_BUFFER + MAX_GAP_STRESS + MAX_SWAP_BUFFER) × contract.

The size comes from this inequality, rounded down. If even 0.01 lot breaks it, the trade is RISK_REJECTED (valid entry preserved).

| Component | Value | Evidence | Evidence-calibrated? |
|---|---|---|---|
| Spread | scenario (NORMAL 0.24 / MODERATE 0.40 / SEVERE 0.60) | platform 240 points; fills 0.26 | yes |
| Slippage allowance + buffer | 0.10 + 0.2 (to MODERATE 0.30) | 3 fills; no stop-out fills | **no (assumption)** |
| Swap | nights possible × 0.5674 USD/oz (BUY) | platform history (max) | yes |
| Gap (H1) | DEV p99 = 0.2707 R | DEV bars | yes (DEV); failed on HOLD |
| Gap (H3, session tier) | DEV max = 0.7018 R | DEV bars | yes (DEV); HOLD session max 1.92 R |
| Gap (H3, closure tier) | DEV max = 3.7096 R | DEV bars (20 events) | yes (DEV); HOLD closure max 10.67 R |

## What the holdout says about each component
| Component | HOLD verdict |
|---|---|
| Execution cost and swap | contained: never the cause of an envelope exceedance |
| Slippage | contained at NORMAL / MODERATE; not evidence-calibrated |
| Gap | NOT contained: reopen gaps exceeded every DEV-derived buffer |

## Requirement derived from the evidence (documented, NOT implemented)
- **Gap risk cannot be bounded by sizing.**
  - It occurs only when a position is held across a market reopen (daily break or weekend / holiday closure).
  - Its size on the holdout exceeded every DEV-derived buffer.
- **What a bound would need:** a deterministic HOLDING rule known at entry (no open position across a market break). That is exit / holding-time management.
  - It would change the trade lifecycle, so it needs its own pre-registered study.
  - V12 does not implement or recommend it for production.
- **Without such a rule,** the honest envelope statement is: planned risk ≤ approved always; realized ≤ approved on ≥ 99 % of losing trades; rare reopen gaps can exceed it by several times.
- **RISK_PERCENTAGE stays UNRESOLVED.**
