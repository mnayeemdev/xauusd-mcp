// NEWS PROTECTION V2 -- offline historical SAFETY simulation (research only; nothing here is imported by production).
// Replays the official V5 event list over the Exness XAUUSDm 15m bars and compares the V1 generic windows
// (pre 30 / active 5 / cooldown 30) with the V2 tiered windows + normalisation, using the PRODUCTION state
// machine (src/engine/newsRisk.js) so that what is measured is what would run. Measures coverage of abnormal
// 15m bars, residual exposure after unblock, blocked minutes and a quiet-blocked-minutes proxy. No P&L, no
// direction, no trade frequency is optimised.
import fs from 'node:fs';
import { buildProtectionIntervals, evaluateNormalization, NEWS_RISK_PARAMS } from '../../src/engine/newsRisk.js';
import { normalizeEvent } from '../../src/engine/newsCalendar.js';

const DIR = 'validation/v5_news_edge';
const EV = JSON.parse(fs.readFileSync(`${DIR}/events_usd_official.json`, 'utf8')).events.filter((e) => e.price_coverage && typeof e.spike_check === 'object');
const B15 = JSON.parse(fs.readFileSync('validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json', 'utf8'))['15m'];
const idx = new Map(B15.map((b, i) => [b.time, i]));
const MIN = 60_000;
const FF_NAME = { CPI: 'CPI m/m', NFP: 'Non-Farm Employment Change', PPI: 'PPI m/m', JOLTS: 'JOLTS Job Openings', FOMC: 'FOMC Statement', PCE: 'Core PCE Price Index m/m', GDP_ADV: 'Advance GDP q/q' };

// Provider-shaped rows for every official event; an FOMC statement adds the press-conference row at +30 min
// (every FOMC since 2022 had one per the Fed calendar) so the V1 and V2 calendars see the same rows.
const rows = [];
for (const e of EV) {
  rows.push(normalizeEvent({ title: FF_NAME[e.family], country: 'USD', date: e.utc, impact: 'High' }, { source: 'sim', sourceTimestamp: e.utc, now: new Date(e.utc) }));
  if (e.family === 'FOMC' && e.press_conference) rows.push(normalizeEvent({ title: 'FOMC Press Conference', country: 'USD', date: new Date(Date.parse(e.utc) + 30 * MIN).toISOString(), impact: 'High' }, { source: 'sim', sourceTimestamp: e.utc, now: new Date(e.utc) }));
}
const V1 = { ...NEWS_RISK_PARAMS, tierBCooldownMin: 30, tierAPostMin: 65, tierAPressConfCoverMin: 35, tierAClusterGapMin: 1, normalizationMaxExtensionMin: 0 }; // reproduces V1: every row T-30..T+35, merged only by overlap
const V2 = NEWS_RISK_PARAMS;

const tr = (i) => { const b = B15[i], p = B15[i - 1]; return Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)); };
function referenceAt(i0) { const from = B15[i0].time - 25 * 3600, to = B15[i0].time - 3600; const v = []; for (let i = i0 - 110; i < i0; i++) if (i > 0 && B15[i].time >= from && B15[i].time <= to) v.push(tr(i)); if (v.length < 24) return null; const s = v.sort((a, b) => a - b); return s[s.length >> 1]; }

// Effective block interval [start, end] per event under a param set, including the V2 normalisation extension replayed on real bars.
function blockFor(e, params) {
  const t = Date.parse(e.utc);
  const iv = buildProtectionIntervals(rows.filter((r) => Math.abs(Date.parse(r.event_time_utc) - t) <= 6 * 3600_000), params);
  const mine = iv.filter((x) => Date.parse(x.e.event_time_utc) === t || (x.cluster_anchor != null && x.cluster_anchor === t));
  if (!mine.length) return null;
  const start = Math.min(...mine.map((x) => x.pre_start));
  let end = Math.max(...mine.map((x) => x.clock_end));
  const cluster = mine.find((x) => x.cluster_anchor != null);
  const tier = mine[0].tier;
  let extension = 0, normStatus = 'NOT_APPLICABLE';
  if ((tier === 'A' || tier === 'B') && params.normalizationMaxExtensionMin > 0) {
    const bars15m = B15.filter((b) => b.time >= t / 1000 - 26 * 3600 && b.time <= t / 1000 + 8 * 3600);
    const maxEnd = end + params.normalizationMaxExtensionMin * MIN;
    let now = end; normStatus = 'MAX_EXTENSION_REACHED';
    while (now <= maxEnd) {
      const n = evaluateNormalization({ bars15m, releaseSec: (cluster?.cluster_anchor ?? t) / 1000, nowSec: now / 1000, params });
      if (n.status !== 'PENDING') { normStatus = n.status; break; }
      now += 15 * MIN;
    }
    if (normStatus === 'MAX_EXTENSION_REACHED') now = maxEnd;
    extension = Math.max(0, (now - end) / MIN); end = now;
  }
  return { start, end, tier, extension_min: extension, normalization: normStatus, clock_end: Math.max(...mine.map((x) => x.clock_end)) };
}

