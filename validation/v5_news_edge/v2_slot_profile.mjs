// Where does the SYSTEMATIC post-release elevation end? Share of events whose 15m bar at slot k (k*15 min after
// the release) exceeds 1.5x the same-slot matched-control median, vs the background share of control bars that
// exceed 1.5x their own slot median. Research only.
import fs from 'node:fs';
import { etToUtc } from './et_time.mjs';
const DIR = 'validation/v5_news_edge';
const EV = JSON.parse(fs.readFileSync(`${DIR}/events_usd_official.json`, 'utf8')).events.filter((e) => e.price_coverage && typeof e.spike_check === 'object');
const B15 = JSON.parse(fs.readFileSync('validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json', 'utf8'))['15m'];
const idx = new Map(B15.map((b, i) => [b.time, i]));
const allSecs = EV.map((e) => Date.parse(e.utc) / 1000); const nearListed = (sec) => allSecs.some((s) => Math.abs(s - sec) <= 240 * 60);
const tr = (i) => { const b = B15[i], p = B15[i - 1]; return Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const K = 20; const out = {}; const bg = { n: 0, hits: 0 };
for (const e of EV) {
  const i0 = idx.get(Date.parse(e.utc) / 1000); if (i0 === undefined) continue; const [hh, mm] = e.et_time.split(':').map(Number); const d0 = new Date(e.date + 'T00:00:00Z');
  const ctrl = []; for (let dd = -42; dd <= 42; dd += 7) { if (!dd) continue; const ds = new Date(d0.getTime() + dd * 86400000).toISOString().slice(0, 10); const sec = Date.parse(etToUtc(ds, hh, mm).iso) / 1000; if (nearListed(sec)) continue; const i = idx.get(sec); if (i !== undefined) ctrl.push(i); }
  if (ctrl.length < 4) continue;
  const F = (out[e.family] ||= { n: 0, slots: Array.from({ length: K }, () => ({ hits: 0, n: 0, ratio_sum: 0 })) }); F.n++;
  for (let k = 0; k < K; k++) { const cm = median(ctrl.map((i) => tr(i + k)).filter(Number.isFinite)); const b = B15[i0 + k]; if (!b || !(cm > 0)) continue; const r = tr(i0 + k) / cm; F.slots[k].n++; F.slots[k].ratio_sum += r; if (r > 1.5) F.slots[k].hits++; for (const i of ctrl) { const v = tr(i + k); if (Number.isFinite(v)) { bg.n++; if (v > 1.5 * cm) bg.hits++; } } }
}
console.log('background share of control bars > 1.5x own-slot median:', (bg.hits / bg.n).toFixed(3));
for (const [fam, F] of Object.entries(out)) console.log(fam.padEnd(7), 'n', F.n, 'share>1.5x by slot (min):', F.slots.map((s, k) => `${k * 15}:${(s.hits / s.n).toFixed(2)}`).join(' '));
for (const [fam, F] of Object.entries(out)) console.log(fam.padEnd(7), 'mean ratio by slot:', F.slots.map((s, k) => `${k * 15}:${(s.ratio_sum / s.n).toFixed(2)}`).join(' '));
fs.writeFileSync(`${DIR}/v2_slot_profile_results.json`, JSON.stringify({ background_share: bg.hits / bg.n, families: out }, null, 1));
