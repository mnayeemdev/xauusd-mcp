# V11 — ENTRY + RISK INTEGRATION — PRE-REGISTRATION (frozen 2026-10-02, before any V11 outcome is computed)

Research and validation only.
- **Authority and production:** REAL = OFF, DEMO = OFF, EXECUTION_AUTHORITY = NONE, PRODUCTION_CHANGED = NO. No order is placed. The connected 10,000 USD MT5 demo account is used for nothing but read-only platform records.
- **Fixed settings:** RR = 1.70, CAPITAL_HARVEST = OFF, AUTO_SCALING = OFF, MARTINGALE = OFF, AVERAGING_DOWN = OFF.

## 1. Owner rule: entry validity is upstream and immutable
- **Entry validity** is decided only by the frozen V8 corrected entry engine (`research/core_pattern_audit_v8/engines/ALL`, replay rows `results/rows/ALL_{DEV,HOLD}.jsonl`).
- **The risk layer is strictly downstream.** It may only ACCEPT or REJECT. It never changes the pattern, setup, trigger, direction, entry location or structural SL, and it never creates an entry.
- **Every valid entry is recorded exactly once,** as `VALID_ENTRY` plus exactly one outcome:
  - `RISK_ACCEPTED`;
  - `RISK_REJECTED:<reason>` (minimum lot, margin, daily, streak, weekly, broker rule);
  - `EXPOSURE_BLOCKED:<reason>` (MAX_SIMULTANEOUS_TRADES = 1 while a position is open; the unchanged V8 one-position re-entry guard);
  - `FAIL_CLOSED:<reason>`.

## 2. Integrated pipeline (fixed order)
1. **ENTRY:** the frozen engine record. It is deep-frozen and hashed (id, bar, time, model, side, entry, structural SL, R, engine TP2 and RR).
2. **ENTRY GEOMETRY CHECK** (verify, never modify):
   - side = candidate side;
   - SL on the protective side;
   - R > 0;
   - R ≥ 0.5 ATR;
   - |entry − anchor| ≤ 2.5 ATR;
   - engine RR ≥ 1.70, consistent with TP2;
   - research target = entry ± 1.70 R.
   - A failure is an ENTRY_DATA defect, recorded and never repaired.
3. **EXPOSURE:** one position at a time. The V8/V9 re-entry guard (`canReenter`) is unchanged.
4. **FAIL-SAFE PRECHECKS → FAIL_CLOSED.** Any of:
   - equity unavailable or ≤ 0;
   - SL unavailable;
   - broker spec unavailable or incomplete;
   - tick value unavailable or inconsistent. The tick value is taken from the platform if recorded; otherwise it is derived as tick size × contract only when the profit currency equals the account currency, and otherwise fails closed;
   - quote older than 90 s or signal older than 600 s (production REAL limits);
   - spread above 0.60 USD (production limit).
5. **RISK TRANSLATION:** the V10 risk library (`research/risk_capital_v10/scripts/risk.mjs`, unchanged; its sha is asserted). It covers equity × r, worst-case loss per lot, lots rounded down, minimum-lot rejection, controls, and the margin cap plus margin-level buffer.
6. **RISK CONSISTENCY CHECK:**
   - independent recomputation of the worst-case loss and actual risk from the frozen entry and the platform spec;
   - |difference| > 1e-6 USD, or actual > approved → FAIL_CLOSED RISK_CALCULATION_INCONSISTENT.
7. **BROKER VALIDATION** — reject if any of:
   - the lot is not a step multiple;
   - the lot is outside [min, max];
   - the SL is on the wrong side;
   - the SL distance is below the stops level;
   - the SL is inside the freeze level;
   - a broker rejection was simulated → REJECTED_BY_BROKER (no retry, no resize).
8. **Outcome:** ELIGIBLE (RISK_ACCEPTED) or the recorded rejection.

## 3. Configurations (descriptive comparison; no winner is declared)
- **Sizing models:**
  - CURRENT: fixed 0.01 lot with the production margin veto `assessRealLot`;
  - PCT: 0.10 %, 0.25 %, 0.50 % and 1.00 % of equity (V10 library, margin cap 50 %).
  - No daily, pause or weekly control is enabled, because V10 supported none.
- **Accounts:** 1,000, 5,000 and 10,000 USD.
- **Costs:**
  - NORMAL: 0.24 + 0.10;
  - MODERATE: 0.40 + 0.30;
  - SEVERE: 0.60 + 0.60, plus a 0.5 R gap on every 10th stop-out.
  - Overnight BUY swap of 0.56 USD/oz/night is charged by the simulator.
- **Exit:** identical for every configuration and unchanged from V8–V10:
  - fixed 1.70 R target;
  - hard broker fail-safe at 1.5 R + spread;
  - thesis invalidation on a confirmed close;
  - 288-bar horizon.
- **Risk percentage:** V10 supported none. RISK_PERCENTAGE = UNRESOLVED. V11 selects no risk percentage and has no free parameter to tune.

## 4. Splits
- **DEV (2025-05-07 → 2025-12-31):** used to build and debug the integration.
- **Freeze:** after DEV the integration code is frozen (sha of `integrate.mjs`, `v11_study.mjs` and the V10 `risk.mjs`).
- **HOLDOUT (2026-01-01 → 2026-09-29):** replayed once with the frozen code. No holdout-driven change.
- **Also run:**
  - chronological replay determinism;
  - restart from serialized state;
  - a deterministic fault-injection replay (every fail-safe condition injected on HOLD entries).

## 5. Metrics (section 22)
- **ENTRY:**
  - valid setups;
  - missed setups, incorrect setups, and direction / trigger / location / SL / RR correctness (V8 audit evidence plus the V11 geometry check plus forward-shadow evidence).
- **RISK:**
  - planned risk, actual risk, risk %, position size;
  - minimum-lot rejections, margin, exposure;
  - risk exceedances (realized loss > planned);
  - risk-rejected valid entries, with their hypothetical R, which stays visible.
- **ECONOMICS:** expectancy R, PF, win rate, average win / loss, max drawdown, consecutive losses.
- **CAPITAL:** equity path, survival, recovery requirement, drawdown distribution.
- **EXECUTION:** spread, slippage, gap, swap; planned versus realized risk, with the excess attributed to spread, slippage, swap and gap.

## 6. Decision (pre-registered)
**INTEGRATION_FAILED** if any of:
- an entry field differs between the engine record and the integrated record, in any configuration;
- a PCT trade is accepted with planned risk above its approved risk;
- an accepted trade fails broker validation;
- a valid entry is missing from the records, or recorded more than once;
- an injected fail-safe condition does not close;
- restart ≠ uninterrupted;
- a duplicate is accepted.

**INTEGRATION_VALIDATED:** no failure condition, all mechanics tests pass, a SUPPORTED risk percentage exists, and capital survival is demonstrated on HOLDOUT at that percentage.

**INTEGRATION_PARTIALLY_VALIDATED:** no failure condition and all mechanics tests pass, but no supported risk percentage exists (RISK_PERCENTAGE = UNRESOLVED) or capital survival is not demonstrated.

**INTEGRATION_INCONCLUSIVE:** no failure condition, but a required mechanic cannot be verified with the available data.

Profitability is NOT an integration criterion. "PROFITABLE" is never an integration status. The entry expectancy is reported as found.

## 7. Prohibited
Optimizing for win rate, trade count, profit or low drawdown; deleting trades; creating filters after outcomes; tuning on HOLDOUT; changing entry rules or the structural SL; manipulating size to improve history; Capital Harvest; DEMO or REAL orders.
