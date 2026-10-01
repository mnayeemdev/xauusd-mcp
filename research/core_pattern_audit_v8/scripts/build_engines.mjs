/**
 * V8 -- builds research copies of the production engine (one directory per variant) and applies the minimal
 * corrections from corrections.mjs. Production files are only READ. Emits unified diffs (patches/<id>.patch,
 * patches/ALL.patch) and a hash manifest (configs/engines.sha256).
 *   node research/core_pattern_audit_v8/scripts/build_engines.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CORRECTIONS, VARIANTS, ENGINE_FILES } from './corrections.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const SRC = join(REPO, 'src'); const ENG = join(ROOT, 'engines'); const PATCHES = join(ROOT, 'patches'); const CFG = join(ROOT, 'configs');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const CORE_FILE = 'core/xauusd_calculate.js';
const UP = '../../../../../'; // engines/<V>/core/ -> repository root

function applyEdits(text, corr) {
  let out = text;
  for (const e of corr.edits) {
    const n = out.split(e.old).length - 1;
    if (n !== 1) throw new Error(`${corr.id}: anchor occurs ${n} times in ${corr.file}: ${e.old.slice(0, 80)}`);
    out = out.replace(e.old, () => e.new);
  }
  return out;
}

/** The live orchestrator copy imports production modules, except the engine files that exist in this variant's copy. */
function rewriteCoreImports(text) {
  return text
    .replace(/from '(\.\.?\/[^']+)'/g, (_, f) => {
      if (f.startsWith('./')) return `from '${UP}src/core/${f.slice(2)}'`;
      if (f.startsWith('../engine/')) return ENGINE_FILES.includes(f.slice(3)) ? `from '${f}'` : `from '${UP}src/${f.slice(3)}'`;
      return `from '${UP}src/${f.slice(3)}'`;
    })
    .replace("new URL('../../validation/mcp_engine_signals.json', import.meta.url)", `new URL('${UP}validation/mcp_engine_signals.json', import.meta.url)`);
}

mkdirSync(PATCHES, { recursive: true }); mkdirSync(CFG, { recursive: true });
if (existsSync(ENG)) rmSync(ENG, { recursive: true, force: true });
const manifest = [];
for (const [variant, ids] of Object.entries({ CONTROL_COPY: [], ...Object.fromEntries(Object.entries(VARIANTS).filter(([k]) => k !== 'CONTROL')) })) {
  const files = [...ENGINE_FILES, CORE_FILE];
  for (const f of files) {
    let text = readFileSync(join(SRC, f), 'utf8');
    for (const c of CORRECTIONS.filter((x) => ids.includes(x.id) && x.file === f)) text = applyEdits(text, c);
    if (f === CORE_FILE) text = rewriteCoreImports(text);
    const dest = join(ENG, variant, f); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, text);
    manifest.push(`${sha(text)}  engines/${variant}/${f}`);
  }
}
// unified diffs against production (the core copy's import rewrite is excluded: patches apply the edits to the original text)
const diffOf = (ids, name) => {
  const tmp = join(ROOT, 'patches', `.tmp_${name}`); rmSync(tmp, { recursive: true, force: true });
  let all = '';
  const touched = [...new Set(CORRECTIONS.filter((c) => ids.includes(c.id)).map((c) => c.file))];
  for (const f of touched) {
    let text = readFileSync(join(SRC, f), 'utf8');
    for (const c of CORRECTIONS.filter((x) => ids.includes(x.id) && x.file === f)) text = applyEdits(text, c);
    const dest = join(tmp, 'src', f); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, text);
    try { execFileSync('git', ['diff', '--no-index', '--', `src/${f}`, dest.replace(/\\/g, '/')], { cwd: REPO, encoding: 'utf8' }); } catch (e) { all += e.stdout; }
  }
  rmSync(tmp, { recursive: true, force: true });
  return all.replace(new RegExp(`[^ \n]*?patches/\.tmp_${name}/src/`, 'g'), 'b/src/');
};
for (const c of CORRECTIONS) writeFileSync(join(PATCHES, `${c.id}_${c.title}.patch`), diffOf([c.id], c.id));
writeFileSync(join(PATCHES, 'ALL_V8_CORRECTIONS.patch'), diffOf(CORRECTIONS.map((c) => c.id), 'ALL'));
writeFileSync(join(CFG, 'engines.sha256'), manifest.join('\n') + '\n');
writeFileSync(join(CFG, 'corrections.sha256'), `${sha(readFileSync(join(HERE, 'corrections.mjs')))}  scripts/corrections.mjs\n`);
console.log(JSON.stringify({ variants: Object.keys(VARIANTS), files: manifest.length, patches: CORRECTIONS.map((c) => c.id) }));
