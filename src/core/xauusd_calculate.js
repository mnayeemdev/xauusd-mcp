/**
 * MCP-native XAUUSD calculation engine orchestrator.
 *
 * This is the PRIMARY calculation path: it fetches raw OHLCV directly
 * from TradingView for 5m/15m/30m and runs the independent deterministic
 * engine in src/engine/*.js to produce the final trading decision. It
 * does NOT require the Pine indicator's ACTION to produce a result --
 * Pine's contract (if present) is read only as an optional, clearly
 * labeled `pine_reference` comparison field, never as an input to the
 * calculation itself.
 *
 * HIGHER-TIMEFRAME CONTEXT (1H/2H/4H/8H/1D/1W/1M): these are additive
 * context/filtering layers over the SAME entry pipeline -- they never
 * change how 5m/15m/30m compute their own decision (src/engine/pipeline.js
 * and src/engine/mtf.js are untouched), and they never vote/average into
 * the decision. The only way a higher timeframe can change the outcome is
 * the single explicit HTF_GATE_TIMEFRAME conflict check below, which
 * mirrors the existing 30m->15m regime-opposition gate one tier higher.
 * See src/engine/htf.js for the context/gate primitives.
 *
 * NOTE ON MUTATION: gathering all timeframes' OHLCV from this single-chart
 * CDP architecture requires switching the visible chart's timeframe. This
 * makes calculateEntry() a MUTATING operation (it changes chart.resolution,
 * even though it restores the original timeframe afterward, including on
 * partial fetch failure) -- it is intentionally NOT exposed in the
 * non-mutating Research MCP profile; see src/profiles.js and
 * docs/XAUUSD_MCP_ENGINE.md.
 */
import * as _chartCore from './chart.js';
import * as _dataCore from './data.js';
import { getMasterState as _getMasterState } from './xauusd.js';
import { checkXauusdSymbol } from '../xauusd_guard.js';
import { runPipeline, MIN_BARS_REQUIRED } from '../engine/pipeline.js';
import { combineTimeframes } from '../engine/mtf.js';
import { computeHtfContext, detectHtfConflict } from '../engine/htf.js';
import { loadStore, saveStore, registerOrGetSignal, resolveOpenSignals } from '../engine/signalStore.js';
import { fileURLToPath } from 'node:url';

export const CALCULATE_SCHEMA_VERSION = '1.1.0';

// Entry timeframes: UNCHANGED from the original engine -- these are the
// only timeframes that run the full regime/structure/correction/model/
// risk/quality pipeline (src/engine/pipeline.js) and the only ones whose
// data failure fails the whole call closed to DATA_UNAVAILABLE.
const ENTRY_TIMEFRAMES = ['5', '15', '30'];

// Context timeframes: read-only higher-timeframe context/filtering layers
// (see src/engine/htf.js doc comment). A data failure on one of these
// degrades only that timeframe's own context to DATA_UNAVAILABLE -- it
// never forces the whole call to WAIT by itself ("do not automatically
// WAIT merely because every timeframe is not perfectly aligned").
const CONTEXT_TIMEFRAMES = ['60', '120', '240', '480', 'D', 'W', 'M'];

const ALL_TIMEFRAMES = [...ENTRY_TIMEFRAMES, ...CONTEXT_TIMEFRAMES];

// Re-exported (additive only -- no behavior change) so the analysis-engine
// orchestrator (src/core/xauusd_analyze_market.js) can reuse the EXACT
// same fetch/validate/timeframe plumbing calculateEntry() already uses,
// instead of duplicating it. calculateEntry() itself is untouched.
export { ENTRY_TIMEFRAMES, CONTEXT_TIMEFRAMES, ALL_TIMEFRAMES };

// TradingView resolution identifiers, discovered from the existing
// codebase, never guessed: minutes are plain numeric-string minutes (the
// same convention already used for 5/15/30, and for the documented Pine
// htfTimeframe placeholder "60" = 1H -- docs/PINE_P1.md /
// PINE_P7_PARAMETER_AUDIT.md); 'D'/'W'/'M' are TradingView's own daily/
// weekly/monthly resolution strings, already referenced in
// src/core/chart.js's own resolution handling.
export const TF_LABEL = { 5: '5m', 15: '15m', 30: '30m', 60: '1H', 120: '2H', 240: '4H', 480: '8H', D: '1D', W: '1W', M: '1M' };

// Minutes-per-bar for the staleness heuristic below. 'D'/'W'/'M' values
// mirror the exact same seconds-per-bar constants src/core/chart.js
// already uses for its own resolution-aware date math (86400/604800/
// 2592000 seconds), expressed in minutes here for validateAndSplit().
export const TF_MINUTES = { 5: 5, 15: 15, 30: 30, 60: 60, 120: 120, 240: 240, 480: 480, D: 1440, W: 10080, M: 43200 };

