# XAUUSD STAGE 12E — INDEPENDENT VALIDATION GATE (frozen 2026-09-26, rule version `stage12-def-1.0`)

**Purpose:** the evidence used to discover or tune an idea can never be its final proof.

## 1. Independence rule (12E.1 / 12E.3)

| Dataset | Definition | Role |
|---|---|---|
| DEVELOPMENT / PRIMARY FORWARD EVIDENCE | every `FORWARD_LIVE_DEMO` trade from the validator start up to `VALIDATION_START_UTC` (if declared) | Stage 12D |
| INDEPENDENT VALIDATION EVIDENCE | `FORWARD_LIVE_DEMO` trades with decision time ≥ `VALIDATION_START_UTC` | Stage 12E |

`VALIDATION_START_UTC` is declared ONCE by the owner in `validation/stage12/validation_window.frozen.json` (`status: DECLARED`, `validation_start_utc`, `declared_at_utc`, `declared_after_12d_status`, `last_primary_trade_utc_at_declaration`) only after Stage 12D reaches `EVIDENCE_COMPLETE_*` on the primary dataset; it must be strictly later than the last primary trade and is never moved. The checker refuses: NOT_DECLARED, DECLARED_BEFORE_12D_COMPLETE, START_NOT_AFTER_LAST_PRIMARY_TRADE, DISCOVERY_DATA_RELABELLED_AS_VALIDATION (a trade between the start and the declaration time), PRIMARY_TRADES_AFTER_DECLARED_BOUNDARY, missing declaration fields. Provenance is preserved; discovery data is never relabelled.

The independent dataset must satisfy the SAME minimums (60 / 40 / 90 / 2 / 3 months) and the SAME gates as Stage 12D, evaluated by the same code without retuning (12E.4). No new metric is introduced after seeing a result.

## 2. Stage 11C candidates (12E.2)

Frozen registry `src/shadow/candidates.frozen.json` (SHA-256 per definition; `verifyFrozenRegistry()` refuses any modification; a tampered registry is reported by 12E and tested):

| Candidate | Frozen gates (repository truth, `src/shadow/report.js`) | Role in 12E |
|---|---|---|
| `SC1_SILVER_LEAD_v1` | ≥ 150 FORWARD_LIVE observations with the primary horizon labelled, ≥ 60 sessions, ≥ 120 days, CI lower > 0, first-touch ≥ 0.53, cost 0.26 USD, no-top-5 > 0, ≥ 60 % positive months (≥ 4 months) | own hypothesis (non-production); validates itself under its frozen gates |
| `SC2_PRODUCTION_SIGNAL_v1` | ≥ 100 forward signals, ≥ 60 sessions, ≥ 120 days, CI lower > 0, geometry expectancy > 0, no-top-5 > 0, ≥ 60 % positive months | cross-check of the SAME production signals the DEMO validator executes ⇒ **not** an independent dataset |

Candidate definitions and hashes are never modified to improve outcomes. Observations are checked for candidate version mismatches.

## 3. Statuses (12E.5)

`NOT_ELIGIBLE_YET` (no valid window), `INDEPENDENT_VALIDATION_RUNNING` (window declared, minimums unmet), `INDEPENDENT_VALIDATION_FAILED` (complete, gates failed — produces recommendations for a NEW research premise, never a strategy mutation), `INDEPENDENT_VALIDATION_SUPPORTED`. A failed validation never changes the Stage 12D result, the strategy or any production setting.

## 4. Current result (2026-09-26)

`STAGE12E_STATUS = NOT_ELIGIBLE_YET` (window NOT_DECLARED; primary 12D still INSUFFICIENT). SC1 and SC2: COLLECTING (0 FORWARD_LIVE observations yet; the current shadow store holds BACKFILL observations only, created after the freshness window during the first observer run, which never count). Registry integrity OK.
