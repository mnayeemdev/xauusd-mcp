/**
 * REAL-TIME VOLATILITY SHOCK DETECTOR. PURE functions over data the executor
 * already has: a rolling window of bid/ask samples (one per monitor pass,
 * ~3 s) and the confirmed 5m bars of the latest analysis (ATR baseline).
 *
 * It never decides BUY/SELL and never chases a move. It answers exactly two
 * questions: (1) is the market currently in a deterministic VOLATILITY_SHOCK
 * state, with evidence; (2) for an OPEN position, does one of the narrowly
 * defined EMERGENCY conditions hold (broker boundary breached but position
 * still open, or the broker protective SL is missing).
 *
 * Signals (each relative to the recent baseline, never one fixed number):
 *   spread_ratio   current spread / median spread of the trailing window
 *                  (window = sampleWindowSec, excluding the last
 *                  baselineExcludeRecentSec so a spike cannot inflate its own
 *                  baseline); trigger SPREAD_SHOCK iff ratio >= spreadShockRatio
 *                  AND spread >= spreadShockMinAbs
 *   velocity_atr   |mid(now) - mid(now - velocityWindowSec)| / ATR(5m,14);
 *                  trigger VELOCITY_SHOCK iff >= velocityShockAtr
 *   jump_atr       |mid(now) - mid(previous sample)| / ATR; trigger JUMP_SHOCK
 *                  iff >= jumpShockAtr AND the sample before the jump differs
 *                  from the sample after it by >= jumpConfirmAtr (an isolated
 *                  bad tick that reverts immediately is NOT a jump)
 *   range_atr      true range of the last CONFIRMED 5m bar / ATR (previous
 *                  bars); trigger RANGE_SHOCK iff >= rangeShockAtr
 *   window_range_atr (high-low of the sample window over the last
 *                  rangeWindowSec) / ATR; trigger RANGE_SHOCK iff >= rangeShockAtr
 *   quote_age_sec  now - last tick time; FEED_STALE iff > feedStaleSec (a
 *                  safety condition: blocks entries, never closes)
 *
 * State machine (advanceShockState):
 *   INSUFFICIENT_DATA  baseline (>= baselineMinSamples) or ATR (>= atrMinBars
 *                      confirmed bars) not yet available -- no shock claim
 *   NORMAL
 *   VOLATILITY_SHOCK   entered only after confirmSamples CONSECUTIVE positive
 *                      evaluations (never one tick); cleared only after
 *                      clearAfterSec without any trigger AND spread_ratio <=
 *                      clearSpreadRatio AND velocity_atr <= clearVelocityAtr
 *                      (normalisation is a condition, not a clock)
 */
import { atr as atrSeries, trueRange } from './math.js';

export const SHOCK_STATES = Object.freeze(['INSUFFICIENT_DATA', 'NORMAL', 'VOLATILITY_SHOCK']);

export const SHOCK_PARAMS = Object.freeze({
  sampleWindowSec: 1800,
  baselineMinSamples: 20,
  baselineExcludeRecentSec: 60,
  spreadShockRatio: 3.0,
  spreadShockMinAbs: 0.5, // USD; a 0.05 -> 0.15 move is not a shock even though the ratio is 3
  spreadEntryRatio: 2.0, // new-order rejection threshold (relative), on top of the absolute config max
  spreadEntryMinAbs: 0.35,
  velocityWindowSec: 60,
  velocityShockAtr: 1.5,
  jumpShockAtr: 1.0,
  jumpConfirmAtr: 0.5,
  rangeShockAtr: 3.0,
  rangeWindowSec: 300,
  atrLen: 14,
  atrMinBars: 15,
  confirmSamples: 2,
  clearAfterSec: 600,
  clearSpreadRatio: 1.5,
  clearVelocityAtr: 0.75,
  feedStaleSec: 90,
  emergencyBoundaryToleranceUsd: 0.5, // price beyond the broker SL by more than this while still open => local enforcement
});

const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
const median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function initialShockState() {
  return { state: 'INSUFFICIENT_DATA', since: null, consecutive_positive: 0, last_trigger_at: null, triggers: [], normalized_at: null, evidence: null };
}

/** Median spread of the window excluding the most recent seconds. */
export function computeSpreadBaseline(samples, nowSec, params = SHOCK_PARAMS) {
  const from = nowSec - params.sampleWindowSec, to = nowSec - params.baselineExcludeRecentSec;
  const used = samples.filter((s) => s.t >= from && s.t <= to && Number.isFinite(s.spread)).map((s) => s.spread);
  return { baseline: used.length >= params.baselineMinSamples ? median(used) : null, samples_used: used.length, ok: used.length >= params.baselineMinSamples };
}

