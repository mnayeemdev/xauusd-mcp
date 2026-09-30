/**
 * CAPITAL HARVEST MASTER -- deterministic position-management state machine (PURE functions).
 *
 *   OPEN_UNPROTECTED -> PROFIT_AVAILABLE -> (HARVEST | PROTECTED -> PROTECTED_RUN -> HARVEST) -> CLOSED
 *                    -> THESIS_EXIT (deterioration / invalidation) -> CLOSED
 *   fail-safe: the broker protective SL (structural x 1.5 + spread) is hit intrabar and is NEVER widened.
 *
 * Every decision is taken at a COMPLETED 5m close with bars <= that close only; a protective floor
 * takes effect from the NEXT bar; the floor is monotone (never lowered) and never above the market
 * (capped at the close-based P&L). Costs (spread, slippage, swap) are part of every P&L figure.
 * Spec: research/capital_harvest_master/PREREGISTRATION.md (sections 5-7). The SAME code path is
 * used by the historical study and by any future CAPITAL_HARVEST_SHADOW; it is NOT wired into
 * REAL execution and refuses the DEMO/REAL modes until an owner-approved promotion.
 */
export const CH_MODES = Object.freeze(['CONTROL', 'CAPITAL_HARVEST_SHADOW', 'CAPITAL_HARVEST_DEMO', 'CAPITAL_HARVEST_REAL']);
export function resolveCapitalHarvestMode(env = {}) {
  const m = String(env.XAUUSD_CAPITAL_HARVEST_MODE ?? 'CONTROL');
  if (!CH_MODES.includes(m)) throw new Error(`XAUUSD_CAPITAL_HARVEST_MODE must be one of ${CH_MODES.join('|')}`);
  if (m === 'CAPITAL_HARVEST_DEMO' || m === 'CAPITAL_HARVEST_REAL') throw new Error(`${m} is not enabled: it requires forward-shadow evidence, DEMO validation and explicit owner approval (REAL_PROMOTION_SPEC.md). Only CONTROL and CAPITAL_HARVEST_SHADOW exist in this build.`);
  return m;
}

export const STATES = Object.freeze(['OPEN_UNPROTECTED', 'PROFIT_AVAILABLE', 'PROTECTED', 'PROTECTED_RUN', 'HARVEST', 'THESIS_EXIT', 'CLOSED']);
export const LOSS_STATES = Object.freeze(['NORMAL_RISK', 'THESIS_DETERIORATING', 'THESIS_INVALIDATED', 'EXIT']);
export const COSTS = Object.freeze({ normal: { spread: 0.24, slip: 0.10 }, stress: { spread: 0.60, slip: 0.20 } });
export const SWAP_LONG_PER_NIGHT_USD = 0.56;
export const HORIZON_BARS = 288;
export const GAP_SECONDS = 3 * 3600;

/** Frozen candidate family (PREREGISTRATION section 5). */
export const MANAGEMENT_CANDIDATES = Object.freeze({
  RUN_TO_END: { kind: 'PASSIVE' }, // counterfactual only: thesis invalidation + broker SL + horizon
  CH_A: { kind: 'PROD_LIKE', monetaryTargetUsd: 30, profitProtectMinR: 1.0, profitProtectRetrace: 0.5 },
  CH_B: { kind: 'BANK', triggerR: 1.0 },
  CH_C: { kind: 'RUN', triggerR: 1.0, bufferAtr: 0.5, minFloorR: 0.2 },
  CH_D1: { kind: 'ADAPTIVE', triggerR: 0.75, bufferAtr: 0.5, minFloorR: 0.2, weakClosesToHarvest: 2, rewardCompressionAtr: 0.5 },
  CH_D2: { kind: 'ADAPTIVE', triggerR: 1.0, bufferAtr: 0.5, minFloorR: 0.2, weakClosesToHarvest: 2, rewardCompressionAtr: 0.5 },
  CH_D3: { kind: 'ADAPTIVE', triggerR: 0.75, bufferAtr: 1.0, minFloorR: 0.2, weakClosesToHarvest: 2, rewardCompressionAtr: 0.5 },
});
export const LOSS_CONTROL = Object.freeze({ deteriorationBars: 3, deteriorationMinAdverseR: 0.5, structuralMultiple: 1.5, adverseBreakLookback: 6 });

