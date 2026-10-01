/**
 * V10 RISK + CAPITAL CONTROL -- pure risk layer (RESEARCH_ONLY; no order code; AUTO_SCALING OFF; never wired to execution).
 * Spec: ../V10_PREREGISTRATION.md. Equity -> approved risk % -> maximum cash risk -> worst-case loss per lot at the HARD broker
 * stop (1.5 x structural distance + spread + slippage allowance) -> lots rounded DOWN to the broker step -> actual risk
 * recalculated (never above the approved cash risk) -> margin control -> daily / streak / weekly controls -> ACCEPT or REJECT.
 * The structural SL is an input and is never moved; a size that cannot respect the risk is rejected, never rounded up.
 */
import { readFileSync, existsSync } from 'node:fs';

/** Reads the latest XAUUSDm symbol / account specification the production MT5 bridge recorded (no credentials are returned). */
export function loadBrokerSpec(logPath) {
  if (!existsSync(logPath)) throw new Error(`broker spec source missing: ${logPath}`);
  let best = null; for (const l of readFileSync(logPath, 'utf8').split('\n')) { if (!l.includes('"volume_step"') || !l.includes('XAUUSDm')) continue; try { const o = JSON.parse(l); best = o; } catch { /* skip */ } }
  if (!best) throw new Error('no broker specification recorded');
  const find = (o, k) => { let v; JSON.stringify(o, (key, val) => { if (key === k && v === undefined && val != null && typeof val !== 'object') v = val; return val; }); return v; };
  const spec = { symbol: 'XAUUSDm', contract_size: find(best, 'trade_contract_size'), volume_min: find(best, 'volume_min'), volume_max: find(best, 'volume_max'), volume_step: find(best, 'volume_step'), point: find(best, 'point'), digits: find(best, 'digits'), stops_level_points: find(best, 'trade_stops_level'), freeze_level_points: find(best, 'trade_freeze_level'), leverage: find(best, 'leverage'), margin_call_pct: find(best, 'margin_so_call'), margin_currency: find(best, 'currency_margin'), spread_points: find(best, 'spread'), swap_long_points: find(best, 'swap_long'), recorded_at: best.timestamp, source: 'state/xauusd_mt5_real_trade_log.jsonl (production MT5 bridge, read-only)' };
  for (const k of ['contract_size', 'volume_min', 'volume_max', 'volume_step', 'point', 'leverage']) if (!(Number(spec[k]) > 0)) throw new Error(`broker spec field missing: ${k}`);
  spec.tick_size = spec.point; spec.tick_value_per_lot = spec.point * spec.contract_size; return spec;
}

export const RISK_CANDIDATES = Object.freeze([0.001, 0.0025, 0.005, 0.0075, 0.01]);
export const MARGIN_LEVEL_BUFFER_PCT = 40; // margin level after the worst-case loss must stay >= margin call (60 %) + 40 points
const roundDown = (x, step) => Math.floor(x / step + 1e-9) * step;
const r6 = (n) => Math.round(n * 1e6) / 1e6;

/** Worst-case loss per 1.0 lot at the hard broker stop, in account currency (USD). */
export function lossPerLot({ entry, sl, spread, slipAllowance, spec }) { const structural = Math.abs(entry - sl); return (1.5 * structural + spread + slipAllowance) * spec.contract_size; }

/** Position size from equity and approved risk %. Never rounds up; rejects when the broker minimum would exceed the approved risk. */
export function sizePosition({ equity, riskPct, entry, sl, spread, slipAllowance, spec }) {
  const structural = Math.abs(entry - sl); if (!(structural > 0)) return { eligible: false, reason: 'INVALID_STRUCTURAL_SL' };
  if (!(equity > 0)) return { eligible: false, reason: 'EQUITY_EXHAUSTED' };
  const cashRisk = equity * riskPct; const lpl = lossPerLot({ entry, sl, spread, slipAllowance, spec }); const raw = cashRisk / lpl;
  let lots = r6(roundDown(raw, spec.volume_step)); if (lots > spec.volume_max) lots = spec.volume_max;
  if (lots < spec.volume_min - 1e-12) return { eligible: false, reason: 'RISK_BELOW_MIN_LOT', cash_risk: cashRisk, loss_per_lot: lpl, lots_raw: raw, min_lot_risk_pct: (spec.volume_min * lpl) / equity };
  const actual = lots * lpl; if (actual > cashRisk + 1e-9) return { eligible: false, reason: 'ACTUAL_RISK_ABOVE_APPROVED' }; // unreachable by construction; asserted in tests
  return { eligible: true, lots, lots_raw: raw, cash_risk: cashRisk, loss_per_lot: lpl, actual_risk: actual, actual_risk_pct: actual / equity, structural_distance: structural };
}

