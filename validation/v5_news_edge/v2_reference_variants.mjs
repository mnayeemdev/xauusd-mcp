// NEWS PROTECTION V2 -- which normalisation REFERENCE is deployable and unbiased? (research only)
// Ground truth "abnormal" = completed 15m true range > 1.5 x the V5 matched-control median for the SAME clock
// slot (same weekday, +-6 weeks, no listed event within 4 h) -- the definition V5 used. Candidate deployable
// references (computable from the ~41 h of confirmed 5m bars the executor holds):
//   prev24h      median TR of [T-25h, T-1h]           (the frozen-spec default; session-biased for 08:30 ET releases)
//   prevday_slot median TR of [T-24h, T-24h+4h]       (same 4-hour slot of the previous day)
//   none         clock minimum only (no extension)
// For each variant: block end via the production evaluateNormalization (with the reference window swapped in),
// true-abnormal coverage, residual, blocked minutes, and the share of blocked post-release bars that were NOT
// truly abnormal (over-block proxy).
import fs from 'node:fs';
import { buildProtectionIntervals, evaluateNormalization, NEWS_RISK_PARAMS } from '../../src/engine/newsRisk.js';
import { normalizeEvent } from '../../src/engine/newsCalendar.js';
import { etToUtc } from './et_time.mjs';

const DIR = 'validation/v5_news_edge';
const EV = JSON.parse(fs.readFileSync(`${DIR}/events_usd_official.json`, 'utf8')).events.filter((e) => e.price_coverage && typeof e.spike_check === 'object');
const B15 = JSON.parse(fs.readFileSync('validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json', 'utf8'))['15m'];
const idx = new Map(B15.map((b, i) => [b.time, i]));
const MIN = 60_000;
const FF_NAME = { CPI: 'CPI m/m', NFP: 'Non-Farm Employment Change', PPI: 'PPI m/m', JOLTS: 'JOLTS Job Openings', FOMC: 'FOMC Statement', PCE: 'Core PCE Price Index m/m', GDP_ADV: 'Advance GDP q/q' };
const allSecs = EV.map((e) => Date.parse(e.utc) / 1000);
const nearListed = (sec) => allSecs.some((s) => Math.abs(s - sec) <= 240 * 60);
const tr = (i) => { const b = B15[i], p = B15[i - 1]; return Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)); };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

const rows = [];
for (const e of EV) { rows.push(normalizeEvent({ title: FF_NAME[e.family], country: 'USD', date: e.utc, impact: 'High' }, { source: 'sim', sourceTimestamp: e.utc, now: new Date(e.utc) })); if (e.family === 'FOMC' && e.press_conference) rows.push(normalizeEvent({ title: 'FOMC Press Conference', country: 'USD', date: new Date(Date.parse(e.utc) + 30 * MIN).toISOString(), impact: 'High' }, { source: 'sim', sourceTimestamp: e.utc, now: new Date(e.utc) })); }
const V1 = { ...NEWS_RISK_PARAMS, tierBCooldownMin: 30, tierAPostMin: 65, tierAPressConfCoverMin: 35, tierAClusterGapMin: 1, normalizationMaxExtensionMin: 0 };

// Ground truth per event: per post slot k (0..15), the control median TR of the same slot on control days.
function truthFor(e) {
  const [hh, mm] = e.et_time.split(':').map(Number); const d0 = new Date(e.date + 'T00:00:00Z'); const perSlot = Array.from({ length: 16 }, () => []);
  for (let dd = -42; dd <= 42; dd += 7) { if (!dd) continue; const ds = new Date(d0.getTime() + dd * 86400000).toISOString().slice(0, 10); const sec = Date.parse(etToUtc(ds, hh, mm).iso) / 1000; if (nearListed(sec)) continue; const i = idx.get(sec); if (i === undefined) continue; for (let k = 0; k < 16; k++) if (B15[i + k]) perSlot[k].push(tr(i + k)); }
  if (perSlot[0].length < 4) return null;
  return perSlot.map((v) => median(v));
}
// Reference under each deployable variant, built ONLY from bars the executor would hold (<= 41 h before T).
function refBars(t0sec, mode) {
  if (mode === 'prev24h') return B15.filter((b) => b.time >= t0sec - 25 * 3600 && b.time <= t0sec - 3600);
  if (mode === 'prevday_slot') return B15.filter((b) => b.time >= t0sec - 24 * 3600 && b.time < t0sec - 20 * 3600);
  return [];
}
// Replay the production normalisation with the reference window swapped: we feed evaluateNormalization a
// bar list whose "reference window" contains exactly the chosen bars (time-shifted into [T-25h, T-1h]).
function blockEnd(e, mode, params) {
  const t = Date.parse(e.utc); const tsec = t / 1000;
  const iv = buildProtectionIntervals(rows.filter((r) => Math.abs(Date.parse(r.event_time_utc) - t) <= 6 * 3600_000), params);
  const mine = iv.filter((x) => Date.parse(x.e.event_time_utc) === t || (x.cluster_anchor != null && x.cluster_anchor === t)); if (!mine.length) return null;
  const start = Math.min(...mine.map((x) => x.pre_start)); let end = Math.max(...mine.map((x) => x.clock_end)); const tier = mine[0].tier; const anchor = (mine.find((x) => x.cluster_anchor != null)?.cluster_anchor ?? t) / 1000;
  let status = 'NOT_APPLICABLE', ext = 0;
  if ((tier === 'A' || tier === 'B') && mode !== 'none' && params.normalizationMaxExtensionMin > 0) {
    const ref = refBars(anchor, mode).map((b, i, arr) => ({ ...b, time: anchor - 3600 - (arr.length - i) * 900 })); // re-stamped into the spec window
    const post = B15.filter((b) => b.time >= anchor && b.time <= anchor + 8 * 3600);
    const bars15m = [...ref, ...post]; const maxEnd = end + params.normalizationMaxExtensionMin * MIN; let now = end; status = 'MAX_EXTENSION_REACHED';
    const p = { ...params, normalizationReferenceMinBars: mode === 'prevday_slot' ? 12 : params.normalizationReferenceMinBars };
    while (now <= maxEnd) { const n = evaluateNormalization({ bars15m, releaseSec: anchor, nowSec: now / 1000, params: p }); if (n.status !== 'PENDING') { status = n.status; break; } now += 15 * MIN; }
    if (status === 'MAX_EXTENSION_REACHED') now = maxEnd; ext = (now - end) / MIN; end = now;
  }
  return { start, end, tier, ext, status };
}