// Intermediate tier (2H/1H) additionally reports correction/pullback
// state per the documented hierarchy; daily/higher-intraday and macro
// tiers report regime/structure only.
const CONTEXT_INCLUDE_CORRECTION = new Set(['60', '120']);

// The single HTF conflict-gate tier: the nearest context timeframe above
// the existing 30m gate. Mirrors mtf.js's 30m->15m regime-opposition rule
// one tier higher -- one authoritative layer, not majority voting, and
// 1M/1W are never read here (macro context only, never gate an entry).
const HTF_GATE_TIMEFRAME = '60';

const OHLCV_REQUEST_COUNT = 500;
const STALE_BAR_MULTIPLE = 3; // last confirmed bar older than 3x its own timeframe duration = stale

const SIGNAL_STORE_PATH = fileURLToPath(new URL('../../validation/mcp_engine_signals.json', import.meta.url));

export function resolveDeps(_deps) {
  return {
    getState: _deps?.getState ?? _chartCore.getState,
    setTimeframe: _deps?.setTimeframe ?? _chartCore.setTimeframe,
    getOhlcv: _deps?.getOhlcv ?? _dataCore.getOhlcv,
    getMasterState: _deps?.getMasterState ?? _getMasterState,
    loadStore: _deps?.loadStore ?? ((p) => loadStore(p)),
    saveStore: _deps?.saveStore ?? ((p, s) => saveStore(p, s)),
    storePath: _deps?.storePath ?? SIGNAL_STORE_PATH,
  };
}

/** Splits raw OHLCV bars into { confirmed, forming } and validates basic data safety. */
export function validateAndSplit(bars, timeframeMinutes) {
  if (!bars || bars.length < MIN_BARS_REQUIRED + 1) {
    return { error: `insufficient bars: ${bars?.length ?? 0} available, ${MIN_BARS_REQUIRED + 1} required (including the forming bar)` };
  }
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].time <= bars[i - 1].time) return { error: `non-monotonic or duplicate timestamps at index ${i} (${bars[i - 1].time} -> ${bars[i].time})` };
  }
  for (const b of bars) {
    if (![b.open, b.high, b.low, b.close].every((v) => Number.isFinite(v)) || b.high < b.low || b.high < b.open || b.high < b.close || b.low > b.open || b.low > b.close) {
      return { error: `invalid OHLC geometry at bar time ${b.time}` };
    }
  }
  const forming = bars[bars.length - 1];
  const confirmed = bars.slice(0, bars.length - 1);
  const nowSec = Date.now() / 1000;
  const expectedBarSeconds = timeframeMinutes * 60;
  const lastConfirmedAgeSec = nowSec - confirmed[confirmed.length - 1].time;
  const stale = lastConfirmedAgeSec > expectedBarSeconds * (STALE_BAR_MULTIPLE + 1); // + the forming bar's own duration
  return { confirmed, forming, stale, lastConfirmedAgeSec };
}

/**
 * Fetches raw OHLCV for every required timeframe (5m/15m/30m entry tiers
 * plus 1H/2H/4H/8H/1D/1W/1M context tiers) by sequentially switching the
 * chart timeframe (see module doc for why this is unavoidable with the
 * current single-chart CDP architecture), then restores the original
 * timeframe. Each fetch is independently try/caught so one timeframe's
 * failure never prevents the others from being gathered, and the restore
 * always runs afterward regardless of how many timeframes failed.
 */
export async function fetchMultiTimeframeBars(deps) {
  const original = await deps.getState();
  const byTf = {};
  const fetchErrors = [];
  for (const tf of ALL_TIMEFRAMES) {
    try {
      await deps.setTimeframe({ timeframe: tf });
      const raw = await deps.getOhlcv({ count: OHLCV_REQUEST_COUNT });
      byTf[tf] = raw.bars;
    } catch (err) {
      fetchErrors.push(`${TF_LABEL[tf]}: ${err.message}`);
      byTf[tf] = null;
    }
  }
  try { await deps.setTimeframe({ timeframe: original.resolution }); } catch { /* best-effort restore */ }
  return { symbol: original.symbol, byTf, fetchErrors };
}

/**
 * Pure decision of whether an MCP-vs-Pine comparison constitutes a
 * MATERIAL (opposing-direction, both-actionable) disagreement that must
 * fail closed to WAIT. Extracted as its own function so it is directly
 * unit-testable without needing the full engine to organically produce
 * an actionable signal.
 */
export function detectMaterialDisagreement(mcpAction, pineAction) {
  const mcpActionable = mcpAction === 'BUY' || mcpAction === 'SELL';
  const pineActionable = pineAction === 'BUY' || pineAction === 'SELL';
  if (!mcpActionable || !pineActionable) return false;
  return mcpAction !== pineAction;
}