/** ATR of the bars BEFORE the last one (so the last bar's own range is judged against history), plus the last bar's true range. */
export function computeAtrContext(bars, params = SHOCK_PARAMS) {
  if (!Array.isArray(bars) || bars.length < params.atrMinBars + 1) return { atr: null, last_true_range: null, ok: false, bars: Array.isArray(bars) ? bars.length : 0 };
  const prior = bars.slice(0, -1);
  const series = atrSeries(prior, params.atrLen);
  const atr = series[series.length - 1];
  const tr = trueRange(bars);
  return { atr: Number.isFinite(atr) && atr > 0 ? atr : null, last_true_range: tr[tr.length - 1] ?? null, ok: Number.isFinite(atr) && atr > 0, bars: bars.length, last_bar_time: bars.at(-1)?.time ?? null };
}

/**
 * samples: [{ t (sec, monotone), tick_time (sec), bid, ask, spread }]
 * bars:    confirmed 5m bars (may be null)
 */
export function evaluateShockSignals({ samples, bars, nowSec, params = SHOCK_PARAMS }) {
  const win = (samples ?? []).filter((s) => s.t >= nowSec - params.sampleWindowSec);
  const last = win.at(-1) ?? null;
  const prev = win.length > 1 ? win[win.length - 2] : null;
  const prev2 = win.length > 2 ? win[win.length - 3] : null;
  const base = computeSpreadBaseline(win, nowSec, params);
  const atrCtx = computeAtrContext(bars, params);
  const mid = (s) => (s ? (s.bid + s.ask) / 2 : null);
  const metrics = { spread: last?.spread ?? null, spread_baseline: r3(base.baseline), spread_ratio: null, velocity_move: null, velocity_atr: null, jump_move: null, jump_atr: null, jump_confirmed: null, last_range: r3(atrCtx.last_true_range), range_atr: null, window_range: null, window_range_atr: null, atr: r3(atrCtx.atr), atr_bars: atrCtx.bars, quote_age_sec: last && Number.isFinite(last.tick_time) ? Math.round(nowSec - last.tick_time) : null, samples: win.length, baseline_samples: base.samples_used };
  const triggers = [];
  if (last && base.ok) {
    metrics.spread_ratio = r3(last.spread / base.baseline);
    if (last.spread / base.baseline >= params.spreadShockRatio && last.spread >= params.spreadShockMinAbs) triggers.push('SPREAD_SHOCK');
  }
  if (last && atrCtx.ok) {
    const ref = win.filter((s) => s.t <= nowSec - params.velocityWindowSec).at(-1);
    if (ref) {
      const move = Math.abs(mid(last) - mid(ref));
      metrics.velocity_move = r3(move); metrics.velocity_atr = r3(move / atrCtx.atr);
      if (move / atrCtx.atr >= params.velocityShockAtr) triggers.push('VELOCITY_SHOCK');
    }
    if (prev) {
      const jump = Math.abs(mid(last) - mid(prev));
      metrics.jump_move = r3(jump); metrics.jump_atr = r3(jump / atrCtx.atr);
      // A jump counts only when the level BEFORE the jump and the level AFTER it really differ (prev2 -> last),
      // so a single reverting bad tick in the middle (prev) never qualifies on its own.
      const confirmed = prev2 ? Math.abs(mid(last) - mid(prev2)) / atrCtx.atr >= params.jumpConfirmAtr : false;
      metrics.jump_confirmed = confirmed;
      if (jump / atrCtx.atr >= params.jumpShockAtr && confirmed) triggers.push('JUMP_SHOCK');
    }
    if (Number.isFinite(atrCtx.last_true_range)) {
      metrics.range_atr = r3(atrCtx.last_true_range / atrCtx.atr);
      if (atrCtx.last_true_range / atrCtx.atr >= params.rangeShockAtr) triggers.push('RANGE_SHOCK');
    }
    const recent = win.filter((s) => s.t >= nowSec - params.rangeWindowSec);
    if (recent.length >= 2) {
      const hi = Math.max(...recent.map(mid)), lo = Math.min(...recent.map(mid));
      metrics.window_range = r3(hi - lo); metrics.window_range_atr = r3((hi - lo) / atrCtx.atr);
      if ((hi - lo) / atrCtx.atr >= params.rangeShockAtr && !triggers.includes('RANGE_SHOCK')) triggers.push('RANGE_SHOCK');
    }
  }
  const feedStale = metrics.quote_age_sec != null && metrics.quote_age_sec > params.feedStaleSec;
  return { triggers, feed_stale: feedStale, metrics, data: { baseline_ok: base.ok, atr_ok: atrCtx.ok, sufficient: base.ok && atrCtx.ok } };
}

