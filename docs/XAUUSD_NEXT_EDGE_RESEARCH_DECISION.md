# XAUUSD_NEXT_EDGE_RESEARCH_DECISION — Stage 11B

Date 2026-09-26. Baseline HEAD e46b3be (News Protection V2 active, REAL watcher v8, lot USER_FIXED 0.01, scaling OFF). Offline research only; nothing promoted.

## 1. What was tested and why

The research inventory (`docs/XAUUSD_NEXT_EDGE_RESEARCH_PROTOCOL.md` §0) shows every price-pattern premise from 5m to weekly, and scheduled-news direction, already tested and failed, with the 2022-07 → 2026-09 15m gold history inspected repeatedly. The strongest genuinely untested premise was **session-and-context structure**: session-clock effects (London/NY opening ranges, Asia range, London→NY transition, hour/weekday seasonality), prior-day reference levels, and a **new information source**, the contemporaneous behaviour of the dollar index, silver and Nasdaq CFDs on the same broker feed (never used before). Consensus forecasts, official yields/DXY and positioning remain UNTESTABLE WITH CURRENT DATA (no trustworthy accessible history; nothing fabricated).

## 2. Result

- Discovery (2022-09 → 2024-06, 47 cells): one candidate passed the pre-declared gate, `S5H:H21` (long during the last London hour before the daily close, 2-hour horizon, +0.34 ATR, CI [+0.20, +0.48], 60 % win, PF 1.9, all years positive), and was frozen (sha256 recorded) before validation.
- Validation (2024-07 → 2025-08): +0.11 ATR, CI [−0.14, +0.34], cost-net +0.01 → **VALIDATION_FAILED**. Holdout not opened. No robustness phase (no survivor).
- Diagnosis: 100 % of H21 positions are held across the broker's daily close; the raw effect is the Asian-reopen drift of a bull market, shrinking as ATR rose; after the long swap every such position pays (−0.55 USD/night) it is negative in both regions, and a realistic reopen spread makes it deeply negative. Not an edge, and not tradeable at 0.01 lot on this account.
- Near-miss recorded, not a candidate: silver 15m drop (z ≤ −1.5) → gold down over the next 2 h, +0.20 ATR in discovery, all years positive, but first-touch probability 50 % (< 53 % gate) and asymmetric. Any follow-up must be a separately pre-declared study on data not yet inspected (forward data), not a retune here.

## 3. Relation to the current MCP (Part 10)

PROPOSED_ROLE_IN_MCP = **F. NO PRODUCTION USE**. No session, reference-level, seasonality or cross-asset rule from this stage qualifies as entry authority, filter, quality input, risk context or execution filter. The one contextual fact worth keeping on record for the safety layer, already consistent with V1/V2 behaviour, is that the hour around the daily close/reopen is a session boundary with reopen-spread risk; production already refuses stale candles and applies spread guards there. No architecture change is proposed.

## 4. Capital implication (Part 11)

EDGE_DEMONSTRATED = NO. CAPITAL_SCALING_READY = NO. The owner's destinations (USD 6 M, then 600 M) remain destinations; they do not lower the evidence standard, and no lot, exposure, leverage or scaling change is authorised. REAL lot remains USER_FIXED 0.01.

## 5. What was learned for the research programme

1. Session clocks and reference levels add no directional expectancy on this feed beyond drift; gold's intraday moves after these conditions are two-sided (MFE/MAE ≈ 1.0).
2. Cross-asset information is strongly contemporaneous (silver +0.77, dollar −0.56 at 15m) but has no exploitable lag at 15m; if it is ever useful it would be as a same-bar confirmation input, which cannot be evaluated without tick-level or sub-bar data.
3. Session-boundary effects (close/reopen) look like edges in bar data and are eaten by swap and reopen spreads; any future candidate that holds through 21:00–22:00 UTC must be costed with swap and reopen spread before being counted.
4. The 15m gold history 2022–2026 has now been used by V3, V5, the V2 replay and this stage; it cannot provide unseen evidence any more. The next genuinely unseen evidence is forward: the live V2 audits (Stage 11) and any shadow-measured research signals.

## 6. Decision

FINAL_DECISION = **C) PREMISE FAILED — NO REPEATABLE EDGE**.

NEXT_GATE = continue Stage 11 live forward-safety monitoring (first real CPI / NFP / FOMC under V2); no strategy or capital-scaling change; further edge research only on genuinely new information or forward data, pre-declared, with the silver-lead near-miss as the one item eligible for a forward shadow measurement (measure only, never trade).
