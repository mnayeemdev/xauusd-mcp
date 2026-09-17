/**
 * Core logic for the three XAUUSD Adaptive Master research tools:
 *   - getMarketSnapshot()  → xauusd_market_snapshot
 *   - getMasterState()     → xauusd_master_state
 *   - getResearchHealth()  → xauusd_research_health
 *
 * Architectural rule (see docs/XAUUSD_ADAPTIVE_MASTER.md): Pine is
 * authoritative. Nothing in this file computes a trading decision, predicts
 * price, or infers a field the underlying data source didn't actually
 * expose. Every field is either read straight from an existing read-only
 * core module or explicitly null/"UNKNOWN" with a warning explaining why.
 * None of the functions below call any chart/study/alert/watchlist/replay
 * setter or mutator — see the "no mutation" regression test in
 * tests/xauusd_profile.test.js, which source-audits this file for exactly
 * that property (it greps for the literal mutator names, so this comment
 * deliberately avoids spelling them out).
 */
import * as _chartCore from './chart.js';
import * as _dataCore from './data.js';
import { checkXauusdSymbol } from '../xauusd_guard.js';
import { discoverMasterCandidates } from '../master_identity.js';
import { buildMasterContract } from './master_contract.js';
import { PROHIBITED_MUTATING_TOOLS } from '../profiles.js';
import { PRODUCT_NAME, PRODUCT_VERSION } from '../branding.js';

const SNAPSHOT_SCHEMA_VERSION = '1.0.0';
const MASTER_SCHEMA_VERSION = '2.1.0'; // 2.1.0: Pine P2 additive `structure` group (market/setup/decision/signal unchanged)
const HEALTH_SCHEMA_VERSION = '1.0.0';
const MAX_SNAPSHOT_OHLCV = 500;
const CONTRACT_TABLE_ANCHOR = 'CONTRACT_VERSION'; // identifies which of a study's tables (if it draws more than one) is the machine contract

function resolveDeps(_deps) {
  return {
    getState: _deps?.getState ?? _chartCore.getState,
    getQuote: _deps?.getQuote ?? _dataCore.getQuote,
    getOhlcv: _deps?.getOhlcv ?? _dataCore.getOhlcv,
    getStudyValues: _deps?.getStudyValues ?? _dataCore.getStudyValues,
    getPineLines: _deps?.getPineLines ?? _dataCore.getPineLines,
    getPineLabels: _deps?.getPineLabels ?? _dataCore.getPineLabels,
    getPineTables: _deps?.getPineTables ?? _dataCore.getPineTables,
    getPineBoxes: _deps?.getPineBoxes ?? _dataCore.getPineBoxes,
  };
}

/**
 * Unified, deterministic read-only XAUUSD snapshot. Never calls a setter —
 * getQuote() is always called with no symbol, so it can never switch the
 * chart. Missing data becomes null + an entry in `errors`/`warnings`, never
 * a fabricated value.
 *
 * NOT ATOMIC: chart state, quote, OHLCV, study values, and the four Pine
 * graphics reads are fetched with SEPARATE, SEQUENTIAL CDP round-trips, one
 * after another — TradingView has no single "read everything as of instant
 * T" API to snapshot against. The market can tick between the quote read and
 * the OHLCV read, for example. `capture_started_at`/`capture_completed_at`
 * expose that window explicitly instead of implying a false atomicity; on a
 * healthy connection it is typically well under a second, but that is not
 * guaranteed (a slow Pine graphics read can widen it).
 */
