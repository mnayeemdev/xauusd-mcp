/**
 * TRADE ECONOMICS V5 -- pure exit-policy simulator (RESEARCH ONLY, not wired to any executor).
 * A trade: { i, side, geo: { entry, sl }, atr }. 1R = |entry - sl| (planned structural distance). Fill = entry + spread (BUY) / entry (SELL).
 * Structural stop semantics are EXIT_F's: broker fail-safe 1.5R + spread intrabar, thesis invalidation at a confirmed close beyond the stop.
 * Policies may RAISE the stop only from information in completed bars; a raised stop is a hard intrabar level from the NEXT bar on.
 * Policies: FIXED {rr} | BE {m, rr} | PARTIAL {m, protect, rr} | FLOOR {m, floor, rr} | HARVEST {arm, gap} | STRUCT_TRAIL {swingAt(j, side) -> price|null} | TIME {bars, level, rr} | OPEN {}
 */
export const MILESTONES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.7, 2, 2.5, 3];
export const DEFAULT_COSTS = { spread: 0.24, slip: 0.10 };
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);

export function normalizeTrade(e, costs = DEFAULT_COSTS) { const { entry, sl } = e.geo; const risk = Math.abs(entry - sl); const fill = e.side === 'BUY' ? entry + costs.spread : entry; return { risk, fill, sgn: e.side === 'BUY' ? 1 : -1, risk_atr: e.atr ? risk / e.atr : null }; }

/** Target price for a fixed R multiple from the planned entry (RR x structural risk). */
export const targetPrice = (e, rr) => (rr == null ? null : e.side === 'BUY' ? e.geo.entry + rr * Math.abs(e.geo.entry - e.geo.sl) : e.geo.entry - rr * Math.abs(e.geo.entry - e.geo.sl));

/**
 * Simulate one trade under a policy. bars = full confirmed bar array; the trade enters at the close of bars[e.i].
 * Returns { status, exit, exitBar, bars, r, pnl_usd, mfe_r, mae_r, mae3_r, cost_usd, cost_r, milestones{m: bar|null}, stop_bar, giveback_r, stop_raised_bar }
 */
export function simulate(bars, e, policy, costs = DEFAULT_COSTS, { horizon = 288, swapPerNight = 0.56, gapSeconds = 3 * 3600, drift = false } = {}) {
  const { side } = e; const N = bars.length; const { risk, sgn } = normalizeTrade(e, costs); if (!(risk > 0)) return { status: 'INVALID' };
  let fill = normalizeTrade(e, costs).fill, start = e.i + 1; if (drift) { if (e.i + 1 >= N) return { status: 'NO_DATA' }; fill = side === 'BUY' ? bars[e.i + 1].open + costs.spread : bars[e.i + 1].open; start = e.i + 2; }
  const sp = costs.spread, slip = costs.slip; const structural = e.geo.sl; const brokerDist = 1.5 * risk + sp; const tp = policy.tpPrice != null ? policy.tpPrice : policy.rr != null ? targetPrice(e, policy.rr) : null; const end = Math.min(N - 1, e.i + horizon);
  // favourable / adverse excursion in PRICE from the fill (SELL pays the spread on exit: adverse uses high + spread, favourable uses low + spread)
  const fav = (b) => (side === 'BUY' ? b.high - fill : fill - (b.low + sp)); const adv = (b) => (side === 'BUY' ? fill - b.low : (b.high + sp) - fill);
  let mfe = 0, mae = 0, mae3 = 0, nights = 0, gap = false, exit = null, exitBar = null, pnl = 0, raised = null, raisedBar = null; const milestones = Object.fromEntries(MILESTONES.map((m) => [m, null])); let stopBar = null;
  const closePnl = (b) => sgn * ((side === 'BUY' ? b.close : b.close + sp) - fill);
  for (let j = start; j <= end; j++) { const b = bars[j], p = bars[j - 1]; if (b.time - p.time > gapSeconds) gap = true; if (side === 'BUY' && Math.floor(b.time / 86400) !== Math.floor(p.time / 86400)) nights++;
    const a = adv(b), fv = fav(b); if (a > mae) mae = a; if (j - e.i <= 3 && a > mae3) mae3 = a;
    // 1. hard stops intrabar: raised protective stop (from an earlier bar) first, then broker fail-safe
    if (raised != null && (side === 'BUY' ? b.low <= raised : b.high + sp >= raised)) { exit = 'PROTECTED_STOP'; pnl = sgn * (raised - fill) - slip; exitBar = j; break; }
    if (a >= brokerDist) { exit = 'BROKER_SL'; pnl = -brokerDist - slip; exitBar = j; stopBar = j; break; }
    // 2. target intrabar (SL-before-TP already honoured above)
    if (tp != null && (side === 'BUY' ? b.high >= tp : (b.low + sp) <= tp)) { if (fv > mfe) mfe = fv; exit = 'TP'; pnl = Math.abs(tp - fill) - slip; exitBar = j; break; }
    if (fv > mfe) mfe = fv; for (const m of MILESTONES) if (milestones[m] == null && mfe >= m * risk) milestones[m] = j;
    // 3. close-based: thesis invalidation at the structural stop (only while the stop has not been raised above it)
    if (raised == null && (side === 'BUY' ? b.close < structural : b.close > structural)) { exit = 'THESIS_INVALIDATION'; pnl = closePnl(b) - slip; exitBar = j; stopBar = j; break; }
    if (policy.type === 'TIME' && j - e.i === policy.bars && closePnl(b) <= -policy.level * risk) { exit = 'TIME_STOP'; pnl = closePnl(b) - slip; exitBar = j; break; }
    // 4. policy stop updates from this COMPLETED bar, effective from the next bar
    let want = null; const mfeR = mfe / risk;
    if (policy.type === 'BE' && mfeR >= policy.m) want = fill + sgn * sp; // break-even incl. the spread already paid
    else if (policy.type === 'PARTIAL' && mfeR >= policy.m) want = fill - sgn * policy.protect * risk;
    else if (policy.type === 'FLOOR' && mfeR >= policy.m) want = fill + sgn * policy.floor * risk;
    else if (policy.type === 'HARVEST' && mfeR >= policy.arm) want = fill + sgn * (mfeR - policy.gap) * risk;
    else if (policy.type === 'STRUCT_TRAIL') { const sw = policy.swingAt(j, side); if (sw != null && (side === 'BUY' ? sw > fill : sw < fill)) want = sw; }
    if (want != null && (raised == null || (side === 'BUY' ? want > raised : want < raised))) { raised = want; if (raisedBar == null) raisedBar = j; } }
  let status = 'RESOLVED'; if (!exit) { if (end < e.i + horizon) return { status: 'NO_DATA' }; status = 'OPEN_AT_HORIZON'; exit = 'HORIZON'; pnl = closePnl(bars[end]) - slip; exitBar = end; }
  const swap = side === 'BUY' ? nights * swapPerNight : 0; pnl -= swap; const r = pnl / risk;
  return { status, gap, exit, exitBar, bars: exitBar - e.i, d: r3(risk), pnl_usd: r3(pnl), r: r3(r), mfe_r: r3(mfe / risk), mae_r: r3(mae / risk), mae3_r: r3(mae3 / risk), cost_usd: r3(sp + slip + swap), cost_r: r3((sp + slip + swap) / risk), milestones, stop_bar: stopBar, stop_raised_bar: raisedBar, giveback_r: mfe / risk >= 0.5 ? r3(mfe / risk - r) : null };
}

