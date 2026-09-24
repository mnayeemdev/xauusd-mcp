/**
 * EI-2 -- Contemporaneous Evidence Snapshot (Entry Intelligence
 * Integration, Stage 2). See docs/XAUUSD_LIVE_RUNTIME.md's Entry
 * Intelligence design audit for the full authority boundary.
 *
 * THIS MODULE NEVER COMPUTES OR CHANGES A TRADING DECISION. It builds a
 * compact, versioned, JSON-safe RECORD of what src/engine/marketEvidence.js
 * (EI-1, UNCHANGED) already computed for one exact confirmed bar --
 * nothing here recomputes regime/structure/candlesticks/patterns/
 * breakout/levels/liquidity/volatility/session, it only reshapes
 * already-computed fields into a compact, persistable shape. Never reads
 * or writes future bars, never reads an outcome (TP1/TP2/SL/PASS/FAIL),
 * never itself performs any filesystem I/O (the caller, e.g.
 * xauusd_analyze_market.js, decides where/whether to persist it).
 *
 * "WHAT THE MCP KNEW THEN" -- outcome resolution (WHAT HAPPENED LATER)
 * is a completely separate, already-existing concern
 * (src/engine/opportunityOutcomeResolver.js / signalStore.js's own
 * PASS/FAIL resolution) and this module never touches it.
 */

export const EVIDENCE_SNAPSHOT_SCHEMA_VERSION = 1;

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

function compactSwing(swing) {
  if (!swing) return null;
  return { price: round2(swing.price), label: swing.label ?? null };
}

function compactStructure(structure) {
  if (!structure) return null;
  return {
    state: structure.state ?? null,
    last_event_type: structure.lastEvent?.type ?? null,
    last_event_level: round2(structure.lastEvent?.level),
    last_event_direction: structure.lastEvent?.direction ?? null,
    last_swing_high: compactSwing(structure.lastSwingHigh),
    last_swing_low: compactSwing(structure.lastSwingLow),
    range_high: round2(structure.rangeHigh),
    range_low: round2(structure.rangeLow),
  };
}

// Only directional (non-NEUTRAL) candlestick reactions -- DOJI/SPINNING_TOP/
// INSIDE_BAR/OUTSIDE_BAR carry no directional payload (see the Entry
// Intelligence design audit's Candle Reaction Policy) and are omitted to
// keep the snapshot compact; every pattern candlesticks.js returns is
// already anchored to the single evaluation bar (detectCandlestickPatterns()
// is only ever called at `lastIndex`), so no further bar filtering is needed.
function compactCandles(candlestickPatterns) {
  const directional = (candlestickPatterns ?? [])
    .filter((p) => p.bias && p.bias !== 'NEUTRAL')
    .map((p) => ({ pattern: p.pattern, bias: p.bias, bar_time: p.bar_time ?? null }));
  return { directional_patterns: directional };
}

// Compact per-pattern summary -- exact detector field names preserved,
// pivot_points/evidence sub-objects omitted (available live from
// marketEvidence.js if ever needed; not persisted here to stay compact).
// No confidence/strength field is added -- patterns.js's own detectors do
// not compute one, and this module never invents unavailable fields.
function compactClassicalPatterns(classicalPatterns) {
  return (classicalPatterns ?? []).map((p) => ({
    pattern_type: p.pattern_type,
    bias: p.bias,
    completion_state: p.completion_state,
    breakout_level: round2(p.breakout_level),
    neckline: round2(p.neckline),
    invalidation_level: round2(p.invalidation_level),
  }));
}

function compactBreakout(breakoutState) {
  if (!breakoutState || breakoutState.state === 'NO_BREAKOUT') return { state: 'NO_BREAKOUT' };
  const e = breakoutState.evidence ?? {};
  return {
    state: breakoutState.state,
    direction: e.direction ?? null,
    event_type: e.event_type ?? null,
    level: round2(e.level),
    bars_since_event: e.bars_since_event ?? null,
    strong_displacement: e.strong_displacement ?? null,
    compressed_before_breakout: e.compressed_before_breakout ?? null,
    retested: e.retested ?? null,
    retest_held: e.retest_held ?? null,
    overextended_ratio: round2(e.overextended_ratio),
  };
}

