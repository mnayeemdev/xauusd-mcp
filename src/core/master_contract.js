/**
 * XAUUSD Adaptive Master ↔ MCP output contract: parser + validator.
 *
 * PROVISIONAL SPEC, NOT YET IMPLEMENTED IN A REAL PINE SCRIPT. The actual
 * XAUUSD Adaptive Master indicator does not exist yet (Phase 2A/2B build the
 * MCP-side foundation ahead of it, per the project's phase plan). This file
 * defines the contract this project's Pine script MUST implement when it is
 * eventually authored — every field name, enum value, and transport shape
 * below is a design decision made without inspecting real Pine source
 * (there is none to inspect), not a fact observed from a live indicator.
 * Update this file, not silently, if the real script ends up differing.
 *
 * ── Transport (see docs/XAUUSD_ADAPTIVE_MASTER.md "Pine transport design") ──
 * The contract travels as a Pine `table.cell()` grid with exactly two
 * columns per row: KEY and VALUE (already read by data_get_pine_tables /
 * core/data.js:getPineTables, which formats each row as "KEY | VALUE" text
 * — see buildGraphicsJS's `.join(' | ')`). This module parses that row
 * format. Screenshots/OCR/pixel-color reads are never used for the contract
 * (Phase 2B spec section 11) — only this deterministic text grid.
 *
 * ── Non-negotiable invariant (enforced throughout this file) ──
 * MCP NEVER promotes WAIT/UNKNOWN into BUY/SELL, and NEVER fabricates a
 * missing/invalid field. Every branch below that can't fully validate a
 * BUY/SELL trade forces `action` back to 'UNKNOWN' and nulls every trade
 * price — it never "fixes", repairs, or guesses a value on Pine's behalf.
 */

export const SUPPORTED_CONTRACT_VERSIONS = Object.freeze([1]);

export const ACTIONS = Object.freeze(['WAIT', 'BUY', 'SELL', 'UNKNOWN']);

// Reserved WAIT reasons (Phase 2B spec section 4). Pine is not required to
// implement all of these yet — this is the reserved vocabulary MCP accepts;
// an unrecognized reason string is a parse error (MALFORMED_CONTRACT), not a
// silently-accepted new one, so the enum can't silently drift out of sync
// between Pine and MCP.
export const WAIT_REASONS = Object.freeze([
  'NO_GOOD_ENTRY',
  'CORRECTION_ACTIVE',
  'UNCLEAR_MARKET',
  'CHOP',
  'TRANSITION',
  'CONFIRMATION_INCOMPLETE',
  'ENTRY_LATE',
  'OVEREXTENDED',
  'RR_NOT_ACCEPTABLE',
  'NO_ELIGIBLE_STRATEGY',
  'NO_SETUP',
  'NO_TRIGGER',
  'NEWS_SUPPRESSION',
  'UNKNOWN',
]);

