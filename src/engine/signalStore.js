/**
 * Deterministic signal identity, entry-freeze, and OPEN/PASS/FAIL
 * tracking for the MCP calculation engine's own signals.
 *
 * This is a SEPARATE ledger from validation/p8_forward_ledger.json (the
 * Pine-authority P8 ledger) -- it tracks the independent MCP engine's own
 * signals, never mixed with P8 evidence.
 *
 * Persisted as JSON so identity/dedup/entry-freeze survive across
 * separate CLI/MCP process invocations (this process is not long-lived).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Same path xauusd_calculate.js's own SIGNAL_STORE_PATH points at (that
// file keeps its own local constant unchanged -- this is purely an
// additive export for OTHER, read-only consumers, e.g. a historical/open-
// trade visualization reader, so they never have to guess or duplicate
// this literal path independently).
export const DEFAULT_STORE_PATH = fileURLToPath(new URL('../../validation/mcp_engine_signals.json', import.meta.url));

export function computeSignalId({ symbol, timeframe, model, side, originBar, signalBarTime }) {
  const canonical = `${symbol}|${timeframe}|${model}|${side}|${originBar}|${signalBarTime}`;
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function loadStore(path) {
  if (!existsSync(path)) return { signals: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function saveStore(path, store) {
  writeFileSync(path, JSON.stringify(store, null, 2) + '\n');
}

/**
 * Registers a newly-triggered candidate if it is genuinely new (by
 * signal ID). If a record with the same ID already exists (OPEN or
 * terminal), returns the EXISTING immutable record instead of creating a
 * duplicate -- this is the "same opportunity = same signal ID, no
 * duplicate new-entry event" rule.
 *
 * SAME-STRUCTURAL-THESIS CONCURRENCY GUARD (additive, narrow -- see
 * docs/XAUUSD_LIVE_RUNTIME.md): `candidate.thesisId`, when supplied, is an
 * opaque, caller-computed identity string (src/core/xauusd_calculate.js
 * computes it via anticipationStore.js's already-existing, already-
 * production-proven computeSetupId()/resolveStructuralAnchorPrice() --
 * this module never computes or interprets it, purely an equality key).
 * This function NEVER re-evaluates RR/model/quality/confirmation -- by
 * the time it runs, `candidate` has ALREADY passed protected
 * qualification (calculateEntry()'s own gates). It only decides whether
 * THIS candidate gets its OWN new OPEN record, or is folded into an
 * already-OPEN signal that shares the same (symbol, timeframe, side,
 * thesisId):
 *   - `candidate.thesisId == null` (legacy caller, or no structural
 *     anchor could be resolved): the guard is skipped entirely --
 *     identical to pre-existing behavior, byte-for-byte.
 *   - An existing record's own `thesis_id` is `undefined`/absent (every
 *     historical record persisted before this change): it can never
 *     equal a real, non-null `thesisId` string, so legacy OPEN records
 *     never participate in this guard -- they remain unlinked until they
 *     resolve to PASS/FAIL on their own, exactly as before.
 *   - `status === 'OPEN'` is the only gate checked (not `tp1_hit`): a
 *     signal that has already hit TP1 but is not yet terminal still
 *     blocks a second same-thesis, same-side registration, matching
 *     tp1_hit's own documented "never terminal" semantics above.
 *   - Opposite-direction signals are never compared (side is part of the
 *     match) -- deliberately out of scope for this change.
 */
export function registerOrGetSignal(store, candidate) {
  const id = computeSignalId(candidate);
  const existing = store.signals.find((s) => s.signal_id === id);
  if (existing) return { record: existing, isNew: false, blockedByOpenThesis: false, thesisId: candidate.thesisId ?? null, existingSignalId: null };

  if (candidate.thesisId != null) {
    const openSameThesis = store.signals.find((s) =>
      s.status === 'OPEN' && s.symbol === candidate.symbol && s.timeframe === candidate.timeframe
      && s.side === candidate.side && s.thesis_id === candidate.thesisId);
    if (openSameThesis) {
      // The candidate passed protected qualification -- this only
      // withholds ITS OWN registration as a second, independently-risked
      // OPEN record. The existing record is returned verbatim, never
      // altered, never re-scored, never moved off OPEN.
      return { record: openSameThesis, isNew: false, blockedByOpenThesis: true, thesisId: candidate.thesisId, existingSignalId: openSameThesis.signal_id };
    }
  }

  const record = {
    signal_id: id,
    symbol: candidate.symbol,
    timeframe: candidate.timeframe,
    model: candidate.model,
    side: candidate.side,
    origin_bar: candidate.originBar,
    signal_bar_time: candidate.signalBarTime,
    entry: candidate.entry,
    stop_loss: candidate.stop_loss,
    tp1: candidate.tp1,
    tp2: candidate.tp2,
    rr: candidate.rr,
    quality: candidate.quality,
    // Additive, optional structural-thesis identity (see the guard doc
    // above). `null` for any caller that doesn't supply one -- preserves
    // exact pre-existing record shape/behavior for those callers.
    thesis_id: candidate.thesisId ?? null,
    status: 'OPEN',
    created_at: new Date().toISOString(),
    resolution_bar_time: null,
    realized_r: null,
    // TP1 lifecycle tracking (additive, non-terminal -- see resolveOpenSignals()
    // below). tp1_hit is one-way (false -> true, never reset) and never
    // affects PASS/FAIL; it exists purely so the trader-facing card can show
    // "TP1 HIT -- TP2 Pending" instead of implying nothing has happened yet.
    tp1_hit: false,
    tp1_hit_bar_time: null,
  };
  store.signals.push(record);
  return { record, isNew: true, blockedByOpenThesis: false, thesisId: candidate.thesisId ?? null, existingSignalId: null };
}

