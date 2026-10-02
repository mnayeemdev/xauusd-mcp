/**
 * V17 RISK GATE -- pure, deterministic risk layer (RESEARCH ONLY; no order code; never wired to execution).
 * Spec: ../V17_PREREGISTRATION.md. Every step can only REJECT; nothing here can move the structural SL, change the entry, the
 * direction or RR, round a size up, cap a size silently, or raise risk after a loss. A valid entry that cannot be traded safely
 * is recorded as VALID_ENTRY + RISK_REJECTED_*.
 */
import { createHash } from 'node:crypto';
import { LOSS_CONTROL, canReenter } from '../../../src/engine/capitalHarvest/positionManager.js';
import { CAPITAL_DEFAULTS } from '../../../src/engine/capitalHarvest/riskPolicy.js';
import { REAL_DEFAULTS } from '../../../src/engine/mt5RealPolicy.js';

export const CONTRACT = 'risk-gate-v17-1';
export const RR = 1.70;
export const RULES = Object.freeze({ structuralMultiple: LOSS_CONTROL.structuralMultiple, slipAllowanceUsdOz: CAPITAL_DEFAULTS.slippage, commissionPerSideUsd: REAL_DEFAULTS.estimatedCommissionPerSideUsd, maxSpreadUsd: REAL_DEFAULTS.maxSpreadUsd, marginCapPct: CAPITAL_DEFAULTS.marginBudgetPct / 100, marginLevelBufferPct: 40, maxSimultaneous: 1, maxConsecutiveLosses: REAL_DEFAULTS.maxConsecutiveLosses, maxTradesPerDay: REAL_DEFAULTS.maxTradesPerDay, dailyLossLimitUsd: REAL_DEFAULTS.dailyLossLimitUsd });
export const RISK_CANDIDATES = Object.freeze([0.001, 0.0025, 0.005, 0.01]); // comparison scenarios only; no winner is selected
export const REJECTS = Object.freeze(['RISK_REJECTED_BROKER_DATA', 'RISK_REJECTED_EQUITY_UNAVAILABLE', 'RISK_REJECTED_SL_INVALID', 'RISK_REJECTED_INVALID_RISK', 'RISK_REJECTED_QUOTE', 'RISK_REJECTED_EXPOSURE', 'RISK_REJECTED_DUPLICATE', 'WAIT_SAFETY_BREAKER', 'RISK_PERCENTAGE_UNRESOLVED', 'RISK_REJECTED_MINIMUM_LOT', 'RISK_REJECTED_BROKER_LIMIT', 'RISK_REJECTED_INVALID_SIZE', 'RISK_REJECTED_STOPS_LEVEL', 'RISK_REJECTED_INCONSISTENT', 'MARGIN_REJECTED', 'RISK_REJECTED_SWAP_DATA']);
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