/** Margin control: required margin vs the cap, and the margin level after the worst-case loss. Margin availability is never risk permission. */
export function marginCheck({ lots, price, equity, capPct, worstLossUsd, spec }) {
  const margin = (lots * spec.contract_size * price) / spec.leverage; const pct = margin / equity; const eqAfter = equity - worstLossUsd; const levelAfter = margin > 0 ? (eqAfter / margin) * 100 : Infinity;
  const reasons = []; if (pct > capPct + 1e-12) reasons.push('MARGIN_ABOVE_CAP'); if (levelAfter < (spec.margin_call_pct ?? 60) + MARGIN_LEVEL_BUFFER_PCT) reasons.push('MARGIN_LEVEL_AFTER_LOSS_TOO_LOW'); if (!(eqAfter > 0)) reasons.push('EQUITY_EXHAUSTED_AT_STOP');
  return { margin_usd: margin, margin_pct: pct, margin_level_after_loss_pct: levelAfter, ok: reasons.length === 0, reasons };
}

// ---------------- governed capital controller (pure, serialisable) ----------------
const dayKey = (t) => new Date(t * 1000).toISOString().slice(0, 10);
export function weekKey(t) { const d = new Date(t * 1000); const day = (d.getUTCDay() + 6) % 7; const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)); return monday.toISOString().slice(0, 10); }
export function initState(equity) { return { equity, day: null, day_start_equity: equity, day_realized: 0, week: null, week_start_equity: equity, streak: 0, paused_until_after: null, halted_week: null, seen: [], open: null }; }
export const serialize = (s) => JSON.stringify(s); export const deserialize = (txt) => JSON.parse(txt);
function roll(s, t) { const d = dayKey(t), w = weekKey(t); if (s.day !== d) { s.day = d; s.day_start_equity = s.equity; s.day_realized = 0; } if (s.week !== w) { s.week = w; s.week_start_equity = s.equity; if (s.halted_week && s.halted_week !== w) s.halted_week = null; } }

/**
 * cfg: { model: 'CURRENT'|'PCT', riskPct, marginCapPct, dailyLimitPct|null, pauseAfter|null, weeklyLimitPct|null, slipAllowance, spec, assessCurrent? }
 * signal: { id, t, side, entry, sl, spread }. Returns { state, decision }. The state is never mutated in place.
 */