const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);

/** Continuation evidence at completed bar j (PREREGISTRATION section 7). STRONG iff >= 2 of 3. */
export function continuationEvidence({ bar, prev, side, atrEntry }) {
  const e1 = side === 'BUY' ? bar.close > bar.open : bar.close < bar.open;
  const e2 = prev ? (side === 'BUY' ? bar.close > prev.high : bar.close < prev.low) : false;
  const e3 = bar.high - bar.low >= atrEntry;
  const n = [e1, e2, e3].filter(Boolean).length;
  return { e1, e2, e3, n, strong: n >= 2 };
}

/** Adverse 6-bar break: close beyond the adverse extreme of the previous `lookback` completed bars. */
export function adverseBreak({ bars, j, side, lookback = LOSS_CONTROL.adverseBreakLookback }) {
  const from = Math.max(0, j - lookback);
  if (j - from < 2) return false;
  let ext = side === 'BUY' ? Infinity : -Infinity;
  for (let k = from; k < j; k++) ext = side === 'BUY' ? Math.min(ext, bars[k].low) : Math.max(ext, bars[k].high);
  return side === 'BUY' ? bars[j].close < ext : bars[j].close > ext;
}

/** Monotone floor: never decreases. */
export function ratchetFloor(prevFloor, candidate) { return prevFloor == null ? candidate : Math.max(prevFloor, candidate); }

/** Re-entry guard (PREREGISTRATION section 8). */
export function canReenter({ signal, exitBar, lastTrade, lastExitWasLoss }) {
  if (exitBar != null && signal.i <= exitBar) return { ok: false, reason: 'SAME_OR_EARLIER_CANDLE' };
  if (lastTrade && signal.model === lastTrade.model && signal.side === lastTrade.side && Math.round(signal.anchor * 100) === Math.round(lastTrade.anchor * 100) && signal.i - lastTrade.i <= 12) return { ok: false, reason: 'STALE_SAME_SETUP' };
  if (lastExitWasLoss && lastTrade && signal.side === lastTrade.side && exitBar != null && signal.i - exitBar <= 3) return { ok: false, reason: 'REVENGE_GUARD' };
  return { ok: true };
}

/**
 * Initial position state (serialisable; a restart resumes from it deterministically).
 * `fill` already includes the entry spread for BUY. `entryBarExtreme` = signal bar low (BUY) / high (SELL).
 */
export function initPosition({ side, fill, sl, atr, tp2Dist = null, entryBarExtreme, entryIdx, spread, params, monetaryMaxLossUsd = null, plannedEntry = null }) {
  const structural = Math.abs(fill - sl); // R unit: structural distance from the FILL (production initial_structural_risk)
  // Broker protective SL exactly as production computeProtectiveStops(): planned-entry structural distance x 1.5 + spread, measured from the fill.
  const plannedDistance = Math.abs((plannedEntry ?? fill) - sl);
  const brokerSlDistance = Math.min(plannedDistance * LOSS_CONTROL.structuralMultiple + spread, monetaryMaxLossUsd ?? Infinity);
  return { side, fill, sl, atr, tp2Dist, entryBarExtreme, entryIdx, risk: structural, brokerSlDistance, state: 'OPEN_UNPROTECTED', lossState: 'NORMAL_RISK', floor: null, mfe: 0, mae: 0, triggerBar: null, decision: null, weakCloses: 0, adverseCloses: 0, ratchetViolations: 0, nights: 0, gap: false, params, closed: null, bars: 0, secured: 0 };
}

/**
 * One completed bar. Returns the NEXT state and an audit record. Order inside the bar:
 *   1. protective floor touch (intrabar, floor as it stood at the previous close)  2. broker protective SL (intrabar)
 *   3. monetary target (PROD_LIKE, intrabar)  4. MFE/MAE update  5. close-based logic (thesis invalidation, deterioration,
 *   profit-available / harvest / protect / ratchet / run re-evaluation).
 */
