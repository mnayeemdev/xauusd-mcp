/**
 * MCP tool-exposure profiles for the XAUUSD Adaptive Master customization
 * layer.
 *
 * Enforcement point: server.js registers every tool group through a
 * ProfileGate (see profile_gate.js) instead of the raw MCP server. The gate
 * only forwards `server.tool(name, ...)` calls whose name is in the active
 * profile's allowedTools set — everything else is never registered with the
 * MCP SDK at all. This means an unapproved tool doesn't exist for the
 * running session; it isn't merely hidden by a description or a runtime
 * check inside the handler. Selection is explicit and fails closed: an
 * unknown/missing/malformed profile name refuses to start the server rather
 * than silently falling back to "expose everything".
 *
 * Four separate concepts, deliberately not collapsed into one "dangerous"
 * list (see Phase 2A review, section 3):
 *
 *   A. PROHIBITED_MUTATING_TOOLS              (46 tools) — state-changing,
 *      code-execution, or process-control tools. These are the ones
 *      xauusd_research_health actively checks for leakage.
 *   B. APPROVED_RESEARCH_TOOLS                (13 tools) — the Research
 *      profile's full allowlist (10 read-only upstream tools + this
 *      project's 3 new tools).
 *   C. APPROVED_DEVELOPMENT_EXTRA_TOOLS        (5 tools) — added on top of B
 *      for the Development profile only.
 *   D. OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE (23 tools) — read-only
 *      upstream tools that are simply not on the Phase 2A candidate list.
 *      Excluding a harmless read tool for scope reasons is NOT the same
 *      claim as "this tool is dangerous" — xauusd_research_health must
 *      never conflate the two, so this list is tracked separately and is
 *      never checked against by the "dangerous tools exposed" assertion.
 *
 * A ∪ B(upstream subset) ∪ C ∪ D is asserted (in tests/xauusd_profile.test.js)
 * to exactly partition the 84 upstream tool names — no tool is omitted, and
 * no tool is double-classified. See PARTITION_UPSTREAM_TOOLS test coverage.
 */

export const PROFILE_ENV_VAR = 'TV_MCP_PROFILE';
export const DEFAULT_PROFILE = 'XAUUSD_RESEARCH';

function assertNoDuplicates(list, label) {
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item)) throw new Error(`Duplicate entry "${item}" in ${label} — this would silently mask an audit mistake.`);
    seen.add(item);
  }
}

function assertDisjoint(a, aLabel, b, bLabel) {
  const setB = new Set(b);
  for (const item of a) {
    if (setB.has(item)) throw new Error(`"${item}" appears in both ${aLabel} and ${bLabel} — these lists must be disjoint.`);
  }
}

// ── B. Research profile — exact candidate list from the Phase 2A spec plus
// this project's own three read-only tools. ─────────────────────────────
export const APPROVED_RESEARCH_TOOLS = Object.freeze([
  'tv_health_check',
  'chart_get_state',
  'quote_get',
  'data_get_ohlcv',
  'data_get_study_values',
  'data_get_pine_lines',
  'data_get_pine_labels',
  'data_get_pine_tables',
  'data_get_pine_boxes',
  'capture_screenshot',
  'xauusd_market_snapshot',
  'xauusd_master_state',
  'xauusd_research_health',
]);

// ── C. Development adds ONLY these five Pine read/write tools on top of
// Research. pine_compile/pine_save/pine_new/pine_open/pine_list_scripts/
// pine_analyze/pine_check are intentionally NOT included — they either
// mutate the chart/cloud (compile adds a study; save writes to TradingView's
// cloud; new/open replace the editor contents) or weren't asked for. ────
export const APPROVED_DEVELOPMENT_EXTRA_TOOLS = Object.freeze([
  'pine_get_source',
  'pine_set_source',
  'pine_smart_compile',
  'pine_get_errors',
  'pine_get_console',
]);

