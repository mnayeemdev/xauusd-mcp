/**
 * V8 FORWARD SHADOW VALIDATION -- live measure-only runner (RESEARCH ONLY; execution authority NONE).
 * For every new completed XAUUSDm 5m candle (read-only MT5 reader, mt5/mt5_shadow_reader.py) it evaluates the FROZEN V8
 * corrected core and production CONTROL on identical confirmed windows, applies the shadow execution-safety stage
 * (production spread limit, News V2 from the calendar snapshot, production shock state), and records BUY/SELL/WAIT with an
 * exact reason. Shadow signals are tracked as HYPOTHETICAL_NOT_EXECUTED trades. Nothing here can send, modify or close an
 * order: the reader protocol has no trading command and no executor/bridge module is imported.
 *   node research/v8_forward_shadow/scripts/runner.mjs            (live; own lock state/v8_shadow/runner.lock)
 *   node research/v8_forward_shadow/scripts/runner.mjs --report   (render reports from the store and exit)
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, SCHEMA, TF_SEC, WINDOW, V8_ENGINE_DIR, CONTROL_ENGINE_DIR, verifyFrozenV8Engine, loadEngine, evaluateEngine, regressionChecks, safetyStage, labelOutcome, wrongDirectionClass, moveEventAt, classifyMissed, decisionId, windowHash, sha } from './lib.mjs';

import { buildQuote, validateQuote, CONTRACT as QUOTE_CONTRACT } from '../../quote_integrity_v15/scripts/quote.mjs';
import { initTracker, observePoll, quoteSnapshot, CONTRACT as TIMING_CONTRACT, POLL_INTERVAL_MS } from '../../execution_timing_v16/scripts/timing.mjs';
import { revalidate, engineSnapshot } from '../../execution_timing_v16/scripts/revalidate.mjs';
import { runProbes } from '../../execution_timing_v16/scripts/probes.mjs';

export const STATE_DIR = join(REPO, 'state', 'v8_shadow');
// V15 quote contract (2026-10-02): every decision record carries the broker tick (time_msc, bid, ask, flags), the receive and decision
// timestamps and the computed quote age; nothing is reconstructed. Broker clock = UTC per the V15 live calibration (median of
// time_msc - received, rounded to 15 min = 0). Freshness limit = the existing production rule REAL_DEFAULTS.maxQuoteAgeSec (90 s).
export const QUOTE_SERVER_UTC_OFFSET_MS = 0; export const QUOTE_MAX_AGE_MS = 90_000;
const QUOTE_OFFSET_SOURCE = 'V15 live calibration 2026-10-02: median(time_msc - received) rounded to 15 min = 0 (broker clock = UTC)';
const TFS = ['5m', '15m', '30m', '1H'];
const FRESH_SEC = 120; const SETTLE_SEC = 8; const DUP_BARS = 12;
const isSig = (a) => a === 'BUY' || a === 'SELL';
const iso = (t) => new Date(t * 1000).toISOString();

function jsonl(p) { if (!existsSync(p)) return []; return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }

/** dir: state directory; reader: { rates(symbol, tf, count), tick(symbol) } read-only; prod: { calendar(), lastProtection() } read-only; newsEval(cal, nowSec) -> { state, event }. */
/** timing (V16, optional): { mono(), wallMs(), getQuote(), sleepUntil(mono), spec, probes } -- monotonic durations, broker identity, no clock offset. */
export async function createForwardShadow({ dir = STATE_DIR, reader, prod = null, newsEval = null, now = () => Date.now() / 1000, log = () => {}, engines = null, timing = null } = {}) {
  mkdirSync(dir, { recursive: true });
  const P = (f) => join(dir, f);
  const frozen = engines ? { files: 'injected' } : verifyFrozenV8Engine();
  const ENG = engines ?? { V8: await loadEngine(V8_ENGINE_DIR, { fixes: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] }), CONTROL: await loadEngine(CONTROL_ENGINE_DIR, { fixes: [] }) };
  // ---------- persistent state ----------
  const archive = Object.fromEntries(TFS.map((tf) => [tf, new Map(jsonl(P(`archive_${tf}.jsonl`)).map((b) => [b.time, b]))]));
  const decisions = jsonl(P('decisions.jsonl')); const decIds = new Set(decisions.map((d) => d.id));
  const outcomes = new Map(jsonl(P('outcomes.jsonl')).map((o) => [o.id, o])); const events = jsonl(P('events.jsonl')); const evIds = new Set(events.map((e) => e.id)); const parity = new Map(jsonl(P('parity.jsonl')).map((x) => [x.id, x]));
  const status = existsSync(P('status.json')) ? JSON.parse(readFileSync(P('status.json'), 'utf8')) : {};
  const st = { schema: SCHEMA, started_at: iso(now()), frozen_engine: frozen, cycles: 0, last_decided_bar: status.last_decided_bar ?? (decisions.length ? Math.max(...decisions.map((d) => d.bar_time)) : null), scan_pointer: status.scan_pointer ?? null, observation_start: status.observation_start ?? (decisions.length ? new Date(Math.min(...decisions.map((d) => Date.parse(d.decision_time_utc)))).toISOString() : iso(now())), last_snapshot_day: status.last_snapshot_day ?? null, last_error: null, revisions: status.revisions ?? 0 };
  const append = (f, rec) => appendFileSync(P(f), JSON.stringify(rec) + '\n');
  const writeStatus = () => { const counts = summaryCounts(); const last = st.last_decided_bar ? iso(st.last_decided_bar + 300) : null; writeFileSync(P('status.json'), JSON.stringify({ ...st, ...counts, observation_end: last, elapsed_hours: last ? Math.round((Date.parse(last) - Date.parse(st.observation_start)) / 36e5 * 10) / 10 : 0, sample_size_gate: 'NONE', trade_count_target: 'NONE', updated_at: iso(now()) }, null, 1)); };
  function summaryCounts() { const by = (e) => decisions.filter((d) => d.engine === e && d.provenance === 'FORWARD_LIVE'); const o = {}; for (const e of ['V8', 'CONTROL']) { const ds = by(e); o[e] = { decisions: ds.length, valid_setups: ds.filter((d) => d.valid_setup && !d.duplicate).length, shadow_signals: ds.filter((d) => d.counted_signal).length, labelled: ds.filter((d) => d.counted_signal && outcomes.has(d.id)).length }; } return { FORWARD_SIGNAL_COUNT: o.V8.shadow_signals, FORWARD_VALID_SETUP_COUNT: o.V8.valid_setups, engines: o }; }
  // ---------- archive ----------
  function archiveBars(tf, bars, nowSec) { let added = 0; for (const b of bars) { if (!(b.time + TF_SEC[tf] <= nowSec)) continue; const x = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }; const prev = archive[tf].get(b.time); if (!prev) { archive[tf].set(b.time, x); append(`archive_${tf}.jsonl`, x); added++; } else if (prev.open !== x.open || prev.high !== x.high || prev.low !== x.low || prev.close !== x.close) { st.revisions++; append('revisions.jsonl', { tf, time: b.time, first_seen: prev, now: x, at: iso(nowSec) }); } } return added; }
  const sortedArchive = (tf) => [...archive[tf].values()].sort((a, b) => a.time - b.time);
  // ---------- data integrity ----------
  function integrity(windows, barTime, nowSec) { const r = {}; for (const tf of TFS) { const w = windows[tf]; r[`${tf}_length`] = w.length === WINDOW ? 'PASS' : 'FAIL'; r[`${tf}_monotonic`] = w.every((b, i) => i === 0 || b.time > w[i - 1].time) ? 'PASS' : 'FAIL'; r[`${tf}_aligned`] = w.every((b) => b.time % TF_SEC[tf] === 0) ? 'PASS' : 'FAIL'; r[`${tf}_no_forming_bar`] = w.every((b) => b.time + TF_SEC[tf] <= nowSec) ? 'PASS' : 'FAIL'; r[`${tf}_geometry`] = w.every((b) => b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close)) ? 'PASS' : 'FAIL'; } r['5m_complete_decision_bar'] = windows['5m'].at(-1)?.time === barTime ? 'PASS' : 'FAIL'; return r; }
  let lastQuote = null; // last accepted quote (V15 ordering / duplicate check)
  // ---------- one decision ----------
  async function decide(barTime, nowSec) {
    const fetched = {}; let fetchErr = null;
    for (const tf of TFS) { try { const r = await reader.rates('XAUUSDm', tf, WINDOW + 6); if (!r.ok) throw new Error(r.error ?? 'rates not ok'); fetched[tf] = r.bars ?? []; } catch (e) { fetchErr = `${tf}: ${e.message}`; break; } }
    let tick = null, tickReceivedMs = null; try { const t = await reader.tick('XAUUSDm'); tick = t.ok ? t.tick : null; tickReceivedMs = Number.isFinite(t.received_ms) ? t.received_ms : null; } catch { tick = null; }
    const quote = buildQuote({ symbol: 'XAUUSDm', tick, receivedMs: tickReceivedMs, decisionMs: Math.round(now() * 1000), serverUtcOffsetMs: QUOTE_SERVER_UTC_OFFSET_MS, offsetSource: QUOTE_OFFSET_SOURCE });
    const qc = validateQuote(quote, { prev: lastQuote, maxAgeMs: QUOTE_MAX_AGE_MS }); if (qc.status === 'VALID' || qc.status === 'STALE') lastQuote = quote;
    const quoteFields = { quote_contract: QUOTE_CONTRACT, quote, quote_check: { status: qc.status, reasons: qc.reasons, duplicate: qc.duplicate, quote_age_ms: qc.quote_age_ms } };
    const latency = Math.round(nowSec - (barTime + 300)); const provenance = latency <= FRESH_SEC ? 'FORWARD_LIVE' : 'LATE_DECISION';
    const base = { schema: SCHEMA, record: 'decision', symbol: 'XAUUSDm', timeframe: '5m', bar_time: barTime, bar_close_utc: iso(barTime + 300), decision_time_utc: iso(nowSec), latency_sec: latency, provenance, executed: false, execution_authority: 'NONE', ...quoteFields };
    if (fetchErr) { for (const engine of ['V8', 'CONTROL']) record({ ...base, id: decisionId(engine, barTime), engine, action: 'WAIT', engine_action: 'WAIT', wait_category: 'DATA_UNAVAILABLE', wait_detail: `fetch failed: ${fetchErr}`, valid_setup: false, shadow_signal: false, counted_signal: false }); return; }
    for (const tf of TFS) archiveBars(tf, fetched[tf], nowSec);
    const windows = Object.fromEntries(TFS.map((tf) => [tf, fetched[tf].filter((b) => b.time + TF_SEC[tf] <= nowSec).sort((a, b) => a.time - b.time).slice(-WINDOW).map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }))]));
    const integ = integrity(windows, barTime, nowSec); const hashes = Object.fromEntries(TFS.map((tf) => [tf, windowHash(windows[tf])])); const lastBars = Object.fromEntries(TFS.map((tf) => [tf, windows[tf].at(-1)?.time ?? null]));
    const spread = tick && Number.isFinite(tick.ask) && Number.isFinite(tick.bid) ? tick.ask - tick.bid : null;
    const { news, shock } = safetyInputs(nowSec);
    const integrityFail = Object.values(integ).includes('FAIL');
    const barsInfo = { last_closed_open: windows['5m'].at(-1)?.time ?? null, latest_open: fetched['5m'].length ? Math.max(...fetched['5m'].map((b) => b.time)) : null }; let probeSignal = null;
    for (const engine of ['V8', 'CONTROL']) {
      const id = decisionId(engine, barTime); if (decIds.has(id)) continue;
      if (integrityFail) { record({ ...base, id, engine, action: 'WAIT', engine_action: 'WAIT', wait_category: 'DATA_UNAVAILABLE', wait_detail: `data integrity: ${Object.entries(integ).filter(([, v]) => v === 'FAIL').map(([k]) => k).join(', ')}`, data_integrity: integ, input_hashes: hashes, input_last_bars: lastBars, valid_setup: false, shadow_signal: false, counted_signal: false }); continue; }
      const d = evaluateEngine(ENG[engine], windows, nowSec, { applyStaleGate: engine === 'V8' });
      const obsMono = timing ? timing.mono() : null, obsWall = timing ? timing.wallMs() : null; // V16: the moment the signal exists (monotonic + wall)
      const regression = regressionChecks(d, windows);
      let action = d.engine_action, wc = d.wait_category, wd = d.wait_detail, safety = null;
      if (isSig(d.engine_action)) { safety = safetyStage({ spread, news, shock, candidate: d.candidate }); if (safety.block) { action = 'WAIT'; wc = safety.block.category; wd = safety.block.detail; } }
      const rec = { ...base, id, engine, ...d, action, wait_category: action === 'WAIT' ? wc : null, wait_detail: action === 'WAIT' ? wd : null, safety, spread_usd: spread == null ? null : Math.round(spread * 1000) / 1000, news_state: news?.state ?? null, shock_state: shock.state, session: sessionOf(barTime), data_integrity: integ, input_hashes: hashes, input_last_bars: lastBars, regression, valid_setup: isSig(d.engine_action), shadow_signal: isSig(action) };
      // duplicate identity: same engine, model, side and anchor within 12 bars of a counted signal
      const prior = decisions.filter((x) => x.engine === engine && x.counted_signal && x.candidate && rec.candidate && x.candidate.model === rec.candidate.model && x.candidate.side === rec.candidate.side && Math.round(x.candidate.anchor * 100) === Math.round(rec.candidate.anchor * 100) && barTime - x.bar_time <= DUP_BARS * 300);
      rec.duplicate = rec.valid_setup && prior.length > 0; rec.counted_signal = rec.shadow_signal && !rec.duplicate && provenance === 'FORWARD_LIVE';
      if (timing) { try { const v = v16Block({ engine, d, rec, windows, integ, barsInfo, news, shock, obsMono, obsWall, barTime }); rec.v16 = v.block; if (v.probe) probeSignal = v.probe; } catch (e) { rec.v16 = { contract: TIMING_CONTRACT, error: String(e?.message ?? e) }; } }
      record(rec);
    }
    // V16: re-validate a forward-live V8 signal at 0-6 s (and 8 s) after its observation; measure only, nothing is executed
    if (timing?.probes && probeSignal) { try { await runProbes({ ...probeSignal, deps: probeDeps() }); } catch (e) { log(`[v8shadow] timing probes error: ${e.message}`); } }
  }
  function safetyInputs(nowSec) {
    let news = null; try { const cal = prod?.calendar?.(); news = cal && newsEval ? newsEval(cal, nowSec) : { state: 'DATA_UNAVAILABLE' }; } catch { news = { state: 'DATA_UNAVAILABLE' }; }
    let shock = { state: 'UNKNOWN' }; try { const lp = prod?.lastProtection?.(); if (lp && nowSec - Date.parse(lp.at) / 1000 <= 900) shock = { state: lp.shock_state ?? 'UNKNOWN', at: lp.at }; else shock = { state: 'NORMAL_OR_STALE', at: lp?.at ?? null }; } catch { /* keep UNKNOWN */ }
    return { news, shock };
  }
  // ---------- V16 execution timing (research, measure-only) ----------
  function atrOf(engine, windows) { try { const v = ENG[engine].math.atr(windows['5m'], 14).at(-1); return Number.isFinite(v) ? v : null; } catch { return null; } }
  function v16Block({ engine, d, rec, windows, integ, barsInfo, news, shock, obsMono, obsWall, barTime }) {
    const q = timing.getQuote(); const dm = timing.mono(), dw = timing.wallMs(); const sig = isSig(d.engine_action);
    const snap = engineSnapshot({ ...d, data_integrity: integ }, barTime, { atrExact: atrOf(engine, windows) });
    const inline = sig && engine === 'V8' ? revalidate({ original: snap, current: snap, quote: q, signal: { observed_mono: obsMono, observed_wall_ms: obsWall }, decision: { mono: dm, wallMs: dw }, bars: barsInfo, news, shock, spec: timing.spec, configName: 'PRIMARY' }) : null;
    const qAge = q && Number.isFinite(q.appeared_after_mono) ? Math.round((dm - q.appeared_after_mono) * 1000) / 1000 : null;
    const block = { contract: TIMING_CONTRACT, symbol: 'XAUUSDm', timeframe: '5m', signal_timestamp: sig ? { bar_close_utc: iso(barTime + 300), observed_wall_utc: new Date(obsWall).toISOString(), observed_mono_ms: obsMono } : null, quote_timestamp_ms: q?.quote_timestamp_ms ?? null, decision_timestamp: { wall_utc: new Date(dw).toISOString(), mono_ms: dm },
      signal_age_seconds: inline?.signal_age_seconds ?? null, quote_age_ms: inline?.quote_age_ms ?? qAge, bid: q?.bid ?? null, ask: q?.ask ?? null, spread: q?.spread ?? null, entry: inline?.entry_price ?? null, sl: sig ? d.candidate?.stop_loss ?? null : null, rr: inline?.rr ?? null,
      final_decision: inline ? inline.decision : rec.action, decision_reason: inline ? inline.reason : rec.wait_category ?? rec.engine_wait_reason ?? null, revalidated_by_v16: !!inline, revalidation: inline, clock_monitor: q && Number.isFinite(q.first_seen_wall_ms) ? { wall_minus_broker_ms: q.first_seen_wall_ms - q.quote_timestamp_ms, note: 'monitor only (first receipt on the PC wall clock minus broker tick time)' } : null };
    const probe = sig && engine === 'V8' && rec.provenance === 'FORWARD_LIVE' ? { original: snap, signal: { observed_mono: obsMono, observed_wall_ms: obsWall, bar_time: barTime }, signalId: rec.id } : null;
    return { block, probe };
  }
  function probeDeps() {
    return { mono: timing.mono, wallMs: timing.wallMs, sleepUntil: timing.sleepUntil, getQuote: timing.getQuote, spec: timing.spec ?? null, onRecord: (r) => append('timing_probes.jsonl', r),
      fetchContext: async () => { const nowSec = Math.floor(now()); const fetched = {}; for (const tf of TFS) { const r = await reader.rates('XAUUSDm', tf, WINDOW + 6); if (!r.ok) throw new Error(r.error ?? 'rates not ok'); fetched[tf] = r.bars ?? []; }
        const windows = Object.fromEntries(TFS.map((tf) => [tf, fetched[tf].filter((b) => b.time + TF_SEC[tf] <= nowSec).sort((a, b) => a.time - b.time).slice(-WINDOW).map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }))]));
        const lastBar = windows['5m'].at(-1)?.time ?? null; const integ = integrity(windows, lastBar, nowSec); const d = evaluateEngine(ENG.V8, windows, nowSec, { applyStaleGate: true }); const { news, shock } = safetyInputs(nowSec);
        return { current: engineSnapshot({ ...d, data_integrity: integ }, lastBar, { atrExact: atrOf('V8', windows) }), bars: { last_closed_open: lastBar, latest_open: fetched['5m'].length ? Math.max(...fetched['5m'].map((b) => b.time)) : null }, news, shock }; } };
  }
  function record(rec) { if (decIds.has(rec.id)) return; decIds.add(rec.id); decisions.push(rec); append('decisions.jsonl', rec); }
  const sessionOf = (t) => { const h = new Date(t * 1000).getUTCHours(); return h >= 8 && h < 13 ? 'LONDON' : h >= 13 && h < 21 ? 'NEW_YORK' : h < 8 ? 'ASIA' : 'OTHER'; };
  // ---------- outcomes ----------
  function labelPending() { const a5 = sortedArchive('5m'); const idx = new Map(a5.map((b, i) => [b.time, i])); for (const d of decisions) { if (!(d.counted_signal || (d.valid_setup && !d.duplicate && d.provenance === 'FORWARD_LIVE')) || outcomes.has(d.id) || !d.candidate) continue; const i = idx.get(d.bar_time); if (i == null) continue; const o = labelOutcome(a5, i, d.candidate); if (!o) continue; const rec = { schema: SCHEMA, record: 'outcome', id: d.id, engine: d.engine, bar_time: d.bar_time, labelled_at: iso(now()), counted_signal: !!d.counted_signal, ...o }; if (o.wrong_direction || o.against_entry) rec.forensics = wrongDirectionClass({ ...d, replay_mismatch: parity.get(d.id)?.match === false }); outcomes.set(d.id, rec); append('outcomes.jsonl', rec); } }
  // ---------- missed-setup events ----------
  function scanEvents() { const a5 = sortedArchive('5m'); const times = a5.map((b) => b.time); const lastDecided = st.last_decided_bar; if (!lastDecided) return; const fwd = decisions.filter((d) => d.provenance === 'FORWARD_LIVE'); if (!fwd.length) return; const first = Math.min(...fwd.map((d) => d.bar_time));
    let k = st.scan_pointer != null ? times.indexOf(st.scan_pointer) : times.indexOf(first) + 6; if (k < 0) k = times.findIndex((t) => t >= (st.scan_pointer ?? first + 1800));
    const byEngine = { V8: new Map(), CONTROL: new Map() }; for (const d of fwd) byEngine[d.engine].set(d.bar_time, d);
    while (k > 14 && k + 24 < a5.length && times[k + 6] <= lastDecided) { const ev = moveEventAt(a5, k); if (ev) { const id = `${times[k]}`; if (!evIds.has(id)) { const around = []; for (let q = k - 6; q <= k + 6; q++) around.push(times[q]); const res = { schema: SCHEMA, record: 'move_event', id, onset_bar_time: times[k], onset_utc: iso(times[k]), dir: ev.dir, atr: Math.round(ev.atr * 1000) / 1000, bars_to_move: ev.end - k, V8: classifyMissed(ev, byEngine.V8, around, times[k]), CONTROL: classifyMissed(ev, byEngine.CONTROL, around, times[k]) }; evIds.add(id); events.push(res); append('events.jsonl', res); } k += 24; } else k++; st.scan_pointer = times[k] ?? st.scan_pointer; } }
  // ---------- replay cross-check from the archive ----------
  function replayCheck(nowSec) { const sampled = decisions.filter((d) => d.engine && d.provenance === 'FORWARD_LIVE' && !parity.has(d.id) && d.input_hashes && (d.valid_setup || d.shadow_signal || d.bar_time % 3600 === 0) && nowSec - Date.parse(d.decision_time_utc) / 1000 >= 60); if (!sampled.length) return; const arch = Object.fromEntries(TFS.map((tf) => [tf, sortedArchive(tf)]));
    for (const d of sampled) { const t = Date.parse(d.decision_time_utc) / 1000; const windows = Object.fromEntries(TFS.map((tf) => [tf, arch[tf].filter((b) => b.time + TF_SEC[tf] <= t).slice(-WINDOW)])); const hashes = Object.fromEntries(TFS.map((tf) => [tf, windowHash(windows[tf])])); const inputsEqual = TFS.every((tf) => hashes[tf] === d.input_hashes[tf]); let match = null, diffs = [];
      if (inputsEqual) { const r = evaluateEngine(ENG[d.engine], windows, t, { applyStaleGate: d.engine === 'V8' }); const f = (x) => ({ engine_action: x.engine_action, engine_wait_reason: x.engine_wait_reason, model: x.model, side: x.candidate?.side ?? null, entry: x.candidate?.entry ?? null, sl: x.candidate?.stop_loss ?? null, tp2: x.candidate?.tp2_engine ?? null, rr: x.candidate?.rr_engine ?? null, tp170: x.candidate?.tp_170r ?? null, wait_category: x.wait_category, stages: x.stages ? `${x.stages.BUY}|${x.stages.SELL}` : null, origin: x.candidate?.origin_bar_time ?? null }); const a = f(d), b = f(r); if (isSig(d.engine_action) && d.action === 'WAIT') a.wait_category = b.wait_category; diffs = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])); match = diffs.length === 0; }
      const rec = { schema: SCHEMA, record: 'replay_parity', id: d.id, engine: d.engine, bar_time: d.bar_time, inputs_equal: inputsEqual, match, diffs, checked_at: iso(nowSec) }; parity.set(d.id, rec); append('parity.jsonl', rec); if (match === false) log(`[v8shadow] REPLAY MISMATCH ${d.engine} ${iso(d.bar_time)} ${diffs.join(',')}`); } }
  // ---------- daily evidence snapshot (calendar-based context only; there is no sample-size gate and no trade target) ----------
  function dailySnapshot() { const day = st.last_decided_bar ? iso(st.last_decided_bar).slice(0, 10) : null; if (!day || day === st.last_snapshot_day) return; if (st.last_snapshot_day) { mkdirSync(P('snapshots'), { recursive: true }); writeFileSync(P(`snapshots/${st.last_snapshot_day}.json`), JSON.stringify({ day: st.last_snapshot_day, written_at: iso(now()), observation_start: st.observation_start, counts: summaryCounts() }, null, 1)); } st.last_snapshot_day = day; }
  // ---------- cycle ----------
  async function cycle() {
    const nowSec = Math.floor(now()); st.cycles++;
    try {
      const r = await reader.rates('XAUUSDm', '5m', 3); if (!r.ok) throw new Error(r.error ?? 'rates not ok');
      const done = (r.bars ?? []).filter((b) => b.time + 300 <= nowSec).sort((a, b) => a.time - b.time); const L = done.at(-1)?.time ?? null;
      if (L != null && (st.last_decided_bar == null || L > st.last_decided_bar) && nowSec - (L + 300) >= SETTLE_SEC) { await decide(L, nowSec); st.last_decided_bar = L; labelPending(); scanEvents(); dailySnapshot(); }
      replayCheck(nowSec); st.last_cycle_at = iso(nowSec); st.last_error = null;
    } catch (e) { st.last_error = `${iso(nowSec)} ${e.message}`; log(`[v8shadow] cycle error: ${e.message}`); }
    writeStatus();
  }
  return { cycle, probeDeps: timing ? probeDeps : null, status: () => ({ ...st, ...summaryCounts() }), decisions: () => decisions, outcomes: () => outcomes, events: () => events, parity: () => parity, archive: () => archive, dir };
}