// ---------------- broker data ----------------
/** Normalized spec from the V17 read-only live capture (results/broker_spec_live.json). */
export function specFromCapture(c) {
  const s = c?.symbol ?? {}, a = c?.account ?? {};
  return { source: 'MT5 read-only capture', captured_utc: c?.captured_utc ?? null, account_mode: a.trade_mode_label ?? null, symbol: s.name ?? null, contract_size: s.trade_contract_size, tick_size: s.trade_tick_size, tick_value_per_lot: s.trade_tick_value, point: s.point, digits: s.digits,
    volume_min: s.volume_min, volume_max: s.volume_max, volume_step: s.volume_step, stops_level_points: s.trade_stops_level, freeze_level_points: s.trade_freeze_level, leverage: a.leverage, margin_call_pct: a.margin_so_call, currency_profit: s.currency_profit, account_currency: a.currency,
    swap_mode: s.swap_mode, swap_long_points: s.swap_long, swap_short_points: s.swap_short, swap_rollover3days: s.swap_rollover3days, live_spread_usd: c?.tick?.spread_usd ?? null };
}
const REQUIRED = ['contract_size', 'tick_size', 'tick_value_per_lot', 'point', 'volume_min', 'volume_max', 'volume_step', 'leverage', 'margin_call_pct', 'stops_level_points', 'freeze_level_points'];
/** Required broker data present, finite and coherent (tick value = tick size x contract size for a USD-profit symbol). */
export function validateBrokerData(spec) {
  const missing = REQUIRED.filter((k) => !fin(spec?.[k])); const invalid = [];
  for (const k of ['contract_size', 'tick_size', 'tick_value_per_lot', 'point', 'volume_min', 'volume_max', 'volume_step', 'leverage']) if (fin(spec?.[k]) && !(spec[k] > 0)) invalid.push(k);
  for (const k of ['stops_level_points', 'freeze_level_points', 'margin_call_pct']) if (fin(spec?.[k]) && spec[k] < 0) invalid.push(k);
  if (fin(spec?.volume_min) && fin(spec?.volume_max) && spec.volume_min > spec.volume_max) invalid.push('volume_min>volume_max');
  if (fin(spec?.volume_min) && fin(spec?.volume_step) && spec.volume_step > 0 && Math.abs(spec.volume_min / spec.volume_step - Math.round(spec.volume_min / spec.volume_step)) > 1e-6) invalid.push('volume_min_off_step');
  if (!missing.length && !invalid.length && (spec.currency_profit ?? 'USD') === 'USD' && Math.abs(spec.tick_value_per_lot - spec.tick_size * spec.contract_size) > 1e-9) invalid.push('tick_value_inconsistent');
  return { ok: !missing.length && !invalid.length, missing, invalid };
}
/** Swap rates in USD per oz per charged night (negative = cost); UNAVAILABLE unless the swap mode is points (1). */
export function swapRates(spec) {
  if (spec?.swap_mode !== 1 || !fin(spec?.swap_long_points) || !fin(spec?.swap_short_points) || !fin(spec?.point) || !Number.isInteger(spec?.swap_rollover3days)) return { ok: false };
  return { ok: true, long: spec.swap_long_points * spec.point, short: spec.swap_short_points * spec.point, rollover3days: spec.swap_rollover3days, mode: 'POINTS' };
}

// ---------------- swap calendar (00:00 broker time = UTC per the V15 calibration; Sat/Sun rollovers not charged; triple day x3) ----------------
export function rolloverCharges(t0, t1, rollover3days) {
  let rollovers = 0, nights = 0, triple = false; for (let m = (Math.floor(t0 / 86400) + 1) * 86400; m <= t1; m += 86400) { rollovers++; const ended = new Date((m - 86400) * 1000).getUTCDay(); if (ended === 6 || ended === 0) continue; if (ended === rollover3days) { nights += 3; triple = true; } else nights += 1; }
  return { rollovers, charged_nights: nights, triple, category: nights === 0 && rollovers === 0 ? 'INTRADAY' : triple ? 'TRIPLE_ROLLOVER' : rollovers > 0 ? 'OVERNIGHT' : 'INTRADAY' };
}
/** Sensitivity definition: the instrument's own trading-day boundaries in the broker bars (daily break / closure > 30 min). */
export function boundaryCharges(bars, i, exitBar, rollover3days) {
  let n = 0, nights = 0, triple = false; for (let j = i + 1; j <= exitBar; j++) { if (bars[j].time - bars[j - 1].time > 1800) { n++; const d = new Date(bars[j - 1].time * 1000).getUTCDay(); if (d === rollover3days) { nights += 3; triple = true; } else nights += 1; } }
  return { boundaries: n, charged_nights: nights, triple, category: n === 0 ? 'INTRADAY' : triple ? 'TRIPLE_ROLLOVER' : 'OVERNIGHT' };
}

