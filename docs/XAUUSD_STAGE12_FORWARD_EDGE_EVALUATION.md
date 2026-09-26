# XAUUSD STAGE 12D — FORWARD EDGE EVALUATION (rules frozen 2026-09-26, rule version `stage12-def-1.0`)

**Question answered:** does the FROZEN production strategy (fingerprint `356e4189…`, `intraday_5m`, lot 0.01) demonstrate a repeatable positive forward trading edge after realistic execution costs? This is an evidence evaluator, never an optimiser. It is READ-ONLY (`npm run xauusd:stage12:report`; `--json`; `--out <dir>` writes only its own report files) and can reach no executor or bridge (transitive-closure test).

## 1. Accepted evidence (12D.1)

| Source | Schema | Provenance vocabulary | Gate-eligible |
|---|---|---|---|
| Stage 12 DEMO validator store `state/demo_forward/demo_forward_evidence.jsonl` | `demo-forward-1.0` (SIGNAL / EXECUTION / OUTCOME) | `FORWARD_LIVE_DEMO`, `BACKFILL`, `HISTORICAL_REPLAY`, `TEST` | **only `FORWARD_LIVE_DEMO`** |
| REAL executor audit `state/xauusd_mt5_real_trade_log.jsonl` (OPENED/CLOSED/SKIPPED rows) | executor audit | derived label `FORWARD_LIVE_REAL` (genuine forward; separate cohort, explicitly labelled) | never (supplementary disclosure only) |
| Stage 11C shadow store `state/shadow/*.jsonl` | `shadow-1.0` | `FORWARD_LIVE`, `BACKFILL`, `HISTORICAL_REPLAY`, `TEST` | only `FORWARD_LIVE` for the Stage 11C gates (12E) |

Provenance is read, never rewritten. `BACKFILL` / `HISTORICAL_REPLAY` / `TEST` records are loaded (software testing) but can never satisfy a production edge gate (`tests/stage12_def_gates.test.js` A). Synthetic test fixtures carry a `synthetic_fixture` marker and are quarantined by the CLI. REAL and DEMO are never pooled.

**Trade definition:** COMPLETED = a CLOSED execution record with realized net P&L; R = net USD / initial broker risk USD, risk = |fill − structural stop| × 100 × 0.01 (frozen protocol). Trades without a known risk are counted as completed but excluded from R statistics and counted as missing data. OPEN positions are never counted as winners.

## 2. Frozen rules (12D.2 / 12D.3) — authority

Imported, not restated: `src/demo/report.js STAGE12_GATES` (Stage 12 protocol §3) and `src/shadow/report.js FORWARD_GATES` (Stage 11C). `validation/stage12/rules.js` adds only disclosures, a cost-scenario table and the independence/capital rules; it cannot lower a threshold (test A).

| Minimum | Value |
|---|---|
| completed forward DEMO trades | 60 |
| independent sessions (UTC days with ≥ 1 forward signal) | 40 |
| calendar days since the first forward signal | 90 |
| model families with completed trades | 2 |
| months with ≥ 10 trades (monthly stability) | 3 |

| Robustness gate | Rule |
|---|---|
| expectancy | seeded bootstrap (seed 20260926, 2000 resamples) 95 % CI of mean R, lower bound > 0 |
| profit factor | gross winning R / |gross losing R| ≥ 1.15; no losses ⇒ UNDEFINED (not passable), no wins ⇒ 0 |
| winner dependence | mean R without the top 5 winners > 0 (top 1 / 3 / 5 reported) |
| cost stress | STAGE12_STRESS scenario (+0.40 USD round trip +0.10 USD slippage per trade) mean R > 0; OBSERVED and ADVERSE (+1.00 USD) reported |
| BUY/SELL stability | both sides non-negative, or the negative side < 25 % of trades |
| monthly stability | ≥ 60 % of months with ≥ 10 trades positive |
| model-family stability | no family with ≥ 15 trades and expectancy < −0.3 R |
| execution reliability | fill-failure ≤ 5 %, median entry slippage ≤ 0.30 USD, 0 unreconciled, 0 duplicates |
| missing data | ≤ 10 % of trades without P&L or R |
| max drawdown | PREDECLARED_REVIEW_REQUIRED: reported in R and USD; no pass/fail number until ≥ 60 trades exist |

## 3. Metrics produced (12D.2)

Counts (trades, completed, with/without R, open, wins, losses, breakeven, sessions, calendar days, span, models, blocked signals), expectancy (point estimate, CI, standard error, median, win rate, `POINT_ESTIMATE_POSITIVE` vs `EDGE_STATISTICALLY_SUPPORTED`), gross/net R and USD, profit factor with status, drawdown R/USD, streaks, average win/loss R, payoff ratio, MFE/MAE (where recorded), holding duration, execution costs (commission, swap, spread, slippage, signal-to-fill drift), cost scenarios, winner dependence, per-model / session-bucket / month / side / regime / news-proximity / shock-state breakdowns, exit-reason distribution, blocked-signal reasons, Pine-parity split. Anything the evidence does not support is `NOT_AVAILABLE`.

## 4. Statuses (12D.12)

`INSUFFICIENT_EVIDENCE` (any minimum unmet; the summary prints `WAITING_FOR_FORWARD_EVIDENCE`), `EVIDENCE_COMPLETE_EDGE_NOT_SUPPORTED`, `EVIDENCE_COMPLETE_EDGE_SUPPORTED` (every gate, integrity OK, single fingerprint cohort). An EDGE_SUPPORTED dataset with failed integrity or a mixed cohort is downgraded.

## 5. Pine parity disclosure (12D.11)

Production can veto an actionable signal on an OPPOSING Pine reference (WAIT / ENGINE_DISAGREEMENT). DEMO evidence has no chart reference; every DEMO SIGNAL carries `pine_reference_status` and `pine_parity = REFERENCE_UNAVAILABLE_PRODUCTION_MAY_VETO`. Every 12D report prints the split (read / unavailable / unknown) and the disclosure. No Pine state is fabricated; production semantics are unchanged.

## 6. Integrity and version links

Quarantine (never repair, never delete): invalid schema/provenance, duplicate record id / signal / close / outcome, outcome before signal, outcome before horizon, future timestamp, clock inversion, account contamination (login/server/class/symbol/lot), provenance mismatch between outcome/execution and signal, malformed lines, synthetic fixtures. Every report carries: rule version + rule fingerprint, strategy fingerprint (+ verification), git commit, evidence schema versions, candidate hashes, account class, symbol, timeframe. DEMO records are stamped with `strategy_fingerprint` / `git_commit` by the validator; a different fingerprint is a separate cohort excluded from the gate and reported.

## 7. Current result (2026-09-26, genuine evidence)

`STAGE12D_STATUS = WAITING_FOR_FORWARD_EVIDENCE` (INSUFFICIENT_EVIDENCE): 0 gate-eligible DEMO forward trades (validator READY_NOT_STARTED). Supplementary REAL cohort: 2 closed trades (net −59.87 USD; one without a recorded structural risk ⇒ R NOT_AVAILABLE for it), 3 early audit rows quarantined as cross-account contamination (written while the terminal was still on the DEMO login). EDGE_DEMONSTRATED = NO.