// Two EXPLICITLY DISTINCT sources, never merged into one count (see the
// Entry Intelligence design audit's "Group B -- The Sweep" double-counting
// rule): `structural_sweep` is structure.js's own protected
// `lastSweep` (the SAME event models.js's MR trigger reads); `sweep_reclaim`
// is liquidity.js's richer, read-only reclaim VERIFICATION of that SAME
// event -- never a second, independent sweep.
function compactLiquidity(structure, liquidityContext) {
  const sweep = structure?.lastSweep;
  const reclaim = liquidityContext?.sweepReclaim;
  return {
    structural_sweep: sweep ? { type: sweep.type, level: round2(sweep.level), bar: sweep.bar ?? null, source: 'structure.js lastSweep (protected, same event models.js MR reads)' } : null,
    sweep_reclaim: reclaim?.swept
      ? {
          swept: true, sweep_type: reclaim.sweepType, level: round2(reclaim.level),
          reclaimed: reclaim.reclaimed, reclaim_bar_index: reclaim.reclaimBarIndex ?? null,
          within_lookback: reclaim.withinLookback ?? null,
          source: 'liquidity.js detectSweepReclaim (richer reclaim verification of the SAME structural sweep, never a second independent sweep event)',
        }
      : { swept: false },
  };
}

function nearestZone(zones, direction, currentPrice) {
  const candidates = (zones ?? []).filter((z) => z.direction === direction && z.state !== 'INVALIDATED');
  if (!candidates.length || !Number.isFinite(currentPrice)) return null;
  let best = null;
  let bestDist = null;
  for (const z of candidates) {
    const mid = (z.zone_low + z.zone_high) / 2;
    const dist = Math.abs(currentPrice - mid);
    if (best === null || dist < bestDist) { best = z; bestDist = dist; }
  }
  return best ? { lower: round2(best.zone_low), upper: round2(best.zone_high), state: best.state } : null;
}

function compactLevel(level) {
  if (!level) return null;
  return { price: round2(level.price), touch_count: level.touch_count ?? null, fresh: level.fresh ?? null, distance_from_current: round2(level.distance_from_current) };
}

function compactLocation(levelsContext, currentPrice) {
  return {
    nearest_support: compactLevel(levelsContext?.nearestSupport),
    nearest_resistance: compactLevel(levelsContext?.nearestResistance),
    nearest_demand_zone: nearestZone(levelsContext?.supplyDemandZones, 'demand', currentPrice),
    nearest_supply_zone: nearestZone(levelsContext?.supplyDemandZones, 'supply', currentPrice),
  };
}

/**
 * `marketEvidence`: the SAME object src/engine/marketEvidence.js's
 * computeMarketEvidence() already produced for this exact confirmed-bar
 * set (never recomputed here). `structure`/`correction`/`regime`: the
 * SAME already-computed protected-pipeline values (EI-1). `currentPrice`:
 * the evaluation bar's own close (for nearest-zone selection only, never
 * a forming/live price). `qualityComponents`: the ALREADY-COMPUTED
 * quality.js breakdown (decision.diagnostics.quality_breakdown), when
 * available -- never recomputed, never a new quality calculation.
 */
export function buildEvidenceSnapshot({
  symbol, timeframe, capturedBarTime, signalBarTime = null, originBar = null, thesisId = null,
  regime, structure, correction, currentPrice = null, qualityComponents = null,
  marketEvidence,
}) {
  return {
    schema_version: EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
    symbol, timeframe,
    captured_bar_time: capturedBarTime,
    signal_bar_time: signalBarTime,
    origin_bar: originBar,
    thesis_id: thesisId,

    regime: regime ?? null,
    structure: compactStructure(structure),
    correction: { state: correction?.state ?? null },

    candles: compactCandles(marketEvidence?.candlestickPatterns),
    classical_patterns: compactClassicalPatterns(marketEvidence?.classicalPatterns),
    breakout: compactBreakout(marketEvidence?.breakoutState),
    liquidity: compactLiquidity(structure, marketEvidence?.liquidityContext),
    location: compactLocation(marketEvidence?.levelsContext, currentPrice),

    volatility: { state: marketEvidence?.volatilityContext?.state ?? null, atr_value: round2(marketEvidence?.volatilityContext?.atrValue) },
    session: { session: marketEvidence?.sessionContext?.current?.session ?? null },

    quality_components: qualityComponents ?? null,
  };
}
