/**
 * ILLUSTRATIVE ONLY -- NOT EVIDENCE. Replays 2026-09-30 RR-rejected production candidates under H2a on today's MT5 bars.
 * Uses frozen production pure functions to recompute geometry at each candle (as the forensic audit did) and V1's engine.
 * Usage: node today_illustrative.mjs <bars.json> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { simulateTrade, capitalRisk } from '../../capital_harvest_v1/scripts/harvest_engine.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)); const REPO = join(HERE, '..', '..', '..');
const E = (p) => 'file:///' + join(REPO, 'src', 'engine', p).replace(/\\/g, '/');
const { runPipeline } = await import(E('pipeline.js')); const { computeHtfContext } = await import(E('htf.js')); const { computeBias } = await import(E('intraday/bias.js')); const { runIntradayPipeline, combineIntraday } = await import(E('intraday/pipeline5m.js')); const { INTRADAY_PARAMS: P } = await import(E('intraday/params.js'));
const BARS = JSON.parse(readFileSync(process.argv[2], 'utf8')); const b5 = BARS['5m'];
const TF = { '5m': 300, '15m': 900, '30m': 1800, '1H': 3600 }; const conf = (tf, T) => BARS[tf].filter((b) => b.time < Math.floor(T / TF[tf]) * TF[tf]).slice(-499);
const CASES = [{ t: 1790762100, label: '09:55 BO SELL (live RR_NOT_ACCEPTABLE 1.27)' }, { t: 1790770800, label: '12:20 SR BUY (live RR_NOT_ACCEPTABLE 1.31; inside PRE_NEWS block)' }, { t: 1790776200, label: '13:50 BO SELL (live RR_NOT_ACCEPTABLE 1.62)' }, { t: 1790776500, label: '13:55 BO SELL (stall-suppressed; replay RR 1.42)' }, { t: 1790777100, label: '14:05 BO SELL (stall-suppressed; replay RR 1.21)' }, { t: 1790777700, label: '14:15 BO SELL (live RR_NOT_ACCEPTABLE 1.43)' }];
const H2A = { kind: 'RUN', m1: { usd: 3 }, buffer: { usd: 1 }, bankRun: true };
const oppBuy = [b5.findIndex((b) => b.time === 1790771100)]; // the 12:25Z production BUY signal (opposite side for SELL cases)
const out = [];
for (const c of CASES) { const T = c.t + 360; const bars5 = conf('5m', T); const i = b5.findIndex((b) => b.time === c.t); if (bars5.at(-1)?.time !== c.t || i < 0) { out.push({ ...c, error: 'bar not found' }); continue; }
  const bias = computeBias({ confirmedBars: conf('15m', T), params: P }); const m30 = runPipeline({ confirmedBars: conf('30m', T) }); const ctx1H = computeHtfContext(conf('1H', T), { includeCorrection: true }); const intra = runIntradayPipeline({ bars5: bars5, bias, m30Regime: m30.regime, ctx1H, params: P }); const live = combineIntraday({ intraday: intra, bias, m30, ctx1H }); const cand = intra.evidence?.candidate, rk = intra.evidence?.risk;
  if (!cand || !rk || !Number.isFinite(rk.entry)) { out.push({ ...c, production: `${live.action}/${live.wait_reason}`, error: 'no candidate geometry' }); continue; }
  const { atr } = await import(E('math.js')); const a14 = atr(bars5, 14).at(-1);
  const admitting = rk.rr >= 1.7 ? '1.70' : rk.rr >= 1.5 ? '1.50' : rk.rr >= 1.25 ? '1.25' : rk.rr >= 1.0 ? '1.00' : 'NO_FIXED_RR only';
  const o = simulateTrade({ bars: b5, i, side: cand.side, entry: rk.entry, sl: rk.stop_loss, atr: a14, tp1Dist: Math.abs(rk.tp1 - rk.entry), variant: H2A, oppSignalBars: cand.side === 'SELL' ? oppBuy.filter((x) => x > i) : [] });
  const risk = capitalRisk({ entry: rk.entry, sl: rk.stop_loss });
  out.push({ ...c, production_decision: `${live.action}/${live.wait_reason ?? '-'}`, model: cand.model, side: cand.side, entry: rk.entry, structural_stop: rk.stop_loss, tp2: rk.tp2, rr: rk.rr, admitting_threshold: admitting, expected_loss_usd: risk.expectedLossUsd, pct_equity: risk.pctEquity, h2a: { status: o.status, exit: o.exit, bars: o.exitBar - i, pnl_usd: o.pnl_usd, mfe_usd: o.mfe_usd, mae_usd: o.mae_usd, reached_3usd: o.reached_bar != null, reached_at_bar: o.reached_bar, decision: o.decision, evidence: o.evidence, final_floor: o.final_floor, given_back: o.given_back }, bars_available_after_signal: b5.length - 1 - i }); }
writeFileSync(process.argv[3], JSON.stringify({ label: 'ILLUSTRATIVE — NOT EVIDENCE (2026-09-30 is the motivating session and is excluded from all inference)', data_end: new Date(b5.at(-1).time * 1000).toISOString(), cases: out }, null, 1));
console.log(JSON.stringify(out, null, 1));