const out = { generated_at: new Date().toISOString(), events: EV.length, per_family: {}, totals: {} };
const acc = (fam) => (out.per_family[fam] ||= { n: 0, abnormal_bars: 0, v1: { covered: 0, residual_bars: 0, residual_minutes: 0, blocked_min: 0, quiet_blocked_min: 0, events_with_residual: 0 }, v2: { covered: 0, residual_bars: 0, residual_minutes: 0, blocked_min: 0, quiet_blocked_min: 0, events_with_residual: 0, extensions: 0, extension_min_total: 0, max_extension_hits: 0, ref_unavailable: 0 } });
for (const e of EV) {
  const i0 = idx.get(Date.parse(e.utc) / 1000); if (i0 === undefined) continue;
  const ref = referenceAt(i0); if (ref == null) continue;
  const A = acc(e.family); A.n++;
  const post = []; for (let k = 0; k < 16; k++) { const b = B15[i0 + k]; if (!b) break; post.push({ startMs: b.time * 1000, abnormal: tr(i0 + k) > 1.5 * ref }); }
  const abn = post.filter((p) => p.abnormal); A.abnormal_bars += abn.length;
  for (const [key, params] of [['v1', V1], ['v2', V2]]) {
    const blk = blockFor(e, params); if (!blk) continue; const S = A[key];
    const covered = abn.filter((p) => p.startMs >= blk.start && p.startMs < blk.end).length; S.covered += covered;
    const residual = abn.filter((p) => p.startMs >= blk.end); S.residual_bars += residual.length; S.residual_minutes += residual.length * 15; if (residual.length) S.events_with_residual++;
    S.blocked_min += (blk.end - blk.start) / MIN;
    S.quiet_blocked_min += post.filter((p) => !p.abnormal && p.startMs >= Date.parse(e.utc) && p.startMs < blk.end).length * 15;
    if (key === 'v2') { if (blk.extension_min > 0) { S.extensions++; S.extension_min_total += blk.extension_min; } if (blk.normalization === 'MAX_EXTENSION_REACHED') S.max_extension_hits++; if (blk.normalization === 'REFERENCE_UNAVAILABLE') S.ref_unavailable++; }
  }
}
const months = (Date.parse(EV.at(-1).utc) - Date.parse(EV[0].utc)) / (30.44 * 86400000);
for (const [fam, A] of Object.entries(out.per_family)) for (const key of ['v1', 'v2']) { const S = A[key]; S.coverage = A.abnormal_bars ? +(S.covered / A.abnormal_bars).toFixed(3) : null; S.blocked_min_per_event = +(S.blocked_min / A.n).toFixed(1); S.blocked_h_per_month = +(S.blocked_min / 60 / months).toFixed(2); S.quiet_share_of_post_block = S.blocked_min ? +(S.quiet_blocked_min / S.blocked_min).toFixed(3) : null; if (key === 'v2') { S.extension_rate = +(S.extensions / A.n).toFixed(3); S.mean_extension_min_when_extended = S.extensions ? +(S.extension_min_total / S.extensions).toFixed(1) : 0; } }
const tot = (key) => Object.values(out.per_family).reduce((a, A) => ({ n: a.n + A.n, abnormal: a.abnormal + A.abnormal_bars, covered: a.covered + A[key].covered, residual_bars: a.residual_bars + A[key].residual_bars, blocked_min: a.blocked_min + A[key].blocked_min, quiet: a.quiet + A[key].quiet_blocked_min, ev_res: a.ev_res + A[key].events_with_residual }), { n: 0, abnormal: 0, covered: 0, residual_bars: 0, blocked_min: 0, quiet: 0, ev_res: 0 });
for (const key of ['v1', 'v2']) { const t = tot(key); out.totals[key] = { events: t.n, abnormal_bars_0_240: t.abnormal, covered: t.covered, coverage: +(t.covered / t.abnormal).toFixed(3), residual_bars: t.residual_bars, residual_minutes: t.residual_bars * 15, events_with_residual: t.ev_res, blocked_hours_total: +(t.blocked_min / 60).toFixed(1), blocked_hours_per_month: +(t.blocked_min / 60 / months).toFixed(2), quiet_blocked_share_of_post_block: +(t.quiet / t.blocked_min).toFixed(3) }; }
out.totals.months = +months.toFixed(1);
out.totals.incremental_blocked_hours_per_month = +(out.totals.v2.blocked_hours_per_month - out.totals.v1.blocked_hours_per_month).toFixed(2);
out.note = 'Events = the 7 official V5 families only (CPI, NFP, PPI, JOLTS, FOMC, PCE, GDP advance); production also blocks other provider-rated USD HIGH rows (retail sales, ISM, ...) identically under V1 and V2 (Tier C), so their block time is unchanged and not counted here. Abnormal bar = completed 15m true range > 1.5x the pre-event reference (V5 definition). No tick/spread data: release-second executability is not claimed.';
fs.writeFileSync(`${DIR}/v2_policy_sim_results.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.totals, null, 1));
for (const [fam, A] of Object.entries(out.per_family)) console.log(fam, 'n', A.n, 'abn', A.abnormal_bars, '| V1 cov', A.v1.coverage, 'res', A.v1.residual_bars, 'blk/ev', A.v1.blocked_min_per_event, '| V2 cov', A.v2.coverage, 'res', A.v2.residual_bars, 'blk/ev', A.v2.blocked_min_per_event, 'ext', A.v2.extension_rate, 'meanext', A.v2.mean_extension_min_when_extended, 'maxhits', A.v2.max_extension_hits, 'quietV1', A.v1.quiet_share_of_post_block, 'quietV2', A.v2.quiet_share_of_post_block);