export async function getMarketSnapshot({ ohlcv_count, _deps } = {}) {
  const deps = resolveDeps(_deps);
  const warnings = [];
  const errors = [];
  const captureStartedAt = new Date().toISOString();

  let state = null;
  try { state = await deps.getState(); }
  catch (err) { errors.push(`chart_get_state failed: ${err.message}`); }

  const guard = checkXauusdSymbol(state?.symbol);
  if (state && !guard.approved) {
    warnings.push(`Current chart symbol "${state.symbol}" is not on the approved XAUUSD alias list.`);
  }

  let quote = null;
  try { quote = await deps.getQuote({}); }
  catch (err) { errors.push(`quote_get failed: ${err.message}`); }

  let ohlcv = null;
  try {
    const count = Math.min(ohlcv_count || 20, MAX_SNAPSHOT_OHLCV);
    ohlcv = await deps.getOhlcv({ count, summary: false });
  } catch (err) { errors.push(`data_get_ohlcv failed: ${err.message}`); }

  let studyValues = null;
  try { studyValues = await deps.getStudyValues(); }
  catch (err) { errors.push(`data_get_study_values failed: ${err.message}`); }

  let pineLines = null, pineLabels = null, pineTables = null, pineBoxes = null;
  try { pineLines = await deps.getPineLines({}); } catch (err) { errors.push(`data_get_pine_lines failed: ${err.message}`); }
  try { pineLabels = await deps.getPineLabels({}); } catch (err) { errors.push(`data_get_pine_labels failed: ${err.message}`); }
  try { pineTables = await deps.getPineTables({}); } catch (err) { errors.push(`data_get_pine_tables failed: ${err.message}`); }
  try { pineBoxes = await deps.getPineBoxes({}); } catch (err) { errors.push(`data_get_pine_boxes failed: ${err.message}`); }

  const bars = ohlcv?.bars ?? [];
  const latestBar = bars.length ? bars[bars.length - 1] : null;
  const captureCompletedAt = new Date().toISOString();

  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    captured_at: captureCompletedAt,
    capture_started_at: captureStartedAt,
    capture_completed_at: captureCompletedAt,
    capture_is_atomic: false,
    product: { name: PRODUCT_NAME, version: PRODUCT_VERSION },
    symbol: state?.symbol ?? null,
    provider: quote?.exchange ?? null,
    timeframe: state?.resolution ?? null,
    chart_type: state?.chartType ?? null,
    xauusd_guard: guard,
    quote: quote ? {
      last: quote.last ?? null, open: quote.open ?? null, high: quote.high ?? null,
      low: quote.low ?? null, close: quote.close ?? null, volume: quote.volume ?? null,
      time: quote.time ?? null, bid: quote.bid ?? null, ask: quote.ask ?? null,
    } : null,
    latest_bar: latestBar,
    recent_ohlcv: bars,
    visible_studies: state?.studies ?? [],
    study_values: studyValues?.studies ?? [],
    pine: {
      tables: pineTables?.studies ?? [],
      labels: pineLabels?.studies ?? [],
      lines: pineLines?.studies ?? [],
      boxes: pineBoxes?.studies ?? [],
    },
    data_availability: {
      chart_state: !!state,
      quote: !!quote,
      ohlcv: !!ohlcv,
      study_values: !!studyValues,
      pine_tables: !!(pineTables && pineTables.study_count > 0),
      pine_labels: !!(pineLabels && pineLabels.study_count > 0),
      pine_lines: !!(pineLines && pineLines.study_count > 0),
      pine_boxes: !!(pineBoxes && pineBoxes.study_count > 0),
    },
    status: errors.length ? 'partial' : 'ok',
    warnings,
    errors,
  };
}

// Empty nested shape shared by every non-OK/pre-contract status (READ_ERROR,
// NOT_FOUND, AMBIGUOUS) so callers always get the same schema regardless of
// how far parsing got — never a differently-shaped object per status.
function emptyContractShape(chartSymbol, chartTimeframe) {
  return {
    contract_version: null,
    market: { symbol: chartSymbol ?? null, timeframe: chartTimeframe ?? null, regime: null, correction_state: null, session: null },
    setup: { model: null, setup_state: null, trigger_state: null, confirmation_state: null, quality: null, quality_threshold: null, overextension_state: null, rr_validation_state: null },
    decision: { action: 'UNKNOWN', wait_reason: null, entry: null, stop_loss: null, tp1: null, tp2: null, exit_target: null, rr: null },
    signal: { signal_id: null, signal_bar_time: null, bar_confirmed: null },
    // P2: kept in sync with master_contract.js's `base.structure` shape so
    // every status (including the pre-parser ones this helper covers)
    // returns an identically-shaped payload.
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
  };
}

function withProvenance(result, { source, sourceStudyId, captureTime }) {
  return {
    ...result,
    provenance: {
      source: source ?? null,
      source_study_id: sourceStudyId ?? null,
      capture_time: captureTime,
    },
  };
}

/**
 * Reads the XAUUSD Adaptive Master Pine indicator through the versioned
 * contract defined in ./master_contract.js. Discovery (NOT_FOUND/AMBIGUOUS/
 * exactly-one-match) uses the Phase 2A hardened exact-name identity rules
 * unchanged — see ../master_identity.js. Never calls a setter/mutator; see
 * the source-audit regression test in tests/xauusd_profile.test.js.
 *
 * Status values (Phase 2B spec section 13): NOT_FOUND, AMBIGUOUS,
 * READ_ERROR come from this function directly; OK, NO_CONTRACT,
 * UNSUPPORTED_CONTRACT_VERSION, MALFORMED_CONTRACT, CONTRACT_CONTRADICTION,
 * SOURCE_UNCONFIRMED come from master_contract.js's buildMasterContract().
 * None of these ever collapse into a bare BUY/SELL/WAIT — `decision.action`
 * is the only field that carries that, and it is 'UNKNOWN' on every status
 * except OK-with-a-validated-trade or OK-with-a-validated-WAIT.
 */
