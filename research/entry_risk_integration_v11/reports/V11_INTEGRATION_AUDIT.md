# V11_INTEGRATION_AUDIT

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## Question
Can the frozen V8 corrected entry engine and the V10 governed risk layer be integrated so that risk is strictly downstream of entry validity, and so that each valid entry is accepted or rejected (never altered) and stays visible in the records? The integrated pipeline must also respect broker, margin and safety rules and fail closed.

## Verdict
**INTEGRATION_STATUS = INTEGRATION_PARTIALLY_VALIDATED** (corrected fault harness).

The pre-registered harness computed **INTEGRATION_FAILED**: 2 trades accepted under its leverage-1 "margin insufficient" injection. Both satisfied the margin rule, so the harness did not create the fault; the integration behaved correctly (CORRECTION_LOG C1). Both results are reported, and the owner decides whether to accept the correction.

Why PARTIALLY rather than VALIDATED:
- **What is validated:** every integration mechanic.
- **Risk percentage:** UNRESOLVED (V10 supported none), so capital survival at an approved risk cannot be demonstrated.
- **Not the criterion:** profitability is not an integration criterion. The entry stream's expectancy is negative, as found: DEV -0.077 R, HOLD -0.022 R. *Risk sizing controls how fast capital is lost; it cannot create an edge.*

## The owner's eight questions
| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Is the chart pattern correctly recognized? | Rule execution: yes. Stage parity 0 mismatches in 993,810 pattern / setup / trigger checks; implementation-caused missed patterns 55 / 84 → 0 / 0 (DEV / HOLD) after D1–D6. Forward: 0 violations, 0 implementation errors. | V11_ENTRY_CORRECTNESS |
| 2 | Is the trade correctly triggered? | Yes, by the same stage parity (trigger stage included); entry timing median 3 bars from origin. | V11_ENTRY_CORRECTNESS |
| 3 | Is the direction rule correctly executed? | Yes, as a rule: no direction-logic defect remains in the corrected core. As an outcome: 31.4 % / 29.9 % of signals move against the trade (mostly valid losing trades). | V11_ENTRY_CORRECTNESS |
| 4 | Is the structural SL correct? | Yes: 11,411 of 11,411 entries pass the geometry check (protective side, ≥ 0.5 ATR, location ≤ 2.5 ATR). The SL is never moved: entry-hash mismatches 0 in every configuration. | V11_STRUCTURAL_SL |
| 5 | Is RR 1.70 correctly calculated? | Yes: engine RR ≥ 1.70 on every entry (share below 1.70 = 0.0 %); research target = entry ± 1.70 R exactly. | V11_STRUCTURAL_SL |
| 6 | Can risk be safely translated into position size? | Mechanically yes. 0 PCT trades above the approved risk; lots always a step multiple, rounded down; the independent tick-value path agrees on every trade. Which % to use is UNRESOLVED. | V11_RISK_TRANSLATION, V11_POSITION_SIZING |
| 7 | Can broker constraints be respected? | Yes: the spec is read from the platform; 0 broker-invalid accepted trades; broker rejection is recorded and never retried or resized. | V11_BROKER_VALIDATION |
| 8 | Can capital survive the resulting risk? | Not demonstrated. With negative entry expectancy every sized configuration loses on DEV; at 1.00 % / 10,000 USD the HOLD max DD is 32.1 %. Percentage sizing never ruins the account; CURRENT's fixed lot is a variable % risk. | V11_CAPITAL_SURVIVAL |

## Pre-registered failure conditions
| Condition | Corrected harness | Pre-registered harness |
|---|---|---|
| entry_changed | not met | not met |
| pct_above_approved | not met | not met |
| broker_invalid_accepted | not met | not met |
| identity_broken | not met | not met |
| fault_not_closed | not met | **FIRED** |
| restart_mismatch | not met | not met |
| duplicate_accepted | not met | not met |

## Findings
1. **Entry validity is preserved.**
   - Every one of 11,411 valid entries is recorded exactly once in every configuration (identity holds in all 90 split × account × model × cost cells).
   - Entry-hash mismatches: 0.
   - The integrated replay reproduces the V10 walk exactly, and the risk-free entry-only walk reproduces the V8 audit (n 1133 / 1510, -0.077 / -0.022 R).
2. **Risk-rejected valid entries stay visible.** Every rejection keeps its reason and its hypothetical outcome; at 0.25 % / 10,000 USD on HOLD, 447 valid entries are RISK_REJECTED (minimum lot).
3. **Risk rejection is not outcome-neutral, and this is reported, not exploited.**
   - The minimum-lot rule rejects the WIDEST-SL entries.
   - At 0.25 % / 10,000 USD the rejected HOLD entries have a hypothetical mean of 0.154 R, versus -0.028 R for the accepted ones.
   - This is consistent with V10, where the widest-SL quartile was the only one with positive R on both splits. No filter is built from it (no post-outcome filters).
4. **Planned risk is controlled; realized risk is not fully covered.**
   - NORMAL cost: 0.8 % of losing trades exceed the plan (max ×1.12), all from the overnight BUY swap.
   - SEVERE cost: 58.2 % (max ×1.41).
   - CURRENT's −50 USD assumption is exceeded by 9 HOLD losses (max ×3.08) under the common structural exit.
5. **Every fail-safe closes:** 13 fault types, 172 injections on HOLD, 0 accepted (corrected harness), and every one is also unit-tested. Restart = uninterrupted; duplicate deliveries are rejected, also after restart.
6. **Forward evidence (live shadow, 22.52 h).**
   - V8: 5 valid setups, 0 stage mismatches, 0 D1–D6 violations, 0 implementation errors, 3 valid losses.
   - CONTROL (production, same inputs): 8 implementation errors.
   - Far too small for economics.

## Protocol
- **Pre-registration:** written before any outcome (sha 722b5d612df887a8…).
- **DEV:** integration built and debugged → code frozen (integrate 82c1e6c77374…, V10 risk 2fc1806a1e14…).
- **HOLDOUT:** replayed once with the frozen code.
- **Correction:** a single documented fault-harness correction (C1) with a re-freeze; every non-harness output was identical between the two runs.
- **Costs:** NORMAL, MODERATE, SEVERE (+ gap); swap charged.
- **No changes:** no parameter was selected or tuned; no entry rule, SL or RR was changed.

## Report index
V11_ENTRY_RISK_MATRIX · V11_ENTRY_CORRECTNESS · V11_RISK_TRANSLATION · V11_POSITION_SIZING · V11_STRUCTURAL_SL · V11_BROKER_VALIDATION · V11_MARGIN_EXPOSURE · V11_COST_STRESS · V11_PLANNED_VS_REALIZED_RISK · V11_CAPITAL_SURVIVAL · V11_FIXED_VS_PERCENTAGE · V11_DEVELOPMENT_RESULTS · V11_HOLDOUT_RESULTS · V11_REPLAY_RESULTS · V11_FAILURE_MODES · V11_SUPPORTED_PARAMETERS · V11_REJECTED_PARAMETERS · V11_PROPOSED_INTEGRATED_SPEC