// Transport key → parse kind. 'enum:ACTION' / 'enum:WAIT_REASON' get strict
// enum validation; 'numeric' fields must be "NA" or a finite number;
// everything else is an opaque pass-through string (trimmed, "NA" → null) —
// Pine hasn't been designed yet, so REGIME/MODEL/etc. vocabularies aren't
// fixed enums here; only the two safety-critical fields (ACTION, WAIT_REASON)
// are closed enums.
const FIELD_KINDS = Object.freeze({
  CONTRACT_VERSION: 'integer',
  INDICATOR_VERSION: 'string',
  SYMBOL: 'string',
  EXECUTION_TF: 'string',
  CONTEXT_TF: 'string',
  BAR_TIME: 'numeric',
  BAR_INDEX: 'numeric',
  BAR_CONFIRMED: 'boolean',
  REGIME: 'string',
  CORRECTION_STATE: 'string',
  CORRECTION_REASON: 'string',
  MODEL: 'string',
  SETUP_STATE: 'string',
  TRIGGER_STATE: 'string',
  CONFIRMATION_STATE: 'string',
  QUALITY: 'numeric',
  QUALITY_THRESHOLD: 'numeric',
  OVEREXTENSION_STATE: 'string',
  RR_VALIDATION_STATE: 'string',
  ACTION: 'enum:ACTION',
  WAIT_REASON: 'enum:WAIT_REASON',
  ENTRY: 'numeric',
  SL: 'numeric',
  TP1: 'numeric',
  TP2: 'numeric',
  EXIT_TARGET: 'numeric',
  RR: 'numeric',
  SESSION: 'string',
  SIGNAL_ID: 'string',
  SIGNAL_BAR_TIME: 'numeric',
  STATE_REASON: 'string',

  // ── P2 additions (market-structure engine) — purely additive. None of
  // these are required/consulted by the BUY/SELL validation gates above or
  // below; they exist only to populate `structure` in the returned shape.
  // Vocabularies (STRUCTURE_STATE, LAST_STRUCTURE_EVENT, etc.) are opaque
  // pass-through strings for the same reason REGIME/MODEL are: the exact
  // set of values Pine emits can evolve without a parser change, as long as
  // it stays within the general "string or NA" contract.
  STRUCTURE_STATE: 'string',
  LAST_STRUCTURE_EVENT: 'string',
  LAST_STRUCTURE_EVENT_BAR: 'numeric',
  LAST_SWING_HIGH: 'numeric',
  LAST_SWING_HIGH_TYPE: 'string',
  LAST_SWING_LOW: 'numeric',
  LAST_SWING_LOW_TYPE: 'string',
  LAST_BOS_DIRECTION: 'string',
  LAST_BOS_BAR: 'numeric',
  LAST_CHOCH_DIRECTION: 'string',
  LAST_CHOCH_BAR: 'numeric',
  LAST_SWEEP_TYPE: 'string',
  LAST_SWEEP_BAR: 'numeric',
  PDH: 'numeric',
  PDL: 'numeric',
  LAST_DAILY_SWEEP: 'string',
  DISPLACEMENT_STATE: 'string',
  RANGE_STATE: 'string',
  RANGE_HIGH: 'numeric',
  RANGE_LOW: 'numeric',
});

// Required for ANY BUY/SELL to be trusted at all (spec section 5). TP1 plus
// at least one of TP2/EXIT_TARGET is required — checked separately below.
const REQUIRED_TRADE_FIELDS = Object.freeze(['ENTRY', 'SL', 'TP1', 'RR', 'MODEL', 'REGIME', 'QUALITY', 'SIGNAL_ID', 'SIGNAL_BAR_TIME']);

function isBlank(v) {
  return v === undefined || v === null || v.toString().trim() === '';
}

function normalizeNA(raw) {
  const t = (raw ?? '').toString().trim();
  // Both an entirely OMITTED field (raw === undefined, key not present in
  // the table at all) and a PRESENT-BUT-EMPTY value (e.g. "ENTRY | ") must
  // be treated identically to an explicit "NA" — all three mean "no value".
  // Before this fix, an omitted field fell through to the `t` branch below
  // (t === ''), and Number('') === 0 in JS silently turned a missing
  // numeric field into 0 — e.g. a BUY with no ENTRY row at all parsed as
  // `entry: 0` with status "OK" instead of being rejected. That is exactly
  // the fabrication this entire contract exists to prevent.
  if (t === '') return null;
  return t.toUpperCase() === 'NA' ? null : t;
}

/**
 * Parses "KEY | VALUE" table rows (the exact shape getPineTables produces)
 * into a { fields, malformedRows, duplicateKeys } structure. Pure parsing —
 * no semantic validation here.
 */
export function parseTableRows(rows) {
  const fields = {};
  const duplicateKeys = [];
  const malformedRows = [];
  const seen = new Set();

  for (const row of rows ?? []) {
    const text = (row ?? '').toString();
    const parts = text.split(' | ');
    if (parts.length !== 2) {
      malformedRows.push(text);
      continue;
    }
    const key = parts[0].trim().toUpperCase();
    const value = parts[1].trim();
    if (!key) { malformedRows.push(text); continue; }
    if (seen.has(key)) { duplicateKeys.push(key); continue; }
    seen.add(key);
    fields[key] = value;
  }

  return { fields, duplicateKeys, malformedRows };
}

function parseNumeric(raw) {
  const na = normalizeNA(raw);
  if (na === null) return { ok: true, value: null };
  const n = Number(na);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, value: undefined };
}

