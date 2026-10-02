# V12_FINAL_FINDINGS

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

## Decisions
| Item | Value |
|---|---|
| ENTRY_EDGE_STATUS | **EDGE_FAILURE_NOT_ISOLATED** |
| ENTRY_FAILURE_STAGE | NO DETERMINISTIC FAILURE IDENTIFIED |
| ENTRY_EDGE_REMAINING_PROBLEM | YES |
| RISK_STATUS | **RISK_FAILED**: primary H3; H1 RISK_FAILED; H2 RISK_FAILED |
| SUPPORTED_RISK_PERCENTAGE | UNRESOLVED |

## The ten questions
**1. Where does entry edge fail?**
NO DETERMINISTIC FAILURE IDENTIFIED.
- Gross edge is ≈ 0 from PATTERN onward, on both splits (no stage replicated; no significant transition).
- There is no edge to lose: **the existing strategy has no demonstrated edge.**
- The negative net expectancy (-0.077 / -0.022 R) is the execution cost on trades that are ≈ 0 R gross (0.018 / 0.042 R).

**2. Are losses mostly implementation errors or valid losing trades?**
VALID LOSING TRADES: 1463 of 1463 (100 %), with 0 implementation errors.
- About 45 % are hindsight "direction misses" (the mirror trade would have won).
- About 47 % moved the right way first.
- About 8 % are noise.

**3. Can any proposed entry correction be defined before entry without hindsight?**
No.
- The three admissible pre-entry candidates (location margin, late trigger, early trigger) all failed DEV; C1 even reversed sign between the splits.
- The only robust group difference (SL width / cost ratio) is HOLD-contaminated and deletes trades without creating edge.

**4. Does realized risk remain inside the risk envelope?**
Not always.
- **Planned risk:** always ≤ approved.
- **Frequency:** with the envelope, realized loss stays ≤ approved for ≥ 99.3 % of losing trades.
- **Magnitude:** market-reopen gaps still push single trades to ×2.02 (H3) or ×7.31 (no buffer) on HOLD.

**5. Does swap materially affect risk?**
Minor.
- It is 1.1 % of planned risk overnight and 2.1 % over weekends.
- It is deterministic at entry and fully covered by the swap buffer.
- Unbuffered, it puts some overnight losers above plan by ≤ ×1.13.

**6. Does slippage materially affect risk?**
Yes relative to plan, but bounded.
- MODERATE puts ≈ 43–46 % of losers above plan, by ≤ ×1.10; SEVERE by ≤ ×1.23.
- The buffer covers MODERATE but is not evidence-calibrated (3 fills).

**7. Does gap stress materially affect risk?**
Yes; it is the dominant tail.
- 1.3 % of HOLD stop-outs gapped, all at market reopens (0 in session).
- The HOLD maximum was 10.67 R (45.64 USD/oz), beyond every DEV-derived buffer.

**8. How often does minimum lot make valid entries untradeable?**
Depends on account and risk (HOLD, 10,000 USD, share of risk-evaluated valid entries):
- 0.10 %: H0 67.4 %, H3 87.4 %.
- 0.25 %: H0 22.5 %, H3 52.3 %.
- 0.50 %: H0 5.4 %, H3 23.6 %.
- 1.00 %: H0 0.7 %, H3 6.1 %.

At 1,000 USD almost every valid entry is untradeable at ≤ 1 % (V12_MINIMUM_LOT_ANALYSIS).

**9. Is any risk percentage supported?**
No. RISK_PERCENTAGE = UNRESOLVED.

**10. Is a deterministic correction justified?**
- **Entry:** NO. No deterministic pre-entry error exists; every loss is rule-valid.
- **Risk:** the evidence identifies a deterministic risk SOURCE (exposure across a market reopen, known at entry), but V12 does not justify a correction.
  - Rejecting closure-reachable entries (H2) still failed on daily-break gaps.
  - A full bound needs a holding-time rule that is outside sizing.
  - It is documented as a requirement only.

## Final terminal summary
```
V12_STATUS                 = COMPLETE
ENTRY_EDGE_STATUS          = EDGE_FAILURE_NOT_ISOLATED
ENTRY_FAILURE_STAGE        = NO DETERMINISTIC FAILURE IDENTIFIED
PATTERN_STATUS             = rule-correct; no edge (pooled -0.013 / 0.006 R, n.s.)
SETUP_STATUS               = rule-correct; adds no edge (transition n.s.)
TRIGGER_STATUS             = rule-correct (0 trigger errors after SR rule D1); adds no edge
DIRECTION_STATUS           = rule-correct (0 direction errors); no replicated direction value (drift-driven)
ENTRY_LOCATION_STATUS      = rule-correct (0 location errors); no deterministic timing / location failure; C1–C3 not supported
VALID_LOSS_STATUS          = 1463 / 1463 losing trades are VALID_LOSING_TRADE
HINDSIGHT_CHECK            = PASS (no hindsight quantity used as a rule or candidate)
HOLDOUT_RESULT             = entry: no edge on HOLD (net -0.022 R, CI through 0); risk: RISK_FAILED
REPLAY_RESULT              = PASS (V8 / V11 parity, deterministic, restart = uninterrupted)
RISK_STATUS                = RISK_FAILED
SWAP_RISK                  = MINOR, deterministic, fully buffered
SLIPPAGE_RISK              = MATERIAL vs plan but bounded (≤ ×1.23); buffer not evidence-calibrated
GAP_RISK                   = DOMINANT tail: reopen gaps up to 10.67 R on HOLD; not bounded by any DEV buffer
MINIMUM_LOT_RISK           = HIGH below 5k USD; envelope increases rejections; valid entries preserved
PLANNED_VS_REALIZED_RISK   = planned ≤ approved always; realized ≤ approved on ≥ 99 % of losers; reopen-gap tail up to ×2.02 (H3)
SUPPORTED_RISK_PERCENTAGE  = UNRESOLVED
ENTRY_RULES_CHANGED        = NO
STRUCTURAL_SL_CHANGED      = NO
RR                         = 1.70
CAPITAL_HARVEST            = OFF
REAL_TRADE_PLACED          = NO
DEMO_TRADE_PLACED          = NO
EXECUTION_AUTHORITY        = NONE
PRODUCTION_CHANGED         = NO
```
