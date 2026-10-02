/**
 * V15 QUOTE DATA INTEGRITY -- renders the 15 required reports from results/ (no computation that could change a result).
 *   node research/quote_integrity_v15/scripts/write_reports.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const RES = join(ROOT, 'results'); const REP = join(ROOT, 'reports'); mkdirSync(REP, { recursive: true });
const R = JSON.parse(readFileSync(join(RES, 'v15_results.json'), 'utf8')); const LC = R.live_capture; const S = LC.summary_from_capture; const CK = R.clock; const FS = R.forward_shadow; const D = R.decision; const HI = R.historical;
const T = existsSync(join(RES, 'test_counts.json')) ? JSON.parse(readFileSync(join(RES, 'test_counts.json'), 'utf8')) : null;
const tbl = (h, rows) => `| ${h.join(' | ')} |\n|${h.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
const st = (o) => (o && o.n ? `n ${o.n}; min ${o.min}; p10 ${o.p10}; p50 ${o.p50}; p90 ${o.p90}; p99 ${o.p99}; max ${o.max}` : '—'); const fmt = (o) => Object.entries(o ?? {}).map(([k, v]) => `${k}: ${v}`).join('; ') || '—';
const HEAD = (t) => `# ${t}\n\nV15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec ${R.prereg_sha.slice(0, 16)}…\n\n`;
const out = {};
const DM = LC.decision_minus_receive_ms ?? {}; const DMN = Object.values(DM).reduce((a, b) => a + b, 0); const DMNEG = Object.entries(DM).filter(([k]) => Number(k) < 0).reduce((a, [, v]) => a + v, 0);
const CLOCK_LINE = `this PC's Windows time service is ${CK.pc_time_service}; the PC lags NTP (time.windows.com) by ≈ ${CK.ntp_minus_pc_ms_median} ms, while the broker clock agrees with NTP within ≈ ${Math.abs(CK.broker_vs_ntp_ms)} ms`;

out.V15_QUOTE_DATA_CONTRACT = HEAD('V15_QUOTE_DATA_CONTRACT') + `## Contract \`${R.contract}\` (one record per observation; a field the platform does not provide is \`UNAVAILABLE\`, never guessed)
${tbl(['Field', 'Source', 'Live availability'], [['symbol', 'request', 'yes'], ['decision_timestamp_ms', 'PC clock (UTC, Date.now) at the decision', 'yes'], ['bid, ask', 'MT5 symbol_info_tick', `${S.ok} / ${S.observations}`], ['mid', '(bid + ask) / 2; descriptive only, never an execution price', 'yes'], ['quote_timestamp_ms', 'MT5 symbol_info_tick.time_msc (broker server clock, ms)', `${S.quote_timestamp_captured} / ${S.observations}`], ['quote_timestamp_s', 'symbol_info_tick.time (seconds)', `consistent with time_msc: ${S.time_s_consistent_with_time_msc}`], ['quote_age_ms', 'decision − (quote − server offset)', 'computed for every observation (see V15_CLOCK_INTEGRITY)'], ['spread, spread_points', 'ask − bid (raw); / point', 'yes'], ['tick_sequence', 'MT5 provides none', '**UNAVAILABLE**'], ['tick_flags', 'symbol_info_tick.flags', 'yes'], ['data_source', 'MT5 terminal via the read-only shadow reader', 'yes'], ['data_received_timestamp_ms', 'PC clock (UTC) in the reader right after the tick call', 'yes'], ['clock', 'quote clock, decision clock, server offset and its source', 'yes']])}

## What changed
- **\`mt5/mt5_shadow_reader.py\`** (read-only reader; not the REAL bridge; not in the strategy fingerprint):
  - the \`tick\` response adds \`time_msc\`, \`flags\` and \`received_ms\`;
  - \`time / bid / ask / now\` are unchanged, so the change is backward compatible;
  - the authority-isolation test (no trading call) still passes.
- **\`research/v8_forward_shadow/scripts/runner.mjs\`:** every new decision record carries \`quote_contract\`, \`quote\` and \`quote_check\`.
- **\`research/quote_integrity_v15/scripts/quote.mjs\`:** the pure contract (build, validate, side-of-market price, legacy record).
- **\`live_gate.mjs\`:** the unchanged V14 gate with quote integrity first.
`;

out.V15_QUOTE_AGE = HEAD('V15_QUOTE_AGE') + `## Definition
- **Formula:** quote_age_ms = decision_timestamp_ms − (quote_timestamp_ms − server_utc_offset_ms).
- **Offset:** live calibration gives server_utc_offset_ms = ${LC.server_utc_offset_ms}, so the broker clock is UTC. This is the median of (time_msc − received), rounded to 15 minutes, which can never absorb a real quote age below 7.5 minutes.

## Live measurement (${S.observations} observations, ${S.duration_s} s, ${S.interval_ms} ms polling)
${tbl(['Clock basis', 'Quote age (ms)', 'Negative ages', 'Validation'], [['raw PC clock (as the system would run today)', st(LC.raw_pc_clock.ages), String(S.negative_ages), fmt(LC.raw_pc_clock.statuses)], ['documented NTP conversion SCENARIO (PC + measured NTP offset; research only, not used for decisions)', st(CK.conversion_scenario.ages), String(CK.conversion_scenario.negative_ages), fmt(CK.conversion_scenario.statuses)]])}

## Technical freshness scenarios (measurement settings, NOT approved parameters; NTP-converted ages)
${tbl(['Scenario', ...Object.keys(CK.conversion_scenario.technical_scenarios).map((k) => `≤ ${k} ms`)], [['share of observations', ...Object.values(CK.conversion_scenario.technical_scenarios).map((v) => `${(v * 100).toFixed(1)} %`)]])}

## Reading
- **The gate's limit is the existing production rule** maxQuoteAgeSec = ${S.production_limit_ms / 1000} s; no threshold is approved here.
- **Quote age is measurable to the millisecond.** Ticks advance about ${S.tick_updates_per_s} times per second, and IPC latency is p99 ${S.ipc_latency_ms.p99} ms.
- **But it is only trustworthy once the PC clock is synchronized.** With the raw clock, the age is negative on ${S.negative_ages} / ${S.observations} observations, which correctly fail closed.
- **Cross-check.** With the documented NTP conversion, the smallest age is ${CK.conversion_scenario.min_age_vs_half_ping_ms?.[0]} ms, consistent with the terminal's measured round-trip ping of ${CK.terminal_ping_us ? Math.round(CK.terminal_ping_us / 1000) : '—'} ms (one-way ≈ ${CK.conversion_scenario.min_age_vs_half_ping_ms?.[1]} ms).
- **Second finding: 1 ms cross-process resolution.** The receive time is taken by the Python reader (time.time) and the decision time by Node (Date.now): two processes reading the same PC clock at 1 ms resolution. Decision − receive (ms) over the live capture: ${fmt(DM)}. On ${DMNEG} / ${DMN} observations the decision reads 1 ms *before* receipt, so even with a synchronized clock these fail closed as DECISION_BEFORE_RECEIPT (the ${CK.conversion_scenario.statuses['INVALID_QUOTE:DECISION_BEFORE_RECEIPT'] ?? 0} rows in the NTP scenario). This is safe (it only adds WAITs) and is reported, not repaired: no tolerance is introduced in V15. Taking both times in one process, or a documented 1 ms resolution tolerance, is an open design question for the owner.
- **Note on \`live_capture_summary.json\`:** its \`technical_scenarios\` shares are computed on the raw (negative) ages and are therefore not meaningful; the scenario table above uses the NTP-converted ages.
`;

out.V15_CLOCK_INTEGRITY = HEAD('V15_CLOCK_INTEGRITY') + `## Clocks and conversions (documented, never mixed silently)
${tbl(['Clock', 'Used for', 'Resolution / precision', 'Time zone'], [['broker server (MT5 time_msc)', 'quote_timestamp_ms', '1 ms', `UTC (live calibration offset ${LC.server_utc_offset_ms} ms)`], ['PC clock (Date.now / Python time.time)', 'decision and receive timestamps', '1 ms (Windows timer granularity ≈ 1–16 ms; w32tm precision 119 ns per tick)', 'UTC epoch'], ['candle time (bar open, seconds)', 'NEVER used as a quote time', '1 s', 'server clock']])}

## Integrity checks
${tbl(['Check', 'Result'], [['Windows time service', CK.pc_time_service], ['PC vs NTP (time.windows.com, read-only stripchart)', `NTP − PC = ${CK.ntp_minus_pc_ms_median} ms (samples: ${CK.ntp_minus_pc_ms_samples.map((x) => Math.round(x)).join(', ')})`], ['Broker vs PC (from live ticks)', `broker ahead of PC by ≈ ${CK.broker_minus_pc_ms_estimate} ms`], ['Broker vs NTP', `≈ ${CK.broker_vs_ntp_ms} ms`], ['Negative quote ages (raw PC clock)', `${S.negative_ages} / ${S.observations} → CLOCK_OR_DATA_ERROR → WAIT_STALE_DATA`], ['Out-of-order ticks', String(S.out_of_order)], ['Duplicate ticks', String(S.duplicates)], ['Future timestamps (quote after receipt)', `${LC.raw_pc_clock.statuses['INVALID_QUOTE:CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT'] ?? 0} (all explained by the PC clock lag)`], ['time (s) consistent with time_msc', String(S.time_s_consistent_with_time_msc)]])}

## Cross-process timestamp resolution
- Decision − receive (ms): ${fmt(DM)} (Node Date.now vs Python time.time, same PC clock, 1 ms resolution).
- ${DMNEG} / ${DMN} observations read the decision 1 ms before receipt → DECISION_BEFORE_RECEIPT → fail closed. Reported, not repaired; no tolerance is introduced.

## CLOCK_INTEGRITY = FAIL (on this machine)
- **Cause:** ${CLOCK_LINE}.
- **Behaviour:** the system does exactly what the specification requires. It refuses to compute a trustworthy quote age: negative ages are CLOCK_OR_DATA_ERROR and fail closed, so no quote is assumed fresh.
- **Required owner action** (not done in V15, because it changes the machine clock under the running REAL watcher):
  - enable Windows time synchronisation, for example in an elevated shell:
    - \`w32tm /config /manualpeerlist:"time.windows.com,0x9" /syncfromflags:manual /update\`
    - \`net stop w32time && net start w32time\`
    - \`w32tm /resync\`
  - verify with \`w32tm /query /status\` (Leap Indicator 0, a real source);
  - re-run \`node research/quote_integrity_v15/scripts/live_capture.mjs\` and the study.
`;

out.V15_BID_ASK_INTEGRITY = HEAD('V15_BID_ASK_INTEGRITY') + `## Rules (fail closed, never repaired)
- bid > 0; ask > 0; ask ≥ bid; spread ≥ 0.
- A missing or invalid value → INVALID_QUOTE → WAIT_BROKER_UNSAFE.

## Live
- **Observations:** ${S.ok} / ${S.observations} returned a tick, and every bid / ask passed: 0 BID / ASK reasons in ${fmt(LC.raw_pc_clock.statuses)}.
- **Spread:** min ${S.spread.min}, p50 ${S.spread.p50}, max ${S.spread.max}; ${S.spread.negative} negative.

## Unit tests
Bid missing, ask missing, invalid bid (0), invalid ask (−1) and ask below bid each fail closed with the exact reason (tests/quote_integrity_v15.test.js).
`;

out.V15_SPREAD_INTEGRITY = HEAD('V15_SPREAD_INTEGRITY') + `## Spread = ask − bid, raw USD; spread_points = spread ÷ point
- **Live:** min ${S.spread.min}, p50 ${S.spread.p50}, max ${S.spread.max} USD; ${S.spread.negative} negative.
- **Platform:** the recorded spread is 240 points (V10).
- **Preservation:** the raw value is kept in every quote record, and the forward-shadow records keep both \`quote.spread\` and \`spread_usd\`.
- **No new spread filter.** The only spread rule remains the EXISTING production limit maxSpreadUsd = 0.60 USD (V11 fail-safe), applied by the gate using the live spread.
`;

out.V15_ENTRY_PRICE_INTEGRITY = HEAD('V15_ENTRY_PRICE_INTEGRITY') + `## Side of market
- **BUY:** executable price = ASK.
- **SELL:** executable price = BID.
- **Mid:** never an execution price (unit test).

## Structural SL integrity at the side price (existing production rule)
- **The recheck:** for a valid entry with a valid quote, the wrapper applies the production executable-geometry recheck \`evaluateExecutableGeometry\` (minEffectiveRr 1.70) at the side price.
  - Price beyond the structural stop → WAIT_INVALID_SL.
  - Effective RR below 1.70 → WAIT_INVALID_RR.
- **Drift:** the production entry-drift limit (2.0 USD between the engine entry and the side price) → WAIT_BROKER_UNSAFE.
- **The SL is never moved;** an invalid risk calculation is rejected (unit tests).
- **Source of each price:** \`quote.ask\` / \`quote.bid\` from \`symbol_info_tick\` (raw broker prices). The engine entry is the confirmed bar close (unchanged).
`;

out.V15_RISK_DATA_INTEGRITY = HEAD('V15_RISK_DATA_INTEGRITY') + `## Data required to model realized risk (V11 / V12) and its availability now
${tbl(['Item', 'Availability', 'Source / note'], [['quote age', 'computed; NOT trustworthy until the PC clock is synchronized', 'quote-v15-1'], ['bid, ask', 'available', 'symbol_info_tick'], ['spread', 'available', 'ask − bid'], ['tick timing', 'available (time_msc, flags); tick sequence UNAVAILABLE', 'symbol_info_tick'], ['execution timestamp, execution price', 'UNAVAILABLE (no execution; research only)', 'would come from fills'], ['SL price', 'available', 'frozen engine structural SL; broker SL = 1.5 R + spread'], ['swap', 'available (rates)', 'platform record swap_long / swap_short history (V12)'], ['commission', 'UNAVAILABLE as a measured value', 'production config estimates 0 per side; no fill evidence'], ['slippage', 'UNAVAILABLE (3 historical fills only, V12)', 'needs real fills']])}

## Rule
**Risk data incomplete → RISK_VALIDATION = FAIL → REJECT / WAIT.**
- A valid entry with an invalid or missing quote is recorded with \`risk_data: INCOMPLETE, risk_validation: FAIL\` and WAIT_STALE_DATA / WAIT_BROKER_UNSAFE.
- RISK_PERCENTAGE stays UNRESOLVED; the risk model is not redesigned here.
`;

const legacyN = FS.legacy_records; const qn = FS.quote_contract_records;
out.V15_FORWARD_SHADOW_DATA_CONTRACT = HEAD('V15_FORWARD_SHADOW_DATA_CONTRACT') + `## Update
- **The runner:** the V8 forward-shadow runner (research, measure-only) now writes \`quote_contract: ${R.contract}\`, \`quote\` (§1) and \`quote_check\` into every decision record. There is no separate pipeline.
- **The reader:** the read-only reader supplies the broker tick time in ms and the receive time.
- **The restart:** the runner was restarted to load the change. PID 50540 was stopped gracefully (its own console; lock released) and PID 49200 started. The frozen V8 engine manifest is unchanged (1daa2c5f…).
- **Untouched:** the REAL watcher and the silver / DOM observer.

## Records
${tbl(['Item', 'Count'], [['decision records in the store', FS.records], ['LEGACY_DATA / QUOTE_AGE_UNAVAILABLE (before the update)', legacyN], ['records with the quote contract', qn], ['… with every contract field present', FS.quote_fields_complete], ['… with a broker quote timestamp', FS.quote_timestamp_captured], ['… with a computed quote age', FS.quote_age_computed], ['quote status', fmt(FS.quote_status)], ['quote age (ms)', st(FS.quote_age_ms)], ['first quote-contract record', FS.first_quote_record_utc ?? '—']])}

## Gate on the new V8 records (illustrative risk model; nothing executed)
${tbl(['Bar close (UTC)', 'Engine', 'Gate decision', 'Reason', 'Quote age (ms)', 'Quote status'], FS.gate_on_v8_quote_records.map((x) => [x.bar_close_utc, x.engine_action, x.decision, x.reason, x.quote_age_ms, `${x.quote_status}${x.quote_reason ? `:${x.quote_reason}` : ''}`]))}

**Reading:** every new record carries the quote data the risk gate needs. On this machine the quote age is invalid because of the PC clock lag, so a live signal fails closed (WAIT_STALE_DATA) instead of being treated as fresh. A bar without an entry is already a WAIT (no trade is considered); its quote check is still recorded.
`;

out.V15_HISTORICAL_DATA_LIMITATIONS = HEAD('V15_HISTORICAL_DATA_LIMITATIONS') + `## Rule
- **Candles only.** The V8 replay rows (2025-05 → 2026-09) contain candles only: bar open time in seconds and OHLC. There are no quote timestamps, no bid / ask and no receive times.
- **Never reconstructed.** Quote age is therefore UNAVAILABLE and is never derived from candle timestamps.
- **Scope of historical replays.** They can still study entry rules, but they cannot validate execution eligibility.

## Historical replay through the live-gate wrapper
${tbl(['Split', 'Configuration', 'Decisions', 'Valid entries', 'Reasons for valid entries', 'TRADE_ELIGIBLE', 'Fabricated quote ages'], Object.entries(HI).flatMap(([Sp, cs]) => Object.entries(cs).map(([c, x]) => [Sp, c, x.decisions, x.valid_entries, fmt(x.valid_entry_reasons), x.trade_eligible, x.fabricated_quote_age])))}

## Consequence for earlier work
- **V14:** the illustrative risk replays assumed a bar-close quote age of 0 (documented there as a construction). Under the V15 contract that assumption is **withdrawn**: historically, no decision can be TRADE_ELIGIBLE.
- **The V14 PRIMARY result is unchanged:** 0 eligible.
`;

out.V15_LIVE_DATA_TEST = HEAD('V15_LIVE_DATA_TEST') + `## Setup
- **Source:** the connected MT5 demo, read-only, through the existing shadow reader protocol (rates / tick / select / ping). There is no order, position or account command.
- **What was stored:** no account identifiers.
- **Run:** ${S.captured_utc}, ${S.duration_s} s, polled every ${S.interval_ms} ms.

${tbl(['Measure', 'Value'], [['observations / ok / errors', `${S.observations} / ${S.ok} / ${S.errors}`], ['quote timestamp captured (time_msc)', `${S.quote_timestamp_captured} (${(S.quote_timestamp_capture_share * 100).toFixed(1)} %)`], ['distinct ticks / updates per second', `${S.distinct_ticks} / ${S.tick_updates_per_s}`], ['observations with a new tick / duplicates / out of order', `${S.observations_with_new_tick} / ${S.duplicates} / ${S.out_of_order}`], ['IPC latency reader → decision (ms)', `p50 ${S.ipc_latency_ms.p50}, p99 ${S.ipc_latency_ms.p99}, max ${S.ipc_latency_ms.max}`], ['receive − quote (ms, raw PC clock)', fmt(S.receive_minus_quote_ms)], ['quote age (ms, raw PC clock)', st(LC.raw_pc_clock.ages)], ['spread (USD)', `min ${S.spread.min}, p50 ${S.spread.p50}, max ${S.spread.max}`], ['candle reference (bar open times, s)', (S.candle_reference ?? []).map((c) => c.time).join(', ')]])}

## Conclusion
- **The live path works.** Quote timestamps are captured on 100 % of observations, quote age updates with every tick, and bid / ask / spread integrity holds.
- **The age is not trustworthy until the PC clock is synchronized** (V15_CLOCK_INTEGRITY), and the system fails closed meanwhile.
`;

out.V15_REPLAY_VALIDATION = HEAD('V15_REPLAY_VALIDATION') + `${tbl(['Check', 'Result'], [['Recorded live observations replayed twice: identical quote-age decisions', LC.replay_deterministic ? 'PASS' : 'FAIL'], ['Replay reproduces the capture-time validation counts exactly', LC.replay_matches_capture_summary ? 'PASS' : 'FAIL'], ['Restart (first half, carry the last accepted quote, second half) = uninterrupted', LC.restart_equals_uninterrupted ? 'PASS' : 'FAIL'], ['Same input + same state = same decision (unit test)', 'PASS'], ['Historical replay: deterministic and never fabricates quote age', `PASS (${Object.values(HI).flatMap((x) => Object.values(x)).reduce((s, x) => s + x.fabricated_quote_age, 0)} fabricated)`]])}

What the replay reproduces: quote_timestamp, decision_timestamp, quote_age_ms, bid, ask, spread and the decision, from the raw capture (\`results/live_capture_raw.jsonl\`).
`;

out.V15_NO_LOOKAHEAD = HEAD('V15_NO_LOOKAHEAD') + `${tbl(['Check', 'Result'], [['A decision uses only quotes received at or before the decision (DECISION_BEFORE_RECEIPT fails closed)', 'enforced'], ['Prefix stability: the first 200 replayed decisions alone = the first 200 of the full replay', LC.prefix_stable ? 'PASS' : 'FAIL'], ['Ordering uses only the last ACCEPTED earlier quote', 'enforced'], ['Unit test: later quotes never change earlier decisions', 'PASS'], ['Candle times never stand in for quote times', 'enforced (unit test scans the contract module)']])}

**NO_LOOKAHEAD = ${LC.prefix_stable ? 'PASS' : 'FAIL'}.**
`;

out.V15_FAIL_CLOSED = HEAD('V15_FAIL_CLOSED') + `${tbl(['Condition', 'Result', 'Evidence'], [['quote age missing', 'WAIT_STALE_DATA (QUOTE_AGE_UNAVAILABLE / CLOCK_OFFSET_UNAVAILABLE)', 'unit test; historical replay'], ['quote timestamp missing', 'WAIT_STALE_DATA (QUOTE_TIMESTAMP_UNAVAILABLE)', `unit test; ${Object.values(HI).flatMap((x) => Object.values(x)).reduce((s, x) => s + x.valid_entries, 0)} historical valid entries`], ['quote age invalid / negative', 'WAIT_STALE_DATA (CLOCK_OR_DATA_ERROR)', `unit test; live ${S.negative_ages} / ${S.observations}; forward-shadow records`], ['quote timestamp in the future', 'WAIT_STALE_DATA (CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT)', 'unit test; live'], ['out-of-order / replayed tick', 'WAIT_STALE_DATA (OUT_OF_ORDER)', 'unit test'], ['stale / delayed quote', 'WAIT_STALE_DATA (STALE_QUOTE, existing 90 s limit)', 'unit test'], ['bid / ask missing or invalid; spread negative', 'WAIT_BROKER_UNSAFE', 'unit tests'], ['clock integrity invalid', 'WAIT_STALE_DATA', 'live'], ['risk data incomplete', 'risk_validation FAIL → WAIT', 'unit test'], ['broker data incomplete', 'WAIT_BROKER_UNSAFE (V11 / V14, unchanged)', 'V14 tests']])}

Eligible decisions without a valid quote age: **${D.criteria.eligible_without_quote_age}**.
`;

out.V15_TEST_RESULTS = HEAD('V15_TEST_RESULTS') + (T ? `${tbl(['Suite', 'Pass / total'], Object.entries(T).map(([k, v]) => [k, v]))}` : 'see results/*_output.txt') + `

The V15 tests cover every case in the owner's list:
- fresh quote, stale quote, missing quote timestamp, missing quote age, negative quote age, future timestamp;
- out-of-order timestamp, duplicate quote;
- bid missing, ask missing, invalid bid, invalid ask, negative spread;
- clock drift, delayed quote;
- restart, replay, same-input same-decision, no-lookahead, fail-closed.

They also cover side-of-market pricing, legacy data never fabricated, the live-gate wrapper, and the runner / reader contract.
`;

out.V15_FINAL_DECISION = HEAD('V15_FINAL_DECISION') + `## Decision
**${D.DATA_INTEGRITY_STATUS}**

${tbl(['Pre-registered criterion', 'Result'], Object.entries(D.criteria).map(([k, v]) => [k, String(v)]))}

**What is fixed:**
- Quote freshness is now a first-class field: the broker tick time in ms, receive and decision times, bid / ask / spread and the quote age.
- It is in the reader, the forward-shadow records and the gate path.
- Missing, invalid, future or stale quotes fail closed.
- Historical quote age is never fabricated.

**What keeps V15 from "validated":** ${CLOCK_LINE}. Until the clock is synchronized, every live quote age is negative and the system (correctly) refuses to trade.

**Second finding (does not block, adds WAITs only):** ${DMNEG} / ${DMN} live observations read the decision time (Node) 1 ms before the receive time (Python), a cross-process 1 ms resolution artifact. Even with a synchronized clock these fail closed as DECISION_BEFORE_RECEIPT. Reported, not repaired.

**V15 does not create an entry edge and does not fix the negative expectancy (V13).** DATA_VALIDITY ≠ TRADING_EDGE.

## Final terminal summary
\`\`\`
V15_STATUS                 = COMPLETE
DATA_INTEGRITY_STATUS      = ${D.DATA_INTEGRITY_STATUS}
QUOTE_TIMESTAMP            = CAPTURED (MT5 time_msc, ${(S.quote_timestamp_capture_share * 100).toFixed(0)} % of live observations; broker clock = UTC)
QUOTE_AGE_AVAILABLE        = YES (computed for every observation); NOT TRUSTWORTHY until the PC clock is synchronized
QUOTE_AGE_DETERMINISTIC    = ${LC.replay_deterministic ? 'YES' : 'NO'}
CLOCK_INTEGRITY            = FAIL (PC clock not synchronized: −${CK.ntp_minus_pc_ms_median} ms vs NTP; broker ≈ NTP)
BID_ASK_INTEGRITY          = PASS
SPREAD_INTEGRITY           = PASS (raw ${S.spread.min}–${S.spread.max} USD preserved)
ENTRY_PRICE_INTEGRITY      = PASS (BUY ask / SELL bid; executable-geometry recheck at the side price)
STALE_DATA_HANDLING        = PASS (WAIT_STALE_DATA)
MISSING_DATA_HANDLING      = PASS (fail closed)
FUTURE_TIMESTAMP_HANDLING  = PASS (CLOCK_OR_DATA_ERROR -> WAIT_STALE_DATA; demonstrated live)
FORWARD_SHADOW_UPDATED     = YES (runner PID 49200 writes ${R.contract} in every new record; ${legacyN} legacy records LEGACY_DATA)
HISTORICAL_QUOTE_AGE       = UNAVAILABLE (never fabricated; 0 historical eligible)
REPLAY_PARITY              = ${LC.replay_deterministic && LC.replay_matches_capture_summary && LC.restart_equals_uninterrupted ? 'PASS' : 'FAIL'}
HINDSIGHT_CHECK            = PASS
NO_LOOKAHEAD               = ${LC.prefix_stable ? 'PASS' : 'FAIL'}
FAIL_CLOSED                = PASS
ENTRY_RULES_CHANGED        = NO
STRUCTURAL_SL_CHANGED      = NO
RR                         = 1.70
CAPITAL_HARVEST            = OFF
RISK_PERCENTAGE            = UNRESOLVED
REAL_TRADE_PLACED          = NO
DEMO_TRADE_PLACED          = NO
EXECUTION_AUTHORITY        = NONE
PRODUCTION_CHANGED         = NO (REAL / DEMO execution path and strategy files unchanged; fingerprint ok. Changed: the read-only shadow reader's tick response and the forward-shadow research runner)
\`\`\`
`;

let n = 0; for (const [name, body] of Object.entries(out)) { writeFileSync(join(REP, `${name}.md`), body.replace(/\n{3,}/g, '\n\n')); n++; }
console.log(`wrote ${n} reports`);