export async function getMasterState({ _deps } = {}) {
  const deps = resolveDeps(_deps);
  const captureTime = new Date().toISOString();

  let state;
  try {
    state = await deps.getState();
  } catch (err) {
    return withProvenance({
      schema_version: MASTER_SCHEMA_VERSION,
      status: 'READ_ERROR',
      indicator_found: false,
      indicator_identity: null,
      ...emptyContractShape(null, null),
      warnings: [`chart_get_state failed: ${err.message}`],
    }, { source: 'chart', captureTime });
  }

  const discovery = discoverMasterCandidates(state.studies, { _deps });

  if (discovery.status === 'NOT_FOUND') {
    return withProvenance({
      schema_version: MASTER_SCHEMA_VERSION,
      status: 'NOT_FOUND',
      indicator_found: false,
      indicator_identity: null,
      ...emptyContractShape(state.symbol, state.resolution),
      warnings: ['XAUUSD Adaptive Master Pine indicator is not present on the current chart. This is expected until it is added — no values are fabricated in its absence.'],
    }, { source: 'chart', captureTime });
  }

  if (discovery.status === 'AMBIGUOUS') {
    return withProvenance({
      schema_version: MASTER_SCHEMA_VERSION,
      status: 'AMBIGUOUS',
      indicator_found: false,
      indicator_identity: null,
      candidates: discovery.candidates,
      ...emptyContractShape(state.symbol, state.resolution),
      warnings: ['Multiple studies on the chart match the Master Indicator name pattern. Refusing to guess which one is authoritative — see `candidates` and rename/remove one, or narrow XAUUSD_MASTER_INDICATOR_NAMES.'],
    }, { source: 'chart', captureTime });
  }

  // discovery.status === 'FOUND' — read that specific study's Pine table(s)
  // and locate the one implementing the contract (identified by a
  // CONTRACT_VERSION row, in case the indicator draws other, unrelated
  // tables too). study_filter narrows to this exact indicator by name so a
  // different study's table can never be mistaken for the contract.
  const identity = discovery.indicator;
  let tablesResult;
  try {
    tablesResult = await deps.getPineTables({ study_filter: identity.display_name });
  } catch (err) {
    return withProvenance({
      schema_version: MASTER_SCHEMA_VERSION,
      status: 'READ_ERROR',
      indicator_found: true,
      indicator_identity: identity,
      ...emptyContractShape(state.symbol, state.resolution),
      warnings: [`data_get_pine_tables failed: ${err.message}`],
    }, { source: 'pine_table', sourceStudyId: identity.entity_id, captureTime });
  }

  const studyTables = tablesResult?.studies?.find((s) => s.name === identity.display_name) ?? tablesResult?.studies?.[0];
  const contractTable = studyTables?.tables?.find((t) => (t.rows ?? []).some((r) => r.toString().toUpperCase().startsWith(`${CONTRACT_TABLE_ANCHOR} |`)));

  const contract = buildMasterContract({
    rows: contractTable?.rows ?? [],
    chartSymbol: state.symbol,
    chartTimeframe: state.resolution,
  });

  return withProvenance({
    schema_version: MASTER_SCHEMA_VERSION,
    indicator_found: true,
    indicator_identity: identity,
    ...contract,
  }, { source: 'pine_table', sourceStudyId: identity.entity_id, captureTime });
}

export async function getResearchHealth({ profileName, registeredTools, blockedTools, _deps } = {}) {
  const deps = resolveDeps(_deps);
  const warnings = [];

  let cdpConnected = false;
  let symbol = null;
  let timeframe = null;
  try {
    const state = await deps.getState();
    cdpConnected = true;
    symbol = state.symbol;
    timeframe = state.resolution;
  } catch (err) {
    warnings.push(`Could not read chart state (CDP/chart may be unavailable): ${err.message}`);
  }

  const guard = checkXauusdSymbol(symbol, { _deps });
  if (symbol && !guard.approved) {
    warnings.push(`Current chart symbol "${symbol}" is not on the approved XAUUSD alias list.`);
  }

  const registered = registeredTools ?? [];
  const dangerousExposed = registered.filter((t) => PROHIBITED_MUTATING_TOOLS.includes(t));
  if (dangerousExposed.length) {
    warnings.push(`PROHIBITED state-changing tools are exposed: ${dangerousExposed.join(', ')}`);
  }

  let masterStatus = 'UNKNOWN';
  let masterDetected = false;
  try {
    const master = _deps?.getMasterState ? await _deps.getMasterState({ _deps }) : await getMasterState({ _deps });
    masterStatus = master.status;
    masterDetected = !!master.indicator_found;
  } catch (err) {
    warnings.push(`Master indicator discovery failed: ${err.message}`);
  }

  return {
    schema_version: HEALTH_SCHEMA_VERSION,
    mcp_connectivity: true,
    cdp_connectivity: cdpConnected,
    symbol,
    timeframe,
    xauusd_guard: guard,
    profile_active: profileName ?? null,
    tools_registered_count: registered.length,
    tools_registered: registered,
    tools_blocked_count: (blockedTools ?? []).length,
    dangerous_tools_exposed: dangerousExposed,
    master_indicator_detected: masterDetected,
    master_indicator_status: masterStatus,
    // 'OK' means the contract table was found AND parsed/validated
    // successfully (whether the resulting decision is WAIT or a trade).
    // NO_CONTRACT/MALFORMED_CONTRACT/etc. all mean "not yet usable" here.
    structured_output_available: masterStatus === 'OK',
    status: dangerousExposed.length ? 'FAIL' : (cdpConnected ? 'OK' : 'DEGRADED'),
    warnings,
  };
}
