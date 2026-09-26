// V5 research only. Builds the official scheduled-USD-event list from the raw official pages
// saved under validation/v5_news_edge/raw/ and runs timestamp-integrity checks against the
// Exness XAUUSDm 15m bars saved by V3. Nothing here is imported by production.
import fs from 'node:fs';
import path from 'node:path';

const RAW = 'validation/v5_news_edge/raw';
const OUT = 'validation/v5_news_edge';

import { etToUtc } from './et_time.mjs';
const MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };

const events = [];
const checks = { dst_label_checks: 0, dst_label_mismatches: [], excluded_unverified_time: [] };

// ---------- BLS: filenames MMDDYYYY, times verified from archived release text ----------
const bls = JSON.parse(fs.readFileSync(path.join(RAW, 'bls_archive_filenames.json'), 'utf8'));
const BLS_FAM = { cpi: ['CPI', 8, 30], empsit: ['NFP', 8, 30], ppi: ['PPI', 8, 30], jolts: ['JOLTS', 10, 0] };
for (const [key, [fam, hh, mm]] of Object.entries(BLS_FAM)) {
  for (const fn of bls[key]) {
    const s = fn.split('_')[1];
    const date = `${s.slice(4, 8)}-${s.slice(0, 2)}-${s.slice(2, 4)}`;
    const { iso, tz } = etToUtc(date, hh, mm);
    events.push({ family: fam, date, et_time: `${hh}:${String(mm).padStart(2, '0')}`, tz, utc: iso, source: `https://www.bls.gov/news.release/archives/${fn}.htm`, time_basis: key === 'jolts' ? 'verified 10:00 a.m. (ET) on archived release jolts_10042022' : 'verified 8:30 a.m. (ET) on archived releases (2022 and 2025 samples)' });
  }
}

// ---------- FOMC statements: printed "For release at h:mm p.m. EDT/EST" ----------
const fed = JSON.parse(fs.readFileSync(path.join(RAW, 'fed_statement_times.json'), 'utf8'));
const pcDates = new Set(JSON.parse(fs.readFileSync(path.join(RAW, 'fed_pressconf_dates.json'), 'utf8')));
for (const o of fed) {
  if (!o.time || o.time !== '2:00' || !/FOMC statement/i.test(o.title)) { checks.excluded_unverified_time.push({ family: 'FOMC', date: o.date, reason: `not a 2:00 p.m. FOMC statement (${o.time} ${o.title.slice(0, 40)})` }); continue; }
  const date = `${o.date.slice(0, 4)}-${o.date.slice(4, 6)}-${o.date.slice(6, 8)}`;
  const { iso, tz } = etToUtc(date, 14, 0);
  checks.dst_label_checks++;
  if (tz !== o.tz) checks.dst_label_mismatches.push({ family: 'FOMC', date, computed: tz, printed: o.tz });
  events.push({ family: 'FOMC', date, et_time: '14:00', tz: o.tz, utc: iso, press_conference: pcDates.has(o.date), source: `https://www.federalreserve.gov/newsevents/pressreleases/monetary${o.date}a.htm`, time_basis: 'printed "For release at 2:00 p.m." on the statement page' });
}