/** Right-tail metric: trades whose OPEN-path MFE >= 2R; mean realized under a policy vs the control exit. */
export function rightTail(openRows, policyRows, controlRows, thresholdR = 2) { const idx = new Map(); openRows.forEach((x, k) => { if (x.o.mfe_r >= thresholdR) idx.set(x.e.i + '|' + x.e.side, k); }); const pr = [], cr = []; let trunc = 0; for (const x of policyRows) { const k = idx.get(x.e.i + '|' + x.e.side); if (k == null) continue; pr.push(x.o.r); if (x.o.r < 1.0) trunc++; } for (const x of controlRows) { const k = idx.get(x.e.i + '|' + x.e.side); if (k == null) continue; cr.push(x.o.r); } const mp = pr.length ? pr.reduce((a, b) => a + b, 0) / pr.length : null, mc = cr.length ? cr.reduce((a, b) => a + b, 0) / cr.length : null; const ratio = mp != null && mc != null && mc > 0 ? mp / mc : null; return { tail_trades: idx.size, tail_share: openRows.length ? r3(idx.size / openRows.length) : null, policy_mean_realized_r: r3(mp), control_mean_realized_r: r3(mc), truncation_rate: pr.length ? r3(trunc / pr.length) : null, profit_lost_r: mp != null && mc != null ? r3((mc - mp) * pr.length) : null, ratio: r3(ratio), verdict: ratio == null ? 'INCONCLUSIVE' : ratio >= 0.8 ? 'YES' : ratio >= 0.6 ? 'INCONCLUSIVE' : 'NO' }; }

/** Give-back table for trades with policy-path MFE >= each threshold. */
export function giveback(rows) { const out = {}; for (const th of [0.5, 0.75, 1.0, 1.5, 2.0]) { const v = rows.filter((x) => x.o.mfe_r >= th); const gb = v.map((x) => x.o.mfe_r - x.o.r); out[th] = { n: v.length, share: rows.length ? r3(v.length / rows.length) : null, mean_mfe_r: r3(v.length ? v.reduce((a, x) => a + x.o.mfe_r, 0) / v.length : null), mean_realized_r: r3(v.length ? v.reduce((a, x) => a + x.o.r, 0) / v.length : null), mean_giveback_r: r3(gb.length ? gb.reduce((a, b) => a + b, 0) / gb.length : null), losers_share: v.length ? r3(v.filter((x) => x.o.r <= 0).length / v.length) : null }; } return out; }
