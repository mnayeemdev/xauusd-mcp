/**
 * V12 REALIZED RISK HARDENING -- pure envelope helpers (RESEARCH ONLY; no order code; the structural SL is never moved).
 * Spec: ../V12_PREREGISTRATION.md (Part B). The envelope only SIZES (smaller lots) or REJECTS; it never touches the entry.
 * Worst plausible loss per oz = 1.5 R + spread + 0.10 + SLIPPAGE_BUFFER + GAP_BUFFER + SWAP_BUFFER.
 */
import { readFileSync, existsSync } from 'node:fs';

export const BASE_SLIP = 0.10; export const SLIPPAGE_BUFFER = 0.20; // to the MODERATE 0.30 level; ASSUMPTION (3 fills, no stop-out fill data)
/** UTC midnights crossed in (t0, t1] (calendar nights; a Friday -> Monday hold = 3). */
export const calendarNights = (t0, t1) => Math.max(0, Math.floor(t1 / 86400) - Math.floor(t0 / 86400));
/** Nights a position opened at bar i could be held within the 288-bar horizon (the trading calendar is known at entry). */
export function nightsPossible(bars, i, horizon = 288) { if (!bars[i]) return null; const j = Math.min(bars.length - 1, i + horizon); return calendarNights(bars[i].time + 300, bars[j].time + 300); }
/** Amendment 1: the 288-bar horizon from bar i contains a market closure (bar gap > 24 h: weekend / holiday) -- trading calendar. */
export function closureReachable(bars, i, horizon = 288) { const j = Math.min(bars.length - 1, i + horizon); for (let k = i + 1; k <= j; k++) if (bars[k].time - bars[k - 1].time > 24 * 3600) return true; return false; }
/** Type of the bar gap preceding bar j: CLOSURE (> 24 h), SESSION (> 30 min, daily break), IN_SESSION. */
export function gapType(bars, j) { const dt = bars[j].time - bars[j - 1].time; return dt > 24 * 3600 ? 'CLOSURE' : dt > 30 * 60 ? 'SESSION' : 'IN_SESSION'; }
/** Gap-through at a broker-SL exit: the bar opens beyond the broker level (entry -/+ 1.5 R in bid terms) and fills at the open. */
export function gapThroughOz({ bars, exitBar, side, entry, R }) { const L = side === 'BUY' ? entry - 1.5 * R : entry + 1.5 * R; const o = bars[exitBar]?.open; if (!Number.isFinite(o)) return 0; return side === 'BUY' ? Math.max(0, L - o) : Math.max(0, o - L); }
/** Largest platform swap-long magnitude observed in the bridge record history (USD per oz per night); null if none recorded. */
export function maxSwapLongUsd(logPath) { if (!existsSync(logPath)) return null; let best = null, point = null; for (const l of readFileSync(logPath, 'utf8').split('\n')) { const m = /"swap_long":(-?[0-9.]+)/.exec(l); const p = /"point":([0-9.e-]+)/.exec(l); if (m && p) { const v = Math.abs(Number(m[1])) * Number(p[1]); if (best == null || v > best) { best = v; point = Number(p[1]); } } } return best == null ? null : { usd_per_oz_night: best, point }; }
/** Envelope extra (beyond 1.5 R + spread + 0.10) per oz for one entry; fails closed when the swap rate is unavailable for a BUY. */
export function envelopeExtraOz({ side, R, nightsPossible: n, swapRate, slipBuffer = SLIPPAGE_BUFFER, gapBufferR }) {
  if (!(Number.isFinite(R) && R > 0)) return { ok: false, reason: 'INVALID_STRUCTURAL_SL' }; if (!(Number.isFinite(gapBufferR) && gapBufferR >= 0)) return { ok: false, reason: 'GAP_BUFFER_UNAVAILABLE' }; // Number.isFinite: null must fail closed (null >= 0 is true in JS)
  if (side === 'BUY' && !(Number.isFinite(swapRate) && swapRate >= 0 && Number.isInteger(n) && n >= 0)) return { ok: false, reason: 'SWAP_RATE_UNAVAILABLE' };
  const swap = side === 'BUY' ? n * swapRate : 0; const gap = gapBufferR * R; return { ok: true, slip: slipBuffer, gap, swap, total: slipBuffer + gap + swap };
}
export const worstPlausibleOz = ({ R, spread, extra }) => 1.5 * R + spread + BASE_SLIP + extra.total;
/**
 * Realized P&L per oz under a realized-loss model. SCENARIO = the simulator outcome as is. REALISTIC = the simulator's spread /
 * slippage, the simulator swap and any deterministic gap removed, calendar-night swap at `swapRate` and data gap-through added.
 */
export function realizedPnlOz({ model, pnlOz, side, simSwapOz, detGapOz = 0, calNights, swapRate, exit, gapThrough }) {
  if (model === 'SCENARIO') return pnlOz;
  return pnlOz + simSwapOz + detGapOz - (side === 'BUY' ? calNights * swapRate : 0) - (exit === 'BROKER_SL' ? gapThrough : 0);
}
