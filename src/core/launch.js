/**
 * P9 — launch/readiness diagnostic aggregator.
 *
 * Read-only. Places no trades, sets no inputs, mutates no chart state.
 * This module answers exactly one question: "is the existing, already-
 * approved MCP/TradingView/Pine pipeline currently healthy enough to
 * hand a launch operator a trustworthy WAIT/BUY/SELL decision?" It does
 * not implement any new trading logic — it aggregates reads that already
 * exist (chart state, master contract, profile tool counts, frozen
 * source hashes) into one pass/fail summary.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as _chartCore from './chart.js';
import * as _dataCore from './data.js';
import { getMasterState as _getMasterState } from './xauusd.js';
import { APPROVED_RESEARCH_TOOLS, APPROVED_DEVELOPMENT_EXTRA_TOOLS } from '../profiles.js';

const EXPECTED_INDICATOR_SHA256 = '6c4dbba9105db1f75a07682408a8d91f34929d594cf8ddf7eaaea0defa57d3b6';
const EXPECTED_STRATEGY_SHA256 = '947b6852d3ae60fc236854c0b6604b7af15f355a58340d5b5eca79db37797911';
const EXPECTED_CONTRACT_VERSION = 1;
const EXPECTED_RESEARCH_TOOL_COUNT = 13;
const EXPECTED_DEVELOPMENT_EXTRA_TOOL_COUNT = 6; // P9: +xauusd_calculate_entry (the independent MCP calculation engine)

// Positional indicator-input indices for the currently locked P7 research
// candidate (C4). These map to the frozen Pine source's own input.*()
// declaration order (see docs/PINE_P7_PARAMETER_AUDIT.md) — this file does
// not change or reinterpret them, only reads them back for display.
const C4_INPUT_INDEX = { minRR: 'in_51', corrResolveConfirmBars: 'in_23', qualityThreshold: 'in_52' };
const C4_EXPECTED = { minRR: 1.7, corrResolveConfirmBars: 3, qualityThreshold: 65 };

function resolveDeps(_deps) {
  return {
    getState: _deps?.getState ?? _chartCore.getState,
    getMasterState: _deps?.getMasterState ?? _getMasterState,
    getIndicator: _deps?.getIndicator ?? _dataCore.getIndicator,
    readFileSync: _deps?.readFileSync ?? readFileSync,
    existsSync: _deps?.existsSync ?? existsSync,
  };
}

function sha256OfFile(readFileSyncFn, existsSyncFn, path) {
  if (!existsSyncFn(path)) return { available: false, sha256: null };
  return { available: true, sha256: createHash('sha256').update(readFileSyncFn(path)).digest('hex') };
}

/**
 * Runs the full launch-readiness diagnostic. Never throws for an
 * individual failed sub-check -- each is captured as a warning/blocker
 * and folded into the final status instead.
 */