export function decide(state, signal, cfg) {
  const s = JSON.parse(JSON.stringify(state)); roll(s, signal.t); const rej = (reason, extra = {}) => ({ state: s, decision: { action: 'REJECT', reason, ...extra } });
  if (s.seen.includes(signal.id)) return rej('DUPLICATE_SIGNAL');
  if (s.open) return rej('POSITION_OPEN_MAX_SIMULTANEOUS_1');
  if (!(s.equity > 0)) return rej('EQUITY_EXHAUSTED');
  if (s.halted_week === s.week) return rej('WEEKLY_HALTED');
  if (s.paused_until_after && s.day <= s.paused_until_after) return rej('LOSS_STREAK_PAUSE');
  const spec = cfg.spec;
  if (cfg.model === 'CURRENT') {
    const a = cfg.assessCurrent({ lot: spec.volume_min, price: signal.entry, contractSize: spec.contract_size, leverage: spec.leverage, equity: s.equity, freeMargin: s.equity, spreadUsd: signal.spread });
    if (!a.executable) return rej('CURRENT_MARGIN_SAFETY_VETO', { veto: a.reasons });
    const lpl = lossPerLot({ entry: signal.entry, sl: signal.sl, spread: signal.spread, slipAllowance: cfg.slipAllowance, spec }); const worst = Math.min(spec.volume_min * lpl, 50 + signal.spread);
    s.seen.push(signal.id); return { state: s, decision: { action: 'ACCEPT', lots: spec.volume_min, actual_risk: worst, actual_risk_pct: worst / s.equity, cash_risk: null } };
  }
  const z = sizePosition({ equity: s.equity, riskPct: cfg.riskPct, entry: signal.entry, sl: signal.sl, spread: signal.spread, slipAllowance: cfg.slipAllowance, spec });
  if (!z.eligible) return rej(z.reason, { min_lot_risk_pct: z.min_lot_risk_pct ?? null });
  if (cfg.dailyLimitPct != null) { const cap = s.day_start_equity * cfg.dailyLimitPct; const lossSoFar = Math.max(0, -s.day_realized); if (lossSoFar >= cap - 1e-9) return rej('DAILY_LOSS_LIMIT_REACHED'); if (lossSoFar + z.actual_risk > cap + 1e-9) return rej('DAILY_CAPACITY_INSUFFICIENT'); }
  const m = marginCheck({ lots: z.lots, price: signal.entry, equity: s.equity, capPct: cfg.marginCapPct, worstLossUsd: z.actual_risk, spec });
  if (!m.ok) return rej(m.reasons[0], { margin: m });
  s.seen.push(signal.id); return { state: s, decision: { action: 'ACCEPT', lots: z.lots, cash_risk: z.cash_risk, actual_risk: z.actual_risk, actual_risk_pct: z.actual_risk_pct, margin_pct: m.margin_pct, margin_level_after_loss_pct: m.margin_level_after_loss_pct } };
}
export function openPosition(state, signal, decision) { const s = JSON.parse(JSON.stringify(state)); s.open = { id: signal.id, lots: decision.lots, planned_risk: decision.actual_risk }; return s; }
/** Settles a closed trade: equity, daily / weekly realized, streak, pause and halt. Risk of the next trade is never increased after a loss. */
export function settle(state, { pnlUsd, exitT }, cfg) {
  const s = JSON.parse(JSON.stringify(state)); s.open = null; roll(s, exitT); s.equity += pnlUsd; s.day_realized += pnlUsd;
  if (pnlUsd <= 0) s.streak += 1; else s.streak = 0;
  if (cfg.pauseAfter != null && s.streak >= cfg.pauseAfter) { s.paused_until_after = s.day; s.streak = 0; }
  if (cfg.weeklyLimitPct != null && s.equity <= s.week_start_equity * (1 - cfg.weeklyLimitPct) + 1e-9) s.halted_week = s.week;
  return s;
}

// ---------------- execution fail-safes (research decisions; nothing is executed here) ----------------
/** After a fill: if the real SL exposure (fill to the broker SL actually set) exceeds the approved cash risk beyond tolerance -> FAIL_SAFE. */
export function checkFillExposure({ lots, side, fill, brokerSl, spread, approvedCash, spec, tolerance = 0.05 }) {
  if (brokerSl == null || !Number.isFinite(brokerSl)) return { action: 'FAIL_SAFE_CLOSE', reason: 'BROKER_SL_MISSING' };
  const wrongSide = side === 'BUY' ? brokerSl >= fill : brokerSl <= fill; if (wrongSide) return { action: 'FAIL_SAFE_CLOSE', reason: 'BROKER_SL_WRONG_SIDE' };
  const exposure = (Math.abs(fill - brokerSl) + spread) * lots * spec.contract_size;
  if (exposure > approvedCash * (1 + tolerance)) return { action: 'FAIL_SAFE_CLOSE', reason: 'ACTUAL_EXPOSURE_ABOVE_APPROVED', exposure, approved: approvedCash };
  return { action: 'OK', exposure };
}
/** Periodic broker-SL audit of an open position. A missing or loosened SL fails closed; a tighter SL is accepted. */
export function auditBrokerSl({ side, expectedSl, currentSl, connected = true, marketOpen = true }) {
  if (!connected) return { action: 'NO_NEW_TRADES_RECONNECT_THEN_AUDIT', reason: 'CONNECTION_LOST' };
  if (currentSl == null) return { action: marketOpen ? 'FAIL_SAFE_CLOSE' : 'CLOSE_AT_REOPEN', reason: 'BROKER_SL_MISSING' };
  const looser = side === 'BUY' ? currentSl < expectedSl - 1e-9 : currentSl > expectedSl + 1e-9; if (looser) return { action: 'RESTORE_SL_OR_CLOSE', reason: 'BROKER_SL_LOOSENED' };
  return { action: 'OK' };
}
/** Broker rejection of an order: no retry with a different size, no state change except the audit record. */
export function onBrokerRejection(state, signal, code) { const s = JSON.parse(JSON.stringify(state)); if (!s.seen.includes(signal.id)) s.seen.push(signal.id); s.open = null; return { state: s, decision: { action: 'REJECTED_BY_BROKER', code, retry: false, size_change: false, signal: signal.id } }; }