// ---------------- sizing ----------------
/** Broker volume rules for a size: below the minimum, above the maximum (never capped) or off the step grid. null = valid. */
export function checkVolume(lots, spec) {
  if (!fin(lots)) return 'RISK_REJECTED_INVALID_SIZE'; if (lots < spec.volume_min - 1e-12) return 'RISK_REJECTED_MINIMUM_LOT'; if (lots > spec.volume_max + 1e-12) return 'RISK_REJECTED_BROKER_LIMIT';
  if (Math.abs(lots / spec.volume_step - Math.round(lots / spec.volume_step)) > 1e-6) return 'RISK_REJECTED_INVALID_SIZE'; return null;
}
export const exposurePerOz = ({ R, spread, slipAllowance = RULES.slipAllowanceUsdOz }) => RULES.structuralMultiple * R + spread + slipAllowance;
const entryKey = (e) => ({ id: e.id ?? null, side: e.side, model: e.model ?? null, entry: e.entry, sl: e.sl, anchor: e.anchor ?? null, tp: e.tp ?? null, rr: e.rr ?? RR });
/**
 * Position size for one execution. inp: { equity, riskPct, side, execPrice, entry (engine), sl (structural), spread, spec, basis: 'PLANNED'|'ENVELOPE', maxSwapCostPerOz, usedMargin }.
 * Returns { ok, reason?, ... } -- the size is never rounded up, never capped, and the risk is recalculated after rounding.
 */
export function sizePosition(inp) {
  const { equity, riskPct, side, execPrice, entry, sl, spread, spec, basis = 'PLANNED', maxSwapCostPerOz = 0, usedMargin = 0 } = inp;
  const rej = (reason, extra = {}) => ({ ok: false, reason, ...extra });
  const bd = validateBrokerData(spec); if (!bd.ok) return rej('RISK_REJECTED_BROKER_DATA', { broker_data: bd });
  if (!fin(equity) || !(equity > 0)) return rej('RISK_REJECTED_EQUITY_UNAVAILABLE');
  if (!fin(sl) || !fin(entry) || !fin(execPrice) || (side === 'BUY' ? !(sl < entry && sl < execPrice) : side === 'SELL' ? !(sl > entry && sl > execPrice) : true)) return rej('RISK_REJECTED_SL_INVALID');
  if (!fin(riskPct) || !(riskPct > 0) || !fin(spread) || spread < 0 || !fin(maxSwapCostPerOz) || maxSwapCostPerOz < 0) return rej('RISK_REJECTED_INVALID_RISK');
  const R = Math.abs(entry - sl); const commissionPerOz = 0; // production estimate 0 per side (per-trade USD) is added below in USD
  const planned = exposurePerOz({ R, spread }) + commissionPerOz; const perOz = basis === 'ENVELOPE' ? planned + maxSwapCostPerOz : planned;
  const commissionUsd = 2 * RULES.commissionPerSideUsd;
  const cash = equity * riskPct; const lpl = perOz * spec.contract_size; const raw = (cash - commissionUsd) / lpl;
  const step = spec.volume_step; const lots = r6(Math.floor(raw / step + 1e-9) * step);
  const minLotRisk = spec.volume_min * lpl + commissionUsd;
  const vol = checkVolume(lots, spec);
  if (vol === 'RISK_REJECTED_MINIMUM_LOT') return rej(vol, { cash_risk: cash, exposure_per_oz: perOz, lots_raw: raw, min_lot_risk_usd: minLotRisk, min_lot_risk_pct: minLotRisk / equity });
  if (vol) return rej(vol, { lots, lots_raw: raw, volume_max: spec.volume_max });
  const actual = lots * lpl + commissionUsd; if (!(actual <= cash + 1e-9) || !(lots <= raw + 1e-9)) return rej('RISK_REJECTED_INCONSISTENT', { lots, actual, cash });
  const brokerDist = RULES.structuralMultiple * R + spread; if (brokerDist < spec.stops_level_points * spec.point) return rej('RISK_REJECTED_STOPS_LEVEL', { broker_distance: brokerDist });
  const marginReq = (lots * spec.contract_size * execPrice) / spec.leverage; const available = equity - usedMargin; const levelAfter = ((equity - actual) / marginReq) * 100;
  if (marginReq > available + 1e-9) return rej('MARGIN_REJECTED', { margin_reason: 'MARGIN_INSUFFICIENT', margin_required: marginReq, margin_available: available });
  if (marginReq > equity * RULES.marginCapPct + 1e-9) return rej('MARGIN_REJECTED', { margin_reason: 'MARGIN_ABOVE_CAP', margin_required: marginReq });
  if (levelAfter < spec.margin_call_pct + RULES.marginLevelBufferPct) return rej('MARGIN_REJECTED', { margin_reason: 'MARGIN_LEVEL_AFTER_LOSS_TOO_LOW', margin_level_after_loss: levelAfter });
  const brokerSl = side === 'BUY' ? execPrice - brokerDist : execPrice + brokerDist; const tp = side === 'BUY' ? execPrice + RR * Math.abs(execPrice - sl) : execPrice - RR * Math.abs(execPrice - sl);
  return { ok: true, basis, lots, lots_raw: raw, cash_risk: cash, exposure_per_oz: perOz, planned_exposure_per_oz: planned, actual_stop_exposure: actual, actual_risk_pct: actual / equity, R, structural_sl: sl, broker_sl: brokerSl, entry_price: execPrice, tp_170: tp, rr: Math.abs(tp - execPrice) / Math.abs(execPrice - sl), margin_required: marginReq, margin_level_after_loss: levelAfter, commission_usd: commissionUsd };
}