const VARIANTS = { V1: { params: V1, mode: 'none' }, V2_clock_only: { params: NEWS_RISK_PARAMS, mode: 'none' }, V2_prev24h: { params: NEWS_RISK_PARAMS, mode: 'prev24h' }, V2_prevday_slot: { params: NEWS_RISK_PARAMS, mode: 'prevday_slot' } };
const out = { generated_at: new Date().toISOString(), variants: {}, per_family: {} };
let months = (Date.parse(EV.at(-1).utc) - Date.parse(EV[0].utc)) / (30.44 * 86400000);
let nTruth = 0;
for (const e of EV) {
  const i0 = idx.get(Date.parse(e.utc) / 1000); if (i0 === undefined) continue; const truth = truthFor(e); if (!truth) continue; nTruth++;
  const post = []; for (let k = 0; k < 16; k++) { const b = B15[i0 + k]; if (!b) break; post.push({ startMs: b.time * 1000, abnormal: tr(i0 + k) > 1.5 * truth[k] }); }
  const abn = post.filter((p) => p.abnormal);
  for (const [name, v] of Object.entries(VARIANTS)) {
    const blk = blockEnd(e, v.mode, v.params); if (!blk) continue;
    const S = (out.variants[name] ||= { n: 0, abnormal: 0, covered: 0, residual: 0, events_with_residual: 0, blocked_min: 0, post_blocked_min: 0, post_blocked_normal_min: 0, ext_events: 0, ext_min: 0, max_hits: 0, ref_unavail: 0 });
    const F = ((out.per_family[e.family] ||= {})[name] ||= { n: 0, abnormal: 0, covered: 0, residual: 0, blocked_min: 0, post_blocked_normal_min: 0, ext_events: 0, ext_min: 0, max_hits: 0, ref_unavail: 0 });
    for (const X of [S, F]) {
      X.n++; X.abnormal += abn.length; const cov = abn.filter((p) => p.startMs >= blk.start && p.startMs < blk.end).length; X.covered += cov; const res = abn.filter((p) => p.startMs >= blk.end).length; X.residual += res; if (X === S && res) X.events_with_residual++;
      X.blocked_min += (blk.end - blk.start) / MIN; const pb = post.filter((p) => p.startMs >= Date.parse(e.utc) && p.startMs < blk.end); if (X === S) X.post_blocked_min += pb.length * 15; X.post_blocked_normal_min += pb.filter((p) => !p.abnormal).length * 15;
      if (blk.ext > 0) { X.ext_events++; X.ext_min += blk.ext; } if (blk.status === 'MAX_EXTENSION_REACHED') X.max_hits++; if (blk.status === 'REFERENCE_UNAVAILABLE') X.ref_unavail++;
    }
  }
}
for (const [name, S] of Object.entries(out.variants)) { S.coverage = +(S.covered / S.abnormal).toFixed(3); S.residual_minutes = S.residual * 15; S.blocked_h_per_month = +(S.blocked_min / 60 / months).toFixed(2); S.over_block_share = +(S.post_blocked_normal_min / S.post_blocked_min).toFixed(3); S.ext_rate = +(S.ext_events / S.n).toFixed(3); S.mean_ext_min = S.ext_events ? +(S.ext_min / S.ext_events).toFixed(1) : 0; }
for (const fam of Object.keys(out.per_family)) for (const [name, F] of Object.entries(out.per_family[fam])) { F.coverage = +(F.covered / F.abnormal).toFixed(3); F.blocked_min_per_event = +(F.blocked_min / F.n).toFixed(1); F.ext_rate = +(F.ext_events / F.n).toFixed(3); F.mean_ext_min = F.ext_events ? +(F.ext_min / F.ext_events).toFixed(1) : 0; F.over_block_min_per_event = +(F.post_blocked_normal_min / F.n).toFixed(1); }
out.events_with_ground_truth = nTruth; out.months = +months.toFixed(1);
fs.writeFileSync(`${DIR}/v2_reference_variants_results.json`, JSON.stringify(out, null, 1));
console.log('events with ground truth', nTruth, 'months', out.months);
for (const [name, S] of Object.entries(out.variants)) console.log(name.padEnd(16), 'cov', S.coverage, 'residual_bars', S.residual, 'ev_res', S.events_with_residual, 'blk h/mo', S.blocked_h_per_month, 'overblock', S.over_block_share, 'ext', S.ext_rate, 'meanext', S.mean_ext_min, 'maxhits', S.max_hits, 'refunavail', S.ref_unavail);
for (const fam of ['CPI', 'NFP', 'FOMC']) for (const [name, F] of Object.entries(out.per_family[fam])) console.log(fam.padEnd(5), name.padEnd(16), 'cov', F.coverage, 'res', F.residual, 'blk/ev', F.blocked_min_per_event, 'overblk/ev', F.over_block_min_per_event, 'ext', F.ext_rate, 'meanext', F.mean_ext_min, 'max', F.max_hits, 'refNA', F.ref_unavail);
