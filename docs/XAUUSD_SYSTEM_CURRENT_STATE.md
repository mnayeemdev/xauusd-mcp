# XAUUSD SYSTEM — CURRENT STATE (reconciled 2026-09-26, weekend pre-market freeze)

Single source of truth for WHAT IS RUNNING, WHAT IS BUILT BUT DORMANT, and WHAT IS RESEARCH. Detailed documents are referenced, not duplicated. Runtime facts are re-verified by `tv xauusd premarket` (read-only).

## PRODUCTION ACTIVE

| Component | State | Detail |
|---|---|---|
| REAL watcher v8 | RUNNING (pid at `state/xauusd_watcher.lock`) | `tv xauusd watch --mt5-real --engine intraday_5m`, log `state/watcher_real_v8.log`, started 2026-09-26 09:05 UTC with News Protection V2 (commit e46b3be). The running process loaded the tree at e46b3be; the strategy surface is byte-identical to the frozen baseline except for the weekend hardening files listed in `docs/XAUUSD_PRE_MARKET_FREEZE.md` (activation of those requires the next authorized restart) |
| REAL account | 460149329 / Exness-MT5Real51 / XAUUSDm / magic 88052001 | equity ≈ 62 USD, leverage 1:200, lot EXACTLY 0.01 (USER_FIXED), auto scaling OFF, breaker 2 consecutive losses (per UTC day), daily loss limit disabled, +30 / −50 USD monetary envelope, minimum effective RR 1.7, thesis exit + adaptive management ON |
| Strategy | FROZEN `intraday_5m` profile | fingerprint registry `src/engine/strategy.frozen.json`, verified by `tests/strategy_fingerprint.test.js` / `tv xauusd fingerprint`; docs: `XAUUSD_MCP_ENGINE.md` |
| News Protection V2 | ACTIVE | tiers A (FOMC cluster 150/90/120) / B (CPI, NFP T+60) / C (30/5/30), DATA_UNAVAILABLE = BLOCK, normalisation extension OFF (0, shadow-audited), open-position policy O1; docs: `XAUUSD_NEWS_PROTECTION_V2.md`, `_V2_SPEC.md` |
| Shock / spread / feed guards | ACTIVE | `src/engine/marketShock.js`, `protectionGuards.js`; docs: `XAUUSD_NEWS_SHOCK_PROTECTION.md` (V1 windows superseded by V2, guards unchanged) |
| Pine reference (TradingView indicator) | ACTIVE as a VETO only | opposing actionable direction => WAIT/ENGINE_DISAGREEMENT; otherwise informational; 0 occurrences recorded to date; docs: `XAUUSD_AUTHORITY_MAP.md` |
| Ops alerts | console + Windows toast, "NOT A TRADE SIGNAL" | feed stalled/recovered; from the next restart also: executor HALTED / ORDER_AMBIGUOUS / OPENED / CLOSED / EMERGENCY / ANOMALY (once) / REJECTED (once) / CLOSE_FAILED (once) / bridge down / watcher cycle errors (one-shot + recovery) |

## SHADOW ACTIVE (observation only, zero execution authority)

| Component | State |
|---|---|
| Stage 11C forward shadow observer | RUNNING (`state/shadow/observer.lock`), `node src/shadow/observer.js`, candidates SC1_SILVER_LEAD_v1 / SC2_PRODUCTION_SIGNAL_v1, store `state/shadow/*.jsonl`; docs: `XAUUSD_FORWARD_SHADOW_EVIDENCE_PROTOCOL.md`, `XAUUSD_FORWARD_SHADOW_CANDIDATES.md` |

## EVALUATION MACHINERY (Stage 12 D/E/F, frozen 2026-09-26, read-only, zero execution authority)

| Component | State |
|---|---|
| `validation/stage12/*` (rules `stage12-def-1.0`, evidence integrity, 12D edge evaluator, 12E independence gate, 12F capital readiness, report CLI `npm run xauusd:stage12:report`) | ENGINEERING COMPLETE; genuine evidence: 12D WAITING_FOR_FORWARD_EVIDENCE, 12E NOT_ELIGIBLE_YET, 12F CAPITAL_SCALING_NOT_READY. Docs: `XAUUSD_STAGE12_FORWARD_EDGE_EVALUATION.md`, `_INDEPENDENT_VALIDATION.md`, `_CAPITAL_READINESS.md`, `_FINAL_GATE.md` |

