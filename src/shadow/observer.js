/**
 * FORWARD SHADOW OBSERVER (Stage 11C). OBSERVATION ONLY -- separate process, separate read-only MT5 reader,
 * separate state directory (state/shadow/). It never imports the engine, the watcher, the executor, the
 * REAL policy or the bridge; it reads production's own output files and writes only under state/shadow/.
 * There is no path from anything here to an order.
 *
 *   node src/shadow/observer.js            run (poll every 60 s; own lock state/shadow/observer.lock)
 *   node src/shadow/observer.js --once     one cycle (used for smoke checks)
 *
 * Cycle: (1) read completed XAUUSDm 5m/15m/30m/1H bars and the tick; (2) for every completed 5m bar not yet
 * observed (max 24 h back) build a CANDLE_5M observation, FORWARD_LIVE only if created within 15 min of the
 * candle close, else BACKFILL; (3) on 15m boundaries evaluate the frozen SC1 silver-lead trigger; (4) record
 * every new production signal (SC2) with its executor status; (5) mirror production's news/shock/protection
 * transitions as NEWS_V2_EVENT observations; (6) label outcomes whose horizon has elapsed (append-only).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createEvidenceStore } from './store.js';
import { createMt5Reader } from './mt5Reader.js';
import { createProductionReader } from './production.js';
import { CANDIDATES, candidateById, verifyFrozenRegistry } from './candidates.js';
import { buildCandleObservation, buildTriggerObservation, evaluateSilverLead, labelOutcome, completedBars, atr14, provenanceFor, TF_SEC } from './core.js';
import { SCHEMA_VERSION, observationId, outcomeId } from './schema.js';
import { evaluateNewsState, NEWS_RISK_PARAMS } from '../engine/newsRisk.js';
import { classifyNewsTier } from '../engine/newsCalendar.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SHADOW_DIR = `${ROOT}state/shadow`;
export const PROD_FILES = Object.freeze({ waitLog: `${ROOT}state/xauusd_wait_opportunity_log.jsonl`, signalStore: `${ROOT}validation/mcp_engine_signals.json`, auditLog: `${ROOT}state/xauusd_mt5_real_trade_log.jsonl`, calendarSnapshot: `${ROOT}state/xauusd_news_calendar_snapshot.json` });
export const CROSS_SYMBOLS = Object.freeze(['DXYm', 'XAGUSDm', 'USTECm']);
export const OUTCOME_PLAN = Object.freeze({
  CANDLE_5M: [['h12', 12, '5m'], ['h24', 24, '5m'], ['h48', 48, '5m']],
  'SC1_SILVER_LEAD_v1': [['h4', 4, '15m'], ['h8', 8, '15m'], ['h16', 16, '15m']],
  'SC2_PRODUCTION_SIGNAL_v1': [['h12', 12, '5m'], ['h24', 24, '5m'], ['h48', 48, '5m']],
});

export function createShadowObserver({ dir = SHADOW_DIR, reader, prod, now = () => Date.now() / 1000, log = () => {}, mode = 'LIVE' } = {}) {
  verifyFrozenRegistry();
  const store = createEvidenceStore({ dir });
  const statusPath = `${dir}/observer_status.json`;
  const st = { started_at: new Date(now() * 1000).toISOString(), cycles: 0, last_cycle_at: null, last_error: null, last_bar_time: null, market: { feed_state: 'UNKNOWN', last_tick_time: null }, counts: { observations: 0, outcomes: 0, duplicates: 0, invalid: 0, backfill: 0 }, reader: null, known_signals: 0, last_news_event_ts: null };
  const knownSignals = new Set(); let lastNewsTs = null;
  for (const o of store.readAll('observations')) { if (o.type === 'PRODUCTION_SIGNAL' && o.payload?.signal_id) knownSignals.add(o.payload.signal_id); if (o.type === 'NEWS_V2_EVENT' && o.payload?.timestamp) lastNewsTs = lastNewsTs && lastNewsTs > o.payload.timestamp ? lastNewsTs : o.payload.timestamp; }
  const put = (o) => { const r = store.appendObservation(o); if (r.ok) { st.counts.observations++; if (o.provenance === 'BACKFILL') st.counts.backfill++; } else if (r.reason === 'DUPLICATE') st.counts.duplicates++; else { st.counts.invalid++; log(`[shadow] invalid observation ${o.type} ${o.bar_time}: ${r.errors?.join(',')}`); } return r; };
  const putOutcome = (r) => { const x = store.appendOutcome(r); if (x.ok) st.counts.outcomes++; else if (x.reason !== 'DUPLICATE') log(`[shadow] outcome rejected ${r.observation_id} ${r.horizon}: ${x.reason} ${x.errors?.join(',') ?? ''}`); return x; };
  const writeStatus = () => { try { mkdirSync(dir, { recursive: true }); writeFileSync(statusPath, JSON.stringify({ ...st, store: store.stats(), schema_version: SCHEMA_VERSION, candidates: CANDIDATES.map((c) => c.id), updated_at: new Date(now() * 1000).toISOString() }, null, 1)); } catch { /* status is best effort */ } };

  async function marketSnapshot() {
    const [r5, r15, r30, r60, tk] = await Promise.all([reader.rates('XAUUSDm', '5m', 600), reader.rates('XAUUSDm', '15m', 300), reader.rates('XAUUSDm', '30m', 120), reader.rates('XAUUSDm', '1H', 80), reader.tick('XAUUSDm')]);
    const cross = {}; for (const s of CROSS_SYMBOLS) { try { const r = await reader.rates(s, '15m', 200); cross[s] = r.ok ? r.bars : null; } catch { cross[s] = null; } }
    return { bars5: r5.ok ? r5.bars : [], bars15: r15.ok ? r15.bars : [], bars30: r30.ok ? r30.bars : [], bars60: r60.ok ? r60.bars : [], tick: tk.ok ? tk.tick : null, cross };
  }
  function newsFor(decisionSec) {
    const cal = prod.calendar(); if (!cal) return { available: false, reason: 'NO_CALENDAR_SNAPSHOT' };
    const s = evaluateNewsState({ events: cal.events, now: new Date(decisionSec * 1000), calendar: { status: 'OK', source: cal.source, source_timestamp: cal.source_timestamp, last_success_at: cal.fetched_at, error: null, consecutive_failures: 0 }, params: NEWS_RISK_PARAMS });
    const lp = prod.lastProtection();
    return { available: true, computed_from_snapshot: { state: s.state, reason: s.reason, event: s.event ? { event_name: s.event.event_name, tier: s.event.tier, event_time_utc: s.event.event_time_utc, minutes_to_event: s.event.minutes_to_event, clock_min_end_utc: s.event.clock_min_end_utc ?? null, cluster_anchor_utc: s.event.cluster_anchor_utc ?? null, press_conference_utc: s.event.press_conference_utc ?? null } : null, next_event: s.next_event ? { event_name: s.next_event.event_name, tier: s.next_event.tier ?? classifyNewsTier(s.next_event), event_time_utc: s.next_event.event_time_utc, minutes_to_event: s.next_event.minutes_to_event } : null, block_ends_utc: s.block_ends_utc ?? null, calendar_source_timestamp: cal.source_timestamp }, production_reported: lp ? { at: lp.at, news_state: lp.news_state, news_tier: lp.news_tier ?? null, shock_state: lp.shock_state, block_reasons: lp.block_reasons, blocking: lp.blocking, last_block_cleared_at: lp.last_block_cleared_at, spread_ratio: lp.spread_ratio ?? null, feed_stale: lp.feed_stale ?? null, normalization_shadow: lp.normalization_shadow ?? null } : null };
  }

  async function cycle() {
    const nowSec = Math.floor(now()); st.cycles++; st.last_cycle_at = new Date(nowSec * 1000).toISOString();
    try {
      const m = await marketSnapshot(); const done5 = completedBars(m.bars5, 300, nowSec); st.market = { feed_state: m.tick ? (nowSec - m.tick.time > 90 ? 'STALE' : 'FRESH') : 'UNKNOWN', last_tick_time: m.tick?.time ?? null, last_completed_5m: done5.at(-1)?.time ?? null };
      // (2) candle observations for completed bars not yet stored (bounded backfill)
      for (const b of done5) {
        const closeSec = b.time + 300; const prov = mode === 'LIVE' ? provenanceFor({ barCloseSec: closeSec, nowSec }) : provenanceFor({ barCloseSec: closeSec, nowSec, mode }); if (!prov) continue;
        const id = observationId({ type: 'CANDLE_5M', candidate_id: null, symbol: 'XAUUSDm', timeframe: '5m', bar_time: b.time }); if (store.hasObservation(id)) continue;
        if (prov === 'FORWARD_LIVE' && nowSec - closeSec < 120) continue; // give the production watcher its evaluation window (<= 2 min) so the snapshot is not falsely "missing"
        const o = buildCandleObservation({ nowSec, barTime: b.time, bars5: m.bars5, bars15: m.bars15, bars30: m.bars30, bars60: m.bars60, tick: m.tick, cross: m.cross, prod: prod.snapshotForBar(b.time), news: newsFor(closeSec), provenance: prov });
        put(o); st.last_bar_time = b.time;
        // (3) SC1 at 15m boundaries
        if (closeSec % 900 === 0) { const c = candidateById('SC1_SILVER_LEAD_v1'); const ev = evaluateSilverLead(c, m.cross.XAGUSDm ?? [], closeSec); if (ev.triggered) put(buildTriggerObservation({ candidate: c, nowSec, decisionSec: closeSec, barTime: closeSec - 900, provenance: prov, side: c.hypothesis_side, payload: { z: ev.z, ret_15m: ev.ret, silver_bar_time: ev.bar_time, gold_atr14_15m: atr14(completedBars(m.bars15, 900, closeSec)) } })); }
      }
      // (4) production signals (SC2)
      for (const s of prod.newSignals(knownSignals)) {
        const c = candidateById('SC2_PRODUCTION_SIGNAL_v1'); const barTime = s.signal_bar_time; if (!Number.isFinite(barTime)) continue; const closeSec = barTime + 300; const createdSec = Date.parse(s.created_at ?? '') / 1000;
        const prov = mode === 'LIVE' ? provenanceFor({ barCloseSec: Number.isFinite(createdSec) ? createdSec : closeSec, nowSec }) : provenanceFor({ barCloseSec: closeSec, nowSec, mode }); if (!prov) { knownSignals.add(s.signal_id); continue; }
        const exec = prod.executionStatus(s.signal_id);
        const o = { schema_version: SCHEMA_VERSION, record: 'observation', type: 'PRODUCTION_SIGNAL', candidate_id: c.id, candidate_version: c.version, observation_id: observationId({ type: 'PRODUCTION_SIGNAL', candidate_id: c.id, symbol: 'XAUUSDm', timeframe: '5m', bar_time: barTime }), provenance: prov, source: 'shadow-observer', created_at_utc: new Date(nowSec * 1000).toISOString(), decision_time_utc: new Date(closeSec * 1000).toISOString(), symbol: 'XAUUSDm', feed: 'Exness MT5', timeframe: '5m', bar_time: barTime, bar_close_time: closeSec, hypothesis_side: s.side, execution_authority: 'NONE', payload: { signal_id: s.signal_id, side: s.side, model: s.model, quality: s.quality, rr: s.rr, entry: s.entry, stop_loss: s.stop_loss, tp1: s.tp1, tp2: s.tp2, thesis_id: s.thesis_id, engine_symbol: s.symbol, engine_created_at: s.created_at, execution: exec, news: newsFor(closeSec) } };
        if (put(o).ok || store.hasObservation(o.observation_id)) knownSignals.add(s.signal_id);
      }
      // (5) news / shock / protection transitions
      for (const ev of prod.protectionEvents(lastNewsTs)) {
        const t = Math.floor(Date.parse(ev.timestamp) / 1000); if (!Number.isFinite(t)) continue; const cid = `${ev.type}|${ev.timestamp}`;
        const prov = mode === 'LIVE' ? (provenanceFor({ barCloseSec: t, nowSec }) ?? 'BACKFILL') : provenanceFor({ barCloseSec: t, nowSec, mode });
        const o = { schema_version: SCHEMA_VERSION, record: 'observation', type: 'NEWS_V2_EVENT', candidate_id: cid, observation_id: observationId({ type: 'NEWS_V2_EVENT', candidate_id: cid, symbol: 'XAUUSDm', timeframe: 'event', bar_time: t }), provenance: prov, source: 'shadow-observer', created_at_utc: new Date(nowSec * 1000).toISOString(), decision_time_utc: new Date(t * 1000).toISOString(), symbol: 'XAUUSDm', feed: 'Exness MT5', timeframe: 'event', bar_time: t, hypothesis_side: 'NONE', payload: ev };
        put(o); if (!lastNewsTs || ev.timestamp > lastNewsTs) lastNewsTs = ev.timestamp;
      }
      st.last_news_event_ts = lastNewsTs; st.known_signals = knownSignals.size;
      // (6) outcomes
      labelPending({ nowSec, bars5: m.bars5, bars15: m.bars15 });
      st.last_error = null;
    } catch (err) { st.last_error = `${new Date(now() * 1000).toISOString()} ${err.message}`; log(`[shadow] cycle error: ${err.message}`); }
    writeStatus();
  }
  function labelPending({ nowSec, bars5, bars15 }) {
    for (const o of store.readAll('observations')) {
      const plan = OUTCOME_PLAN[o.type === 'CANDIDATE_TRIGGER' || o.type === 'PRODUCTION_SIGNAL' ? o.candidate_id : o.type]; if (!plan) continue;
      for (const [key, bars, tf] of plan) {
        if (store.hasOutcome(outcomeId(o.observation_id, key))) continue;
        const side = o.hypothesis_side === 'BUY' || o.hypothesis_side === 'SELL' ? o.hypothesis_side : null; const atr = o.type === 'CANDLE_5M' ? o.market?.atr14_5m : o.type === 'CANDIDATE_TRIGGER' ? o.payload?.gold_atr14_15m : null;
        const geometry = o.type === 'PRODUCTION_SIGNAL' && Number.isFinite(o.payload?.entry) && Number.isFinite(o.payload?.stop_loss) && Number.isFinite(o.payload?.tp1) ? { entry: o.payload.entry, stop_loss: o.payload.stop_loss, tp1: o.payload.tp1 } : null;
        const r = labelOutcome({ observation: o, horizonKey: key, horizonBars: bars, tfSec: TF_SEC[tf], bars: tf === '5m' ? bars5 : bars15, nowSec, side, refPrice: o.type === 'PRODUCTION_SIGNAL' && Number.isFinite(o.payload?.entry) ? o.payload.entry : null, atr: atr ?? null, geometry, provenance: o.provenance });
        if (r && r.status === 'LABELED') putOutcome(r); else if (r && r.status === 'INCOMPLETE_PATH' && nowSec - r.horizon_end_time > 48 * 3600) putOutcome(r); // give the bar window 48 h to arrive before recording an incomplete path
      }
    }
  }
  return { cycle, status: () => ({ ...st, store: store.stats() }), store, writeStatus };
}

