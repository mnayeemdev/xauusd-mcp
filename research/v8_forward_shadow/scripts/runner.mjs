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
import { REPO, SCHEMA, TF_SEC, WINDOW, CHECKPOINTS, V8_ENGINE_DIR, CONTROL_ENGINE_DIR, verifyFrozenV8Engine, loadEngine, evaluateEngine, regressionChecks, safetyStage, labelOutcome, wrongDirectionClass, moveEventAt, classifyMissed, decisionId, windowHash, sha } from './lib.mjs';

export const STATE_DIR = join(REPO, 'state', 'v8_shadow');
const TFS = ['5m', '15m', '30m', '1H'];
const FRESH_SEC = 120; const SETTLE_SEC = 8; const DUP_BARS = 12;
const isSig = (a) => a === 'BUY' || a === 'SELL';
const iso = (t) => new Date(t * 1000).toISOString();

function jsonl(p) { if (!existsSync(p)) return []; return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }

/** dir: state directory; reader: { rates(symbol, tf, count), tick(symbol) } read-only; prod: { calendar(), lastProtection() } read-only; newsEval(cal, nowSec) -> { state, event }. */
export async function createForwardShadow({ dir = STATE_DIR, reader, prod = null, newsEval = null, now = () => Date.now() / 1000, log = () => {}, engines = null } = {}) {
  mkdirSync(dir, { recursive: true });
  const P = (f) => join(dir, f);
  const frozen = engines ? { files: 'injected' } : verifyFrozenV8Engine();
  const ENG = engines ?? { V8: await loadEngine(V8_ENGINE_DIR, { fixes: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] }), CONTROL: await loadEngine(CONTROL_ENGINE_DIR, { fixes: [] }) };
  // ---------- persistent state ----------
  const archive = Object.fromEntries(TFS.map((tf) => [tf, new Map(jsonl(P(`archive_${tf}.jsonl`)).map((b) => [b.time, b]))]));
  const decisions = jsonl(P('decisions.jsonl')); const decIds = new Set(decisions.map((d) => d.id));
  const outcomes = new Map(jsonl(P('outcomes.jsonl')).map((o) => [o.id, o])); const events = jsonl(P('events.jsonl')); const evIds = new Set(events.map((e) => e.id)); const parity = new Map(jsonl(P('parity.jsonl')).map((x) => [x.id, x]));
  const status = existsSync(P('status.json')) ? JSON.parse(readFileSync(P('status.json'), 'utf8')) : {};
  const st = { schema: SCHEMA, started_at: iso(now()), frozen_engine: frozen, cycles: 0, last_decided_bar: status.last_decided_bar ?? (decisions.length ? Math.max(...decisions.map((d) => d.bar_time)) : null), scan_pointer: status.scan_pointer ?? null, checkpoints_done: status.checkpoints_done ?? [], frozen_300: status.frozen_300 ?? null, last_error: null, revisions: status.revisions ?? 0 };
  const append = (f, rec) => appendFileSync(P(f), JSON.stringify(rec) + '\n');
  const writeStatus = () => { const counts = summaryCounts(); writeFileSync(P('status.json'), JSON.stringify({ ...st, ...counts, updated_at: iso(now()) }, null, 1)); };
  function summaryCounts() { const by = (e) => decisions.filter((d) => d.engine === e && d.provenance === 'FORWARD_LIVE'); const o = {}; for (const e of ['V8', 'CONTROL']) { const ds = by(e); o[e] = { decisions: ds.length, valid_setups: ds.filter((d) => d.valid_setup && !d.duplicate).length, shadow_signals: ds.filter((d) => d.counted_signal).length, labelled: ds.filter((d) => d.counted_signal && outcomes.has(d.id)).length }; } return { FORWARD_SIGNAL_COUNT: o.V8.shadow_signals, FORWARD_VALID_SETUP_COUNT: o.V8.valid_setups, engines: o }; }
  // ---------- archive ----------
  function archiveBars(tf, bars, nowSec) { let added = 0; for (const b of bars) { if (!(b.time + TF_SEC[tf] <= nowSec)) continue; const x = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }; const prev = archive[tf].get(b.time); if (!prev) { archive[tf].set(b.time, x); append(`archive_${tf}.jsonl`, x); added++; } else if (prev.open !== x.open || prev.high !== x.high || prev.low !== x.low || prev.close !== x.close) { st.revisions++; append('revisions.jsonl', { tf, time: b.time, first_seen: prev, now: x, at: iso(nowSec) }); } } return added; }
  const sortedArchive = (tf) => [...archive[tf].values()].sort((a, b) => a.time - b.time);
  // ---------- data integrity ----------
  function integrity(windows, barTime, nowSec) { const r = {}; for (const tf of TFS) { const w = windows[tf]; r[`${tf}_length`] = w.length === WINDOW ? 'PASS' : 'FAIL'; r[`${tf}_monotonic`] = w.every((b, i) => i === 0 || b.time > w[i - 1].time) ? 'PASS' : 'FAIL'; r[`${tf}_aligned`] = w.every((b) => b.time % TF_SEC[tf] === 0) ? 'PASS' : 'FAIL'; r[`${tf}_no_forming_bar`] = w.every((b) => b.time + TF_SEC[tf] <= nowSec) ? 'PASS' : 'FAIL'; r[`${tf}_geometry`] = w.every((b) => b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close)) ? 'PASS' : 'FAIL'; } r['5m_complete_decision_bar'] = windows['5m'].at(-1)?.time === barTime ? 'PASS' : 'FAIL'; return r; }
  // ---------- one decision ----------
  async function decide(barTime, nowSec) {
    const fetched = {}; let fetchErr = null;
    for (const tf of TFS) { try { const r = await reader.rates('XAUUSDm', tf, WINDOW + 6); if (!r.ok) throw new Error(r.error ?? 'rates not ok'); fetched[tf] = r.bars ?? []; } catch (e) { fetchErr = `${tf}: ${e.message}`; break; } }
    let tick = null; try { const t = await reader.tick('XAUUSDm'); tick = t.ok ? t.tick : null; } catch { tick = null; }
    const latency = Math.round(nowSec - (barTime + 300)); const provenance = latency <= FRESH_SEC ? 'FORWARD_LIVE' : 'LATE_DECISION';
    const base = { schema: SCHEMA, record: 'decision', symbol: 'XAUUSDm', timeframe: '5m', bar_time: barTime, bar_close_utc: iso(barTime + 300), decision_time_utc: iso(nowSec), latency_sec: latency, provenance, executed: false, execution_authority: 'NONE' };
    if (fetchErr) { for (const engine of ['V8', 'CONTROL']) record({ ...base, id: decisionId(engine, barTime), engine, action: 'WAIT', engine_action: 'WAIT', wait_category: 'DATA_UNAVAILABLE', wait_detail: `fetch failed: ${fetchErr}`, valid_setup: false, shadow_signal: false, counted_signal: false }); return; }
    for (const tf of TFS) archiveBars(tf, fetched[tf], nowSec);
    const windows = Object.fromEntries(TFS.map((tf) => [tf, fetched[tf].filter((b) => b.time + TF_SEC[tf] <= nowSec).sort((a, b) => a.time - b.time).slice(-WINDOW).map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }))]));
    const integ = integrity(windows, barTime, nowSec); const hashes = Object.fromEntries(TFS.map((tf) => [tf, windowHash(windows[tf])])); const lastBars = Object.fromEntries(TFS.map((tf) => [tf, windows[tf].at(-1)?.time ?? null]));
    const spread = tick && Number.isFinite(tick.ask) && Number.isFinite(tick.bid) ? tick.ask - tick.bid : null;
    let news = null; try { const cal = prod?.calendar?.(); news = cal && newsEval ? newsEval(cal, nowSec) : { state: 'DATA_UNAVAILABLE' }; } catch { news = { state: 'DATA_UNAVAILABLE' }; }
    let shock = { state: 'UNKNOWN' }; try { const lp = prod?.lastProtection?.(); if (lp && nowSec - Date.parse(lp.at) / 1000 <= 900) shock = { state: lp.shock_state ?? 'UNKNOWN', at: lp.at }; else shock = { state: 'NORMAL_OR_STALE', at: lp?.at ?? null }; } catch { /* keep UNKNOWN */ }
    const integrityFail = Object.values(integ).includes('FAIL');
    for (const engine of ['V8', 'CONTROL']) {
      const id = decisionId(engine, barTime); if (decIds.has(id)) continue;
      if (integrityFail) { record({ ...base, id, engine, action: 'WAIT', engine_action: 'WAIT', wait_category: 'DATA_UNAVAILABLE', wait_detail: `data integrity: ${Object.entries(integ).filter(([, v]) => v === 'FAIL').map(([k]) => k).join(', ')}`, data_integrity: integ, input_hashes: hashes, input_last_bars: lastBars, valid_setup: false, shadow_signal: false, counted_signal: false }); continue; }
      const d = evaluateEngine(ENG[engine], windows, nowSec, { applyStaleGate: engine === 'V8' });
      const regression = regressionChecks(d, windows);
      let action = d.engine_action, wc = d.wait_category, wd = d.wait_detail, safety = null;
      if (isSig(d.engine_action)) { safety = safetyStage({ spread, news, shock, candidate: d.candidate }); if (safety.block) { action = 'WAIT'; wc = safety.block.category; wd = safety.block.detail; } }
      const rec = { ...base, id, engine, ...d, action, wait_category: action === 'WAIT' ? wc : null, wait_detail: action === 'WAIT' ? wd : null, safety, spread_usd: spread == null ? null : Math.round(spread * 1000) / 1000, news_state: news?.state ?? null, shock_state: shock.state, session: sessionOf(barTime), data_integrity: integ, input_hashes: hashes, input_last_bars: lastBars, regression, valid_setup: isSig(d.engine_action), shadow_signal: isSig(action) };
      // duplicate identity: same engine, model, side and anchor within 12 bars of a counted signal
      const prior = decisions.filter((x) => x.engine === engine && x.counted_signal && x.candidate && rec.candidate && x.candidate.model === rec.candidate.model && x.candidate.side === rec.candidate.side && Math.round(x.candidate.anchor * 100) === Math.round(rec.candidate.anchor * 100) && barTime - x.bar_time <= DUP_BARS * 300);
      rec.duplicate = rec.valid_setup && prior.length > 0; rec.counted_signal = rec.shadow_signal && !rec.duplicate && provenance === 'FORWARD_LIVE';
      record(rec);
    }
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
  // ---------- checkpoints ----------
  function checkpoints() { const c = summaryCounts().FORWARD_SIGNAL_COUNT; for (const n of CHECKPOINTS) { if (c >= n && !st.checkpoints_done.includes(n)) { const ids = decisions.filter((d) => d.engine === 'V8' && d.counted_signal).sort((a, b) => a.bar_time - b.bar_time).slice(0, n).map((d) => d.id); const snap = { checkpoint: n, at: iso(now()), signal_ids_sha256: sha(ids.join('\n')), counts: summaryCounts() }; mkdirSync(P('checkpoints'), { recursive: true }); writeFileSync(P(`checkpoints/checkpoint_${n}.json`), JSON.stringify(snap, null, 1)); st.checkpoints_done.push(n); if (n === 300) st.frozen_300 = { at: snap.at, signal_ids_sha256: snap.signal_ids_sha256, ids }; log(`[v8shadow] checkpoint ${n} reached`); } } }
  // ---------- cycle ----------
  async function cycle() {
    const nowSec = Math.floor(now()); st.cycles++;
    try {
      const r = await reader.rates('XAUUSDm', '5m', 3); if (!r.ok) throw new Error(r.error ?? 'rates not ok');
      const done = (r.bars ?? []).filter((b) => b.time + 300 <= nowSec).sort((a, b) => a.time - b.time); const L = done.at(-1)?.time ?? null;
      if (L != null && (st.last_decided_bar == null || L > st.last_decided_bar) && nowSec - (L + 300) >= SETTLE_SEC) { await decide(L, nowSec); st.last_decided_bar = L; labelPending(); scanEvents(); checkpoints(); }
      replayCheck(nowSec); st.last_cycle_at = iso(nowSec); st.last_error = null;
    } catch (e) { st.last_error = `${iso(nowSec)} ${e.message}`; log(`[v8shadow] cycle error: ${e.message}`); }
    writeStatus();
  }
  return { cycle, status: () => ({ ...st, ...summaryCounts() }), decisions: () => decisions, outcomes: () => outcomes, events: () => events, parity: () => parity, archive: () => archive, dir };
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
  const newsEval = (cal, nowSec) => { const s = evaluateNewsState({ events: cal.events, now: new Date(nowSec * 1000), calendar: { status: 'OK', source: cal.source, source_timestamp: cal.source_timestamp, last_success_at: cal.fetched_at, error: null, consecutive_failures: 0 }, params: NEWS_RISK_PARAMS }); return { state: s.state, event: s.event ? `${s.event.event_name} ${s.event.tier ?? ''}`.trim() : null }; };
  const fs = await createForwardShadow({ reader, prod, newsEval, log });
  log(`v8 forward shadow started pid=${process.pid} frozen=${JSON.stringify(fs.status().frozen_engine)} execution_authority=NONE`);
  let stopping = false; const shutdown = async (sig) => { if (stopping) return; stopping = true; log(`stopping (${sig})`); try { await reader.stop(); } catch { /* ignore */ } try { if (existsSync(lock) && readFileSync(lock, 'utf8').trim() === String(process.pid)) unlinkSync(lock); } catch { /* ignore */ } process.exit(0); };
  process.on('SIGINT', () => shutdown('SIGINT')); process.on('SIGTERM', () => shutdown('SIGTERM'));
  let n = 0; const loop = async () => { if (stopping) return; if (!reader.alive()) { try { await reader.start(); log('reader restarted'); } catch (e) { log(`reader restart failed: ${e.message}`); } } await fs.cycle(); n++; if (n % 120 === 0) log(`cycle ${n}: ${JSON.stringify({ signals: fs.status().FORWARD_SIGNAL_COUNT, valid: fs.status().FORWARD_VALID_SETUP_COUNT, last_bar: fs.status().last_decided_bar, err: fs.status().last_error })}`); setTimeout(loop, 5000); };
  loop();
}