// ---------------- live entry point ----------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain && process.argv.includes('--report')) { const { renderReports } = await import('./report.mjs'); const outDir = process.argv[process.argv.indexOf('--report') + 1]; renderReports({ dir: STATE_DIR, outDir: outDir && !outDir.startsWith('--') ? outDir : join(REPO, 'research', 'v8_forward_shadow', 'reports') }); process.exit(0); }
if (isMain) {
  try { (await import('node:os')).setPriority((await import('node:os')).constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* best effort */ }
  mkdirSync(STATE_DIR, { recursive: true }); const lock = join(STATE_DIR, 'runner.lock');
  if (existsSync(lock)) { const pid = Number(readFileSync(lock, 'utf8').trim()); let alive = false; try { process.kill(pid, 0); alive = true; } catch { alive = false; } if (alive && pid !== process.pid) { console.error(`v8 forward shadow already running (pid ${pid})`); process.exit(1); } }
  writeFileSync(lock, String(process.pid));
  const logPath = join(STATE_DIR, 'runner.log'); const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); try { appendFileSync(logPath, line + '\n'); } catch { /* ignore */ } };
  const { createMt5Reader } = await import('../../../src/shadow/mt5Reader.js'); const { createProductionReader } = await import('../../../src/shadow/production.js'); const { PROD_FILES } = await import('../../../src/shadow/observer.js'); const { evaluateNewsState, NEWS_RISK_PARAMS } = await import('../../../src/engine/newsRisk.js');
  const reader = createMt5Reader({ log }); const hello = await reader.start(); log(`reader hello read_only=${hello?.read_only ?? 'n/a'}`); try { await reader.select('XAUUSDm'); } catch { /* ignore */ }
  const prod = createProductionReader(PROD_FILES);
  // V16 execution timing (2026-10-02): continuous read-only quote polling; monotonic clock for every duration, broker time for identity, no clock offset.
  const { loadPlatformSpec } = await import('../../entry_risk_integration_v11/scripts/integrate.mjs'); let spec = null; try { spec = loadPlatformSpec(join(REPO, 'state', 'xauusd_mt5_real_trade_log.jsonl')); } catch (e) { log(`V16 platform spec unavailable (risk fails closed): ${e.message}`); }
  let tracker = initTracker(); let polling = true; const perf = globalThis.performance;
  const sleepUntil = async (m) => { const rem = m - perf.now(); if (rem > 20) await new Promise((r) => setTimeout(r, rem - 20)); while (perf.now() < m) { /* sub-20 ms spin to the instant */ } };
  (async () => { while (polling) { const t0 = perf.now(); try { const r = await reader.tick('XAUUSDm'); tracker = observePoll(tracker, { requestMono: t0, receiveMono: perf.now(), receiveWallMs: Date.now(), ok: !!r?.ok, tick: r?.tick ?? null }); } catch { tracker = observePoll(tracker, { ok: false }); } await new Promise((r) => setTimeout(r, Math.max(0, POLL_INTERVAL_MS - (perf.now() - t0)))); } })();
  const timing = { mono: () => perf.now(), wallMs: () => Date.now(), getQuote: () => quoteSnapshot(tracker), sleepUntil, spec, probes: true };
  const newsEval = (cal, nowSec) => { const s = evaluateNewsState({ events: cal.events, now: new Date(nowSec * 1000), calendar: { status: 'OK', source: cal.source, source_timestamp: cal.source_timestamp, last_success_at: cal.fetched_at, error: null, consecutive_failures: 0 }, params: NEWS_RISK_PARAMS }); return { state: s.state, event: s.event ? `${s.event.event_name} ${s.event.tier ?? ''}`.trim() : null }; };
  const fs = await createForwardShadow({ reader, prod, newsEval, log, timing });
  log(`v8 forward shadow started pid=${process.pid} frozen=${JSON.stringify(fs.status().frozen_engine)} execution_authority=NONE v16_timing=${TIMING_CONTRACT} spec=${spec ? 'ok' : 'unavailable'}`);
  let stopping = false; const shutdown = async (sig) => { if (stopping) return; stopping = true; polling = false; log(`stopping (${sig})`); try { await reader.stop(); } catch { /* ignore */ } try { if (existsSync(lock) && readFileSync(lock, 'utf8').trim() === String(process.pid)) unlinkSync(lock); } catch { /* ignore */ } process.exit(0); };
  process.on('SIGINT', () => shutdown('SIGINT')); process.on('SIGTERM', () => shutdown('SIGTERM'));
  let n = 0; const loop = async () => { /* one evaluation per completed 5m candle; no sample-size gate, no trade target */ if (stopping) return; if (!reader.alive()) { try { await reader.start(); log('reader restarted'); } catch (e) { log(`reader restart failed: ${e.message}`); } } await fs.cycle(); n++; if (n % 120 === 0) log(`cycle ${n}: ${JSON.stringify({ signals: fs.status().FORWARD_SIGNAL_COUNT, valid: fs.status().FORWARD_VALID_SETUP_COUNT, last_bar: fs.status().last_decided_bar, err: fs.status().last_error })}`); setTimeout(loop, 5000); };
  loop();
}