// ---------------- process entry ----------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const once = process.argv.includes('--once'); const lock = `${SHADOW_DIR}/observer.lock`; mkdirSync(SHADOW_DIR, { recursive: true });
  if (existsSync(lock)) { const pid = Number(readFileSync(lock, 'utf8').trim()); let alive = false; try { process.kill(pid, 0); alive = true; } catch { alive = false; } if (alive && pid !== process.pid) { console.error(`shadow observer already running (pid ${pid}); refusing to start a duplicate`); process.exit(2); } }
  writeFileSync(lock, String(process.pid));
  const logPath = `${SHADOW_DIR}/observer.log`; const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); try { appendFileSync(logPath, line + '\n'); } catch { /* ignore */ } };
  const reader = createMt5Reader({ log }); const prod = createProductionReader(PROD_FILES);
  const shutdown = async (sig) => { log(`stopping (${sig})`); try { await reader.stop(); } catch { /* ignore */ } try { if (existsSync(lock) && readFileSync(lock, 'utf8').trim() === String(process.pid)) unlinkSync(lock); } catch { /* ignore */ } process.exit(0); };
  process.on('SIGINT', () => shutdown('SIGINT')); process.on('SIGTERM', () => shutdown('SIGTERM'));
  (async () => {
    const hello = await reader.start(); log(`reader hello login=${hello.login} server=${hello.server} read_only=${hello.read_only}`);
    for (const s of CROSS_SYMBOLS) { try { const r = await reader.select(s); log(`select ${s}: ${JSON.stringify(r)}`); } catch (e) { log(`select ${s} failed: ${e.message}`); } }
    const obs = createShadowObserver({ reader, prod, log }); const st = obs.status(); st.reader = { login: hello.login, server: hello.server, read_only: true }; log(`shadow observer started pid=${process.pid} schema=${SCHEMA_VERSION} candidates=${CANDIDATES.map((c) => c.id).join(',')}`);
    await obs.cycle(); log(`cycle 1 done: ${JSON.stringify(obs.status().counts)} market=${JSON.stringify(obs.status().market)}`);
    if (once) return shutdown('once');
    setInterval(() => obs.cycle().then(() => { const s = obs.status(); if (s.cycles % 10 === 0) log(`cycle ${s.cycles}: ${JSON.stringify(s.counts)} market=${JSON.stringify(s.market)}`); }), 60_000);
  })().catch((e) => { log(`fatal: ${e.message}`); shutdown('fatal'); });
}