## DEMO BUILT / NOT ACTIVE

| Component | State |
|---|---|
| Stage 12 DEMO forward validator | READY_NOT_STARTED. Blocker: no independent MT5 terminal logged into DEMO 480236873 / Exness-MT5Trial11 (the only terminal is REAL). Never switch the REAL terminal. Docs: `XAUUSD_STAGE12_DEMO_*.md`. Known comparability limitation: no Pine reference (production may veto where the validator acts); SIGNAL evidence carries `pine_parity` |

## DORMANT / LEGACY

| Component | State |
|---|---|
| Legacy DEMO watcher route (`tv xauusd watch --mt5-demo`, magic 88051501) | RETIRED (kill-switch file `state/xauusd_mt5_kill_switch` present); superseded by Stage 12; doc `XAUUSD_MT5_DEMO_EXECUTION.md` is historical |
| Dynamic capital scaling (`src/engine/mt5RealScaling.js`) | DORMANT, NOT WIRED (reporting projection only); `XAUUSD_CAPITAL_SCALING_READINESS.md`, `CAPITAL_GROWTH_ARCHITECTURE_62_TO_6M.md` are design documents with no code hooks. CAPITAL_SCALING_READY = NO |
| `reference_15m` engine profile | available for research/manual reads; NOT permitted with `--mt5-real` |

## RESEARCH ONLY (no authority, historical conclusions preserved)

`XAUUSD_MASTER_EDGE_VALIDATION.md`, `XAUUSD_MODEL_EDGE_MATRIX.md`, `XAUUSD_STRATEGY_IMPROVEMENT_LAB.md`, `XAUUSD_CANDIDATE_RULES.md`, `XAUUSD_SHADOW_VALIDATION_PLAN.md`, `XAUUSD_STRATEGY_V2_*` (4), `XAUUSD_V3_*` (3), `XAUUSD_V4_*` (5), `XAUUSD_V5_*` (5), `XAUUSD_V5_1_NEWS_PROTECTION_REVIEW.md`, `XAUUSD_NEXT_EDGE_RESEARCH_*` (4: premise failed, decision C), `SEED_RISK_REPLAY_STUDY.md`. EDGE_DEMONSTRATED = NO.

## DEPRECATED / SUPERSEDED / HISTORICAL

`XAUUSD_NEWS_PROTECTION_POLICY_V2_PROPOSAL.md` (implemented as V2), `XAUUSD_NEWS_SHOCK_PROTECTION.md` V1 windows (superseded by V2; guard layer unchanged), `MASTER_CONTRACT.md` status line (contract now implemented; MCP decides, Pine vetoes), `PINE_P*.md`, `XAUUSD_ADAPTIVE_MASTER.md` (Pine stage records), `XAUUSD_LIVE_RUNTIME.md` (Stage 6 runtime, predates REAL/shadow/validator processes).

## Owner decision items (explicitly NOT changed this weekend)

1. **Breaker scope**: the 2-consecutive-loss breaker resets at the UTC day change (`rollDaily`). Two losses at 23:50 UTC permit entries again at 00:00 UTC. This is the documented policy; changing it to a rolling breaker is a risk-policy decision.
2. **Fail-closed configurability**: `XAUUSD_NEWS_DATA_UNAVAILABLE_POLICY=ALLOW` and `XAUUSD_NEWS_PROVIDER=none` are accepted by the REAL config (audited; the pre-market report flags them). The frozen baseline uses BLOCK / http_json.
3. **Calendar freshness** is keyed to the provider's Last-Modified timestamp (fail-closed; a frozen upstream file blocks entries after 6 h).
4. **DEMO comparability**: the Stage 12 validator cannot reproduce the Pine veto without chart access; a JS port of the Pine decision would be a strategy-semantics change and is not attempted.

## Runtime files (all git-ignored)

`state/xauusd_watcher.lock|_state.json`, `state/xauusd_cdp_chart.lock`, `state/xauusd_mt5_real_executor_state.json|_trade_log.jsonl|_kill_switch`, `state/xauusd_news_calendar_snapshot.json`, `validation/mcp_engine_signals.json` (production dedup store, untracked since 2026-09-26), `state/shadow/*`, `state/demo_forward/*`, `state/watcher_real_v*.log`.