function parseBoolean(raw) {
  const na = normalizeNA(raw);
  if (na === null) return null;
  return na === '1' || na.toUpperCase() === 'TRUE';
}

function parseEnum(raw, allowed) {
  const na = normalizeNA(raw);
  if (na === null) return { ok: true, value: null };
  const upper = na.toUpperCase();
  return allowed.includes(upper) ? { ok: true, value: upper } : { ok: false, value: upper };
}

function emptyDecision() {
  return { action: 'UNKNOWN', wait_reason: null, entry: null, stop_loss: null, tp1: null, tp2: null, exit_target: null, rr: null };
}

/**
 * The main entry point. Builds the full structured contract result from raw
 * Pine table rows plus chart-derived context (symbol/timeframe, which are
 * NOT trusted from Pine's own SYMBOL/EXECUTION_TF fields for the top-level
 * `market.symbol`/`market.timeframe` — those come from chart_get_state,
 * which is the one thing MCP itself is authoritative for).
 *
 * @returns {object} a full xauusd_master_state-shaped payload minus the
 *   discovery-layer fields (status/indicator_identity/candidates), which the
 *   caller (core/xauusd.js:getMasterState) merges in.
 */
export function buildMasterContract({ rows, chartSymbol, chartTimeframe } = {}) {
  const base = {
    contract_version: null,
    market: { symbol: chartSymbol ?? null, timeframe: chartTimeframe ?? null, regime: null, correction_state: null, session: null },
    setup: { model: null, setup_state: null, trigger_state: null, confirmation_state: null, quality: null, quality_threshold: null, overextension_state: null, rr_validation_state: null },
    decision: emptyDecision(),
    signal: { signal_id: null, signal_bar_time: null, bar_confirmed: null },
    // P2: market-structure evidence. Additive — present (all-null) on every
    // status, including NOT_FOUND/NO_CONTRACT/MALFORMED_CONTRACT, exactly
    // like market/setup/decision/signal above, so the shape never changes
    // between statuses.
    structure: {
      state: null, last_event: null, last_event_bar: null,
      last_swing_high: null, last_swing_high_type: null,
      last_swing_low: null, last_swing_low_type: null,
      last_bos_direction: null, last_bos_bar: null,
      last_choch_direction: null, last_choch_bar: null,
      last_sweep_type: null, last_sweep_bar: null,
      pdh: null, pdl: null, last_daily_sweep: null,
      displacement_state: null,
      range_state: null, range_high: null, range_low: null,
    },
    rr_check: null,
    contradictions: [],
    invalid_fields: [],
    warnings: [],
  };

  if (!rows || rows.length === 0) {
    return { ...base, status: 'NO_CONTRACT', warnings: ['No contract table found for this indicator (it may not be computing yet, or does not implement the contract).'] };
  }

  const { fields, duplicateKeys, malformedRows } = parseTableRows(rows);

  if (duplicateKeys.length > 0) {
    return { ...base, status: 'MALFORMED_CONTRACT', invalid_fields: duplicateKeys, warnings: [`Duplicate/conflicting keys in contract table: ${duplicateKeys.join(', ')}`] };
  }
  if (malformedRows.length > 0) {
    return { ...base, status: 'MALFORMED_CONTRACT', invalid_fields: malformedRows, warnings: [`Rows that did not parse as "KEY | VALUE": ${malformedRows.length}`] };
  }

  // ── CONTRACT_VERSION ────────────────────────────────────────────────
  if (isBlank(fields.CONTRACT_VERSION)) {
    return { ...base, status: 'MALFORMED_CONTRACT', invalid_fields: ['CONTRACT_VERSION'], warnings: ['CONTRACT_VERSION is required and missing.'] };
  }
  const versionNum = Number(fields.CONTRACT_VERSION);
  if (!Number.isInteger(versionNum)) {
    return { ...base, status: 'MALFORMED_CONTRACT', invalid_fields: ['CONTRACT_VERSION'], warnings: [`CONTRACT_VERSION "${fields.CONTRACT_VERSION}" is not an integer.`] };
  }
  if (!SUPPORTED_CONTRACT_VERSIONS.includes(versionNum)) {
    return { ...base, contract_version: versionNum, status: 'UNSUPPORTED_CONTRACT_VERSION', warnings: [`Contract version ${versionNum} is not supported. Supported: ${SUPPORTED_CONTRACT_VERSIONS.join(', ')}.`] };
  }
  base.contract_version = versionNum;

  // ── Parse every known field, collecting invalid ones without guessing ──
  const invalidFields = [];
  const parsed = {};
  for (const [key, kind] of Object.entries(FIELD_KINDS)) {
    if (key === 'CONTRACT_VERSION') continue; // already handled
    const raw = fields[key];
    if (kind === 'numeric') {
      const r = parseNumeric(raw);
      if (!r.ok) invalidFields.push(key); else parsed[key] = r.value;
    } else if (kind === 'boolean') {
      parsed[key] = parseBoolean(raw);
    } else if (kind === 'enum:ACTION') {
      const r = parseEnum(raw, ACTIONS);
      if (!r.ok) invalidFields.push(key); else parsed[key] = r.value ?? 'UNKNOWN';
    } else if (kind === 'enum:WAIT_REASON') {
      const r = parseEnum(raw, WAIT_REASONS);
      if (!r.ok) invalidFields.push(key); else parsed[key] = r.value;
    } else {
      parsed[key] = normalizeNA(raw);
    }
  }

  if (invalidFields.length > 0) {
    return { ...base, status: 'MALFORMED_CONTRACT', invalid_fields: invalidFields, warnings: [`Fields failed validation: ${invalidFields.join(', ')}`] };
  }

  base.market.regime = parsed.REGIME;
  base.market.correction_state = parsed.CORRECTION_STATE;
  base.market.session = parsed.SESSION;
  base.setup.model = parsed.MODEL;
  base.setup.setup_state = parsed.SETUP_STATE;
  base.setup.trigger_state = parsed.TRIGGER_STATE;
  base.setup.confirmation_state = parsed.CONFIRMATION_STATE;
  base.setup.quality = parsed.QUALITY;
  base.setup.quality_threshold = parsed.QUALITY_THRESHOLD;
  base.setup.overextension_state = parsed.OVEREXTENSION_STATE;
  base.setup.rr_validation_state = parsed.RR_VALIDATION_STATE;
  base.signal.signal_id = parsed.SIGNAL_ID;
  base.signal.signal_bar_time = parsed.SIGNAL_BAR_TIME;
  base.signal.bar_confirmed = parsed.BAR_CONFIRMED;

  // P2: populated whenever the contract parses this far, regardless of
  // what ACTION turns out to be — structure is context, not gated by trade
  // validity.
  base.structure = {
    state: parsed.STRUCTURE_STATE,
    last_event: parsed.LAST_STRUCTURE_EVENT,
    last_event_bar: parsed.LAST_STRUCTURE_EVENT_BAR,
    last_swing_high: parsed.LAST_SWING_HIGH,
    last_swing_high_type: parsed.LAST_SWING_HIGH_TYPE,
    last_swing_low: parsed.LAST_SWING_LOW,
    last_swing_low_type: parsed.LAST_SWING_LOW_TYPE,
    last_bos_direction: parsed.LAST_BOS_DIRECTION,
    last_bos_bar: parsed.LAST_BOS_BAR,
    last_choch_direction: parsed.LAST_CHOCH_DIRECTION,
    last_choch_bar: parsed.LAST_CHOCH_BAR,
    last_sweep_type: parsed.LAST_SWEEP_TYPE,
    last_sweep_bar: parsed.LAST_SWEEP_BAR,
    pdh: parsed.PDH,
    pdl: parsed.PDL,
    last_daily_sweep: parsed.LAST_DAILY_SWEEP,
    displacement_state: parsed.DISPLACEMENT_STATE,
    range_state: parsed.RANGE_STATE,
    range_high: parsed.RANGE_HIGH,
    range_low: parsed.RANGE_LOW,
  };

  const action = parsed.ACTION ?? 'UNKNOWN';

  // WAIT / UNKNOWN: never carry trade prices, regardless of stray values
  // Pine's table might still hold from a previous signal.
  if (action !== 'BUY' && action !== 'SELL') {
    base.decision = { action, wait_reason: parsed.WAIT_REASON ?? (action === 'WAIT' ? 'UNKNOWN' : null), entry: null, stop_loss: null, tp1: null, tp2: null, exit_target: null, rr: null };
    return { ...base, status: 'OK' };
  }

  // ── action is BUY or SELL from here — every remaining check exists to
  // decide whether we are allowed to say so, never to invent a substitute. ──

  // 1. Structural completeness first.
  const missing = REQUIRED_TRADE_FIELDS.filter((f) => parsed[f] === null || parsed[f] === undefined);
  const hasExit = parsed.TP2 !== null || parsed.EXIT_TARGET !== null;
  if (!hasExit) missing.push('TP2_OR_EXIT_TARGET');
  if (missing.length > 0) {
    return { ...base, status: 'MALFORMED_CONTRACT', invalid_fields: missing, warnings: [`${action} signal is missing required trade field(s), refusing to trust it: ${missing.join(', ')}`] };
  }

  // 2. Confirmed-bar / non-repaint provenance (spec section 7).
  if (base.signal.bar_confirmed !== true) {
    return { ...base, status: 'SOURCE_UNCONFIRMED', warnings: [`${action} reported on an unconfirmed/repainting bar — refusing to present it as a confirmed trade.`] };
  }

  // 3. Contradiction checks (spec sections 6, 8, 9, 10) — flagged, never
  // silently downgraded to WAIT (that would itself be a form of "fixing"
  // Pine's contradictory output rather than surfacing it transparently).
  const contradictions = [];
  if ((parsed.CORRECTION_STATE ?? '').toUpperCase() === 'ACTIVE') {
    contradictions.push(`${action} reported while correction_state=ACTIVE — correction-active states must remain WAIT.`);
  }
  if (['OVEREXTENDED', 'ENTRY_LATE'].includes((parsed.OVEREXTENSION_STATE ?? '').toUpperCase())) {
    contradictions.push(`${action} reported while overextension_state=${parsed.OVEREXTENSION_STATE} — late/overextended entries must remain WAIT.`);
  }
  if ((parsed.RR_VALIDATION_STATE ?? '').toUpperCase() === 'RR_NOT_ACCEPTABLE') {
    contradictions.push(`${action} reported while rr_validation_state=RR_NOT_ACCEPTABLE.`);
  }
  if (parsed.QUALITY !== null && parsed.QUALITY_THRESHOLD !== null && parsed.QUALITY < parsed.QUALITY_THRESHOLD) {
    contradictions.push(`${action} reported with quality (${parsed.QUALITY}) below quality_threshold (${parsed.QUALITY_THRESHOLD}).`);
  }
  if (contradictions.length > 0) {
    return { ...base, status: 'CONTRACT_CONTRADICTION', contradictions, warnings: ['Authoritative contract contains an internal contradiction — refusing to surface the trade. See `contradictions`.'] };
  }

  // 4. Everything checked out — this is a valid, trustworthy trade signal.
  // MCP-side RR arithmetic is informational only; Pine's own `rr` value is
  // never overwritten (spec section 9: PINE_REPORTED_RR vs MCP_VALIDATED_RR).
  const risk = Math.abs(parsed.ENTRY - parsed.SL);
  const reward = Math.abs(parsed.TP1 - parsed.ENTRY);
  const mcpCalculatedRr = risk > 0 ? +(reward / risk).toFixed(4) : null;
  const rrCheck = {
    pine_reported_rr: parsed.RR,
    mcp_calculated_rr: mcpCalculatedRr,
    consistent: mcpCalculatedRr === null ? null : Math.abs(mcpCalculatedRr - parsed.RR) <= Math.max(0.05 * parsed.RR, 0.05),
  };

  base.decision = {
    action,
    wait_reason: null,
    entry: parsed.ENTRY,
    stop_loss: parsed.SL,
    tp1: parsed.TP1,
    tp2: parsed.TP2,
    exit_target: parsed.EXIT_TARGET,
    rr: parsed.RR,
  };
  base.rr_check = rrCheck;

  return { ...base, status: 'OK' };
}