/** Deterministic state transition. `evaluation` is evaluateShockSignals() output. */
export function advanceShockState(prev, evaluation, nowSec, params = SHOCK_PARAMS) {
  const p = prev ?? initialShockState();
  const nowIso = new Date(nowSec * 1000).toISOString();
  const positive = evaluation.data.sufficient && evaluation.triggers.length > 0;
  const consecutive = positive ? (p.consecutive_positive ?? 0) + 1 : 0;
  let state = p.state, since = p.since, lastTrigger = p.last_trigger_at, normalizedAt = p.normalized_at, changed = false, reason = null;
  if (p.state === 'VOLATILITY_SHOCK') {
    if (positive) lastTrigger = nowIso;
    else {
      const quietSec = lastTrigger ? nowSec - Date.parse(lastTrigger) / 1000 : Infinity;
      const m = evaluation.metrics;
      const spreadOk = m.spread_ratio != null && m.spread_ratio <= params.clearSpreadRatio;
      const velocityOk = m.velocity_atr == null ? evaluation.data.atr_ok : m.velocity_atr <= params.clearVelocityAtr;
      if (quietSec >= params.clearAfterSec && spreadOk && velocityOk) { state = 'NORMAL'; since = nowIso; normalizedAt = nowIso; changed = true; reason = 'NORMALIZED'; }
    }
  } else if (consecutive >= params.confirmSamples) {
    state = 'VOLATILITY_SHOCK'; since = nowIso; lastTrigger = nowIso; changed = true; reason = `SHOCK_CONFIRMED:${evaluation.triggers.join('+')}`;
  } else if (!evaluation.data.sufficient) {
    if (p.state !== 'INSUFFICIENT_DATA') { state = 'INSUFFICIENT_DATA'; since = nowIso; changed = true; reason = 'DATA_INSUFFICIENT'; }
  } else if (p.state !== 'NORMAL') { state = 'NORMAL'; since = nowIso; changed = true; reason = 'DATA_SUFFICIENT'; }
  return { state, since, consecutive_positive: consecutive, last_trigger_at: lastTrigger, triggers: evaluation.triggers, normalized_at: normalizedAt, evidence: { ...evaluation.metrics, feed_stale: evaluation.feed_stale, data: evaluation.data }, changed, reason, evaluated_at: nowIso };
}

/** Relative spread gate for a NEW order (the absolute config max is applied separately by evaluateEntry). */
export function evaluateSpreadGate({ spread, baseline, params = SHOCK_PARAMS }) {
  if (!Number.isFinite(spread)) return { ok: false, reason: 'SPREAD_UNKNOWN', spread: null, baseline: r3(baseline), ratio: null, deviation: null };
  if (!Number.isFinite(baseline) || baseline <= 0) return { ok: false, reason: 'SPREAD_BASELINE_UNAVAILABLE', spread: r3(spread), baseline: null, ratio: null, deviation: null };
  const ratio = spread / baseline;
  const out = { spread: r3(spread), baseline: r3(baseline), ratio: r3(ratio), deviation: r3(spread - baseline), entry_ratio_max: params.spreadEntryRatio };
  if (ratio >= params.spreadEntryRatio && spread >= params.spreadEntryMinAbs) return { ok: false, reason: 'SPREAD_ABNORMAL', ...out };
  return { ok: true, reason: 'OK', ...out };
}

/**
 * EMERGENCY conditions for an OPEN position. Risk protection only:
 *   RESTORE_SL  the live position carries no broker SL although we placed one
 *   CLOSE       the market already trades beyond the broker SL by more than the
 *               tolerance and the position is still open (the broker boundary
 *               did not do its job) -- local enforcement of the same boundary
 * Spread expansion alone never closes; a stale feed never closes.
 */
export function evaluateEmergency({ position, live, tick, params = SHOCK_PARAMS }) {
  const side = position?.side;
  const liveSl = Number(live?.sl);
  const expectedSl = Number(position?.broker_sl);
  if (!position || !live) return { action: 'NONE', reason: 'NO_POSITION' };
  if ((!Number.isFinite(liveSl) || liveSl === 0) && Number.isFinite(expectedSl) && expectedSl > 0) return { action: 'RESTORE_SL', reason: 'BROKER_SL_MISSING', evidence: { live_sl: live?.sl ?? null, expected_sl: expectedSl, expected_tp: position.broker_tp ?? null } };
  const sl = Number.isFinite(liveSl) && liveSl > 0 ? liveSl : expectedSl;
  if (!Number.isFinite(sl) || sl <= 0 || !tick) return { action: 'NONE', reason: 'NO_BOUNDARY' };
  const tol = params.emergencyBoundaryToleranceUsd;
  const breached = side === 'BUY' ? Number(tick.bid) < sl - tol : side === 'SELL' ? Number(tick.ask) > sl + tol : false;
  if (breached) return { action: 'CLOSE', reason: 'BROKER_BOUNDARY_BREACHED', evidence: { side, broker_sl: sl, bid: tick.bid, ask: tick.ask, tolerance_usd: tol } };
  return { action: 'NONE', reason: 'WITHIN_BOUNDARY', evidence: { side, broker_sl: sl, bid: tick.bid, ask: tick.ask } };
}