export function stepPosition(pos, { bars, j, costs = COSTS.normal }) {
  if (pos.closed) return { pos, audit: null };
  const b = bars[j], prev = bars[j - 1];
  const sp = costs.spread, slip = costs.slip, side = pos.side, sgn = side === 'BUY' ? 1 : -1;
  const p = { ...pos, bars: pos.bars + 1 };
  if (prev && b.time - prev.time > GAP_SECONDS) p.gap = true;
  if (side === 'BUY' && prev && Math.floor(b.time / 86400) !== Math.floor(prev.time / 86400)) p.nights++;
  const fav = side === 'BUY' ? b.high - p.fill : p.fill - (b.low + sp);
  const adv = side === 'BUY' ? p.fill - b.low : (b.high + sp) - p.fill;
  const pnlClose = sgn * ((side === 'BUY' ? b.close : b.close + sp) - p.fill);
  const close = (kind, pnl, reason, extra = {}) => { p.closed = { kind, pnl: r3(pnl - (side === 'BUY' ? p.nights * SWAP_LONG_PER_NIGHT_USD : 0)), grossPnl: r3(pnl), exitBar: j, reason }; p.state = kind === 'BROKER_SL' || kind === 'THESIS_INVALIDATION' || kind === 'THESIS_DETERIORATION' ? (kind === 'BROKER_SL' ? 'CLOSED' : 'THESIS_EXIT') : kind.startsWith('HARVEST') || kind === 'FLOOR_BANK' ? 'HARVEST' : 'CLOSED'; return { pos: { ...p, state: 'CLOSED', lastState: p.state, lossState: kind === 'BROKER_SL' || kind.startsWith('THESIS') ? 'EXIT' : p.lossState }, audit: { j, action: 'CLOSE', kind, reason, pnl: p.closed.pnl, mfe: r3(p.mfe), mae: r3(p.mae), floor: r3(p.floor), ...extra } }; };

  // 1. protective floor touch (floor active from the previous close)
  if (p.floor != null && (side === 'BUY' ? b.low <= p.fill + p.floor : (b.high + sp) >= p.fill - p.floor)) return close('FLOOR_BANK', p.floor - slip, 'PROTECTED_FLOOR_TOUCHED');
  // 2. broker protective SL (fail-safe; never widened)
  if (p.floor == null && adv >= p.brokerSlDistance) return close('BROKER_SL', -p.brokerSlDistance - slip, 'BROKER_PROTECTIVE_SL');
  // 3. monetary target (production-like only)
  if (p.params.kind === 'PROD_LIKE' && p.params.monetaryTargetUsd != null && fav >= p.params.monetaryTargetUsd) return close('MONETARY_TARGET', p.params.monetaryTargetUsd - slip, 'MONETARY_PROFIT_TARGET');
  // 4. excursions
  if (fav > p.mfe) p.mfe = fav; if (adv > p.mae) p.mae = adv;

  // 5a. thesis invalidation (confirmed close beyond the structural stop) -- all states without an active floor
  if (p.floor == null && (side === 'BUY' ? b.close < p.sl : b.close > p.sl)) { p.lossState = 'THESIS_INVALIDATED'; return close('THESIS_INVALIDATION', pnlClose - slip, 'CONFIRMED_CLOSE_BEYOND_STRUCTURAL_STOP'); }
  // 5b. deterioration (before profit is available)
  if (p.floor == null && p.state === 'OPEN_UNPROTECTED' && p.params.kind !== 'PASSIVE') {
    const adverseClose = prev ? (side === 'BUY' ? b.close < prev.close : b.close > prev.close) : false;
    p.adverseCloses = adverseClose ? p.adverseCloses + 1 : 0;
    const beyondEntryBar = side === 'BUY' ? b.close < p.entryBarExtreme : b.close > p.entryBarExtreme;
    if (p.adverseCloses >= LOSS_CONTROL.deteriorationBars && pnlClose <= -LOSS_CONTROL.deteriorationMinAdverseR * p.risk && beyondEntryBar) { p.lossState = 'THESIS_DETERIORATING'; return close('THESIS_DETERIORATION', pnlClose - slip, 'THREE_ADVERSE_CLOSES_BEYOND_HALF_R_AND_ENTRY_BAR'); }
    if (pnlClose < 0 && p.adverseCloses >= 2) p.lossState = 'RISK_REDUCED'; else if (pnlClose >= 0) p.lossState = 'NORMAL_RISK';
  }
  const K = p.params;
  // 5c. production-like profit protection
  if (K.kind === 'PROD_LIKE') {
    const progressR = p.mfe / p.risk; const retrace = p.mfe > 0 ? (p.mfe - pnlClose) / p.mfe : 0;
    if (progressR >= K.profitProtectMinR && pnlClose > 0 && (retrace >= K.profitProtectRetrace || adverseBreak({ bars, j, side }))) return close('HARVEST_PROD_PROTECT', pnlClose - slip, retrace >= K.profitProtectRetrace ? 'RETRACE_GE_HALF_OF_BEST' : 'ADVERSE_6BAR_BREAK');
    return { pos: p, audit: { j, action: 'HOLD', state: p.state, pnlClose: r3(pnlClose), mfe: r3(p.mfe) } };
  }
  if (K.kind === 'PASSIVE') return { pos: p, audit: { j, action: 'HOLD', state: p.state } };
  const T = K.triggerR * p.risk;
  // 5d. profit available -> HARVEST / PROTECT
  if (p.state === 'OPEN_UNPROTECTED' && p.mfe >= T) {
    p.state = 'PROFIT_AVAILABLE'; p.triggerBar = j;
    if (K.kind === 'BANK') return close('HARVEST_BANK', pnlClose - slip, 'FIRST_CLOSE_AFTER_TRIGGER');
    let strong = true, ev = null;
    if (K.kind === 'ADAPTIVE') { ev = continuationEvidence({ bar: b, prev, side, atrEntry: p.atr }); strong = ev.strong; p.decision = strong ? 'RUN' : 'BANK'; p.evidence = { e1: ev.e1, e2: ev.e2, e3: ev.e3 }; }
    if (!strong) return close('HARVEST_WEAK_CONTINUATION', pnlClose - slip, `WEAK_EVIDENCE_${ev.n}_OF_3`, { decision: 'BANK' });
    const cand = Math.min(Math.max(K.minFloorR * p.risk, p.mfe - K.bufferAtr * p.atr), pnlClose);
    if (cand <= K.minFloorR * p.risk) return close('HARVEST_FLOOR_UNREALISTIC', pnlClose - slip, 'FLOOR_WOULD_BE_AT_OR_BELOW_MIN_FLOOR', { decision: p.decision ?? 'RUN' });
    p.floor = cand; p.secured = cand; p.state = 'PROTECTED'; p.weakCloses = 0;
    return { pos: p, audit: { j, action: 'PROTECT', state: p.state, floor: r3(p.floor), pnlClose: r3(pnlClose), mfe: r3(p.mfe), evidence: p.evidence ?? null, decision: p.decision ?? 'RUN' } };
  }
  // 5e. protected run: ratchet, then re-evaluate continuation (ADAPTIVE)
  if (p.floor != null) {
    p.state = 'PROTECTED_RUN';
    const cand = Math.max(p.floor, Math.min(p.mfe - K.bufferAtr * p.atr, pnlClose));
    const nf = ratchetFloor(p.floor, cand); if (nf < p.floor) p.ratchetViolations++; p.floor = nf; p.secured = nf;
    if (K.kind === 'ADAPTIVE') {
      if (adverseBreak({ bars, j, side })) return close('HARVEST_ADVERSE_BREAK', pnlClose - slip, 'ADVERSE_6BAR_BREAK_IN_RUN', { decision: 'RUN' });
      const ev = continuationEvidence({ bar: b, prev, side, atrEntry: p.atr });
      p.weakCloses = ev.strong ? 0 : p.weakCloses + 1;
      if (p.weakCloses >= K.weakClosesToHarvest) return close('HARVEST_CONTINUATION_WEAKENED', pnlClose - slip, `${p.weakCloses}_CONSECUTIVE_WEAK_CLOSES`, { decision: 'RUN' });
      if (p.tp2Dist != null && p.tp2Dist - pnlClose < K.rewardCompressionAtr * p.atr && pnlClose > 0) return close('HARVEST_REWARD_COMPRESSED', pnlClose - slip, 'REMAINING_REWARD_LT_HALF_ATR', { decision: 'RUN' });
    }
    return { pos: p, audit: { j, action: 'RATCHET', state: p.state, floor: r3(p.floor), pnlClose: r3(pnlClose), mfe: r3(p.mfe) } };
  }
  return { pos: p, audit: { j, action: 'HOLD', state: p.state, lossState: p.lossState, pnlClose: r3(pnlClose), mfe: r3(p.mfe), mae: r3(p.mae) } };
}

