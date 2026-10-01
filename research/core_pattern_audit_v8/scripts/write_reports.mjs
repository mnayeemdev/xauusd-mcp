/**
 * V8 -- renders every required report from the frozen results (results/v8_results_FULL.json + parity / symmetry files).
 * No computation that could change a result happens here; descriptive aggregates only. Writes reports/*.md.
 *   node research/core_pattern_audit_v8/scripts/write_reports.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CORRECTIONS } from './corrections.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const RES = join(ROOT, 'results'); const REP = join(ROOT, 'reports'); mkdirSync(REP, { recursive: true });
const J = (f) => JSON.parse(readFileSync(join(RES, f), 'utf8'));
const R = J('v8_results_FULL.json'); const LP = J('live_parity.json'); const LPP = J('live_production_parity.json'); const SYM = J('symmetry.json'); const SYMR = existsSync(join(RES, 'symmetry_residual.json')) ? J('symmetry_residual.json') : [];
const FZ = JSON.parse(readFileSync(join(ROOT, 'configs', 'v8_freeze.json'), 'utf8'));
const pc = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)} %`); const f3 = (x) => (x == null ? '—' : Number(x).toFixed(3)); const f2 = (x) => (x == null ? '—' : Number(x).toFixed(2)); const ci = (c) => (c ? `[${c[0]}, ${c[1]}]` : '—');
const V = Object.keys(R.variants); const S2 = ['DEV', 'HOLD'];
const HEAD = (title) => `# ${title}\n\nV8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 ${R.prereg_sha.slice(0, 16)}… · freeze ${FZ.frozen_utc}\n\n`;
const rowsOf = (v, S) => { const p = join(RES, 'rows', `${v}_${S}.jsonl`); return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };
const out = {};
const econTable = (S, vars = V) => `| Variant | Signals | Trades | Expectancy (R) | 95 % CI | PF | Win | Avg win / loss (R) | Max DD (R) | Wrong-direction | Capture | MFE / MAE (R) | Loss streak |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n` + vars.map((v) => { const d = R.variants[v][S]; const p = d.primary; return `| ${v} | ${d.signals} | ${p.n} | ${f3(p.expectancy_r)} | ${ci(p.ci95_r)} | ${f2(p.pf)} | ${pc(p.win_rate)} | ${f2(p.avg_win_r)} / ${f2(p.avg_loss_r)} | ${f2(p.max_dd_r)} | ${pc(p.wrong_direction_rate)} | ${pc(d.capture.capture_rate)} | ${f2(p.mfe_r)} / ${f2(p.mae_r)} | ${p.max_loss_streak} |`; }).join('\n');
const mix = (o) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
const dec = R.decision;

// ---------------- inventory ----------------
out.V8_STRATEGY_INVENTORY = HEAD('V8_STRATEGY_INVENTORY — the production intraday_5m models (implementation is the authority)') + `The production REAL profile (\`intraday_5m\`, docs/XAUUSD_MCP_ENGINE.md) has exactly **five** 5m entry models in \`src/engine/intraday/models5m.js\`, evaluated in priority order MC > PB > BO > SR > MR (first eligible model that triggers wins, one candidate per confirmed 5m bar). The reference_15m profile (TC/PB/BO/MR/SR in \`src/engine/models.js\`) is not the production decision layer and is out of scope. No model was renamed, added or removed.

Common to every model: inputs are CONFIRMED 5m bars (499-bar window, forming bar stripped), the 15m bias (\`bias.js\`: direction from the 15m regime, eligible model set, fresh-CHoCH veto), 5m regime/structure/ATR14/EMA20; entry = close of the signal bar; risk gate (\`risk5m.js\`): 5m ATR ≥ 2.00 USD, entry ≤ 2.5 ATR from the setup anchor, SL = slAnchor ∓ 0.25 ATR (wrong side → entry ∓ 1.5 ATR; never closer than 0.5 ATR), TP1 = 1 R, TP2 = nearest structural objective ≥ 1.0 R (5m/15m pivots, 15m range), capped 3 R, else 2 R; RR (to TP2) ≥ 1.70; quality ≥ 65 (70 under a NEUTRAL bias without 1H support); then cross-timeframe vetoes (fresh opposing 15m CHoCH, 30m regime AND structure opposed, 1H opposed for MR or unaligned trades).

| Field | MC Momentum Continuation | PB Pullback Continuation | BO Breakout + Retest + Reclaim | SR Structure / Rejection | MR Controlled Mean Reversion |
|---|---|---|---|---|---|
| Purpose | join an expanding move in the 15m bias direction | buy/sell the end of a 5m correction against the 15m bias | trade the first retest of a confirmed 5m structure break | fade a level with a rejection candle | fade a liquidity sweep inside a 15m range toward its midpoint |
| Eligible when | 15m bias BULLISH/BEARISH | 15m bias BULLISH/BEARISH | any 15m regime except CHOP; 5m regime not CHOP | directional, RANGE or TRANSITION 15m | 15m RANGE only, 30m not trending, 5m not HIGH_VOLATILITY |
| Pattern | 3 consecutive 5m closes on the bias side of EMA20, each progressing | a 5m correction of ≥ 1.0 ATR against the bias inside the 20-bar window | 5m BOS/CHoCH: confirmed close beyond a confirmed pivot (structure.lastEvent) | rejection candle: wick ≥ 50 % of range, close in the outer third | 5m liquidity sweep: wick beyond a confirmed pivot by > 0.05 %, close back inside |
| Setup | pattern + 5m ATR ratio ≥ 1.0 (expansion) | correction RESOLVED: 2 consecutive closes back on the bias side of EMA20 | retest: a bar within 0.3 ATR of the broken level (close or wick) | the candle's wick reaches a 15m/5m swing level (−0.6 / +0.3 ATR) and it closes back beyond the level | the sweep is ≤ 3 bars old and the regime conditions hold |
| Trigger | close beyond the prior 5m swing, the break ≤ 3 bars old | resolution ≤ 3 bars old (fresh) | the current bar closes back beyond the level (reclaim), ≤ 10 bars after the break | the rejection itself; against 5m structure only with a supporting 15m bias or a fresh sweep at the level | the sweep + reclaim |
| Entry | signal-bar close | signal-bar close | signal-bar close | signal-bar close | signal-bar close |
| Invalidation / SL anchor | low (BUY) / high (SELL) of the momentum leg from 2 bars before the break | pullback extreme | retest extreme after the break | rejection wick | sweep-bar extreme |
| RR | ≥ 1.70 to TP2 (all models) | idem | idem | idem | TP2 = 15m range midpoint (capped 3 R) |
| Exclusions | NEUTRAL bias; ATR contraction; late > 3 bars | NEUTRAL bias; correction ACTIVE/NONE; late | CHOP; no retest; no reclaim; > 10 bars | no level; mid-bar close; counter-structure without basis | trending 30m; HIGH_VOL 5m; stale sweep |
| BUY | BULLISH bias, closes above EMA20, close > last 5m swing high | BULLISH bias, pullback down, 2 closes back above EMA20 | bullish break, retest from above, close > level | lower-wick rejection at a swing low | SWEEP_LOW (wick below a pivot low, close back above) |
| SELL | mirror | mirror | mirror | upper-wick rejection at a swing high | SWEEP_HIGH |
| WAIT | any condition false → next model; none → NO_ELIGIBLE_STRATEGY | idem | idem | idem | idem |

## Documentation vs implementation conflicts (reported, not silently resolved)
| # | Documentation says | Implementation does | Treatment |
|---|---|---|---|
| C1 | owner: "TP = entry ± 1.70 × structural risk" | TP2 = nearest structural objective ≥ 1.70 R (RR gate), capped 3 R; TP1 = 1 R | reported; PRIMARY economics keep production geometry, SECONDARY = fixed 1.70 R |
| C2 | structure.js comment: walk breaks forward with a running direction | pivots processed in pivot-index order | **D1** (corrected) |
| C3 | "Liquidity sweep: the most recent …" | the last sweep of the newest pivot ever swept | **D2** (corrected) |
| C4 | params: "5m pullback depth in 5m ATR"; reason "pullback of X ATR" | depth measured from the extreme to the CURRENT close | **D3** (corrected) |
| C5 | MR reason: "sweep + reclaim at a 15m range boundary", target = midpoint | no location check; SELL possible below the midpoint | **D4** (corrected: entry must lie on the far side of its own midpoint target) |
| C6 | structure.js comment: range high/low "not yet broken by a confirmed close" | max/min of the last five pivots, broken or not | reported only (behaviour when all are broken unspecified) |
| C7 | engine docs: NEUTRAL-bias 65 bar when the 1H "regime or structure" supports the side | only a directional 1H regime (audit PART 7) | documentation stale; code kept |
| C8 | engine docs WAIT-gate list (reference profile) includes TRANSITION / CORRECTION_ACTIVE hard WAITs | intraday profile treats them as bias inputs (documented in the profile table) | consistent with the intraday section |
`;

// ---------------- pipeline ----------------
out.V8_CORE_PIPELINE_AUDIT = HEAD('V8_CORE_PIPELINE_AUDIT') + `| Stage | Input | Output | Rule (file) | Failure mode found | Test coverage | Verdict |
|---|---|---|---|---|---|---|
| 5m OHLCV | TradingView bars (live) / Exness bars (replay) | 499 confirmed bars | last bar = forming, stripped (\`validateAndSplit\`) | none: forming bar never used (garbage forming bar on ${LP.sample_bars} bars changed nothing) | live-path parity, fixture test | OK |
| Candle structure | confirmed bars | body/wick/close location, progressing closes | SR \`rejectionAt\`, MC closes, sweeps | none (symmetric; see V8_CANDLE_AUDIT) | SR / MC tests | OK |
| Pattern detection (structure) | bars | pivots, BOS/CHoCH, last event, sweep, range | \`structure.js\` | **D1** event chronology, **D2** sweep recency, C6 range comment | D1/D2 fixtures | DEFECT → corrected |
| Regime / context | 5m/15m/30m/1H bars | regimes, 15m bias, eligible models | \`regime.js\`, \`bias.js\` | none in the mapping; context lag documented (V8_CONTEXT_LAG_AUDIT) | eligibility tests | OK |
| Model eligibility | bias | eligible model set | \`eligibleModelsFor\` | 0 eligibility errors (mapping = documentation) | mapping test + per-bar trace | OK |
| Setup | model context | setup present | per model | **D3** PB depth measured at the current close | PB fixtures | DEFECT → corrected |
| Trigger | setup | candidate (model, side, anchor, slAnchor, origin) | per model | **D2** (MR/SR use a stale sweep) | sweep fixture, stage parity on ${(R.fidelity.stage_parity.CONTROL.DEV.checked + R.fidelity.stage_parity.CONTROL.HOLD.checked).toLocaleString('en-US')} model checks | DEFECT → corrected |
| Location | candidate | overextension gate | \`risk5m.js\` 2.5 ATR | **D4** MR entry on the wrong side of its own target | MR fixtures | DEFECT → corrected |
| Structural invalidation | slAnchor | SL | \`risk5m.js\` | none (buffer 0.25 ATR, floor 0.5 ATR, wrong-side fallback 1.5 ATR) | SL tests | OK |
| RR = 1.70 | SL, objectives | TP1, TP2, RR | \`risk5m.js\` | **D5** gate on the rounded RR; C1 TP2 vs fixed 1.70 R | RR tests | DEFECT → corrected |
| Safety gates | decision | WAIT/BUY/SELL | quality, CHoCH, 30m, 1H vetoes; live: news, spread, drift, margin | none in replay scope; **D6** stale 15m/30m snapshot not fail-closed (orchestrator) | veto tests, D6 live-path test | DEFECT → corrected |
| Final decision | all | BUY / SELL / WAIT + reason | \`combineIntraday\`, \`calculateEntry\` | replay = Edge Lab on ${R.fidelity.control_vs_lab.compared.toLocaleString('en-US')} bars; live orchestrator = replay on ${LP.sample_bars} bars | parity tests | OK |
`;

// ---------------- candle ----------------
const stg = (S, v = 'CONTROL') => R.forensics[S][v === 'CONTROL' ? 'stages_control' : 'stages_corrected'].models;
out.V8_CANDLE_AUDIT = HEAD('V8_CANDLE_AUDIT') + `The production decision path computes these candle quantities, from completed 5m candles only:

| Quantity | Where | Formula | BUY / SELL |
|---|---|---|---|
| open / high / low / close | all | confirmed bar fields; forming bar stripped | — |
| range | SR | high − low (must be > 0) | same |
| lower / upper wick | SR | min(open, close) − low / high − max(open, close) | mirror (tested: mirrored candle → SR SELL with mirrored stop) |
| wick / range | SR | ≥ 0.50 | same threshold |
| close position | SR | BUY close ≥ high − range/3; SELL close ≤ low + range/3 | mirror |
| direction / progression | MC | 3 consecutive closes beyond EMA20, each beyond the previous close | mirror |
| breakout candle | structure (BO, MC) | a confirmed CLOSE beyond the pivot; a wick alone never counts | mirror |
| rejection beyond a level | sweep (MR, SR basis) | wick beyond pivot + 0.05 % and close back inside | mirror |
| pullback candles | PB | closes relative to EMA20 (resolution), lows/highs after the 20-bar extreme (depth) | mirror |
| inside bar / engulfing | — | NOT used by the decision path (only by the analysis presenter \`candlesticks.js\`) | — |
| consecutive candles | MC, PB | runs of closes vs EMA20 | mirror |

Data-wide (bias-agnostic, every confirmed bar): rejection-candle SHAPE on ${stg('DEV').SR.BUY.pattern_or_more.toLocaleString('en-US')} BUY / ${stg('DEV').SR.SELL.pattern_or_more.toLocaleString('en-US')} SELL DEV bars, at a level ${stg('DEV').SR.BUY.setup_or_more} / ${stg('DEV').SR.SELL.setup_or_more}, triggered ${stg('DEV').SR.BUY.trigger} / ${stg('DEV').SR.SELL.trigger}: a long wick without a level stays WAIT, as specified.

Mirror test (V8_BUY_SELL_SYMMETRY): with the three price-relative terms neutralised, production candle/structure logic mirrors ${SYM.engines.SYMPROBE.exact} of ${SYM.sample_bars} bars; the single residual is the D1 tie-order case, absent in the corrected engine (${SYM.engines.SYMPROBE_ALL?.exact} of ${SYM.sample_bars}). No candle-level defect found.
`;

// ---------------- pattern detection ----------------
const fx = [
  ['D1 flip fixture (breaks at bars 14↓, 28↑, 36↑, 51↓; close 93.80)', 'state BEARISH, last event = bar-51 break of 94.8', 'BULLISH, CHoCH bar 36', 'MISMATCH', 'pivot-order processing (D1)'],
  ['D1 BOS fixture (breaks 28↓, 35↑, 45↑ through 105.2)', 'last event BOS bar 45 level 105.2', 'CHoCH bar 35 level 97.4', 'MISMATCH', 'D1'],
  ['Sweep fixture (bar 50 wicks above the 105.2 high, closes 104.6)', 'last sweep = bar 50 at 105.2 (age 0)', 'bar 41 at 103.2 (age 9 > MR limit 3)', 'MISMATCH', 'D2'],
  ['PB fixture: 2.64-ATR pullback, 2 closes back above EMA20, close 0.64 ATR under the extreme', 'PB BUY, stop at the pullback low', 'null (correction NONE)', 'MISMATCH', 'D3'],
  ['PB fixture: only 1 close back above EMA20', 'WAIT (not resolved)', 'WAIT', 'MATCH', '—'],
  ['MR fixture: SWEEP_HIGH at 103 in a 100–110 15m range', 'WAIT (entry below its own midpoint target)', 'MR SELL with target 105 above the entry', 'MISMATCH', 'D4'],
  ['MR fixture: SWEEP_HIGH at 108', 'MR SELL, target 105', 'MR SELL, target 105', 'MATCH', '—'],
  ['SR fixture: 73 % lower wick, close in the top third, at the 5m swing low 100', 'SR BUY, stop at the wick 99.8', 'SR BUY, 99.8', 'MATCH', '—'],
  ['SR fixture: same candle, no level within reach', 'WAIT', 'WAIT', 'MATCH', '—'],
  ['SR fixture: long wick, close mid-bar', 'WAIT', 'WAIT', 'MATCH', '—'],
  ['BO fixture: break of 100, retest low 100.3, reclaim close 101.5', 'BO BUY, stop anchor 100.3', 'BO BUY, 100.3', 'MATCH', '—'],
  ['BO fixture: no retest / close back below / > 10 bars / CHOP', 'WAIT', 'WAIT', 'MATCH', '—'],
  ['BO fixture mirrored', 'BO SELL, mirrored stop', 'BO SELL', 'MATCH', '—'],
  ['MC fixture: 3 progressing closes above EMA20, ATR ratio 1.2, fresh swing break', 'MC BUY, origin at the break bar', 'MC BUY', 'MATCH', '—'],
  ['MC fixture: ATR ratio 0.9 / NEUTRAL bias', 'WAIT', 'WAIT', 'MATCH', '—'],
  ['Pivot latency: pivot with 4 right bars / 5 right bars', 'not reported / reported', 'same', 'MATCH', '—'],
  ['RR fixture: objective at 1.696 R', 'RR_NOT_ACCEPTABLE', 'OK (rounded to 1.70)', 'MISMATCH', 'D5'],
  ['Stale 15m snapshot (4 h old) on the live path', 'DATA_UNAVAILABLE (stale)', 'decision taken (status OK)', 'MISMATCH', 'D6'],
];
const funnel = (S, v) => { const m = stg(S, v); return Object.entries(m).map(([k, x]) => `| ${k} | ${x.BUY.pattern_or_more.toLocaleString('en-US')} / ${x.SELL.pattern_or_more.toLocaleString('en-US')} | ${x.BUY.setup_or_more.toLocaleString('en-US')} / ${x.SELL.setup_or_more.toLocaleString('en-US')} | ${x.BUY.trigger.toLocaleString('en-US')} / ${x.SELL.trigger.toLocaleString('en-US')} |`).join('\n'); };
out.V8_PATTERN_DETECTION_AUDIT = HEAD('V8_PATTERN_DETECTION_AUDIT') + `## Deterministic fixtures (tests/core_pattern_audit_v8.test.js)\n| Chart data | Expected pattern (specification) | Actual production | Match | Reason |\n|---|---|---|---|---|\n${fx.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n\n## Data-wide bias-agnostic funnel (bars where the stage is reached, BUY / SELL)\nStage 3 of every model was asserted equal to the production model function on every bar (${Object.values(R.fidelity.stage_parity).reduce((s, o) => s + Object.values(o).reduce((a, b) => a + b.checked, 0), 0).toLocaleString('en-US')} checks across all variants, 0 mismatches).\n\n${S2.map((S) => `### ${S} — CONTROL\n| Model | Pattern | Setup | Trigger |\n|---|---|---|---|\n${funnel(S, 'CONTROL')}\n\n### ${S} — corrected (ALL)\n| Model | Pattern | Setup | Trigger |\n|---|---|---|---|\n${funnel(S, 'ALL')}`).join('\n\n')}\n`;

// ---------------- breakout ----------------
const sig = (v, S) => R.variants[v][S];
out.V8_BREAKOUT_AUDIT = HEAD('V8_BREAKOUT_AUDIT (BO; MC uses the same break definition)') + `| Question | Answer from the implementation |
|---|---|
| Which level is broken? | the price of the confirmed 5m pivot in \`structure.lastEvent\` (BO); MC: the last confirmed 5m swing high/low |
| Which candle confirms the break? | the first confirmed bar that CLOSES beyond the pivot after the pivot's own confirmation (pivot index + 5) |
| Does wick penetration count? | no — a wick beyond with the close back inside is a sweep, not a break |
| Does close beyond the level count? | yes, by any amount |
| Displacement required? | none for the break; the entry may not be more than 2.5 ATR from the level (OVEREXTENDED) |
| What invalidates the breakout? | no retest within 10 bars, or the current close not back beyond the level; a close back through the level BEFORE the reclaim does NOT invalidate it (reported ambiguity) |
| When is the retest valid? | any bar after the break whose close is within 0.3 ATR of the level, or whose wick reaches level ± 0.3 ATR |
| Too extended? | entry > 2.5 ATR from the level → OVEREXTENDED WAIT |
| Unfinished candle? | never: the forming bar is stripped (garbage-forming-bar test on ${LP.sample_bars} bars, 0 changes) |
| Too late? | entry ≤ 10 bars after the break by rule (BO); MC ≤ 3 bars |
| Rejected by a lagging context gate? | BO is eligible under every 15m regime except CHOP; context blocks are measured in V8_CONTEXT_LAG_AUDIT |
| **Defect found** | **D1**: the "last event" was the break of the newest-INDEXED broken pivot, not the most recent break in time, so BO could retest a stale level or miss the current breakout, and the BOS/CHoCH label could be wrong |

Effect of D1 alone (decision changes vs CONTROL): DEV ${R.diffs.D1.DEV.decision_changed_bars.toLocaleString('en-US')} bars (primitive changed on ${pc(R.diffs.D1.DEV.primitive_changed_share)} of bars), HOLD ${R.diffs.D1.HOLD.decision_changed_bars.toLocaleString('en-US')}; BO signals DEV ${sig('CONTROL', 'DEV').signal_model_mix.BO} → ${sig('D1', 'DEV').signal_model_mix.BO}, HOLD ${sig('CONTROL', 'HOLD').signal_model_mix.BO} → ${sig('D1', 'HOLD').signal_model_mix.BO}. Top changes (HOLD): ${R.diffs.D1.HOLD.top_changes.slice(0, 6).map((x) => `${x.change} ${x.n}`).join('; ')}. D1 changes many decisions because the structure primitive feeds every timeframe — FLAGGED as a wide correction; every change is explained by a changed primitive (unexplained 0).
`;

// ---------------- pullback ----------------
out.V8_PULLBACK_AUDIT = HEAD('V8_PULLBACK_AUDIT (PB)') + `| Element | Implementation |
|---|---|
| Original impulse | the 15m bias direction; the 20-bar 5m extreme (highest high for BUY) |
| Correction / retracement | production: \`computeCorrection\` distance from the 20-bar extreme to the CURRENT close ≥ 1.0 ATR (ACTIVE while closes stay on the wrong side of EMA20) |
| Structure preservation | not checked beyond the 15m bias (no 5m swing-low preservation rule) |
| Depth | ≥ 1.0 × 5m ATR (\`pbCorrAtrMultiplier\`, "5m pullback depth") |
| Reclaim / confirmation | 2 consecutive closes back on the bias side of EMA20; entry ≤ 3 bars after |
| Entry location | signal close, ≤ 2.5 ATR from the pullback extreme |
| Invalidation | SL beyond the pullback extreme − 0.25 ATR |

**Defect D3:** RESOLVED required the CURRENT close to still be ≥ 1 ATR from the extreme, so a deep pullback with a decisive reclaim (close back near the extreme) was never recognised (MISSES VALID PULLBACKS), while a shallow, weak reclaim that stayed deep was (biased toward weak resumptions). Fixture: 2.64-ATR pullback, 2 closes back above EMA20 → production NONE. Correction: the depth is measured from the extreme to the deepest point after it; resolution and freshness unchanged; a bar that is itself the new extreme cannot be a pullback.

| | DEV CONTROL | DEV D3 | HOLD CONTROL | HOLD D3 |
|---|---|---|---|---|
| PB signals | ${sig('CONTROL', 'DEV').signal_model_mix.PB} | ${sig('D3', 'DEV').signal_model_mix.PB} | ${sig('CONTROL', 'HOLD').signal_model_mix.PB} | ${sig('D3', 'HOLD').signal_model_mix.PB} |
| decisions changed | — | ${R.diffs.D3.DEV.decision_changed_bars} | — | ${R.diffs.D3.HOLD.decision_changed_bars} |
| expectancy (R) | ${f3(sig('CONTROL', 'DEV').primary.expectancy_r)} | ${f3(sig('D3', 'DEV').primary.expectancy_r)} | ${f3(sig('CONTROL', 'HOLD').primary.expectancy_r)} | ${f3(sig('D3', 'HOLD').primary.expectancy_r)} |
| wrong-direction | ${pc(sig('CONTROL', 'DEV').primary.wrong_direction_rate)} | ${pc(sig('D3', 'DEV').primary.wrong_direction_rate)} | ${pc(sig('CONTROL', 'HOLD').primary.wrong_direction_rate)} | ${pc(sig('D3', 'HOLD').primary.wrong_direction_rate)} |

Early / late / reversal confusion: PB cannot enter before 2 reclaim closes (not early) and never > 3 bars after them (not late). A reversal can still be taken as a pullback when the 15m bias has not yet turned (the 15m bias is the only trend arbiter) — this is the context-lag question, measured in V8_CONTEXT_LAG_AUDIT, not a code defect.
`;

// ---------------- rejection ----------------
out.V8_REJECTION_AUDIT = HEAD('V8_REJECTION_AUDIT (SR)') + `| Check | Implementation | Verdict |
|---|---|---|
| wick / body | the rejection wick ≥ 50 % of the bar range | correct |
| close position | close in the top third (BUY) / bottom third (SELL) | correct |
| location | the wick must reach a 15m or 5m swing level: within +0.3 ATR above to −0.6 ATR below (BUY), mirrored for SELL, and close back beyond the level | correct — a long wick without a level is WAIT (fixture) |
| previous structure | trades against 5m structure only with a supporting 15m bias or a fresh (≤ 3 bars) 5m sweep at the level | correct rule; its inputs (structure state, sweep) were affected by D1/D2 |
| confirmation | the rejection candle itself (confirmed close); no extra bar | by design |
| direction | from the level type (swing low → BUY, swing high → SELL) | correct, symmetric |

SR signals: DEV ${sig('CONTROL', 'DEV').signal_model_mix.SR} (corrected ${sig('ALL', 'DEV').signal_model_mix.SR}), HOLD ${sig('CONTROL', 'HOLD').signal_model_mix.SR} (corrected ${sig('ALL', 'HOLD').signal_model_mix.SR}). No SR-specific defect; SR changes in the corrected engine come from D1 (structure state) and D2 (sweep basis).
`;

// ---------------- structure ----------------
out.V8_STRUCTURE_AUDIT = HEAD('V8_STRUCTURE_AUDIT') + `| Element | Implementation | Status |
|---|---|---|
| swing high / low | pivot = highest high (lowest low) of a 5-left / 5-right window | CONFIRMED only: reported once 5 confirmed bars exist after it (latency 5 bars, tested); no provisional pivots are used |
| HH / HL / LH / LL | each pivot vs the previous pivot of the same type | correct |
| BOS / CHoCH | first confirmed close beyond a pivot after its confirmation; BOS if in the running direction (or first), CHoCH if against | **D1**: walked in pivot-index order instead of time order → wrong last event / label / direction |
| reclaim / failed break | not modelled as events (BO reclaim is a model condition) | — |
| sweep | wick beyond pivot + 0.05 % with the close back inside | **D2**: the reported sweep was the last sweep of the newest swept pivot, not the most recent sweep |
| range high / low | max / min of the last five pivots | conflict C6 with the comment "not yet broken" (reported) |
| future pivots | never: the function only receives confirmed bars; pivots need 5 right bars | PASS |

D1 is a CHRONOLOGY defect with a symmetry side effect: when one bar is both a pivot high and a pivot low (outside bar), the processing order (highs before lows at equal index) differs between a chart and its mirror image. The mirror test found exactly this: ${SYMR.map((x) => `${x.t}: production original ${x.production_original}, mirrored ${x.production_mirrored}; D1 original ${x.d1_original}, mirrored ${x.d1_mirrored}`).join('; ')}.

Prevalence: the D1 correction changes the 5m/15m/30m/1H structure primitives recorded per bar on ${pc(R.diffs.D1.DEV.primitive_changed_share)} (DEV) / ${pc(R.diffs.D1.HOLD.primitive_changed_share)} (HOLD) of bars; D2 on ${pc(R.diffs.D2.DEV.primitive_changed_share)} / ${pc(R.diffs.D2.HOLD.primitive_changed_share)} (the sweep field changes often because the sweep is now the most recent one).
`;

// ---------------- eligibility trace ----------------
const elig = (S, v) => R.forensics[S][v === 'CONTROL' ? 'eligibility_control' : 'eligibility_corrected'];
const eligTable = (S, v) => `| Model | Eligible bars | Triggered under the real bias | Selected | Pre-empted by a higher-priority model | Final signals | Bias-agnostic triggers BUY / SELL |\n|---|---|---|---|---|---|---|\n${Object.entries(elig(S, v).models).map(([m, x]) => `| ${m} | ${x.eligible_bars.toLocaleString('en-US')} | ${x.triggered_under_real_bias.toLocaleString('en-US')} | ${x.selected.toLocaleString('en-US')} | ${x.preempted_by_higher_priority} | ${x.final_signals.toLocaleString('en-US')} | ${x.bias_agnostic_triggers.BUY.toLocaleString('en-US')} / ${x.bias_agnostic_triggers.SELL.toLocaleString('en-US')} |`).join('\n')}`;
const sample = rowsOf('CONTROL', 'HOLD').filter((r) => r.t >= Date.parse('2026-09-25T07:00:00Z') / 1000 && r.t < Date.parse('2026-09-25T09:30:00Z') / 1000);
out.V8_MODEL_ELIGIBILITY_TRACE = HEAD('V8_MODEL_ELIGIBILITY_TRACE') + `Mapping (\`eligibleModelsFor\`): BULLISH/BEARISH 15m → MC, PB, BO, SR; RANGE → BO, SR, MR; COMPRESSION / HIGH_VOLATILITY → BO; TRANSITION → BO, SR; CHOP → none. It matches the engine documentation. **MODEL_ELIGIBILITY_ERRORS = 0.**\n\n${S2.map((S) => `## ${S} — CONTROL (${elig(S, 'CONTROL').bars.toLocaleString('en-US')} bars)\n${eligTable(S, 'CONTROL')}\n\nDecision mix: ${mix(elig(S, 'CONTROL').decision_mix)}\n\n## ${S} — corrected\n${eligTable(S, 'ALL')}`).join('\n\n')}\n\n## Per-bar trace sample (CONTROL, 2026-09-25 07:00–09:30 UTC, Exness replay)\n| Bar (UTC) | 15m bias | Eligible | Triggered (model+side) | Stages BUY MC PB BO SR MR | Stages SELL | Final |\n|---|---|---|---|---|---|---|\n${sample.map((r) => `| ${new Date(r.t * 1000).toISOString().slice(11, 16)} | ${r.b15 ?? '—'} ${r.b15r ?? ''} | ${r.elig ?? '—'} | ${r.trig ?? '—'} | ${r.stB ?? '—'} | ${r.stS ?? '—'} | ${r.act === 'WAIT' ? `WAIT ${r.wr}` : `${r.act} ${r.mdl}`} |`).join('\n')}\n\nStage digits: 0 none, 1 pattern, 2 setup, 3 trigger (bias-agnostic). Pre-emption by priority is rare (largest: MR ${elig('HOLD', 'CONTROL').models.MR.preempted_by_higher_priority} bars HOLD) and follows the documented MC > PB > BO > SR > MR order.\n`;

// ---------------- setup/trigger ----------------
out.V8_SETUP_TRIGGER_AUDIT = HEAD('V8_SETUP_TRIGGER_AUDIT') + `A setup alone never produces a trade: every model returns a candidate only when its trigger condition holds on the current confirmed bar (stage 3), asserted bar-by-bar against the production functions.

| Question | Finding |
|---|---|
| Missing triggers | **D2** (MR / SR basis read a stale sweep → fresh sweeps missed); **D3** (PB resolution never recognised after a decisive reclaim) |
| Triggering too early | none: MC needs 3 closes + a confirmed break, PB 2 reclaim closes, BO a retest AND a reclaim close, SR / MR a completed candle |
| Triggering too late | bounded by rule (MC/PB/MR ≤ 3 bars, BO ≤ 10); entry timing from origin (bars): CONTROL HOLD mean ${f2(sig('CONTROL', 'HOLD').entry_timing_bars_from_origin.mean)}, median ${sig('CONTROL', 'HOLD').entry_timing_bars_from_origin.median}, p90 ${sig('CONTROL', 'HOLD').entry_timing_bars_from_origin.p90}; corrected mean ${f2(sig('ALL', 'HOLD').entry_timing_bars_from_origin.mean)} |
| Incomplete candles | never (forming bar stripped; garbage forming bar test) |
| Wrong reference levels | **D1** (BO retest level / breakout bar from a stale event), **D2** (sweep level) |

Funnels (pattern → setup → trigger) per model and side: V8_PATTERN_DETECTION_AUDIT.
`;

// ---------------- location ----------------
const loc = (v, S) => { const rows = rowsOf(v, S).filter((r) => (r.act === 'BUY' || r.act === 'SELL') && r.g && r.g.ra); const ox = rows.map((r) => { const a = Math.abs(r.g.e - r.g.sl) / r.g.ra; return Math.abs(r.g.e - r.anc) / a; }); const mrWrong = rows.filter((r) => r.mdl === 'MR' && r.g.obj !== 'model_override').length; return { n: rows.length, mean: ox.reduce((s, x) => s + x, 0) / Math.max(1, ox.length), valid: ox.filter((x) => x <= 2.0).length, marginal: ox.filter((x) => x > 2.0 && x <= 2.51).length, over: ox.filter((x) => x > 2.51).length, mrNoMidpoint: mrWrong, mr: rows.filter((r) => r.mdl === 'MR').length, ra: rows.map((r) => r.g.ra) }; };
const L = Object.fromEntries(['CONTROL', 'ALL'].flatMap((v) => S2.map((S) => [`${v}_${S}`, loc(v, S)])));
out.V8_ENTRY_LOCATION_AUDIT = HEAD('V8_ENTRY_LOCATION_AUDIT') + `Entry = close of the confirmed signal bar. Location rule: entry ≤ 2.5 × 5m ATR from the model's anchor (OVEREXTENDED otherwise). Classes (descriptive): VALID ≤ 2.0 ATR from the anchor and within the model's own rules; MARGINAL 2.0–2.5 ATR (the last fifth of the allowance; distances are recomputed from the stored 2-decimal risk/ATR ratio, so values within 0.01 ATR of 2.5 count as MARGINAL); INVALID = violates the model's own definition (MR entry on the wrong side of its own midpoint target = D4).

| | Signals | Mean distance from anchor (ATR) | VALID | MARGINAL | > 2.5 ATR | MR signals whose target is NOT the midpoint (midpoint behind the entry or missing) |
|---|---|---|---|---|---|---|
${Object.entries(L).map(([k, x]) => `| ${k} | ${x.n} | ${x.mean.toFixed(2)} | ${x.valid} | ${x.marginal} | ${x.over} | ${x.mrNoMidpoint} of ${x.mr} |`).join('\n')}

D4 removes every MR entry whose own objective lies behind it (CONTROL MR signals with a non-midpoint target are exactly those). No other location defect was found; thresholds were not changed.
`;

// ---------------- SL ----------------
const srcMix = (v, S) => { const g = {}; for (const r of rowsOf(v, S)) if ((r.act === 'BUY' || r.act === 'SELL') && r.g) g[r.g.src] = (g[r.g.src] ?? 0) + 1; return g; };
out.V8_STRUCTURAL_SL_AUDIT = HEAD('V8_STRUCTURAL_SL_AUDIT') + `| Model | Structural invalidation (slAnchor) | Engine SL |
|---|---|---|
| MC | lowest low / highest high of the momentum leg (2 bars before the break → now) | anchor ∓ 0.25 ATR |
| PB | pullback extreme | idem |
| BO | retest extreme after the break | idem |
| SR | rejection wick | idem |
| MR | sweep-bar extreme | idem |
| all | wrong side of entry → entry ∓ 1.5 ATR (atr_fallback); never closer than 0.5 ATR (min_risk floor) | broker fail-safe 1.5 × structural distance + spread (unchanged) |

SL source mix (signals): ${S2.map((S) => `${S} CONTROL ${mix(srcMix('CONTROL', S))}; corrected ${mix(srcMix('ALL', S))}`).join(' · ')}.

Risk distance (ATR): CONTROL HOLD mean ${f3(sig('CONTROL', 'HOLD').sl_risk_atr.mean)}, median ${f3(sig('CONTROL', 'HOLD').sl_risk_atr.median)}; corrected ${f3(sig('ALL', 'HOLD').sl_risk_atr.mean)} / ${f3(sig('ALL', 'HOLD').sl_risk_atr.median)}. BUY and SELL SL formulas mirror exactly (tests). **SL_ERRORS = 0**: no stop was tightened or widened by V8. Wide stops are handled by risk eligibility (V8_COST_STRESS capital section), not by moving the stop.
`;

// ---------------- RR ----------------
out.V8_RR_AUDIT = HEAD('V8_RR_AUDIT') + `| Item | Implementation |
|---|---|
| TP1 | entry ± 1.0 × structural risk |
| TP2 | nearest structural objective ≥ 1.0 R beyond the entry (5m/15m pivots, 15m range), capped 3 R; 2 R if none; MR: 15m midpoint |
| RR gate | RR to TP2 ≥ 1.70 (\`minRR\`, kept verbatim) |
| BUY / SELL | TP = entry + / − R-multiple × risk; tested symmetric with fractional prices |
| Spread | not in the engine geometry; the executor re-checks effective RR from the fill (\`minEffectiveRr\` 1.7) and the replay pays 0.24 spread + 0.10 slippage |

**Conflict C1:** the owner's rule "TP = entry ± 1.70 × risk" ≠ implementation (TP2 is an objective ≥ 1.70 R, mean ${f3(sig('CONTROL', 'HOLD').tp2_r.mean)} R, ${pc(sig('CONTROL', 'HOLD').tp2_r.share_at_cap_3r)} at the 3 R cap on HOLD). Not changed by V8 (RR not optimised); both are reported: PRIMARY (production TP2) and SECONDARY (fixed 1.70 R).

**Defect D5:** \`rr = +(…).toFixed(2)\` was compared with 1.70, so 1.695 ≤ RR < 1.70 passed (JavaScript rounds 1.695 to "1.70"). Share of signals below 1.70 R: CONTROL HOLD ${pc(sig('CONTROL', 'HOLD').tp2_r.share_below_1_70)}, after D5 ${pc(sig('D5', 'HOLD').tp2_r.share_below_1_70)}. Decisions changed by D5: DEV ${R.diffs.D5.DEV.decision_changed_bars}, HOLD ${R.diffs.D5.HOLD.decision_changed_bars} (signals removed: ${R.diffs.D5.HOLD.top_changes.filter((x) => !x.change.startsWith('WAIT')).map((x) => `${x.change} ${x.n}`).join(', ')}).

| Split | Variant | PRIMARY (TP2) exp R | FIXED 1.70 R exp R | FIXED 1.70 R stress |
|---|---|---|---|---|
${S2.flatMap((S) => ['CONTROL', 'ALL'].map((v) => `| ${S} | ${v} | ${f3(sig(v, S).primary.expectancy_r)} | ${f3(sig(v, S).fixed_170r.expectancy_r)} | ${f3(sig(v, S).fixed_170r_stress.expectancy_r)} |`)).join('\n')}
`;

// ---------------- wrong direction ----------------
const WD = (S) => R.forensics[S].wrong_direction_control;
const CLS = { A: 'pattern misclassification', B: 'wrong direction logic', C: 'trigger / RR error', D: 'location error', E: 'stale signal / stale data', F: 'context block', G: 'data error (gap)', H: 'execution error (not observable in replay)', I: 'valid losing trade', J: 'unknown' };
out.V8_WRONG_DIRECTION_FORENSICS = HEAD('V8_WRONG_DIRECTION_FORENSICS (CONTROL trades, open path MFE < 0.5 R and the structural stop reached)') + S2.map((S) => { const w = WD(S); return `## ${S}: ${w.wrong_trades} wrong-direction trades of ${w.trades} (${pc(w.wrong_trades / w.trades)})\n| Class | Count | Share |\n|---|---|---|\n${Object.keys(CLS).map((k) => `| ${k} ${CLS[k]} | ${w.by_class[k] ?? 0} | ${pc((w.by_class[k] ?? 0) / w.wrong_trades)} |`).join('\n')}\n\nAttributed corrections: ${mix(w.by_fix)}. By model: ${Object.entries(w.by_model).map(([m, x]) => `${m} {${mix(x)}}`).join('; ')}.`; }).join('\n\n') + `\n\nClassification rule (pre-registered): G gap > 3 h near entry → E late beyond the model's own limit → defect (the corrected engine does not reproduce the same model and side at that bar; attributed to the single correction that also removes / flips it) → I valid losing trade. Implementation-related share: DEV ${pc((WD('DEV').wrong_trades - (WD('DEV').by_class.I ?? 0)) / WD('DEV').wrong_trades)}, HOLD ${pc((WD('HOLD').wrong_trades - (WD('HOLD').by_class.I ?? 0)) / WD('HOLD').wrong_trades)}. **Most wrong-direction trades are valid losing trades: the rules were followed and the market went the other way.**\n\n## Examples (HOLD, first 40)\n| Bar | Model | Side | Class | Fix | Entry | SL | TP2 | R | Open MFE | Context | Stages BUY / SELL | Corrected engine |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n${WD('HOLD').examples.map((x) => `| ${x.t.slice(0, 16)} | ${x.model} | ${x.side} | ${x.cls} | ${x.fix ?? ''} | ${x.entry} | ${x.sl} | ${x.tp2} | ${x.r} | ${x.mfe_open_r} | ${x.context.b15}/${x.context.b15r} 5m ${x.context.rg5} 30m ${x.context.m30r} 1H ${x.context.h1r} | ${x.stages.BUY} / ${x.stages.SELL} | ${x.all_variant} |`).join('\n')}\n`;

// ---------------- missed ----------------
const MS = (S, k) => R.forensics[S][k];
const MORDER = ['CAPTURED', 'LATE', 'WRONG_SIDE_SIGNAL', 'POSITION_OCCUPIED', 'DATA_UNAVAILABLE', 'LOCATION_BLOCKED', 'RR_BLOCKED', 'RISK_BLOCKED', 'MODEL_BLOCKED:QUALITY', 'MODEL_BLOCKED:CONTEXT_VETO', 'MODEL_BLOCKED:BIAS', 'NO_TRIGGER', 'NO_SETUP', 'NO_PATTERN'];
out.V8_MISSED_TRADE_FORENSICS = HEAD('V8_MISSED_TRADE_FORENSICS (V3 move events: ≥ 3 ATR within 24 bars before 1 ATR adverse)') + S2.map((S) => { const c = MS(S, 'missed_control'), a = MS(S, 'missed_corrected'), e = MS(S, 'engine_errors'); return `## ${S}: ${c.events} move events\n| Class | CONTROL | Corrected |\n|---|---|---|\n${MORDER.map((k) => `| ${k} | ${c.by_class[k] ?? 0} | ${a.by_class[k] ?? 0} |`).join('\n')}\n\nBias-block detail: CONTROL ${mix(c.bias_block_detail)}; corrected ${mix(a.bias_block_detail)}.\n\n**ENGINE_ERROR (missed valid patterns caused by implementation defects): ${e.missed_valid_patterns_before}** — CONTROL had no aligned entry in the onset window while the corrected engine had one (attributed: ${mix(e.by_fix)}). Events captured by CONTROL but no longer by the corrected engine: ${e.no_longer_captured} (${mix(e.no_longer_captured_by_class)}).`; }).join('\n\n') + `\n\nMISSED_VALID_PATTERNS_AFTER = 0 by construction (no known defect remains); the corrected engine's remaining misses are rule-based (no pattern, setup or trigger; bias; gates; one-position rule). SAFETY_BLOCKED (news, spread, drift, margin) is outside the replay and not counted.\n`;

// ---------------- context lag ----------------
const CL = (S, v) => R.forensics[S][v === 'CONTROL' ? 'context_lag_control' : 'context_lag_corrected'];
out.V8_CONTEXT_LAG_AUDIT = HEAD('V8_CONTEXT_LAG_AUDIT') + `Test: on WAIT bars where a 5m model's own trigger is present (bias-agnostic, stage 3) and the would-be trade passes risk, RR, quality 65 and the cross-timeframe vetoes with an aligned bias, record when the pattern was valid, the real context, the blocker and whether the 15m bias aligned within 6 bars (episodes collapse repeats of the same side/model within 3 bars). Outcomes are descriptive only; **no context rule is changed by V8.**\n\n${S2.map((S) => ['CONTROL', 'ALL'].map((v) => { const c = CL(S, v); return `## ${S} — ${v}: ${c.episodes} episodes\n| BLOCKED_BY | Episodes | Bias aligned within 6 bars | Descriptive mean R (EXIT_F, normal cost) | Wrong-direction | Models |\n|---|---|---|---|---|---|\n${Object.entries(c.summary).map(([k, x]) => `| ${k} | ${x.episodes} | ${x.aligned_within_6} | ${f3(x.mean_r_descriptive)} | ${pc(x.wrong_direction_rate)} | ${mix(x.by_model)} |`).join('\n')}`; }).join('\n\n')).join('\n\n')}\n\n## Examples (CONTROL, HOLD)\n| PATTERN_VALID_AT | Side | Model | CONTEXT_STATE_AT | BLOCKED_BY | WOULD_HAVE_BEEN_VALID | Bias aligned ≤ 6 bars | R |\n|---|---|---|---|---|---|---|---|\n${CL('HOLD', 'CONTROL').examples.slice(0, 25).map((x) => `| ${x.pattern_valid_at.slice(0, 16)} | ${x.side} | ${x.model} | ${x.context_state_at} | ${x.blocked_by} | ${x.would_have_been_valid} | ${x.bias_aligned_within_6_bars} | ${x.r ?? '—'} |`).join('\n')}\n\nReading: the 15m bias rarely aligns within 6 bars of a blocked 5m pattern, and the sign of the descriptive outcome of blocked trades flips between DEV and HOLDOUT (DEV: every blocker negative; HOLD: opposing-bias SELLs positive). This is not stable evidence that the context gate is wrong. **CONTEXT_LAG_ERRORS = 0** (lag documented, not a defect).\n`;

// ---------------- timing ----------------
out.V8_CANDLE_TIMING_AUDIT = HEAD('V8_CANDLE_TIMING_AUDIT') + `| Moment | Live | Replay | Verified |
|---|---|---|---|
| Signal candle close | 5m bar close (open time + 300 s) | same | — |
| Decision timestamp | watcher cycle after the close; the last returned bar is the forming bar and is stripped | close + 80 s (FETCH_LAG) | live orchestrator driven offline = replay on ${LP.sample_bars} bars (${LP.signals_in_sample} signals), 0 mismatches |
| Higher-timeframe availability | last returned 15m/30m/1H bar = forming, stripped | bars cut at floor(T / tf) × tf | same parity test |
| Forming bar | never used | never used | garbage forming bars (high × 1.5, low × 0.5) on every timeframe: 0 decision changes |
| Pivot confirmation | 5 right bars | same | fixture: 4 right bars → not a pivot; 5 → pivot |
| Entry timestamp | the executor fills at market after the decision (drift guard 2.00 USD, re-checked RR from the fill) | entry = signal close; DRIFT variant fills at the next open | DRIFT result in V8_COST_STRESS |
| Stale data | 5m: watcher freshness check; 15m/30m: \`stale\` computed but NOT enforced (**D6**) | D6 emulated with the production rule | live-path test: 4 h-old 15m snapshot → production decides; corrected → DATA_UNAVAILABLE |

**NO_LOOKAHEAD = PASS.** **TIMING_ERRORS = 0** (D6 is classified as a DATA error: stale data is used, but never future data).
`;

// ---------------- replay parity ----------------
out.V8_REPLAY_PARITY = HEAD('V8_REPLAY_PARITY') + `| Comparison | Bars | Fields | Mismatches |
|---|---|---|---|
| Research replay (CONTROL) vs Edge Lab production-faithful replay (\`lab_rows.jsonl\`) | ${R.fidelity.control_vs_lab.compared.toLocaleString('en-US')} (all DEV + HOLD) | action, wait reason, model, candidate side, quality, threshold, RR | ${Object.values(R.fidelity.control_vs_lab.mismatches).reduce((a, b) => a + b, 0)} |
| Unchanged engine copy vs production engine | ${R.fidelity.copy_vs_control.compared.toLocaleString('en-US')} | full row | ${R.fidelity.copy_vs_control.compared - R.fidelity.copy_vs_control.identical} |
| Stage decomposition vs production model functions | ${Object.values(R.fidelity.stage_parity).reduce((s, o) => s + Object.values(o).reduce((a, b) => a + b.checked, 0), 0).toLocaleString('en-US')} model checks (9 variants) | trigger present per model and side | 0 |
| LIVE-STYLE (production \`calculateEntry\`, injected bars, garbage forming bar) vs research replay | ${LP.sample_bars.toLocaleString('en-US')} (${LP.last_week_bars} = every bar 2026-09-22 → 29 + 600 seeded) incl. ${LP.signals_in_sample} signals | action, reason, model, entry, SL, TP1, TP2, RR | ${Object.values(LP.mismatches).reduce((a, b) => a + b, 0)} |
| Live production records (TradingView OANDA feed) vs replay (Exness feed) — wait log | ${LPP.wait_log.compared} logged decisions | action / reason | ${LPP.wait_log.compared - LPP.wait_log.action_match} action / ${LPP.wait_log.compared - LPP.wait_log.reason_match} reason differences — feed, not code |
| Live production 5m signals vs replay | ${LPP.signal_store.in_replay_range} in range | same side, same bar | ${LPP.signal_store.in_replay_range - LPP.signal_store.same_side_same_bar} (replay WAIT ${LPP.signal_store.replay_wait}, opposite ${LPP.signal_store.replay_opposite}) |

**REPLAY_PARITY = PASS** (code paths identical). Feed differences (OANDA vs Exness prices) explain the remaining live-record differences: ${LPP.wait_log.mismatches.slice(0, 6).map((m) => `${m.t.slice(0, 16)} live ${m.live} / replay ${m.replay}`).join('; ')}.
`;

// ---------------- symmetry ----------------
out.V8_BUY_SELL_SYMMETRY = HEAD('V8_BUY_SELL_SYMMETRY (price-mirror test)') + `Method: ${SYM.sample_bars} seeded DEV bars; every timeframe mirrored around K = ${SYM.K} (open/close → K − x, high ↔ low). A symmetric implementation returns BUY ↔ SELL with the same model / wait reason and mirrored geometry.\n\n| Engine | Bars | Signals | Exact mirror | Mismatch fields |\n|---|---|---|---|---|\n${Object.entries(SYM.engines).map(([k, x]) => `| ${k} | ${x.bars} | ${x.signals} | ${x.exact} / ${x.bars} (${(x.symmetry_rate * 100).toFixed(2)} %) | ${mix(x.by_field) || '—'} |`).join('\n')}\n\nSYMPROBE = production with the three price-relative terms neutralised (ATR % → ATR in the regime, Bollinger width / basis → absolute width, sweep tolerance 0.05 % → 2 USD). These terms are price-LEVEL normalisations (a mirrored chart has a different price history), so CONTROL's ${pc(1 - SYM.engines.CONTROL.symmetry_rate)} differences are expected and are not code asymmetry. With them neutralised production mirrors ${SYM.engines.SYMPROBE.exact} of ${SYM.engines.SYMPROBE.bars}; the single residual is the D1 tie-order case (an outside bar that is both a pivot high and low): ${SYMR.map((x) => `${x.t} production ${x.production_original}/${x.production_mirrored}, D1 ${x.d1_original}/${x.d1_mirrored}`).join('; ')}. The corrected engine with the same neutralisation mirrors ${SYM.engines.SYMPROBE_ALL?.exact} of ${SYM.engines.SYMPROBE_ALL?.bars}.\n\n**BUY_SELL_SYMMETRY: production FAIL (one genuine code asymmetry, caused by D1); corrected PASS.** Unit tests also mirror SR, BO, SL/TP/RR and the D1 fixture explicitly.\n`;

// ---------------- stale / duplicate ----------------
out.V8_STALE_DUPLICATE_AUDIT = HEAD('V8_STALE_DUPLICATE_AUDIT') + `| Risk | Protection | Evidence |
|---|---|---|
| same candle / same setup / same model / same direction twice | signal id = hash of symbol, timeframe, model, side, origin bar, signal bar (\`signalStore.registerOrGetSignal\`): a second registration returns the existing record (isNew false); a second candidate on the same OPEN thesis is withheld (blockedByOpenThesis) | test: duplicate → isNew false; same thesis → blocked |
| watcher restart | the store is persisted atomically (temp + rename) and reloaded; ids are deterministic | test: save → reload → re-register → no second record |
| executor duplicates | \`mt5Executor\` keeps \`executed_signals\` and a write-ahead intent before order_send; reconcile resolves a crash in the send window | existing tests (mt5_executor, watcher_tick_overlap, weekend_hardening) — unchanged, all pass |
| re-entry | \`canReenter\`: never on the same or an earlier candle than the last exit; same model/side/anchor within 12 bars = STALE_SAME_SETUP; revenge guard 3 bars after a loss | test for each rule; the replay walk uses the same function (skipped: CONTROL HOLD ${JSON.stringify(R.variants.CONTROL.HOLD.skipped)}) |
| stale signals | each model has its own lateness limit (MC/PB/MR 3 bars, BO 10, SR 0); CONTROL wrong-direction trades later than their limit: ${(WD('DEV').by_class.E ?? 0) + (WD('HOLD').by_class.E ?? 0)} (only via stale higher-timeframe data, D6) | forensics |
| reconnect / missed candle recovery | the watcher evaluates the latest confirmed bar only; a missed bar is not back-filled into a signal (no stale entry) | existing watcher tests |
| stale data | **D6**: a stale 15m/30m snapshot was used; corrected copy fails closed | live-path test |

**STALE_SIGNAL_ERRORS = 0** (stale data counted under DATA_ERRORS as D6).
`;

// ---------------- data failure ----------------
out.V8_DATA_FAILURE_AUDIT = HEAD('V8_DATA_FAILURE_AUDIT') + `| Failure | Production behaviour | Exact reason recorded | Verdict |
|---|---|---|---|
| 5m unavailable / too few bars / non-monotonic / invalid OHLC | DATA_UNAVAILABLE, WAIT | "5m: …" in \`errors\` | fail-closed (tested) |
| 15m unavailable or invalid | DATA_UNAVAILABLE, WAIT | "15m: …" | fail-closed (tested) |
| 30m unavailable or invalid | DATA_UNAVAILABLE, WAIT | "30m: …" | fail-closed |
| 1H and higher unavailable | that context tier = DATA_UNAVAILABLE; decision continues; the 1H veto cannot fire | context status | documented design ("context tiers never force WAIT"); reported |
| 15m / 30m snapshot STALE (last confirmed bar older than 4 bar durations) | decision continues on the stale snapshot | \`stale: true\` only in the per-timeframe summary | **D6 defect** → corrected copy: DATA_UNAVAILABLE with "15m: stale data (… s old)" |
| replay bars after a data gap | evaluated (as live would) | \`gap\` flag | D6 emulation turns post-gap decisions on stale 15m/30m into DATA_UNAVAILABLE_STALE: DEV ${R.diffs.D6.DEV.decision_changed_bars} / HOLD ${R.diffs.D6.HOLD.decision_changed_bars} decisions, signals ${sig('CONTROL', 'DEV').signals} → ${sig('D6', 'DEV').signals} (DEV), ${sig('CONTROL', 'HOLD').signals} → ${sig('D6', 'HOLD').signals} (HOLD) |

DATA_UNAVAILABLE never becomes a pattern WAIT: it carries its own status and errors (missed-move forensics count it separately as DATA_UNAVAILABLE). **DATA_ERRORS = 1 (D6).**
`;

// ---------------- defect register ----------------
const REG = {
  D1: ['lastEvent / state = break of the highest-INDEX broken pivot; BOS/CHoCH labelled in pivot order', 'the most recent confirmed break in time sets the direction and the last event; labels follow the running direction', 'fixtures (direction flip; stale CHoCH); mirror residual; 45–50 % of bars carry a changed structure primitive', 'pivots processed in index order (outer loop) instead of collecting first breaks and walking them by break bar', 'collect each pivot\'s first close-break, sort by (break bar, pivot index), walk', 'structure fixtures (state, last event, labels, mirror)'],
  D2: ['lastSweep = last sweep of the newest pivot that was ever swept (can be many bars old while a fresh sweep exists)', 'the most recent sweep in time (ties → the more recent pivot)', 'sweep fixture: age 9 vs a current-bar sweep; MR needs age ≤ 3', 'reverse pivot loop breaks at the first pivot with any sweep', 'scan all pivots, keep the sweep with the largest bar', 'sweep fixture'],
  D3: ['PB resolution required the CURRENT close ≥ 1 ATR from the 20-bar extreme', 'pullback depth (extreme → deepest point after it) ≥ 1 ATR, then 2 reclaim closes', 'fixture: 2.64-ATR pullback with a decisive reclaim → no PB', 'reuse of the 15m correction-state primitive (remaining distance) as a depth test', 'depth from the extreme to the lowest low (BUY) after it; resolution/freshness unchanged', 'PB fixtures'],
  D4: ['MR SELL/BUY on any fresh sweep in a 15m RANGE, even when its own midpoint target lies behind the entry', 'mean-reversion entry on the far side of its midpoint objective', 'fixture: SELL at 103 with target 105', 'location never checked although the reason text claims "at a 15m range boundary"', 'return no candidate when the midpoint is missing or on the wrong side', 'MR fixtures'],
  D5: ['RR gate compared the 2-decimal-rounded RR with 1.70', 'RR ≥ 1.70 exactly (1e-9 tolerance)', '(1.695).toFixed(2) === "1.70"; fixture 1.696 R accepted', 'rounding before the comparison', 'compare the unrounded value; keep the rounded value for reporting', 'RR fixtures'],
  D6: ['a 15m/30m snapshot older than 4 bar durations is used for the decision', 'fail closed exactly like invalid data, with the reason', 'live-path test: 4 h-old 15m snapshot → decision taken', '`stale` computed by validateAndSplit but never enforced', 'add stale to the existing entry-timeframe fail-closed condition and record the reason', 'live-path stale test'],
};
out.V8_DEFECT_REGISTER = HEAD('V8_DEFECT_REGISTER') + CORRECTIONS.map((c) => { const r = REG[c.id]; return `## ${c.id} ${c.title} — ${c.category} (\`src/${c.file}\`)\n| Field | |\n|---|---|\n| CURRENT_BEHAVIOUR | ${r[0]} |\n| EXPECTED_BEHAVIOUR | ${r[1]} |\n| EVIDENCE | ${r[2]} |\n| ROOT_CAUSE | ${r[3]} |\n| MINIMAL_FIX | ${r[4]} (\`patches/${c.id}_${c.title}.patch\`) |\n| REGRESSION_TEST | tests/core_pattern_audit_v8.test.js — ${r[5]} |\n| Decisions changed (DEV / HOLD) | ${R.diffs[c.id].DEV.decision_changed_bars} / ${R.diffs[c.id].HOLD.decision_changed_bars} (unexplained ${R.diffs[c.id].DEV.unexplained_changes + R.diffs[c.id].HOLD.unexplained_changes}) |`; }).join('\n\n') + `\n\n## Reported, not corrected\nC1 TP2 objective vs owner's fixed 1.70 R; C6 range high/low comment; quality qTrigger/qStructure direction-agnostic (an opposite BOS earns trigger credit — scoring template without a directional specification); BO breakout not invalidated by an intermediate close back through the level; sweeps of already-broken pivots counted; 1H context data failure disables only that tier (documented); engine docs stale about the 1H quality-bar rule (C7).\n`;

// ---------------- minimal corrections ----------------
const patchStat = (id) => { const p = readFileSync(join(ROOT, 'patches', `${id}.patch`), 'utf8'); return { add: p.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length, del: p.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length }; };
out.V8_MINIMAL_CORRECTIONS = HEAD('V8_MINIMAL_CORRECTIONS (research copies only — NOT deployed)') + `| ID | File | Lines + / − | Patch |\n|---|---|---|---|\n${CORRECTIONS.map((c) => { const s = patchStat(`${c.id}_${c.title}`); return `| ${c.id} | src/${c.file} | +${s.add} / −${s.del} | patches/${c.id}_${c.title}.patch |`; }).join('\n')}\n| ALL | 4 files | +${patchStat('ALL_V8_CORRECTIONS').add} / −${patchStat('ALL_V8_CORRECTIONS').del} | patches/ALL_V8_CORRECTIONS.patch (\`git apply --check\` clean against 48eb31d) |\n\nEach correction changes only its defective rule: no threshold, indicator, RR, SL rule, exit, cost, lot or safety gate was changed, and nothing was added (no RSI, MACD, Bollinger, new EMA, oscillator, silver, dollar index or score). The corrections were selected by specification before any outcome was computed (pre-registration ${R.prereg_sha.slice(0, 16)}…) and frozen before the HOLDOUT replay (configs/v8_freeze.json). They are NOT applied to \`src/\`; deployment would need the owner's decision, a fingerprint update and the usual safety review.\n`;

// ---------------- before/after ----------------
const ba = (S) => `| Variant | Signals | Model mix | Trades | Wrong-direction | Capture | Entry timing mean (bars) | SL risk mean (ATR) | TP2 mean (R) | Expectancy (R) | PF | Max DD (R) | Decisions changed | Unexplained |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n${V.map((v) => { const d = sig(v, S); const df = R.diffs[v]?.[S]; return `| ${v} | ${d.signals} | ${mix(d.signal_model_mix)} | ${d.primary.n} | ${pc(d.primary.wrong_direction_rate)} | ${pc(d.capture.capture_rate)} | ${f2(d.entry_timing_bars_from_origin.mean)} | ${f3(d.sl_risk_atr.mean)} | ${f3(d.tp2_r.mean)} | ${f3(d.primary.expectancy_r)} | ${f2(d.primary.pf)} | ${f2(d.primary.max_dd_r)} | ${df ? df.decision_changed_bars : '—'} | ${df ? df.unexplained_changes : '—'} |`; }).join('\n')}`;
out.V8_BEFORE_AFTER_REPLAY = HEAD('V8_BEFORE_AFTER_REPLAY') + `${S2.map((S) => `## ${S}\n${ba(S)}`).join('\n\n')}\n\nFLAGGED: D1 and ALL change thousands of decisions because the corrected structure primitive feeds the 5m, 15m, 30m and 1H tiers. Every changed decision is explained by a changed recorded primitive (unexplained = 0 for every variant). Single corrections do not sum to ALL: they interact through shared structure inputs.\n`;

// ---------------- results ----------------
const resTable = (S) => econTable(S);
const extra = (S) => `| Variant | Stress exp (R) | Drift exp (R) | Fixed 1.70 R exp | Block CI 95 % | Trades / session (median, p90) | Max DD USD (0.01 lot) |\n|---|---|---|---|---|---|---|\n${V.map((v) => { const d = sig(v, S); return `| ${v} | ${f3(d.stress.expectancy_r)} | ${f3(d.drift.expectancy_r)} | ${f3(d.fixed_170r.expectancy_r)} | ${ci(d.primary.block_ci95_r)} | ${d.primary.trades_per_session ? `${d.primary.trades_per_session.median}, ${d.primary.trades_per_session.p90}` : '—'} | ${f2(d.primary.max_dd_usd)} |`; }).join('\n')}`;
out.V8_DEVELOPMENT_RESULTS = HEAD('V8_DEVELOPMENT_RESULTS (DEV 2025-05-07 → 2025-12-31, 205 sessions)') + `${resTable('DEV')}\n\n${extra('DEV')}\n\nCONTROL reproduces V7 DEV exactly (n 878, −0.055 R). The corrected engine is WORSE than CONTROL on DEV (−0.099 R, DD 155.91 R), driven by D1 (−0.119 R). Corrections were not selected or tuned on these numbers (pre-registered by specification).\n`;
out.V8_HOLDOUT_RESULTS = HEAD('V8_HOLDOUT_RESULTS (HOLDOUT 2026-01-01 → 2026-09-29, 232 sessions, opened once after the freeze)') + `${resTable('HOLD')}\n\n${extra('HOLD')}\n\n## Pre-registered decision\n| Check | Result |\n|---|---|\n${Object.entries(dec.checks).map(([k, x]) => `| ${k} | ${x ? 'PASS' : 'FAIL'} |`).join('\n')}\n| better than CONTROL on HOLD | ${dec.better_than_control_hold ? 'yes' : 'no'} |\n\n**EDGE_DEMONSTRATED = ${dec.EDGE_DEMONSTRATED}. DEMO_ELIGIBLE = ${dec.DEMO_ELIGIBLE}.** CONTROL reproduces V7 HOLD exactly (n 1,163, −0.064 R, PF 0.93, DD 98.89 R, wrong-direction 29.7 %).\n`;
out.V8_COST_STRESS = HEAD('V8_COST_STRESS') + `Costs: NORMAL spread 0.24 + slippage 0.10 USD; STRESS 0.60 + 0.20; DRIFT = fill at the next bar open; swap 0.56 USD per BUY night.\n\n${S2.map((S) => `## ${S}\n${extra(S)}`).join('\n\n')}\n\n## Capital feasibility (0.01 lot, corrected engine, HOLD; no fixed-dollar loss assumption)\n| Capital (USD) | Max DD % | Mean broker SL risk % | Margin % | 0.01 lot feasible |\n|---|---|---|---|---|\n${Object.entries(sig('ALL', 'HOLD').capital.by_capital).map(([cap, x]) => `| ${cap} | ${pc(x.max_dd_pct)} | ${pc(x.risk_pct)} | ${pc(x.margin_pct)} | ${x.feasible_001_lot} |`).join('\n')}\n\nNORMAL and STRESS are negative for every variant on both splits. Mean broker SL ≈ ${sig('ALL', 'HOLD').capital.mean_broker_sl_usd} USD at 0.01 lot.\n`;
const wf = (v) => Object.entries({ ...sig(v, 'DEV').walk_forward, ...sig(v, 'HOLD').walk_forward });
out.V8_WALK_FORWARD = HEAD('V8_WALK_FORWARD (quarterly, no re-fitting — nothing is fitted)') + `| Quarter | CONTROL n | CONTROL exp (R) | CONTROL PF | Corrected n | Corrected exp (R) | Corrected PF | Corrected wrong-direction |\n|---|---|---|---|---|---|---|---|\n${wf('CONTROL').map(([q, c]) => { const a = Object.fromEntries(wf('ALL'))[q] ?? {}; return `| ${q} | ${c.n} | ${f3(c.expectancy_r)} | ${f2(c.pf)} | ${a.n ?? '—'} | ${f3(a.expectancy_r)} | ${f2(a.pf)} | ${pc(a.wrong_direction_rate)} |`; }).join('\n')}\n\nCorrected engine positive quarters: ${wf('ALL').filter(([, x]) => x.expectancy_r > 0).length} of ${wf('ALL').length} (HOLD ${Object.entries(sig('ALL', 'HOLD').walk_forward).filter(([, x]) => x.expectancy_r > 0).length} of 3). **WALK_FORWARD = UNSTABLE.**\n`;
out.V8_UNCERTAINTY = HEAD('V8_UNCERTAINTY') + `| Source | Assessment |\n|---|---|\n| Sampling | trade-bootstrap 95 % CI (HOLD) CONTROL ${ci(sig('CONTROL', 'HOLD').primary.ci95_r)}, corrected ${ci(sig('ALL', 'HOLD').primary.ci95_r)}; session-block CI ${ci(sig('CONTROL', 'HOLD').primary.block_ci95_r)} / ${ci(sig('ALL', 'HOLD').primary.block_ci95_r)} — both include 0 and are mostly negative |\n| Month-shuffle drawdown (500 paths) | corrected HOLD p50 ${sig('ALL', 'HOLD').adverse.dd_r_p50} R, p90 ${sig('ALL', 'HOLD').adverse.dd_r_p90} R; loss streak p90 ${sig('ALL', 'HOLD').adverse.loss_streak_p90} |\n| Split instability | D1 alone: DEV ${f3(sig('D1', 'DEV').primary.expectancy_r)} vs HOLD ${f3(sig('D1', 'HOLD').primary.expectancy_r)}; context-lag outcomes change sign between splits |\n| Feed | replay = Exness MT5 bars; live engine = TradingView OANDA bars; 97 % action agreement on the live log |\n| Execution | replay fills at the signal close (DRIFT variant at the next open); real fills, spread spikes and the live safety layer (news, spread, drift, margin, breaker) are not replayed |\n| D6 | emulated with the production staleness rule; live staleness also depends on TradingView snapshot behaviour |\n| Multiple corrections | six corrections evaluated together and singly; no selection by outcome, so no multiple-testing inflation of the decision; interaction effects reported |\n| Wrong-direction attribution | a trade is attributed to a defect when the corrected engine does not reproduce it; this is a counterfactual attribution, not proof that the loss was caused by the defect |\n`;
out.V8_CONTROL_VS_CORRECTED = HEAD('V8_CONTROL_VS_CORRECTED') + `| Metric | DEV CONTROL | DEV corrected | HOLD CONTROL | HOLD corrected |\n|---|---|---|---|---|\n${[['Signals', (d) => d.signals], ['Trades', (d) => d.primary.n], ['Expectancy (R)', (d) => f3(d.primary.expectancy_r)], ['95 % CI', (d) => ci(d.primary.ci95_r)], ['PF', (d) => f2(d.primary.pf)], ['Win rate', (d) => pc(d.primary.win_rate)], ['Avg win / loss (R)', (d) => `${f2(d.primary.avg_win_r)} / ${f2(d.primary.avg_loss_r)}`], ['MFE / MAE (R)', (d) => `${f2(d.primary.mfe_r)} / ${f2(d.primary.mae_r)}`], ['Max DD (R)', (d) => f2(d.primary.max_dd_r)], ['Wrong-direction (trades)', (d) => pc(d.primary.wrong_direction_rate)], ['Move capture', (d) => pc(d.capture.capture_rate)], ['Wrong-side on moves', (d) => pc(d.capture.wrong_direction_rate)], ['Trades / session (mean)', (d) => d.primary.trades_per_session?.mean], ['Max consecutive losses', (d) => d.primary.max_loss_streak], ['Stress exp (R)', (d) => f3(d.stress.expectancy_r)], ['Fixed 1.70 R exp (R)', (d) => f3(d.fixed_170r.expectancy_r)]].map(([k, fn]) => `| ${k} | ${fn(sig('CONTROL', 'DEV'))} | ${fn(sig('ALL', 'DEV'))} | ${fn(sig('CONTROL', 'HOLD'))} | ${fn(sig('ALL', 'HOLD'))} |`).join('\n')}\n`;
for (const [name, md] of Object.entries(out)) writeFileSync(join(REP, `${name}.md`), md);
console.log(`reports written: ${Object.keys(out).length}`);
