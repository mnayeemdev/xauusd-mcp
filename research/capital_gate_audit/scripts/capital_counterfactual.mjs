// PHASE A -- CAPITAL COUNTERFACTUAL (READ-ONLY SIMULATION). Imports the PRODUCTION gate arithmetic
// (assessRealLot = the executor's MARGIN_SAFETY_VETO; computeProtectiveStops = the broker SL/TP the
// executor would send) and evaluates the SAME 2026-09-30 12:25Z signal geometry at several equities.
// No broker call, no order, no state write. Run: node research/capital_gate_audit/scripts/capital_counterfactual.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assessRealLot, REAL_DEFAULTS, REAL_FIXED_LOT } from '../../../src/engine/mt5RealPolicy.js';
import { computeProtectiveStops, evaluateExecutableGeometry } from '../../../src/engine/mt5Policy.js';

const HERE = dirname(fileURLToPath(import.meta.url)); const OUT = join(HERE, '..', 'results'); mkdirSync(OUT, { recursive: true });
// Broker facts read read-only on 2026-09-30 19:30Z (account_info / symbol_info): leverage 200, contract 100 oz,
// margin call 60 %, stop-out 0 %, volume_min 0.01, XAUUSDm margin for 0.01 lot = price*100*0.01/200.
const BROKER = { leverage: 200, contractSize: 100, marginCallLevelPct: 60, stopOutLevelPct: 0, digits: 3, point: 0.001, stopsLevel: 0 };
const CFG = { lot: REAL_FIXED_LOT, profitTargetUsd: REAL_DEFAULTS.profitTargetUsd, maximumLossUsd: REAL_DEFAULTS.maximumLossUsd, marginBudgetPctOfEquity: REAL_DEFAULTS.marginBudgetPctOfEquity, marginCallBufferPct: REAL_DEFAULTS.marginCallBufferPct, brokerStructuralSlMultiple: REAL_DEFAULTS.brokerStructuralSlMultiple, maxEntryDriftUsd: REAL_DEFAULTS.maxEntryDriftUsd, maxSpreadUsd: REAL_DEFAULTS.maxSpreadUsd, minEffectiveRr: REAL_DEFAULTS.minEffectiveRr };

// The Sept-30 signal (state/xauusd_mt5_real_trade_log.jsonl line 77): BO BUY, engine entry 4193.22, SL 4181.78, TP2 4216.10, q 83, rr 2.
const SIGNAL = { side: 'BUY', engine_entry: 4193.22, engine_sl: 4181.78, engine_tp2: 4216.1, live_bid_at_alert: 4209.642, live_ask_at_alert: 4209.902, spread: 0.26 };
// Two price bases: (a) the plan price (what the executor would have seen had price not drifted), (b) the live ask at the alert.
const PRICES = { plan_price: SIGNAL.engine_entry, live_ask_at_alert: SIGNAL.live_ask_at_alert };
const EQUITIES = [62.07, 75, 99, 100, 101, 150, 250, 500, 1000];

function row(equity, price, label) {
  const safety = assessRealLot({ lot: CFG.lot, price, contractSize: BROKER.contractSize, leverage: BROKER.leverage, equity, freeMargin: equity, spreadUsd: SIGNAL.spread, profitTargetUsd: CFG.profitTargetUsd, maximumLossUsd: CFG.maximumLossUsd, marginCallLevelPct: BROKER.marginCallLevelPct, stopOutLevelPct: BROKER.stopOutLevelPct, marginBudgetPctOfEquity: CFG.marginBudgetPctOfEquity, marginCallBufferPct: CFG.marginCallBufferPct, lotCeiling: REAL_FIXED_LOT });
  const stops = computeProtectiveStops({ side: SIGNAL.side, fillPrice: price, lot: CFG.lot, contractSize: BROKER.contractSize, digits: BROKER.digits, profitTargetUsd: CFG.profitTargetUsd, maximumLossUsd: CFG.maximumLossUsd, structuralStop: SIGNAL.engine_sl, plannedEntry: SIGNAL.engine_entry, structuralMultiple: CFG.brokerStructuralSlMultiple, spread: SIGNAL.spread, stopsLevelPrice: 0 });
  const geom = evaluateExecutableGeometry({ side: SIGNAL.side, price, engineSl: SIGNAL.engine_sl, engineTp2: SIGNAL.engine_tp2, minRr: CFG.minEffectiveRr });
  const structuralLossUsd = Math.round((SIGNAL.engine_entry - SIGNAL.engine_sl) * 100) / 100; // 1 USD per 1.00 move at 0.01 lot
  const brokerSlLossUsd = stops.lossDistance ?? null;
  const drift = Math.round((price - SIGNAL.engine_entry) * 100) / 100;
  // Broker-side check (Exness): order accepted when free margin >= required margin; margin call at 60 %, stop-out at 0 %.
  const brokerMarginGate = safety.margin_required_usd <= equity ? 'PASS' : 'FAIL';
  return {
    label, equity, price, margin_required_usd: safety.margin_required_usd, free_margin_after_entry_usd: Math.round((equity - safety.margin_required_usd) * 100) / 100,
    structural_loss_usd: structuralLossUsd, structural_risk_pct_of_equity: Math.round((structuralLossUsd / equity) * 10000) / 100,
    broker_sl_loss_usd: brokerSlLossUsd, broker_sl_risk_pct_of_equity: brokerSlLossUsd != null ? Math.round((brokerSlLossUsd / equity) * 10000) / 100 : null, broker_sl_basis: stops.sl_basis ?? null,
    policy_max_loss_usd: CFG.maximumLossUsd, policy_max_loss_pct_of_equity: Math.round((50 / equity) * 10000) / 100,
    equity_at_policy_max_loss: safety.equity_at_max_loss, margin_level_at_policy_max_loss_pct: safety.margin_level_at_max_loss_pct, margin_pct_of_equity: safety.margin_pct_of_equity,
    software_capital_gate: safety.executable ? 'PASS' : 'FAIL (MARGIN_SAFETY_VETO)', software_gate_reasons: safety.reasons,
    broker_margin_gate: brokerMarginGate, drift_vs_plan_usd: drift, drift_gate: Math.abs(drift) <= CFG.maxEntryDriftUsd ? 'PASS' : `FAIL (${Math.abs(drift)} > ${CFG.maxEntryDriftUsd})`,
    executable_geometry: geom.valid ? `PASS (rr ${geom.rr})` : `FAIL (${geom.reason})`,
  };
}

