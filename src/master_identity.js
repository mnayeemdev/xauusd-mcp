/**
 * Reusable, read-only discovery layer for the (not-yet-built) "XAUUSD
 * Adaptive Master" Pine indicator.
 *
 * Upstream's data_get_pine_* tools match studies by a case-sensitive name
 * substring and cannot disambiguate two same-named studies by entity ID.
 * This module improves on that for our own layer: it matches against a
 * configurable list of approved display names and, when more than one study
 * on the chart matches, returns AMBIGUOUS with every candidate instead of
 * silently picking one.
 *
 * Matching is EXACT (case-insensitive) only — deliberately not a prefix or
 * substring match. An earlier version matched by `name.startsWith(approved)`
 * to tolerate TradingView's auto-versioning suffixes (e.g. "(2)"); the
 * Phase 2A review flagged that this let an unrelated, differently-authored
 * indicator that merely shares a name prefix (e.g. "XAUUSD Adaptive Master
 * Pro") falsely register as a match — a name-squatting risk for something
 * whose entire purpose is unambiguous identity. If a real naming variant is
 * ever needed (a version suffix, a beta label, etc.), add that exact string
 * to XAUUSD_MASTER_INDICATOR_NAMES explicitly rather than widening the
 * matching rule.
 */

export const MASTER_NAMES_ENV_VAR = 'XAUUSD_MASTER_INDICATOR_NAMES';

const DEFAULT_MASTER_NAMES = Object.freeze(['XAUUSD Adaptive Master']);

export function getApprovedMasterNames({ _deps } = {}) {
  const env = _deps?.env ?? process.env;
  const raw = env[MASTER_NAMES_ENV_VAR];
  const list = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_MASTER_NAMES;
  return list;
}

/**
 * @param {Array<{id: string, name: string}>} studies - from chart_get_state
 * @returns {{status: 'NOT_FOUND'|'FOUND'|'AMBIGUOUS', candidates: Array, indicator?: object}}
 */
export function discoverMasterCandidates(studies, { approvedNames, _deps } = {}) {
  const names = (approvedNames ?? getApprovedMasterNames({ _deps })).map((n) => n.toLowerCase());

  const candidates = (studies || [])
    .filter((s) => {
      const sname = (s?.name ?? '').toLowerCase();
      return sname !== '' && names.includes(sname);
    })
    .map((s) => ({
      display_name: s.name,
      entity_id: s.id ?? null,
      matching_reason: 'exact_name_match',
    }));

  if (candidates.length === 0) return { status: 'NOT_FOUND', candidates: [] };
  if (candidates.length > 1) return { status: 'AMBIGUOUS', candidates };
  return { status: 'FOUND', candidates, indicator: candidates[0] };
}
