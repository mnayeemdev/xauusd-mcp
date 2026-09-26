/**
 * Append-only JSONL evidence store (Stage 11C). One line per record, never rewritten. Duplicate ids are
 * rejected in memory (index rebuilt from the files at start, so a restart or a replayed cycle cannot create
 * a second record for the same observation/outcome). Malformed trailing lines (crash mid-write) are skipped
 * and counted, never "repaired". Runtime evidence lives under state/shadow/ (gitignored via state/).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validateObservation, validateOutcome } from './schema.js';

export function createEvidenceStore({ dir, deps = {} } = {}) {
  if (!dir) throw new Error('evidence store needs a directory');
  const fs = { append: deps.append ?? ((p, line) => appendFileSync(p, line)), read: deps.read ?? ((p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')), mkdir: deps.mkdir ?? ((p) => mkdirSync(p, { recursive: true })), write: deps.write ?? ((p, s) => { writeFileSync(p + '.tmp', s); renameSync(p + '.tmp', p); }) };
  const paths = { observations: join(dir, 'observations.jsonl'), outcomes: join(dir, 'outcomes.jsonl') };
  fs.mkdir(dir);
  const ids = { observations: new Set(), outcomes: new Set() }; const stats = { malformed_lines: 0, loaded: { observations: 0, outcomes: 0 } };
  function load(kind) { const txt = fs.read(paths[kind]); const rows = []; for (const line of txt.split(/\r?\n/)) { if (!line.trim()) continue; try { const r = JSON.parse(line); rows.push(r); ids[kind].add(kind === 'observations' ? r.observation_id : r.outcome_id); } catch { stats.malformed_lines++; } } stats.loaded[kind] = rows.length; return rows; }
  load('observations'); load('outcomes');
  function appendObservation(o) { const v = validateObservation(o); if (!v.ok) return { ok: false, reason: 'INVALID', errors: v.errors }; if (ids.observations.has(o.observation_id)) return { ok: false, reason: 'DUPLICATE' }; fs.append(paths.observations, JSON.stringify(o) + '\n'); ids.observations.add(o.observation_id); return { ok: true }; }
  function appendOutcome(r) { const v = validateOutcome(r); if (!v.ok) return { ok: false, reason: 'INVALID', errors: v.errors }; if (ids.outcomes.has(r.outcome_id)) return { ok: false, reason: 'DUPLICATE' }; if (!ids.observations.has(r.observation_id)) return { ok: false, reason: 'UNKNOWN_OBSERVATION' }; fs.append(paths.outcomes, JSON.stringify(r) + '\n'); ids.outcomes.add(r.outcome_id); return { ok: true }; }
  function readAll(kind) { return load(kind); }
  function exportSnapshot(path, meta = {}) { const snap = { exported_at: new Date().toISOString(), ...meta, observations: readAll('observations'), outcomes: readAll('outcomes') }; fs.mkdir(dirname(path)); fs.write(path, JSON.stringify(snap)); return { path, observations: snap.observations.length, outcomes: snap.outcomes.length }; }
  return { paths, appendObservation, appendOutcome, readAll, exportSnapshot, hasObservation: (id) => ids.observations.has(id), hasOutcome: (id) => ids.outcomes.has(id), stats: () => ({ ...stats, observations: ids.observations.size, outcomes: ids.outcomes.size }) };
}