const table = {}; for (const [k, price] of Object.entries(PRICES)) table[k] = EQUITIES.map((e) => row(e, price, k));
// Exact thresholds of the software gate (equity E, margin m = price*100*lot/leverage):
//   margin_level_at_max_loss >= 100  <=> E >= |maxLoss| + m
//   margin_level_at_max_loss >= marginCall + buffer (70) <=> E >= |maxLoss| + 0.70 m
//   margin_pct <= 50 <=> E >= 2 m ; equity_at_max_loss > 0 <=> E > |maxLoss|
const thresholds = Object.fromEntries(Object.entries(PRICES).map(([k, price]) => { const m = (price * BROKER.contractSize * CFG.lot) / BROKER.leverage; return [k, { margin_required_usd: Math.round(m * 100) / 100, min_equity_for_margin_level_100: Math.round((50 + m) * 100) / 100, min_equity_for_margin_call_buffer_70: Math.round((50 + 0.7 * m) * 100) / 100, min_equity_for_margin_budget_50pct: Math.round(2 * m * 100) / 100, min_equity_positive_at_max_loss: 50.01, binding_minimum_equity: Math.round((50 + m) * 100) / 100 }]; }));
// Live-record reproduction (arithmetic must match what the executor logged):
const repro = [
  { record: '2026-09-30T17:36:37Z SKIPPED MARGIN_SAFETY_VETO a2422991', expect: { margin_required_usd: 20.76, margin_level_at_max_loss_pct: 58.14 }, got: assessRealLot({ lot: 0.01, price: 4152.311, contractSize: 100, leverage: 200, equity: 62.07, freeMargin: 62.07, spreadUsd: 0.24, profitTargetUsd: 30, maximumLossUsd: -50, marginCallLevelPct: 60, stopOutLevelPct: 0, marginBudgetPctOfEquity: 50, marginCallBufferPct: 10 }) },
  { record: '2026-09-30T17:56:38Z SKIPPED MARGIN_SAFETY_VETO 3f6638f5', expect: { margin_required_usd: 20.75, margin_level_at_max_loss_pct: 58.17 }, got: assessRealLot({ lot: 0.01, price: 4150.026, contractSize: 100, leverage: 200, equity: 62.07, freeMargin: 62.07, spreadUsd: 0.24, profitTargetUsd: 30, maximumLossUsd: -50, marginCallLevelPct: 60, stopOutLevelPct: 0, marginBudgetPctOfEquity: 50, marginCallBufferPct: 10 }) },
  { record: '2026-09-25T11:02:00Z INTENT/OPENED 0df32f7b (executed at equity 71.94)', expect: { margin_required_usd: 21.55, margin_level_at_max_loss_pct: 101.79, executable: true }, got: assessRealLot({ lot: 0.01, price: 4310.843, contractSize: 100, leverage: 200, equity: 71.94, freeMargin: 71.94, spreadUsd: 0.26, profitTargetUsd: 30, maximumLossUsd: -50, marginCallLevelPct: 60, stopOutLevelPct: 0, marginBudgetPctOfEquity: 50, marginCallBufferPct: 10 }) },
];
const out = { generated_at: new Date().toISOString(), config: CFG, broker: BROKER, signal: SIGNAL, thresholds, table, live_record_reproduction: repro };
writeFileSync(join(OUT, 'capital_counterfactual.json'), JSON.stringify(out, null, 1));
for (const [k, rows] of Object.entries(table)) { console.log(`\n== ${k} (price ${PRICES[k]}) ==`); for (const r of rows) console.log(`E=${String(r.equity).padStart(7)} margin=${r.margin_required_usd} free_after=${r.free_margin_after_entry_usd} structLoss=${r.structural_loss_usd} (${r.structural_risk_pct_of_equity}%) brokerSL=${r.broker_sl_loss_usd} (${r.broker_sl_risk_pct_of_equity}%) mlvl@-50=${r.margin_level_at_policy_max_loss_pct}% gate=${r.software_capital_gate} ${r.software_gate_reasons.join('|')} broker=${r.broker_margin_gate} drift=${r.drift_gate} geom=${r.executable_geometry}`); }
console.log('\nTHRESHOLDS', JSON.stringify(thresholds));
for (const r of repro) console.log('REPRO', r.record, 'expect', JSON.stringify(r.expect), 'got', JSON.stringify({ margin_required_usd: r.got.margin_required_usd, margin_level_at_max_loss_pct: r.got.margin_level_at_max_loss_pct, executable: r.got.executable, reasons: r.got.reasons }));
