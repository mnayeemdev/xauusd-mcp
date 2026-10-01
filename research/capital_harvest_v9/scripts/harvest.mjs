/**
 * V9 CAPITAL HARVEST -- pure, causal profit manager (RESEARCH ONLY; HYPOTHETICAL_NOT_EXECUTED; no order code).
 * Spec: ../V9_PREREGISTRATION.md. Every decision is taken at a COMPLETED 5m close from bars <= that close; a protective floor set
 * at close j is a hard intrabar level from bar j+1; the floor is monotone, >= break-even once armed and never above the close.
 * Entries, structural SL, lot and RR 1.70 are inputs and never changed. The same step function serves the historical study and
 * a live feed of completed bars (the V8 forward-shadow archive format: { time, open, high, low, close }).
 */
export const COSTS = Object.freeze({ normal: { spread: 0.24, slip: 0.10 }, stress: { spread: 0.60, slip: 0.20 } });
export const RR = 1.70; export const HORIZON = 288; export const SWAP_PER_NIGHT = 0.56; export const GAP_SEC = 3 * 3600;
export const MILESTONES = Object.freeze([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.7, 2, 2.5, 3]);
export const STATES = Object.freeze(['INVALIDATED', 'WEAK', 'STRONG', 'MODERATE']);
export const ACTIONS = Object.freeze(['HOLD', 'PROTECT', 'HARVEST', 'EXIT']);
const r4 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000);

/** Causal per-bar features over `bars` (value at j uses bars <= j only). */
export function features(bars) {
  const N = bars.length; const ema = new Array(N).fill(null); const atr = new Array(N).fill(null);
  let e = null, sum = 0; for (let j = 0; j < N; j++) { const c = bars[j].close; if (j < 19) sum += c; else if (j === 19) { sum += c; e = sum / 20; ema[j] = e; } else { e = c * (2 / 21) + e * (1 - 2 / 21); ema[j] = e; } }
  let a = null, trSum = 0; for (let j = 1; j < N; j++) { const b = bars[j], p = bars[j - 1]; const tr = Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)); if (j <= 14) { trSum += tr; if (j === 14) { a = trSum / 14; atr[j] = a; } } else { a = (a * 13 + tr) / 14; atr[j] = a; } }
  // confirmed 3/3 pivots: pivot at p is known at p + 3
  const pivLowAt = new Array(N).fill(null), pivHighAt = new Array(N).fill(null);
  for (let j = 6; j < N; j++) { const p = j - 3; let lo = true, hi = true; for (let q = p - 3; q <= p + 3; q++) { if (q === p) continue; if (bars[q].low < bars[p].low) lo = false; if (bars[q].high > bars[p].high) hi = false; } pivLowAt[j] = lo ? { idx: p, price: bars[p].low } : null; pivHighAt[j] = hi ? { idx: p, price: bars[p].high } : null; }
  return { ema, atr, pivLowAt, pivHighAt };
}

/** Continuation state at completed bar j for an open trade (BUY; SELL mirrored). */
export function continuationState({ bars, f, j, side, i, bestCloseBar, lastPivot }) {
  const b = bars[j]; const isBuy = side === 'BUY'; const range = b.high - b.low;
  if (lastPivot && (isBuy ? b.close < lastPivot.price : b.close > lastPivot.price)) return 'INVALIDATED';
  const e = f.ema[j]; const belowEma = e != null && (isBuy ? b.close < e : b.close > e);
  const rejection = range > 0 && (isBuy ? (b.high - Math.max(b.open, b.close)) / range >= 0.5 && b.close <= b.low + range / 3 : (Math.min(b.open, b.close) - b.low) / range >= 0.5 && b.close >= b.high - range / 3);
  const twoAgainst = j - 2 > i && (isBuy ? b.close < b.open && bars[j - 1].close < bars[j - 1].open && b.close < bars[j - 1].close && bars[j - 1].close < bars[j - 2].close : b.close > b.open && bars[j - 1].close > bars[j - 1].open && b.close > bars[j - 1].close && bars[j - 1].close > bars[j - 2].close);
  if (belowEma || rejection || twoAgainst) return 'WEAK';
  let withCount = 0, n = 0; for (let q = Math.max(i + 1, j - 2); q <= j; q++) { n++; if (isBuy ? bars[q].close > bars[q].open : bars[q].close < bars[q].open) withCount++; }
  const strong = j - bestCloseBar <= 2 && e != null && !belowEma && n >= 2 && withCount >= 2;
  return strong ? 'STRONG' : 'MODERATE';
}

