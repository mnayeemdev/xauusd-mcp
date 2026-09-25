/**
 * ENTRY-CONTEXT GUARD INTERFACE -- the module boundary between the execution
 * layer and any context/safety module that may veto a NEW order.
 *
 * A guard is { name, evaluate(ctx) -> { allowed, reason, details } }. Guards
 * are evaluated in order; the FIRST block is the verdict, but every guard is
 * still evaluated so the audit record carries the full context. Guards never
 * see or touch an open position and never produce a trade direction.
 *
 * ctx (as assembled by src/engine/mt5Executor.js):
 *   now (Date), signal { signal_id, action, entry, calculated_at },
 *   market { bid, ask, spread_price, tick_time, now_sec },
 *   news   (src/engine/newsRisk.js evaluateNewsState output or null),
 *   shock  (src/engine/marketShock.js advanceShockState output or null),
 *   spreadBaseline (number|null), protection { last_block_cleared_at, blocking }
 *
 * Implemented today: news, shock, feed health, relative spread, normalisation
 * freshness. A later SESSION + LIQUIDITY INTELLIGENCE module (Asia/PDH/PDL/
 * PWH/PWL, London/NY transitions, sweep/reclaim, session-range extension)
 * plugs in as one more guard with the SAME shape -- it is NOT part of the
 * REAL strategy and is NOT implemented here.
 */
import { evaluateNewsEntryPolicy } from './newsRisk.js';
import { evaluateSpreadGate } from './marketShock.js';

export function runEntryGuards(guards, ctx) {
  const results = {};
  let verdict = null;
  for (const g of guards) {
    let r;
    try { r = g.evaluate(ctx) ?? { allowed: false, reason: `${g.name}_NO_VERDICT`, details: null }; } catch (err) { r = { allowed: false, reason: `${g.name}_GUARD_THREW`, details: { error: err.message } }; }
    results[g.name] = r;
    if (!r.allowed && !verdict) verdict = { allowed: false, reason: r.reason, details: r.details ?? null, guard: g.name };
  }
  return verdict ? { ...verdict, results } : { allowed: true, reason: 'OK', details: null, guard: null, results };
}

export function createNewsGuard({ params } = {}) {
  return { name: 'news', evaluate: (ctx) => evaluateNewsEntryPolicy({ news: ctx.news, params }) };
}

export function createShockGuard() {
  return {
    name: 'shock',
    evaluate: (ctx) => {
      const s = ctx.shock;
      const details = { shock_state: s?.state ?? null, since: s?.since ?? null, triggers: s?.triggers ?? [], evidence: s?.evidence ?? null };
      if (!s) return { allowed: false, reason: 'SHOCK_STATE_UNKNOWN', details };
      if (s.state === 'VOLATILITY_SHOCK') return { allowed: false, reason: 'VOLATILITY_SHOCK_ENTRY_BLOCK', details };
      // No robust baseline yet (first minutes after a start): no shock claim is
      // possible either way; the absolute spread/drift/quote gates still apply.
      // Allowed, but audited so the decision is reconstructable.
      if (s.state === 'INSUFFICIENT_DATA') return { allowed: true, reason: 'SHOCK_BASELINE_UNAVAILABLE_ABSOLUTE_GATES_ONLY', details };
      return { allowed: true, reason: 'OK', details };
    },
  };
}

export function createFeedHealthGuard({ feedStaleSec }) {
  return {
    name: 'feed',
    evaluate: (ctx) => {
      const m = ctx.market;
      const age = m && Number.isFinite(m.tick_time) ? (m.now_sec ?? ctx.now.getTime() / 1000) - m.tick_time : null;
      const details = { quote_age_sec: age == null ? null : Math.round(age), feed_stale_sec: feedStaleSec, evidence_feed_stale: ctx.shock?.evidence?.feed_stale ?? null };
      if (age == null || age > feedStaleSec || ctx.shock?.evidence?.feed_stale === true) return { allowed: false, reason: 'FEED_UNHEALTHY_BLOCK', details };
      return { allowed: true, reason: 'OK', details };
    },
  };
}

export function createSpreadGuard({ params } = {}) {
  return {
    name: 'spread',
    evaluate: (ctx) => {
      const g = evaluateSpreadGate({ spread: Number(ctx.market?.spread_price), baseline: ctx.spreadBaseline, params });
      // Without a robust baseline the absolute config maximum (already applied by evaluateEntry) is the only spread gate -- audited.
      if (!g.ok && g.reason === 'SPREAD_BASELINE_UNAVAILABLE') return { allowed: true, reason: 'SPREAD_BASELINE_UNAVAILABLE_ABSOLUTE_GATE_ONLY', details: g };
      return { allowed: g.ok, reason: g.ok ? 'OK' : g.reason, details: g };
    },
  };
}

/** A signal calculated before the last protection block cleared is a pre-news/pre-shock signal: never replayed. */
export function createNormalizationGuard() {
  return {
    name: 'normalization',
    evaluate: (ctx) => {
      const clearedAt = ctx.protection?.last_block_cleared_at ?? null;
      const calcMs = Date.parse(ctx.signal?.calculated_at ?? '');
      const details = { last_block_cleared_at: clearedAt, signal_calculated_at: ctx.signal?.calculated_at ?? null };
      if (ctx.protection?.blocking) return { allowed: false, reason: 'PROTECTION_BLOCK_ACTIVE', details };
      if (clearedAt && Number.isFinite(calcMs) && calcMs <= Date.parse(clearedAt)) return { allowed: false, reason: 'SIGNAL_PREDATES_NORMALIZATION', details };
      return { allowed: true, reason: 'OK', details };
    },
  };
}