// ── A. Truly state-changing / code-execution / process-control tools —
// what section 3 and section 4 of the spec say must never be exposed by a
// Research- or Development-derived profile. This is what
// xauusd_research_health's "dangerous tools exposed" check actually scans
// for. It is a defense-in-depth assertion, not the enforcement mechanism
// itself (the gate's allowlist above is what actually stops registration).
export const PROHIBITED_MUTATING_TOOLS = Object.freeze([
  'tv_launch', 'tv_update',
  'chart_set_symbol', 'chart_set_timeframe', 'chart_set_type', 'chart_manage_indicator',
  'chart_set_visible_range', 'chart_scroll_to_date',
  'pine_compile', 'pine_save', 'pine_new', 'pine_open',
  'draw_shape', 'draw_clear', 'draw_remove_one',
  'alert_create', 'alert_delete',
  'batch_run',
  'replay_start', 'replay_step', 'replay_autoplay', 'replay_stop', 'replay_trade',
  'watchlist_add', 'watchlist_add_bulk', 'watchlist_remove',
  'ui_click', 'ui_open_panel', 'ui_fullscreen', 'ui_keyboard', 'ui_type_text',
  'ui_hover', 'ui_scroll', 'ui_mouse_click', 'ui_evaluate',
  'layout_switch', 'layout_new',
  'pane_set_layout', 'pane_focus', 'pane_set_symbol',
  'tab_new', 'tab_close', 'tab_switch',
  'indicator_set_inputs', 'indicator_toggle_visibility', 'indicator_add',
]);

// Deprecated alias — kept only so any external caller importing the old name
// doesn't break. Prefer PROHIBITED_MUTATING_TOOLS.
export const KNOWN_DANGEROUS_TOOLS = PROHIBITED_MUTATING_TOOLS;

// ── D. Read-only upstream tools NOT exposed by this project — a scope
// decision, not a danger classification. Never checked by the "dangerous
// tools exposed" assertion. Widening either profile to include some of
// these is a Phase 2B decision. ──────────────────────────────────────────
export const OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE = Object.freeze([
  'alert_list',
  'chart_get_visible_range',
  'data_get_equity', 'data_get_indicator', 'data_get_strategy_results', 'data_get_trades',
  'depth_get',
  'draw_get_properties', 'draw_list',
  'indicator_search',
  'layout_list',
  'pane_list',
  'pine_analyze', 'pine_check', 'pine_list_scripts',
  'replay_status',
  'symbol_info', 'symbol_search',
  'tab_list',
  'tv_discover', 'tv_ui_state',
  'ui_find_element',
  'watchlist_get',
]);

// Fail fast at import time (not just in tests) if any classification list
// has an internal duplicate or overlaps another — a duplicate or
// misclassification here would silently undermine every downstream
// allowlist/audit built on these lists.
assertNoDuplicates(APPROVED_RESEARCH_TOOLS, 'APPROVED_RESEARCH_TOOLS');
assertNoDuplicates(APPROVED_DEVELOPMENT_EXTRA_TOOLS, 'APPROVED_DEVELOPMENT_EXTRA_TOOLS');
assertNoDuplicates(PROHIBITED_MUTATING_TOOLS, 'PROHIBITED_MUTATING_TOOLS');
assertNoDuplicates(OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE, 'OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE');
assertDisjoint(APPROVED_RESEARCH_TOOLS, 'APPROVED_RESEARCH_TOOLS', APPROVED_DEVELOPMENT_EXTRA_TOOLS, 'APPROVED_DEVELOPMENT_EXTRA_TOOLS');
assertDisjoint(APPROVED_RESEARCH_TOOLS, 'APPROVED_RESEARCH_TOOLS', PROHIBITED_MUTATING_TOOLS, 'PROHIBITED_MUTATING_TOOLS');
assertDisjoint(APPROVED_DEVELOPMENT_EXTRA_TOOLS, 'APPROVED_DEVELOPMENT_EXTRA_TOOLS', PROHIBITED_MUTATING_TOOLS, 'PROHIBITED_MUTATING_TOOLS');
assertDisjoint(APPROVED_RESEARCH_TOOLS, 'APPROVED_RESEARCH_TOOLS', OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE, 'OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE');
assertDisjoint(APPROVED_DEVELOPMENT_EXTRA_TOOLS, 'APPROVED_DEVELOPMENT_EXTRA_TOOLS', OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE, 'OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE');
assertDisjoint(PROHIBITED_MUTATING_TOOLS, 'PROHIBITED_MUTATING_TOOLS', OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE, 'OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE');

