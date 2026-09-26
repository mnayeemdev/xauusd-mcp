/**
 * READ-ONLY view of what the unchanged production system wrote to disk (Stage 11C). The observer never
 * imports the engine, the watcher, the executor or the bridge; it only parses files production already
 * writes, and it never writes to any of them. Every path here is a read path.
 *   wait log       state/xauusd_wait_opportunity_log.jsonl   (per confirmed candle when the engine WAITs)
 *   signal store   validation/mcp_engine_signals.json         (every BUY/SELL signal, executed or not)
 *   REAL audit log state/xauusd_mt5_real_trade_log.jsonl     (executor decisions, news/shock/protection transitions)
 *   calendar       state/xauusd_news_calendar_snapshot.json   (last accepted provider calendar)
 */
import { existsSync, readFileSync, statSync } from 'node:fs';

function jsonl(path, tailBytes = null) {
  if (!existsSync(path)) return [];
  let txt = readFileSync(path, 'utf8');
  if (tailBytes && txt.length > tailBytes) txt = txt.slice(txt.length - tailBytes); // tail read; first partial line dropped below
  const rows = []; for (const line of txt.split(/\r?\n/)) { if (!line.trim()) continue; try { rows.push(JSON.parse(line)); } catch { /* partial or malformed line: skipped, never repaired */ } }
  return rows;
}

export function createProductionReader({ waitLog, signalStore, auditLog, calendarSnapshot } = {}) {
  const files = { waitLog, signalStore, auditLog, calendarSnapshot };
  const mtime = (p) => (p && existsSync(p) ? statSync(p).mtime.toISOString() : null);
  return {
    files,
    /** Engine snapshot for one confirmed 5m bar time, from the wait log (WAIT) or the signal store (BUY/SELL). */
    snapshotForBar(barTime) {
      const waits = jsonl(files.waitLog, 400_000).filter((r) => r.confirmed_bar_time === barTime);
      const w = waits.at(-1) ?? null;
      let signals = [];
      try { const s = JSON.parse(readFileSync(files.signalStore, 'utf8')); signals = (s.signals ?? []).filter((x) => x.signal_bar_time === barTime); } catch { signals = []; }
      if (!w && !signals.length) return null;
      const sig = signals.at(-1) ?? null;
      return {
        source_files: { wait_log_mtime: mtime(files.waitLog), signal_store_mtime: mtime(files.signalStore) },
        action: sig ? sig.side : (w?.authoritative_action ?? null), wait_reason: w?.authoritative_wait_reason ?? null, model: sig?.model ?? w?.mapped_model_code ?? null, quality: sig?.quality ?? null, rr: sig?.rr ?? null, signal_id: sig?.signal_id ?? null,
        regime_5m: w?.regime ?? sig?.evidence_snapshot?.regime ?? null, structure_5m: w?.structure_state ?? sig?.evidence_snapshot?.structure?.state ?? null, structure_event_5m: w?.structure_event ?? sig?.evidence_snapshot?.structure?.last_event_type ?? null,
        session: w?.session ?? null, volatility_state: w?.volatility_state ?? null, direction_bias: w?.direction ?? null, htf_alignment: w?.htf_alignment ?? null, pre_entry_state: w?.pre_entry_state ?? null,
        blocked_by: w?.candidates ? Object.fromEntries(Object.entries(w.candidates).map(([tf, c]) => [tf, c?.blocked_by ?? c?.status ?? null])) : null,
        observed_at: w?.observed_at ?? sig?.created_at ?? null,
      };
    },
    /** Signals whose signal_id is not in `known` (a Set). */
    newSignals(known) { try { const s = JSON.parse(readFileSync(files.signalStore, 'utf8')); return (s.signals ?? []).filter((x) => x.signal_id && !known.has(x.signal_id)); } catch { return []; } },
    /** Executor decision for a signal id: EXECUTED / SKIPPED:<reason> / UNKNOWN (never guessed). */
    executionStatus(signalId) {
      const rows = jsonl(files.auditLog, 2_000_000).filter((r) => r.signal_id === signalId && ['OPENED', 'INTENT', 'SKIPPED'].includes(r.type));
      const opened = rows.find((r) => r.type === 'OPENED'); const skipped = rows.filter((r) => r.type === 'SKIPPED').at(-1);
      if (opened) return { status: 'EXECUTED', at: opened.timestamp, fill: opened.price ?? opened.requested_price ?? null, protection: opened.protection ?? null };
      if (skipped) return { status: `SKIPPED:${skipped.reason}`, at: skipped.timestamp, guard: skipped.guard ?? null, protection: skipped.protection ?? null };
      return { status: 'UNKNOWN' };
    },
    /** Latest protection-bearing audit record (news/shock/block state as production last reported it). */
    lastProtection() { const rows = jsonl(files.auditLog, 400_000).filter((r) => r.protection); const r = rows.at(-1); return r ? { at: r.timestamp, type: r.type, ...r.protection } : null; },
    /** News/shock/protection transition records after `sinceIso` (for NEWS_V2_EVENT observations). */
    protectionEvents(sinceIso) { const rows = jsonl(files.auditLog, 2_000_000).filter((r) => ['NEWS_STATE_CHANGED', 'SHOCK_STATE_CHANGED', 'PROTECTION_BLOCK_STARTED', 'PROTECTION_NORMALIZED', 'PROTECTION_STARTED'].includes(r.type) && (!sinceIso || r.timestamp > sinceIso)); return rows.map((r) => ({ timestamp: r.timestamp, type: r.type, from: r.from ?? null, to: r.to ?? null, reason: r.reason ?? null, reasons: r.reasons ?? null, cleared_at: r.cleared_at ?? null, news_params: r.news_params ?? null, protection: r.protection ?? null })); },
    calendar() { try { const s = JSON.parse(readFileSync(files.calendarSnapshot, 'utf8')); return { events: s.events ?? [], source: s.source ?? null, source_timestamp: s.source_timestamp ?? null, fetched_at: s.fetched_at ?? null }; } catch { return null; } },
  };
}
