# V12_HINDSIGHT_AUDIT

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

Every quantity used in V12, with the information-time test: could MCP know it at entry time?
| Quantity | Known at entry? | Used as |
|---|---|---|
| Stage strings (pattern / setup / trigger per model and side) | YES (confirmed bar) | funnel, attribution |
| Bias-aware triggers (`trig`), 15m bias | YES | DIRECTION stage, SR trigger rule |
| Entry, structural SL, anchor, engine TP2 / RR, risk / ATR | YES | geometry checks, timing / location features |
| Bars from origin, anchor distance, BO bars since event, MR bars since sweep | YES | descriptive bins, candidates C1–C3 |
| DEV quartile cuts, DEV gap / swap / slippage buffers | YES (frozen before HOLD) | candidate thresholds, envelope |
| Calendar nights possible, closure reachability (trading calendar) | YES (schedule; holidays assumed published) | swap buffer, H2 / H3 gap tier |
| Platform swap rate history, contract spec | YES | swap buffer, sizing |
| Probe outcome, trade outcome, MFE, MAE, 1.70 R reach | **NO** (outcome) | measurement only |
| Hindsight outcome labels, mirror counterfactual | **NO** | labels only |
| Realized calendar nights, gap-through at the exit, realized multiplier | **NO** | risk evaluation only |
| SL-width / cost-ratio effects | YES, but HOLD-contaminated (seen in V10 / V11) | NOT admissible as a candidate |

## Result
- **No hindsight quantity became a rule or candidate.**
- **The three admissible candidates** (C1–C3) use pre-entry information only. None passed DEV.
- **The risk envelope** uses only pre-entry information: the calendar, platform rates and DEV-frozen buffers.