// ---------------- decision with state (exposure, duplicates, breakers, firewall) ----------------
export function initRiskState(equity) { return { equity, open: null, seen: [], day: null, daily: { completed: 0, consecutive_losses: 0 }, walk: { exitBar: -1, last: null, lastLoss: false } }; }
const dayOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);
/** signal: { id, i, t, side, model, entry, sl, anchor, execPrice, spread, quote_ok }. cfg: { riskPct|'UNRESOLVED', spec, basis, maxSwapCostPerOz }. Pure. */
export function decideRisk(state, signal, cfg) {
  const s = JSON.parse(JSON.stringify(state)); const before = sha(entryKey(signal)); const out = (decision, extra = {}) => { const after = sha(entryKey(signal)); if (after !== before) throw new Error('entry modified by the risk layer'); return { state: s, decision: { decision, valid_entry: true, entry_hash: before, ...extra } }; };
  if (s.day !== dayOf(signal.t)) { s.day = dayOf(signal.t); s.daily = { completed: 0, consecutive_losses: 0 }; }
  if (signal.quote_ok === false) return out('RISK_REJECTED_QUOTE');
  if (s.seen.includes(signal.id)) return out('RISK_REJECTED_DUPLICATE');
  if (s.open) return out('RISK_REJECTED_EXPOSURE');
  if (s.daily.consecutive_losses >= RULES.maxConsecutiveLosses) return out('WAIT_SAFETY_BREAKER', { breaker: 'CONSECUTIVE_LOSS_LIMIT' });
  if (s.daily.completed >= RULES.maxTradesPerDay) return out('WAIT_SAFETY_BREAKER', { breaker: 'DAILY_TRADE_CEILING' });
  const re = canReenter({ signal: { i: signal.i, model: signal.model, side: signal.side, anchor: signal.anchor }, exitBar: s.walk.exitBar, lastTrade: s.walk.last, lastExitWasLoss: s.walk.lastLoss }); if (!re.ok) return out('WAIT_SAFETY_BREAKER', { breaker: re.reason });
  if (cfg.riskPct === 'UNRESOLVED' || cfg.riskPct == null) { s.seen.push(signal.id); return out('RISK_PERCENTAGE_UNRESOLVED'); }
  const z = sizePosition({ equity: s.equity, riskPct: cfg.riskPct, side: signal.side, execPrice: signal.execPrice, entry: signal.entry, sl: signal.sl, spread: signal.spread, spec: cfg.spec, basis: cfg.basis ?? 'PLANNED', maxSwapCostPerOz: cfg.maxSwapCostPerOz ?? 0, usedMargin: 0 });
  s.seen.push(signal.id); if (!z.ok) return out(z.reason, { sizing: z });
  s.open = { id: signal.id, lots: z.lots, planned: z.actual_stop_exposure, side: signal.side, model: signal.model, anchor: signal.anchor, i: signal.i };
  return out('RISK_ACCEPTED', { sizing: z });
}
/** Settlement of a closed hypothetical trade (equity, breakers, re-entry memory). Never changes the next trade's risk %. */
export function settleRisk(state, { pnlUsd, exitT, exitBar }) {
  const s = JSON.parse(JSON.stringify(state)); const pos = s.open; s.open = null; if (s.day !== dayOf(exitT)) { s.day = dayOf(exitT); s.daily = { completed: 0, consecutive_losses: 0 }; }
  s.equity += pnlUsd; s.daily.completed += 1; s.daily.consecutive_losses = pnlUsd < 0 ? s.daily.consecutive_losses + 1 : 0;
  s.walk = { exitBar, last: pos ? { i: pos.i, model: pos.model, side: pos.side, anchor: pos.anchor } : null, lastLoss: pnlUsd <= 0 }; return s;
}