const IMMUTABLE_FIELDS = ['signal_id', 'symbol', 'timeframe', 'model', 'side', 'origin_bar', 'signal_bar_time', 'entry', 'stop_loss', 'tp1', 'tp2', 'rr'];

/**
 * Resolves OPEN records for one timeframe using only bars strictly AFTER
 * each record's signal_bar_time. Same-future-candle SL+TP2 touch is
 * conservative FAIL. TP1 alone is never terminal (TP2 governs). Terminal
 * records (PASS/FAIL) are never revisited or rewritten.
 *
 * TP1 lifecycle tracking (additive): on each future bar, also checks
 * whether TP1 has been objectively reached and -- the FIRST time this is
 * true -- sets tp1_hit/tp1_hit_bar_time once, permanently (never reset,
 * never re-evaluated once true; guarded by `!record.tp1_hit`). This never
 * changes what makes a record terminal (still SL -> FAIL / TP2 -> PASS
 * only) and never alters realized_r.
 *
 * Same-bar TP1 handling, deterministic, no invented intrabar ordering:
 *   - TP1 and TP2 both crossed on the same bar: safe to record tp1_hit,
 *     because every persisted signal has |tp2-entry| > |tp1-entry| by
 *     construction (tp2's reward/risk must clear minRR=1.7 to ever reach
 *     this store at all, which is already > tp1RMultiple=1.0 -- see
 *     risk.js) -- reaching TP2's price extreme geometrically REQUIRES
 *     having already passed TP1's nearer level in the same direction, a
 *     pure distance fact that needs no knowledge of WHEN within the bar
 *     either happened.
 *   - TP1 and SL both crossed on the same bar (TP2 NOT also crossed):
 *     genuinely ambiguous (TP1 and SL are on OPPOSITE sides of entry, so
 *     which one price reached first cannot be determined from OHLC alone)
 *     -- tp1_hit is deliberately NOT recorded for that bar. The existing
 *     conservative FAIL still applies exactly as before, unchanged.
 *
 * Backward compatible: a pre-existing record missing tp1_hit/
 * tp1_hit_bar_time (persisted before this field existed) is normalized to
 * the safe default (false/null) in place, exactly once, before any check
 * -- never inferred/backfilled from anything but this SAME forward-only,
 * already-confirmed-bars scan every other field in this store already
 * relies on (no hindsight, no future leakage: identical evidence standard
 * as the existing PASS/FAIL resolution).
 */
export function resolveOpenSignals(store, { timeframe, confirmedBars }) {
  const updated = [];
  for (const record of store.signals) {
    if (record.timeframe !== timeframe || record.status !== 'OPEN') continue;
    if (record.tp1_hit === undefined) record.tp1_hit = false;
    if (record.tp1_hit_bar_time === undefined) record.tp1_hit_bar_time = null;

    const futureBars = confirmedBars.filter((b) => b.time > record.signal_bar_time);
    if (futureBars.length === 0) continue;
    const isLong = record.side === 'BUY';
    let result = null;
    let resolutionBarTime = null;
    for (const b of futureBars) {
      const hitSl = isLong ? b.low <= record.stop_loss : b.high >= record.stop_loss;
      const hitTp1 = isLong ? b.high >= record.tp1 : b.low <= record.tp1;
      const hitTarget = isLong ? b.high >= record.tp2 : b.low <= record.tp2;

      if (!record.tp1_hit && hitTp1 && !hitSl) {
        record.tp1_hit = true;
        record.tp1_hit_bar_time = b.time;
      }

      if (hitSl && hitTarget) { result = 'FAIL'; resolutionBarTime = b.time; break; } // same-bar ambiguity -> conservative FAIL
      if (hitSl) { result = 'FAIL'; resolutionBarTime = b.time; break; }
      if (hitTarget) { result = 'PASS'; resolutionBarTime = b.time; break; }
    }
    if (result) {
      const before = { ...record };
      record.status = result;
      record.resolution_bar_time = resolutionBarTime;
      record.realized_r = result === 'PASS' ? +(Math.abs(record.tp2 - record.entry) / Math.abs(record.entry - record.stop_loss)).toFixed(2) : -1;
      for (const f of IMMUTABLE_FIELDS) {
        if (JSON.stringify(record[f]) !== JSON.stringify(before[f])) throw new Error(`immutable field '${f}' was modified during resolution`);
      }
      updated.push({ signal_id: record.signal_id, status: result });
    }
  }
  return updated;
}
