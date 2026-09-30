/**
 * CAPITAL HARVEST V1 -- pure simulation primitives (RESEARCH ONLY; no execution imports; no I/O).
 * Spec: research/capital_harvest_v1/PREREGISTRATION.md. Every function is deterministic and side-effect free.
 */
export const COSTS = Object.freeze({ normal: { spread: 0.24, slip: 0.10 }, stress: { spread: 0.60, slip: 0.20 } });
export const SWAP_LONG_PER_NIGHT_USD = 0.56; // Exness XAUUSDm, 0.01 lot, read 2026-09-30
export const EQUITY_REF_USD = 62.07;
export const MARGIN_0_01_LOT_USD = 20.81;
export const HORIZON_BARS = 288;
export const GAP_SECONDS = 3 * 3600;

export function capitalRisk({ entry, sl, equity = EQUITY_REF_USD, spread = COSTS.normal.spread, slip = COSTS.normal.slip }) {
  const stopDistance = Math.abs(entry - sl);
  const expectedLossUsd = stopDistance + spread + slip; // 0.01 lot = 1 oz => 1 USD per 1.00 move
  const pct = expectedLossUsd / equity;
  const band = pct <= 0.01 ? '<=1%' : pct <= 0.02 ? '1-2%' : pct <= 0.03 ? '2-3%' : pct <= 0.05 ? '3-5%' : pct <= 0.08 ? '5-8%' : '>8%';
  return { stopDistance: r3(stopDistance), expectedLossUsd: r3(expectedLossUsd), pctEquity: r4(pct), band, tooHighAbove5pct: pct > 0.05 };
}

export function updateFloor(prevFloor, candidate) { // monotone: never decreases
  if (prevFloor == null) return candidate;
  return candidate > prevFloor ? candidate : prevFloor;
}

export function canReenter({ signal, exitBar, lastTrade, lastExitWasLoss }) {
  if (exitBar != null && signal.i <= exitBar) return { ok: false, reason: 'SAME_OR_EARLIER_CANDLE' };
  if (lastTrade && signal.model === lastTrade.model && signal.side === lastTrade.side && Math.round(signal.anchor * 100) === Math.round(lastTrade.anchor * 100) && signal.i - lastTrade.i <= 12) return { ok: false, reason: 'STALE_SAME_SETUP' };
  if (lastExitWasLoss && lastTrade && signal.side === lastTrade.side && exitBar != null && signal.i - exitBar <= 3) return { ok: false, reason: 'REVENGE_GUARD' };
  return { ok: true };
}

/** Continuation evidence at the milestone bar j (uses bars <= j only). STRONG iff >= 2 of 3. */
export function continuationEvidence({ bars, j, side, atrEntry }) {
  const b = bars[j], p = bars[j - 1];
  const e1 = side === 'BUY' ? b.close > b.open : b.close < b.open;
  const e2 = p ? (side === 'BUY' ? b.close > p.high : b.close < p.low) : false;
  const e3 = (b.high - b.low) >= atrEntry;
  const n = [e1, e2, e3].filter(Boolean).length;
  return { e1, e2, e3, n, strong: n >= 2 };
}

/**
 * Simulate one trade. `variant`: { kind: 'FIXED'|'RUN'|'TRAIL', m1: {usd|r|atr}, buffer: {usd|atr}, bankRun: bool }
 * `oppSignalBars`: sorted array of bar indices where an opposite-side production signal occurred (thesis rule C proxy).
 */