export async function getLaunchReadiness({ _deps } = {}) {
  const deps = resolveDeps(_deps);
  const warnings = [];
  const blockers = [];

  // 1. Source integrity (best-effort -- only meaningful when run from a
  // checkout that has the local Pine source, which is always true for the
  // repository's own CLI but may not be true for every MCP deployment).
  const indicatorPath = fileURLToPath(new URL('../../pine/XAUUSD_Adaptive_Master.pine', import.meta.url));
  const strategyPath = fileURLToPath(new URL('../../pine/XAUUSD_Adaptive_Master_Strategy.pine', import.meta.url));
  const indicatorHash = sha256OfFile(deps.readFileSync, deps.existsSync, indicatorPath);
  const strategyHash = sha256OfFile(deps.readFileSync, deps.existsSync, strategyPath);
  const sourceIntegrity = {
    indicator: { ...indicatorHash, expected: EXPECTED_INDICATOR_SHA256, matches: indicatorHash.available ? indicatorHash.sha256 === EXPECTED_INDICATOR_SHA256 : null },
    strategy: { ...strategyHash, expected: EXPECTED_STRATEGY_SHA256, matches: strategyHash.available ? strategyHash.sha256 === EXPECTED_STRATEGY_SHA256 : null },
  };
  if (indicatorHash.available && !sourceIntegrity.indicator.matches) blockers.push('Local frozen indicator source hash does NOT match the expected frozen value.');
  if (strategyHash.available && !sourceIntegrity.strategy.matches) blockers.push('Local frozen strategy source hash does NOT match the expected frozen value.');
  if (!indicatorHash.available || !strategyHash.available) warnings.push('Local Pine source not found on disk -- source-hash verification skipped (not necessarily a problem for a non-repo MCP deployment).');

  // 2. MCP profile tool-exposure counts.
  const researchCount = APPROVED_RESEARCH_TOOLS.length;
  const developmentCount = researchCount + APPROVED_DEVELOPMENT_EXTRA_TOOLS.length;
  const profiles = {
    research_tool_count: researchCount,
    development_tool_count: developmentCount,
    research_matches_expected: researchCount === EXPECTED_RESEARCH_TOOL_COUNT,
    development_matches_expected: developmentCount === (EXPECTED_RESEARCH_TOOL_COUNT + EXPECTED_DEVELOPMENT_EXTRA_TOOL_COUNT),
  };
  if (!profiles.research_matches_expected) blockers.push(`Research profile exposes ${researchCount} tools, expected exactly ${EXPECTED_RESEARCH_TOOL_COUNT}.`);
  if (!profiles.development_matches_expected) blockers.push(`Development profile exposes ${developmentCount} tools, expected exactly ${EXPECTED_RESEARCH_TOOL_COUNT + EXPECTED_DEVELOPMENT_EXTRA_TOOL_COUNT}.`);

  // 3. CDP/chart connectivity.
  let cdpConnected = false;
  let symbol = null;
  let timeframe = null;
  try {
    const state = await deps.getState();
    cdpConnected = true;
    symbol = state.symbol;
    timeframe = state.resolution;
  } catch (err) {
    blockers.push(`CDP/chart unavailable: ${err.message}`);
  }

  // 4. Master contract readability.
  let master = null;
  try {
    master = await deps.getMasterState({ _deps });
  } catch (err) {
    blockers.push(`Master state read failed: ${err.message}`);
  }
  const contractReadable = master?.status === 'OK';
  const contractVersionOk = master?.contract_version === EXPECTED_CONTRACT_VERSION;
  if (master && master.status !== 'OK' && master.status !== 'NOT_FOUND') {
    warnings.push(`Master contract status is ${master.status} -- not a hard launch blocker by itself (the frozen system may legitimately be mid-WAIT/no-signal), but decisions cannot be presented while this persists.`);
  }
  if (master && master.status === 'NOT_FOUND') {
    warnings.push('XAUUSD Adaptive Master indicator not found on the current chart -- add it before launch.');
  }
  if (contractReadable && !contractVersionOk) blockers.push(`CONTRACT_VERSION is ${master.contract_version}, expected ${EXPECTED_CONTRACT_VERSION}.`);

  // 5. C4 runtime input readback (observation only -- never sets inputs).
  let c4Runtime = { observable: false, values: null, matches_locked_candidate: null };
  if (master?.indicator_identity?.entity_id) {
    try {
      const raw = await deps.getIndicator({ entity_id: master.indicator_identity.entity_id });
      const byId = Object.fromEntries((raw.inputs ?? []).map((i) => [i.id, i.value]));
      const values = {
        minRR: byId[C4_INPUT_INDEX.minRR],
        corrResolveConfirmBars: byId[C4_INPUT_INDEX.corrResolveConfirmBars],
        qualityThreshold: byId[C4_INPUT_INDEX.qualityThreshold],
      };
      const matches = Object.keys(C4_EXPECTED).every((k) => values[k] === C4_EXPECTED[k]);
      c4Runtime = { observable: true, values, matches_locked_candidate: matches };
      if (!matches) warnings.push('Live indicator inputs do not match the locked P7 C4 candidate -- restore them (minRR=1.7, corrResolveConfirmBars=3, qualityThreshold=65) before treating output as the C4 candidate.');
    } catch (err) {
      warnings.push(`Could not read back live indicator inputs to verify C4: ${err.message}`);
    }
  } else {
    warnings.push('No confirmed indicator identity available -- cannot verify C4 runtime inputs.');
  }

  const status = blockers.length > 0 ? 'NOT_READY' : (warnings.length > 0 ? 'READY_WITH_OBSERVATION_LIMITATION' : 'READY');

  return {
    schema_version: '1.0.0',
    status,
    blockers,
    warnings,
    source_integrity: sourceIntegrity,
    profiles,
    connectivity: { cdp_connected: cdpConnected, symbol, timeframe },
    master_contract: { readable: contractReadable, status: master?.status ?? null, contract_version: master?.contract_version ?? null, indicator_found: master?.indicator_found ?? false },
    c4_runtime: c4Runtime,
    note: 'This check never places broker orders and never authorizes a trade -- it only reports whether the existing pipeline is healthy enough to trust a decision if/when Pine produces one.',
  };
}