/** Price at which the protected floor sits (for a governed SL modification at runtime). */
export function floorPrice(pos, spread = COSTS.normal.spread) { if (pos.floor == null) return null; return pos.side === 'BUY' ? r3(pos.fill + pos.floor) : r3(pos.fill - pos.floor - spread); }

/** Full simulation of one trade on historical bars (research). Deterministic; no I/O. */
export function simulatePosition({ bars, i, side, entry, sl, atr, tp2Dist = null, params, costs = COSTS.normal, drift = false, horizon = HORIZON_BARS, monetaryMaxLossUsd = null, keepAudit = false }) {
  const sp = costs.spread;
  let fill = side === 'BUY' ? entry + sp : entry, start = i + 1;
  if (drift) { if (i + 1 >= bars.length) return { status: 'NO_DATA' }; fill = side === 'BUY' ? bars[i + 1].open + sp : bars[i + 1].open; start = i + 2; }
  if (!(Math.abs(entry - sl) > 0)) return { status: 'INVALID' };
  let pos = initPosition({ side, fill, sl, atr, tp2Dist, entryBarExtreme: side === 'BUY' ? bars[i].low : bars[i].high, entryIdx: i, spread: sp, params, monetaryMaxLossUsd, plannedEntry: entry });
  const end = Math.min(bars.length - 1, i + horizon); const audit = [];
  let protectBar = null, states = new Set(['OPEN_UNPROTECTED']);
  for (let j = start; j <= end; j++) {
    const r = stepPosition(pos, { bars, j, costs }); pos = r.pos; if (keepAudit && r.audit) audit.push(r.audit);
    if (r.audit?.action === 'PROTECT') protectBar = j; states.add(pos.lastState ?? pos.state);
    if (pos.closed) break;
  }
  let status = 'RESOLVED';
  if (!pos.closed) { if (end < i + horizon) return { status: 'NO_DATA' }; status = 'OPEN_AT_HORIZON'; const b = bars[end]; const px = side === 'BUY' ? b.close : b.close + sp; const pnl = (side === 'BUY' ? 1 : -1) * (px - fill) - costs.slip; pos = { ...pos, closed: { kind: 'HORIZON', pnl: r3(pnl - (side === 'BUY' ? pos.nights * SWAP_LONG_PER_NIGHT_USD : 0)), grossPnl: r3(pnl), exitBar: end, reason: 'HORIZON' } }; }
  const c = pos.closed; const swap = side === 'BUY' ? pos.nights * SWAP_LONG_PER_NIGHT_USD : 0;
  return { status, gap: pos.gap, exit: c.kind, exit_reason: c.reason, exitBar: c.exitBar, bars: c.exitBar - i, pnl_usd: c.pnl, r: r3(c.pnl / pos.risk), risk_usd: r3(pos.risk), broker_sl_usd: r3(pos.brokerSlDistance), mfe_usd: r3(pos.mfe), mae_usd: r3(pos.mae), trigger_bar: pos.triggerBar == null ? null : pos.triggerBar - i, protect_bar: protectBar == null ? null : protectBar - i, decision: pos.decision, evidence: pos.evidence ?? null, final_floor: r3(pos.floor), secured_usd: r3(pos.secured), given_back: r3(pos.mfe - c.pnl), giveback_share: pos.mfe > 0 ? r3((pos.mfe - c.pnl) / pos.mfe) : null, states: [...states], loss_state: pos.lossState, ratchetViolations: pos.ratchetViolations, swap_usd: r3(swap), cost_usd: r3(sp + costs.slip + swap), fill: r3(fill), audit: keepAudit ? audit : undefined };
}