/**
 * Simulates one hypothetical trade under a policy. bars: confirmed 5m bars (oldest first); f: features(bars); t: { i, side, entry, sl }.
 * policy: { kind: 'BASELINE'|'RUN_TO_END'|'FLOOR'|'ADAPTIVE', floor?: { family:'A'|'B'|'C'|'D'|'E', arm, lag?, k?, rho? }, harvestMinR? }
 * opts.log = true returns the per-bar decision log (state, action, floor, target active) for replay-parity checks.
 */
export function simulateTrade(bars, f, t, policy, costs = COSTS.normal, { log = false, endIdx = null } = {}) {
  const { i, side, entry, sl } = t; const N = endIdx == null ? bars.length : endIdx + 1; const isBuy = side === 'BUY'; const sgn = isBuy ? 1 : -1;
  const R = Math.abs(entry - sl); if (!(R > 0)) return { status: 'INVALID' };
  const sp = costs.spread, slip = costs.slip; const fill = isBuy ? entry + sp : entry; const brokerDist = 1.5 * R + sp; const tp = isBuy ? entry + RR * R : entry - RR * R;
  const fav = (b) => (isBuy ? b.high - fill : fill - (b.low + sp)); const adv = (b) => (isBuy ? fill - b.low : (b.high + sp) - fill); const closePnl = (b) => sgn * ((isBuy ? b.close : b.close + sp) - fill);
  const be = isBuy ? fill + slip : fill - slip; const fam = policy.floor?.family ?? null; const adaptive = policy.kind === 'ADAPTIVE'; const usesFloor = policy.kind === 'FLOOR' || adaptive;
  let tpActive = policy.kind !== 'RUN_TO_END'; let floor = null; let armedBar = null, armedOpenR = null; let mfe = 0, mae = 0, nights = 0, gap = false;
  let bestClose = null, bestCloseBar = i, extreme = null; let lastPivot = null; const ms = Object.fromEntries(MILESTONES.map((m) => [m, null])); const decisions = log ? [] : null; let suspended = false;
  const end = Math.min(N - 1, i + HORIZON); let exit = null, exitBar = null, pnl = 0, exitPx = null;
  for (let j = i + 1; j <= end; j++) {
    const b = bars[j], p = bars[j - 1]; if (b.time - p.time > GAP_SEC) gap = true; if (isBuy && Math.floor(b.time / 86400) !== Math.floor(p.time / 86400)) nights++;
    const a = adv(b), fv = fav(b); if (a > mae) mae = a;
    if (floor != null && (isBuy ? b.low <= floor : b.high + sp >= floor)) { exit = 'PROTECTED_FLOOR'; pnl = sgn * (floor - fill) - slip; exitPx = floor; exitBar = j; break; }
    if (a >= brokerDist) { exit = 'BROKER_SL'; pnl = -brokerDist - slip; exitPx = isBuy ? fill - brokerDist : fill + brokerDist; exitBar = j; break; }
    if (tpActive && (isBuy ? b.high >= tp : (b.low + sp) <= tp)) { if (fv > mfe) mfe = fv; exit = 'TARGET_170R'; pnl = Math.abs(tp - fill) - slip; exitPx = tp; exitBar = j; break; }
    if (fv > mfe) mfe = fv; for (const m of MILESTONES) if (ms[m] == null && mfe >= m * R) ms[m] = j;
    if (isBuy ? b.close < sl : b.close > sl) { exit = 'THESIS_INVALIDATION'; pnl = closePnl(b) - slip; exitPx = b.close; exitBar = j; break; }
    if (!usesFloor) continue;
    // ---- end-of-bar decision from completed information only ----
    if (bestClose == null || (isBuy ? b.close > bestClose : b.close < bestClose)) { bestClose = b.close; bestCloseBar = j; }
    extreme = extreme == null ? (isBuy ? b.high : b.low) : isBuy ? Math.max(extreme, b.high) : Math.min(extreme, b.low);
    const pv = isBuy ? f.pivLowAt[j] : f.pivHighAt[j]; if (pv && pv.idx > i) lastPivot = pv;
    const mfeR = mfe / R; const openR = closePnl(b) / R; const armed = mfeR >= policy.floor.arm;
    if (armed && armedBar == null) { armedBar = j; armedOpenR = openR; }
    let state = null, action = 'HOLD';
    if (armed) {
      const atr = f.atr[j] ?? 0; let cand = null;
      if (fam === 'A') cand = fill + sgn * (Math.floor(mfeR / 0.5) * 0.5 - policy.floor.lag) * R;
      else if (fam === 'B') cand = isBuy ? extreme - policy.floor.k * atr : extreme + policy.floor.k * atr;
      else if (fam === 'C') cand = lastPivot ? (isBuy ? lastPivot.price - 0.1 * atr : lastPivot.price + 0.1 * atr) : null;
      else if (fam === 'D') cand = fill + sgn * policy.floor.rho * mfe;
      else if (fam === 'E') { const cc = lastPivot ? (isBuy ? lastPivot.price - 0.1 * atr : lastPivot.price + 0.1 * atr) : null; const cb = isBuy ? extreme - policy.floor.k * atr : extreme + policy.floor.k * atr; cand = cc == null ? cb : isBuy ? Math.max(cc, cb) : Math.min(cc, cb); }
      let want = cand == null ? be : isBuy ? Math.max(cand, be) : Math.min(cand, be);
      const cap = isBuy ? b.close : b.close + sp; want = isBuy ? Math.min(want, cap) : Math.max(want, cap);
      if (floor == null || (isBuy ? want > floor : want < floor)) { floor = want; action = 'PROTECT'; }
      if (adaptive) {
        state = continuationState({ bars, f, j, side, i, bestCloseBar, lastPivot });
        const beyondTp = isBuy ? b.close >= tp : b.close + sp <= tp;
        if (state === 'INVALIDATED') { exit = 'STRUCTURE_EXIT'; pnl = closePnl(b) - slip; exitPx = b.close; exitBar = j; action = 'EXIT'; }
        else if ((state === 'WEAK' && openR >= policy.harvestMinR) || (suspended && beyondTp && state !== 'STRONG')) { exit = 'HARVEST'; pnl = closePnl(b) - slip; exitPx = b.close; exitBar = j; action = 'HARVEST'; }
        else { tpActive = state !== 'STRONG'; suspended = !tpActive; if (state === 'STRONG' && action !== 'PROTECT') action = 'HOLD'; }
      }
    }
    if (log) decisions.push({ j, state, action, floor: r4(floor), tp_active: tpActive });
    if (exit) break;
  }
  let status = 'RESOLVED'; if (!exit) { if (end < i + HORIZON) return { status: 'NO_DATA', decisions }; status = 'OPEN_AT_HORIZON'; exit = 'HORIZON'; pnl = closePnl(bars[end]) - slip; exitPx = bars[end].close; exitBar = end; }
  const swap = isBuy ? nights * SWAP_PER_NIGHT : 0; pnl -= swap;
  return { status, exit, exitBar, exitPx, bars: exitBar - i, r: r4(pnl / R), pnl_usd: r4(pnl), mfe_r: r4(mfe / R), mae_r: r4(mae / R), milestones: ms, gap, armed_bar: armedBar, armed_open_r: r4(armedOpenR), early: exit === 'HARVEST' || exit === 'PROTECTED_FLOOR' || exit === 'STRUCTURE_EXIT', decisions };
}

/** Post-exit continuation: max favorable move (in R) after `exitBar` until the ORIGINAL structural thesis / broker stop or the horizon. */
export function postExitContinuation(bars, t, exitBar, exitPx, costs = COSTS.normal) {
  const { i, side, entry, sl } = t; const isBuy = side === 'BUY'; const R = Math.abs(entry - sl); const sp = costs.spread; const fill = isBuy ? entry + sp : entry; const brokerDist = 1.5 * R + sp; let best = 0; const end = Math.min(bars.length - 1, i + HORIZON);
  for (let j = exitBar + 1; j <= end; j++) { const b = bars[j]; const a = isBuy ? fill - b.low : (b.high + sp) - fill; if (a >= brokerDist) break; const fv = isBuy ? b.high - exitPx : exitPx - (b.low + sp); if (fv > best) best = fv; if (isBuy ? b.close < sl : b.close > sl) break; }
  return r4(best / R);
}