// ---------------- realized-risk decomposition ----------------
/**
 * Per-trade realized components (USD, losses positive). o: { stopLossLossOz (price loss fill -> exit level incl. spread, no slippage, no gap),
 * slippageOz, gapOz, swapUsdPerOzPerNight (signed), chargedNights }, lots, spec. planned = actual stop exposure (USD).
 */
export function realizedComponents({ stopLossLossOz, slippageOz, gapOz, swapRatePerOz, chargedNights, lots, spec, planned }) {
  const k = lots * spec.contract_size; const sl = stopLossLossOz * k; const commission = 2 * RULES.commissionPerSideUsd; const swap = -(swapRatePerOz * chargedNights) * k; const slip = slippageOz * k; const gap = gapOz * k;
  const total = sl + commission + swap + slip + gap; const multiplier = planned > 0 ? total / planned : null;
  return { stop_loss_loss: sl, commission, swap, slippage: slip, gap_impact: gap, total_realized: total, risk_multiplier: multiplier, exceedance: classifyExceedance({ planned, sl, commission, swap, slip, gap, allowanceUsd: RULES.slipAllowanceUsdOz * k }) };
}
/** First component that pushes the cumulative realized loss above the planned amount (sequential attribution). */
export function classifyExceedance({ planned, sl, commission, swap, slip, gap, allowanceUsd }) {
  const tot = sl + commission + swap + slip + gap; if (tot <= planned + 1e-9) return 'WITHIN_RISK';
  let c = sl; if (c > planned + 1e-9) return 'OTHER';
  c += commission; if (c > planned + 1e-9) return 'COST_EXCEEDANCE';
  c += Math.max(0, swap); if (c > planned + 1e-9) return 'SWAP_EXCEEDANCE';
  c += Math.min(slip, allowanceUsd); if (c > planned + 1e-9) return 'COST_EXCEEDANCE';
  c += Math.max(0, slip - allowanceUsd); if (c > planned + 1e-9) return 'SLIPPAGE_EXCEEDANCE';
  c += gap; if (c > planned + 1e-9) return 'GAP_EXCEEDANCE';
  return 'OTHER';
}
export const EXCEEDANCE_CLASSES = Object.freeze(['WITHIN_RISK', 'COST_EXCEEDANCE', 'SWAP_EXCEEDANCE', 'SLIPPAGE_EXCEEDANCE', 'GAP_EXCEEDANCE', 'BROKER_ROUNDING_EXCEEDANCE', 'OTHER']);