// ---------- BEA: printed "EMBARGOED UNTIL RELEASE AT h:mm a.m. EDT/EST, Weekday, Month d, yyyy" ----------
const beaLines = fs.readFileSync(path.join(RAW, 'bea_release_times.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
const beaTitles = JSON.parse(fs.readFileSync(path.join(RAW, 'bea_selected_links.json'), 'utf8'));
for (const line of beaLines) {
  const [href, txt] = line.split(' | ');
  const title = beaTitles[href.trim()] || '';
  const fam = title.startsWith('Personal Income') ? 'PCE' : 'GDP_ADV';
  const m = /RELEASE AT (\d{1,2}):(\d{2}) ([ap])\.m\. (E[DS]T), \w+, (\w+) (\d{1,2}), (\d{4})/.exec(txt || '');
  if (!m) { checks.excluded_unverified_time.push({ family: fam, href, reason: 'no embargo line found on the archived page' }); continue; }
  let hh = Number(m[1]) % 12 + (m[3] === 'p' ? 12 : 0); const mm = Number(m[2]);
  const date = `${m[7]}-${String(MONTHS[m[5]]).padStart(2, '0')}-${String(m[6]).padStart(2, '0')}`;
  const { iso, tz } = etToUtc(date, hh, mm);
  checks.dst_label_checks++;
  if (tz !== m[4]) checks.dst_label_mismatches.push({ family: fam, date, computed: tz, printed: m[4] });
  events.push({ family: fam, date, et_time: `${hh}:${String(mm).padStart(2, '0')}`, tz: m[4], utc: iso, title, source: `https://www.bea.gov${href.trim()}`, time_basis: 'printed embargo line on the archived release page' });
}

events.sort((a, b) => a.utc.localeCompare(b.utc));
// weekday sanity: all events must fall Monday-Friday
checks.weekend_events = events.filter(e => [0, 6].includes(new Date(e.utc).getUTCDay())).map(e => `${e.family} ${e.date}`);

// ---------- Overlap / cluster policy (pre-declared): same UTC minute => cluster; within +-240 min => contaminated for single-family use ----------
for (const e of events) { e.same_minute_with = []; e.within_4h = []; }
for (let i = 0; i < events.length; i++) for (let j = 0; j < events.length; j++) {
  if (i === j) continue;
  const dm = (Date.parse(events[j].utc) - Date.parse(events[i].utc)) / 60000;
  if (dm === 0) events[i].same_minute_with.push(events[j].family);
  else if (Math.abs(dm) <= 240) events[i].within_4h.push(`${events[j].family}@${dm > 0 ? '+' : ''}${dm}m`);
}

// ---------- Price-spike timestamp integrity check on 15m bars ----------
const bars = JSON.parse(fs.readFileSync('validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json', 'utf8'))['15m'];
const idxByT = new Map(bars.map((b, i) => [b.time, i]));
const spike = { per_family: {}, details: [] };
for (const e of events) {
  const t0 = Date.parse(e.utc) / 1000;
  if (t0 < bars[0].time + 3600 * 24 || t0 > bars[bars.length - 1].time - 3600 * 4) { e.price_coverage = false; continue; }
  e.price_coverage = true;
  const i0 = idxByT.get(t0);
  if (i0 === undefined) { e.spike_check = 'NO_BAR_AT_RELEASE'; continue; }
  // window: 8 bars before .. 8 bars after (+-2h); largest-range bar index relative to release
  let best = null;
  for (let k = -8; k <= 8; k++) { const b = bars[i0 + k]; if (!b) continue; const r = b.high - b.low; if (!best || r > best.r) best = { k, r }; }
  const rel = bars[i0].high - bars[i0].low;
  const pre = []; for (let k = -8; k <= -1; k++) { const b = bars[i0 + k]; if (b) pre.push(b.high - b.low); }
  const preMed = pre.sort((a, b) => a - b)[Math.floor(pre.length / 2)];
  e.spike_check = { largest_bar_offset_15m: best.k, release_bar_over_pre_median: +(rel / preMed).toFixed(2) };
  const f = spike.per_family[e.family] ||= { n: 0, largest_at_0: 0, largest_at_0_or_1: 0, largest_at_minus4: 0, largest_at_plus4: 0, median_ratio: [] };
  f.n++; if (best.k === 0) f.largest_at_0++; if (best.k === 0 || best.k === 1) f.largest_at_0_or_1++; if (best.k === -4) f.largest_at_minus4++; if (best.k === 4) f.largest_at_plus4++; f.median_ratio.push(rel / preMed);
}
for (const f of Object.values(spike.per_family)) { const s = f.median_ratio.sort((a, b) => a - b); f.median_ratio = +s[Math.floor(s.length / 2)].toFixed(2); f.share_at_0 = +(f.largest_at_0 / f.n).toFixed(3); f.share_at_0_or_1 = +(f.largest_at_0_or_1 / f.n).toFixed(3); }

const counts = {}; for (const e of events) counts[e.family] = (counts[e.family] || 0) + 1;
const covered = {}; for (const e of events) if (e.price_coverage) covered[e.family] = (covered[e.family] || 0) + 1;
const summary = { built_at: new Date().toISOString(), counts_all: counts, counts_with_15m_price_coverage: covered, first: events[0].utc, last: events[events.length - 1].utc, checks, spike_integrity: spike.per_family };
fs.writeFileSync(path.join(OUT, 'events_usd_official.json'), JSON.stringify({ summary, events }, null, 1));
console.log(JSON.stringify(summary, null, 1));