export function simulateTrade({ bars, i, side, entry, sl, atr, tp1Dist, variant, oppSignalBars = [], costs = COSTS.normal, drift = false, horizon = HORIZON_BARS, swapLong = SWAP_LONG_PER_NIGHT_USD }) {
  const sp = costs.spread, slip = costs.slip; const sgn = side === 'BUY' ? 1 : -1;
  let fill = side === 'BUY' ? entry + sp : entry; let start = i + 1;
  if (drift) { if (i + 1 >= bars.length) return { status: 'NO_DATA' }; fill = side === 'BUY' ? bars[i + 1].open + sp : bars[i + 1].open; start = i + 2; }
  const risk = Math.abs(entry - sl); if (!(risk > 0)) return { status: 'INVALID' };
  const m1 = variant.m1.usd != null ? variant.m1.usd : variant.m1.r != null ? variant.m1.r * risk : variant.m1.atr != null ? variant.m1.atr * atr : variant.m1.tp1 ? tp1Dist : null;
  const buf = variant.buffer ? (variant.buffer.usd != null ? variant.buffer.usd : variant.buffer.atr * atr) : null;
  const FLOOR_MIN = 0.50;
  let mfe = 0, mae = 0, floor = null, reached = null, decision = null, exit = null, exitBar = null, gap = false, nights = 0, ratchetViolations = 0;
  const end = Math.min(bars.length - 1, i + horizon);
  let oppIdx = 0; while (oppIdx < oppSignalBars.length && oppSignalBars[oppIdx] <= i) oppIdx++;
  for (let j = start; j <= end; j++) {
    const b = bars[j]; if (b.time - bars[j - 1].time > GAP_SECONDS) gap = true;
    if (side === 'BUY' && Math.floor(b.time / 86400) !== Math.floor(bars[j - 1].time / 86400)) nights++;
    const fav = side === 'BUY' ? b.high - fill : fill - (b.low + sp);
    const adv = side === 'BUY' ? fill - b.low : (b.high + sp) - fill;
    // 1) protected floor touch (floor as it stood at the previous close); touching it banks `floor`
    if (floor != null && (side === 'BUY' ? b.low <= fill + floor : (b.high + sp) >= fill - floor)) { exit = { kind: floor >= m1 ? 'RATCHET_BANK' : 'PROTECTED_BANK', pnl: floor - slip }; exitBar = j; break; }
    // 2) structural stop (before any milestone / with no floor)
    if (floor == null && (side === 'BUY' ? b.low <= sl : (b.high + sp) >= sl)) { exit = { kind: 'STRUCTURAL_STOP', pnl: -(Math.abs(fill - sl)) - slip }; exitBar = j; break; }
    if (fav > mfe) mfe = fav; if (adv > mae) mae = adv;
    // 3) milestone
    if (reached == null && m1 != null && mfe >= m1) {
      reached = j;
      if (variant.kind === 'FIXED') { exit = { kind: 'MILESTONE_BANK', pnl: m1 - slip }; exitBar = j; break; }
      if (variant.kind === 'RUN') {
        const ev = continuationEvidence({ bars, j, side, atrEntry: atr });
        decision = variant.bankRun ? (ev.strong ? 'RUN' : 'BANK') : 'RUN'; decision = { choice: decision, ...ev };
        if (decision.choice === 'BANK') { exit = { kind: 'MILESTONE_BANK', pnl: m1 - slip }; exitBar = j; break; }
        const pnlClose = sgn * ((side === 'BUY' ? b.close : b.close + sp) - fill);
        if (pnlClose <= FLOOR_MIN) { exit = { kind: 'PROTECTED_BANK_AT_CLOSE', pnl: pnlClose - slip }; exitBar = j; break; } // the spec floor would sit above market: bank at the close instead
        floor = Math.min(Math.max(FLOOR_MIN, m1 - buf), pnlClose); // a protective stop can never be above the current price
        // the floor takes effect from the NEXT bar (PREREGISTRATION §4)
      }
      if (variant.kind === 'TRAIL') { decision = { choice: 'RUN' }; const p = bars[j - 1]; const trail = side === 'BUY' ? Math.min(b.low, p.low) - fill : fill - Math.max(b.high, p.high) - sp; const pnlClose = sgn * ((side === 'BUY' ? b.close : b.close + sp) - fill); if (pnlClose <= FLOOR_MIN) { exit = { kind: 'PROTECTED_BANK_AT_CLOSE', pnl: pnlClose - slip }; exitBar = j; break; } floor = Math.min(Math.max(FLOOR_MIN, trail), pnlClose); }
    }
    // 4) ratchet at bar close (monotone)
    if (floor != null && exit == null) {
      const pnlClose = sgn * ((side === 'BUY' ? b.close : b.close + sp) - fill);
      let cand = floor;
      if (variant.kind === 'RUN') cand = Math.max(floor, Math.min(mfe - buf, pnlClose)); // stop never above market
      if (variant.kind === 'TRAIL') { const p = bars[j - 1]; const trail = side === 'BUY' ? Math.min(b.low, p.low) - fill : fill - Math.max(b.high, p.high) - sp; cand = Math.max(floor, Math.min(trail, pnlClose)); }
      const nf = updateFloor(floor, cand); if (nf < floor) ratchetViolations++; floor = nf;
    }
    // 5) governed early thesis exit: opposite production signal at this candle
    while (oppIdx < oppSignalBars.length && oppSignalBars[oppIdx] < j) oppIdx++;
    if (oppIdx < oppSignalBars.length && oppSignalBars[oppIdx] === j) { const px = side === 'BUY' ? b.close : b.close + sp; exit = { kind: 'OPPOSITE_SIGNAL', pnl: sgn * (px - fill) - slip }; exitBar = j; break; }
  }
  let status = 'RESOLVED';
  if (!exit) { if (end < i + horizon) return { status: 'NO_DATA' }; status = 'OPEN_AT_HORIZON'; const px = side === 'BUY' ? bars[end].close : bars[end].close + sp; exit = { kind: 'HORIZON', pnl: sgn * (px - fill) - slip }; exitBar = end; }
  const swap = side === 'BUY' ? nights * swapLong : 0;
  const pnl = exit.pnl - swap;
  return { status, gap, exit: exit.kind, exitBar, bars: exitBar - i, pnl_usd: r3(pnl), r: r3(pnl / risk), risk_usd: r3(risk), mfe_usd: r3(mfe), mae_usd: r3(mae), m1_usd: r3(m1), reached_bar: reached == null ? null : reached - i, decision: decision?.choice ?? null, evidence: decision ? { e1: decision.e1, e2: decision.e2, e3: decision.e3 } : null, final_floor: floor == null ? null : r3(floor), given_back: reached == null ? null : r3(mfe - pnl), swap_usd: r3(swap), cost_usd: r3(sp + slip + swap), ratchetViolations, fill: r3(fill) };
}

export function applyRoundTripCost(grossUsd, costs = COSTS.normal) { return grossUsd - costs.spread - costs.slip; }
function r3(n) { return n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000; }
function r4(n) { return n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000; }