// A Map, deliberately — NOT a plain object. A plain object literal used as a
// lookup table (`PROFILES[key]`) is vulnerable to key values that collide
// with Object.prototype's own accessor properties: `PROFILES['__proto__']`
// on a plain object returns the object's actual prototype (a truthy object)
// instead of `undefined`, which would have silently defeated the `!profile`
// fail-closed check below and returned a bogus, malformed "profile" instead
// of throwing. A Map's `.get()` has no such prototype-chain lookup — an
// unrecognized key always returns exactly `undefined`. (Caught in the
// Phase 2A review's fail-closed matrix: `resolveProfile('__proto__')` did
// not throw before this fix.)
const PROFILES = new Map([
  ['XAUUSD_RESEARCH', {
    name: 'XAUUSD_RESEARCH',
    description: 'Read-only research profile: chart/indicator/Pine-graphics reads only. No chart mutation, no code execution, no writes of any kind.',
    allowedTools: new Set(APPROVED_RESEARCH_TOOLS),
    notes: [],
  }],
  ['XAUUSD_DEVELOPMENT', {
    name: 'XAUUSD_DEVELOPMENT',
    description: 'Research profile plus Pine Script development tools (source read/write, compile, errors, console).',
    allowedTools: new Set([...APPROVED_RESEARCH_TOOLS, ...APPROVED_DEVELOPMENT_EXTRA_TOOLS]),
    // pine_smart_compile side effects (documented per spec section 4): it
    // clicks TradingView's own "Update on Chart"/"Add to Chart" button, which
    // (a) adds/replaces the study currently open in the Pine Editor on the
    // live chart, and (b) can trigger a compile error banner and console
    // output. It does not change symbol/timeframe, does not create alerts,
    // drawings, or watchlist entries, and does not touch any other study.
    notes: [
      'pine_smart_compile side effect: adds/updates the Pine-Editor study on the chart (equivalent to clicking "Add to Chart"/"Update on Chart") and may surface compiler errors/console output. It does not change symbol, timeframe, alerts, drawings, or the watchlist.',
    ],
  }],
]);

export function listProfiles() {
  return [...PROFILES.keys()];
}

/**
 * Resolve a profile by name. Fails closed: any name that isn't an exact,
 * known profile key throws.
 *
 * The ONLY normalization applied is trimming surrounding (leading/trailing)
 * whitespace — so a trailing newline or space accidentally left in a .env
 * file doesn't turn an otherwise-valid value into a fail-closed error. That
 * is the sole exception; there is no case-folding, no internal-whitespace
 * collapsing, and no hyphen/underscore normalization. Concretely:
 *   - ""  / undefined / unset          → default (XAUUSD_RESEARCH)
 *   - "XAUUSD_RESEARCH"                → accepted
 *   - "  XAUUSD_RESEARCH  " (surrounding whitespace only) → accepted (trimmed)
 *   - "xauusd_research" (wrong case)   → REFUSED
 *   - "XAUUSD-RESEARCH" (hyphen)       → REFUSED
 *   - "XAUUSD_RESEARCH " + more text, or any other unrecognized string → REFUSED
 * A refusal always throws rather than falling back to any profile —
 * including the default — so an operator typo can never be silently
 * reinterpreted as a different, unintended profile.
 */
export function resolveProfile(rawName) {
  const trimmed = (rawName ?? '').toString().trim();
  const key = trimmed === '' ? DEFAULT_PROFILE : trimmed;
  const profile = PROFILES.get(key);
  if (!profile) {
    throw new Error(
      `Unknown MCP profile "${key}". Valid profiles: ${listProfiles().join(', ')}. ` +
      `Refusing to start (fail-closed) rather than exposing all tools. ` +
      `Set ${PROFILE_ENV_VAR} to one of the valid values (case-sensitive, exact match), or leave it unset for the default (${DEFAULT_PROFILE}).`
    );
  }
  return profile;
}