export async function calculateEntry({ enablePineComparison = true, _deps } = {}) {
  const deps = resolveDeps(_deps);
  const calculated_at = new Date().toISOString();

  const { symbol, byTf, fetchErrors } = await fetchMultiTimeframeBars(deps);

  const guard = checkXauusdSymbol(symbol, { _deps });
  if (!guard.approved) {
    return { schema_version: CALCULATE_SCHEMA_VERSION, status: 'SYMBOL_NOT_APPROVED', action: 'WAIT', reason: `symbol "${symbol}" is not on the approved XAUUSD alias list`, symbol, calculated_at };
  }

  const split = {};
  const dataErrors = [...fetchErrors];
  for (const tf of ALL_TIMEFRAMES) {
    const result = validateAndSplit(byTf[tf], TF_MINUTES[tf]);
    if (result.error) dataErrors.push(`${TF_LABEL[tf]}: ${result.error}`);
    split[tf] = result;
  }
  // Only the entry tiers (5m/15m/30m) are decision-critical -- a context
  // tier's own data failure degrades just that tier's context to
  // DATA_UNAVAILABLE (handled below), it never fails the whole call.
  if (ENTRY_TIMEFRAMES.some((tf) => split[tf].error)) {
    return { schema_version: CALCULATE_SCHEMA_VERSION, status: 'DATA_UNAVAILABLE', action: 'WAIT', reason: 'insufficient/invalid market data', errors: dataErrors, symbol, calculated_at };
  }

  const pipelineByTf = {};
  const m30 = runPipeline({ confirmedBars: split[30].confirmed });
  pipelineByTf[30] = m30;
  pipelineByTf[15] = runPipeline({ confirmedBars: split[15].confirmed, htfRegime: m30.regime });
  pipelineByTf[5] = runPipeline({ confirmedBars: split[5].confirmed, htfRegime: m30.regime });

  const combined = combineTimeframes({ m5: pipelineByTf[5], m15: pipelineByTf[15], m30: pipelineByTf[30] });

  // Higher-timeframe context (1H/2H/4H/8H/1D/1W/1M) -- read-only, never
  // runs models/risk/quality, never itself produces BUY/SELL. Computed
  // from confirmed bars only when that tier's own data validated cleanly.
  const contextByTf = {};
  for (const tf of CONTEXT_TIMEFRAMES) {
    contextByTf[tf] = split[tf].error
      ? { status: 'DATA_UNAVAILABLE', regime: null, structure_direction: null, correction_state: null, last_event: null, last_swing_high: null, last_swing_low: null, range_high: null, range_low: null }
      : computeHtfContext(split[tf].confirmed, { includeCorrection: CONTEXT_INCLUDE_CORRECTION.has(tf) });
  }

  // Signal store: dedup + entry-freeze + resolve prior OPEN records, per
  // entry timeframe only (context timeframes never generate signals).
  const store = deps.loadStore(deps.storePath);
  const resolutions = {};
  for (const tf of ENTRY_TIMEFRAMES) {
    if (!split[tf].error) resolutions[tf] = resolveOpenSignals(store, { timeframe: TF_LABEL[tf], confirmedBars: split[tf].confirmed });
  }
  let registeredSignal = null;
  if (combined.action === 'BUY' || combined.action === 'SELL') {
    const lastBar = split[15].confirmed.at(-1);
    const { record, isNew } = registerOrGetSignal(store, {
      symbol, timeframe: '15m', model: combined.model, side: combined.action, originBar: combined.decision.originBar ?? lastBar.time,
      signalBarTime: lastBar.time, entry: combined.decision.entry, stop_loss: combined.decision.stop_loss, tp1: combined.decision.tp1, tp2: combined.decision.tp2, rr: combined.decision.rr, quality: combined.quality?.score ?? null,
    });
    registeredSignal = { ...record, is_new_event: isNew };
  }
  deps.saveStore(deps.storePath, store);

  // Optional Pine comparison (informational only -- never changes the result).
  let pine_reference = null;
  let engine_disagreement = null;
  if (enablePineComparison) {
    try {
      const pine = await deps.getMasterState();
      pine_reference = { status: pine.status, action: pine.decision?.action ?? null, regime: pine.market?.regime ?? null };
      if (pine.status === 'OK') {
        const pineActionable = pine.decision.action === 'BUY' || pine.decision.action === 'SELL';
        const engineActionable = combined.action === 'BUY' || combined.action === 'SELL';
        if (pineActionable && engineActionable && pine.decision.action !== combined.action) {
          engine_disagreement = { type: 'ENGINE_DISAGREEMENT', pine_action: pine.decision.action, mcp_action: combined.action, note: 'Both engines produced an actionable but OPPOSING direction -- failing closed to WAIT for launch safety.' };
        } else if (pineActionable !== engineActionable) {
          engine_disagreement = { type: 'ENGINE_DISAGREEMENT', pine_action: pine.decision.action, mcp_action: combined.action, note: 'One engine is actionable and the other is WAIT -- informational only, not fail-closed (only opposing-direction actionable disagreement fails closed).' };
        }
      }
    } catch (err) {
      pine_reference = { status: 'READ_ERROR', error: err.message };
    }
  }

  const materialDisagreement = detectMaterialDisagreement(combined.action, pine_reference?.status === 'OK' ? pine_reference.action : null);
  // HTF conflict gate: a single additional check at HTF_GATE_TIMEFRAME
  // (1H), only evaluated when Pine hasn't already forced WAIT -- see
  // src/engine/htf.js for why this is one layer, not majority voting.
  const htfConflict = !materialDisagreement && detectHtfConflict(combined.action, contextByTf[HTF_GATE_TIMEFRAME]);
  const finalAction = materialDisagreement || htfConflict ? 'WAIT' : combined.action;
  const finalReason = materialDisagreement ? 'ENGINE_DISAGREEMENT' : htfConflict ? 'HTF_CONFLICT' : combined.wait_reason;

  const entryTimeframeSummary = Object.fromEntries(ENTRY_TIMEFRAMES.map((tf) => {
    const p = pipelineByTf[tf];
    return [TF_LABEL[tf], {
      status: p.status, regime: p.regime, model: p.model, action: p.decision.action, wait_reason: p.decision.wait_reason,
      correction_state: p.correction?.state ?? null, quality: p.quality?.score ?? null,
      last_confirmed_bar_time: split[tf].confirmed?.at(-1)?.time ?? null,
      data_error: split[tf].error ?? null, stale: split[tf].stale ?? null,
      new_signals_resolved: resolutions[tf] ?? [],
    }];
  }));

  // Context tiers get a lighter, read-only shape (regime/structure/
  // correction only -- no model/quality/decision fields, since these
  // tiers never run the entry pipeline and never produce a candidate).
  const contextTimeframeSummary = Object.fromEntries(CONTEXT_TIMEFRAMES.map((tf) => {
    const ctx = contextByTf[tf];
    return [TF_LABEL[tf], {
      status: ctx.status, regime: ctx.regime, structure_direction: ctx.structure_direction, correction_state: ctx.correction_state,
      last_swing_high: ctx.last_swing_high, last_swing_low: ctx.last_swing_low, range_high: ctx.range_high, range_low: ctx.range_low,
      last_confirmed_bar_time: split[tf].confirmed?.at(-1)?.time ?? null,
      data_error: split[tf].error ?? null, stale: split[tf].stale ?? null,
    }];
  }));

  return {
    schema_version: CALCULATE_SCHEMA_VERSION,
    status: 'OK',
    action: finalAction,
    reason: finalAction === 'WAIT' ? finalReason : null,
    symbol,
    timeframes: { ...entryTimeframeSummary, ...contextTimeframeSummary },
    regime: combined.regime ?? null,
    direction: finalAction === 'BUY' || finalAction === 'SELL' ? finalAction : null,
    setup: combined.model ?? null,
    entry: finalAction === 'BUY' || finalAction === 'SELL' ? combined.decision.entry : null,
    sl: finalAction === 'BUY' || finalAction === 'SELL' ? combined.decision.stop_loss : null,
    tp1: finalAction === 'BUY' || finalAction === 'SELL' ? combined.decision.tp1 : null,
    tp2: finalAction === 'BUY' || finalAction === 'SELL' ? combined.decision.tp2 : null,
    rr: finalAction === 'BUY' || finalAction === 'SELL' ? combined.decision.rr : null,
    quality: finalAction === 'BUY' || finalAction === 'SELL' ? combined.quality?.score : null,
    correction_state: pipelineByTf[15].correction?.state ?? null,
    confirmation_state: pipelineByTf[15].status,
    overextension_state: pipelineByTf[15].decision.wait_reason === 'OVEREXTENDED' ? 'OVEREXTENDED' : 'NONE',
    signal: registeredSignal,
    market_data_times: Object.fromEntries(ALL_TIMEFRAMES.map((tf) => [TF_LABEL[tf], split[tf].confirmed?.at(-1)?.time ?? null])),
    calculated_at,
    pine_reference,
    engine_disagreement,
    diagnostics: {
      source_timeframe: combined.source_timeframe,
      conflict: combined.conflict ?? null,
      quality_breakdown: combined.quality?.breakdown ?? null,
      htf_conflict: htfConflict ? { gate_timeframe: TF_LABEL[HTF_GATE_TIMEFRAME], gate_regime: contextByTf[HTF_GATE_TIMEFRAME].regime, blocked_action: combined.action } : null,
    },
  };
}
