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
 */
export function registerOrGetSignal(store, candidate) {
  const id = computeSignalId(candidate);
  const existing = store.signals.find((s) => s.signal_id === id);
  if (existing) return { record: existing, isNew: false };
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
    status: 'OPEN',
    created_at: new Date().toISOString(),
    resolution_bar_time: null,
    realized_r: null,
  };
  store.signals.push(record);
  return { record, isNew: true };
}

const IMMUTABLE_FIELDS = ['signal_id', 'symbol', 'timeframe', 'model', 'side', 'origin_bar', 'signal_bar_time', 'entry', 'stop_loss', 'tp1', 'tp2', 'rr'];

/**
 * Resolves OPEN records for one timeframe using only bars strictly AFTER
 * each record's signal_bar_time. Same-future-candle SL+TP2 touch is
 * conservative FAIL. TP1 alone is never terminal (TP2 governs). Terminal
 * records (PASS/FAIL) are never revisited or rewritten.
 */
export function resolveOpenSignals(store, { timeframe, confirmedBars }) {
  const updated = [];
  for (const record of store.signals) {
    if (record.timeframe !== timeframe || record.status !== 'OPEN') continue;
    const futureBars = confirmedBars.filter((b) => b.time > record.signal_bar_time);
    if (futureBars.length === 0) continue;
    const isLong = record.side === 'BUY';
    let result = null;
    let resolutionBarTime = null;
    for (const b of futureBars) {
      const hitSl = isLong ? b.low <= record.stop_loss : b.high >= record.stop_loss;
      const hitTarget = isLong ? b.high >= record.tp2 : b.low <= record.tp2;
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
