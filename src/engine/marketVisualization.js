/**
 * Stage 5 — pure market-analysis → drawing-intent mapper.
 *
 * THIS MODULE NEVER COMPUTES OR CHANGES A TRADING DECISION. Every input is
 * already-computed output from the protected pipeline
 * (src/core/xauusd_calculate.js), the evidence layer
 * (src/core/xauusd_analyze_market.js's computeEvidence()), Stage 1/2's
 * pure src/engine/anticipation.js, and (optionally, currently unused for
 * drawing decisions -- see "HTF scope" below) src/engine/confluence.js.
 * It never imports any of those computation modules, never calls
 * calculateEntry(), never fetches OHLCV, never opens a CDP connection,
 * never writes a file, and never mutates TradingView -- it only maps
 * already-computed data into src/engine/visualization.js's intent schema.
 *
 * ACTIVE-MARKET-ONLY PHILOSOPHY: this is deliberately NOT a dump of
 * everything the engine knows. At most one object per role, a hard
 * CLUTTER_BUDGET.MAX_TOTAL cap with priority-ordered suppression, and a
 * strong preference for skipping a drawing entirely over fabricating a
 * value the underlying evidence doesn't actually provide.
 *
 * REAL-TIMESTAMP LIMITATION (documented, not hidden): structure.js and
 * breakout.js report pivot/event positions as ARRAY INDICES into the bars
 * window that produced them (`index`/`bar`), never as bar TIMESTAMPS --
 * those indices are not stable/meaningful outside the specific fetch that
 * produced them (the exact "new ID every call" failure mode Stage 3 had
 * to avoid for setup identity applies equally here to point.time). This
 * module therefore anchors every horizontal_line/text intent derived from
 * structure/levels/liquidity/breakout evidence at the CURRENT/LATEST
 * confirmed bar's timestamp (`decision.market_data_times`/
 * `decision.timeframes[tf].last_confirmed_bar_time` -- a real, objective,
 * already-computed market timestamp, never wall-clock time) rather than
 * the level's own historical formation bar, which is not available. A
 * horizontal_line's visual extent does not depend on which bar anchors
 * it, so this never misrepresents the LEVEL itself (which is always the
 * exact, real, already-computed price) -- it is not a claim about WHEN a
 * level formed. patterns.js is the one evidence layer that DOES expose
 * real bar timestamps (`start_time`/`end_time`/`pivot_points[].time`,
 * looked up from the bars it was given) -- pattern geometry uses those
 * directly.
 *
 * SUPPLY/DEMAND ZONE LIMITATION: levels.js's supplyDemandZones expose
 * zone_low/zone_high (real PRICE bounds) but only `origin_bar_index` (an
 * index, not a timestamp) -- with no objective TIME bounds, a `rectangle`
 * (which requires two time-anchored corners) cannot be drawn without
 * fabricating a time span. Zones are therefore rendered as a single
 * `horizontal_line` at the zone edge nearest current price, per the
 * mission's own explicit fallback ("if only a single price exists, use
 * horizontal_line instead").
 *
 * FVG LIMITATION: fair value gaps (liquidity.js's detectFairValueGaps)
 * have the same missing-time-bounds problem and are not visualized in
 * this stage -- explicitly skipped, not silently forgotten (see
 * docs/XAUUSD_VISUALIZATION.md).
 *
 * HTF SCOPE: all geometry in this module is anchored to the single
 * PRIMARY decision timeframe (`decision.diagnostics.source_timeframe`,
 * always 15m today) -- there is no equal-timeframe voting and no
 * per-timeframe overlay dump. `confluence` is accepted for interface
 * stability (mission's own signature) but not currently read by any
 * drawing decision; higher-timeframe-specific visualization is
 * deliberately out of scope for this pass.
 */
import { makeDrawingIntent } from './visualization.js';

export const CLUTTER_BUDGET = Object.freeze({ MAX_TOTAL: 12 });

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// ── Style system: ONLY overrides empirically verified against the real
// TradingView API (linecolor/linewidth/linestyle -- confirmed working in
// the Stage 4 controlled live CDP proof; tools/drawing.js's own docstring
// only names linecolor/linewidth as its example, and no other override
// key is evidenced anywhere in this codebase's source, so none other is
// used here). ──────────────────────────────────────────────────────────
function styleFor(category, direction = null) {
  switch (category) {
    case 'structure': return { linecolor: '#787B86', linewidth: 1, linestyle: 2 };
    case 'support_resistance': return { linecolor: '#2962FF', linewidth: 1, linestyle: 0 };
    case 'supply_demand': return { linecolor: '#FF6D00', linewidth: 1, linestyle: 1 };
    case 'liquidity': return { linecolor: '#9C27B0', linewidth: 1, linestyle: 2 };
    case 'pattern': return { linecolor: '#00BCD4', linewidth: 1, linestyle: 2 };
    case 'breakout': return { linecolor: '#FFC107', linewidth: 1, linestyle: 0 };
    case 'primary': return { linecolor: direction === 'BEARISH' ? '#D50000' : direction === 'BULLISH' ? '#00C853' : '#787B86', linewidth: 2, linestyle: 0 };
    case 'primary_invalidation': return { linecolor: '#D50000', linewidth: 1, linestyle: 2 };
    case 'alternate': return { linecolor: '#9E9E9E', linewidth: 1, linestyle: 2 };
    case 'trade': return { linecolor: direction === 'SELL' ? '#D50000' : '#00C853', linewidth: 2, linestyle: 0 };
    default: return { linecolor: '#787B86', linewidth: 1, linestyle: 0 };
  }
}

function buildHLine({ role, symbol, timeframe, time, price, text, overrides, source }) {
  if (!Number.isFinite(time) || !Number.isFinite(price)) return null;
  return makeDrawingIntent({ role, primitive: 'horizontal_line', point: { time, price: round2(price) }, text: text ?? null, overrides, source, symbol, timeframe });
}

function buildText({ role, symbol, timeframe, time, price, text, overrides, source }) {
  if (!Number.isFinite(time) || !Number.isFinite(price) || !text) return null;
  return makeDrawingIntent({ role, primitive: 'text', point: { time, price: round2(price) }, text, overrides, source, symbol, timeframe });
}

function addCandidate(list, { role, category, tier, intent }) {
  if (intent) list.push({ role, category, tier, included: true, intent });
  else list.push({ role, category, tier, included: false, reason_excluded: 'INTENT_VALIDATION_FAILED' });
}

function skip(list, { role, category, tier, reason }) {
  list.push({ role, category, tier, included: false, reason_excluded: reason });
}

// ── Structure (max 2: structure_primary, structure_event) ───────────────
function buildStructureCandidates({ evidence, symbol, timeframe, time }) {
  const out = [];
  const structure = evidence?.structure;
  const relevantSwing = structure?.state === 'BULLISH' ? structure.lastSwingLow : structure?.state === 'BEARISH' ? structure.lastSwingHigh : null;
  if (relevantSwing && Number.isFinite(relevantSwing.price)) {
    addCandidate(out, {
      role: 'structure_primary', category: 'structure', tier: 2,
      intent: buildHLine({ role: 'structure_primary', symbol, timeframe, time, price: relevantSwing.price, text: `STRUCTURE ${relevantSwing.label}`, overrides: styleFor('structure'), source: 'evidence.structure.lastSwingLow/lastSwingHigh' }),
    });
  } else skip(out, { role: 'structure_primary', category: 'structure', tier: 2, reason: 'STRUCTURE_DIRECTION_UNRESOLVED' });

  // structure_event and breakout_level (buildBreakoutCandidates below) both
  // anchor to the EXACT SAME price (structure.lastEvent.level) whenever a
  // breakout lifecycle is active -- not a market coincidence, a guaranteed
  // duplicate by construction. breakout_level's lifecycle label (RETEST
  // PENDING/HOLD/CONFIRMED/etc.) is strictly more current/informative than
  // the bare "BOS/CHoCH direction" label, so structure_event is skipped
  // whenever a breakout lifecycle will already cover the identical level --
  // never two overlapping lines for the same underlying price.
  const breakoutCoversSameLevel = evidence?.breakoutState && evidence.breakoutState.state !== 'NO_BREAKOUT';
  if (structure?.lastEvent && Number.isFinite(structure.lastEvent.level) && !breakoutCoversSameLevel) {
    addCandidate(out, {
      role: 'structure_event', category: 'structure', tier: 2,
      intent: buildHLine({ role: 'structure_event', symbol, timeframe, time, price: structure.lastEvent.level, text: `${structure.lastEvent.type} ${structure.lastEvent.direction}`, overrides: styleFor('structure'), source: 'evidence.structure.lastEvent' }),
    });
  } else if (breakoutCoversSameLevel) {
    skip(out, { role: 'structure_event', category: 'structure', tier: 2, reason: 'COVERED_BY_BREAKOUT_LEVEL_SAME_PRICE' });
  } else skip(out, { role: 'structure_event', category: 'structure', tier: 2, reason: 'NO_STRUCTURE_EVENT' });

  return out;
}

// ── Support / Resistance (max 2) ─────────────────────────────────────────
function buildSRCandidates({ evidence, symbol, timeframe, time }) {
  const out = [];
  const lvl = evidence?.levelsContext;
  if (lvl?.nearestSupport && Number.isFinite(lvl.nearestSupport.price)) {
    const l = lvl.nearestSupport;
    addCandidate(out, { role: 'nearest_support', category: 'sr', tier: 2, intent: buildHLine({ role: 'nearest_support', symbol, timeframe, time, price: l.price, text: `SUPPORT${l.fresh ? ' (fresh)' : ''} x${l.touch_count}`, overrides: styleFor('support_resistance'), source: 'evidence.levelsContext.nearestSupport' }) });
  } else skip(out, { role: 'nearest_support', category: 'sr', tier: 2, reason: 'NO_NEAREST_SUPPORT' });

  if (lvl?.nearestResistance && Number.isFinite(lvl.nearestResistance.price)) {
    const l = lvl.nearestResistance;
    addCandidate(out, { role: 'nearest_resistance', category: 'sr', tier: 2, intent: buildHLine({ role: 'nearest_resistance', symbol, timeframe, time, price: l.price, text: `RESISTANCE${l.fresh ? ' (fresh)' : ''} x${l.touch_count}`, overrides: styleFor('support_resistance'), source: 'evidence.levelsContext.nearestResistance' }) });
  } else skip(out, { role: 'nearest_resistance', category: 'sr', tier: 2, reason: 'NO_NEAREST_RESISTANCE' });

  return out;
}

// ── Supply / Demand (max 2). No time bounds exist -- horizontal_line only, never a fabricated rectangle. ──
function buildSupplyDemandCandidates({ evidence, symbol, timeframe, time }) {
  const out = [];
  const zones = evidence?.levelsContext?.supplyDemandZones ?? [];
  const currentPrice = evidence?.sessionContext?.current?.last_close;
  const active = zones.filter((z) => z.state !== 'INVALIDATED');

  function nearestZone(direction) {
    const candidates = active.filter((z) => z.direction === direction);
    if (!candidates.length || !Number.isFinite(currentPrice)) return null;
    return candidates.reduce((best, z) => {
      const mid = (z.zone_low + z.zone_high) / 2;
      if (!best) return z;
      const bestMid = (best.zone_low + best.zone_high) / 2;
      return Math.abs(mid - currentPrice) < Math.abs(bestMid - currentPrice) ? z : best;
    }, null);
  }

  const demand = nearestZone('demand');
  if (demand) {
    // Edge nearest to current price -- the zone's "first line of defense".
    const edge = Number.isFinite(currentPrice) && currentPrice >= demand.zone_high ? demand.zone_high : demand.zone_low;
    addCandidate(out, { role: 'active_demand', category: 'supply_demand', tier: 2, intent: buildHLine({ role: 'active_demand', symbol, timeframe, time, price: edge, text: `DEMAND ZONE (${demand.state})`, overrides: styleFor('supply_demand'), source: 'evidence.levelsContext.supplyDemandZones' }) });
  } else skip(out, { role: 'active_demand', category: 'supply_demand', tier: 2, reason: 'NO_ACTIVE_DEMAND_ZONE' });

  const supply = nearestZone('supply');
  if (supply) {
    const edge = Number.isFinite(currentPrice) && currentPrice <= supply.zone_low ? supply.zone_low : supply.zone_high;
    addCandidate(out, { role: 'active_supply', category: 'supply_demand', tier: 2, intent: buildHLine({ role: 'active_supply', symbol, timeframe, time, price: edge, text: `SUPPLY ZONE (${supply.state})`, overrides: styleFor('supply_demand'), source: 'evidence.levelsContext.supplyDemandZones' }) });
  } else skip(out, { role: 'active_supply', category: 'supply_demand', tier: 2, reason: 'NO_ACTIVE_SUPPLY_ZONE' });

  return out;
}

// ── Liquidity (max 1): active sweep/reclaim > nearest EQH/EQL pool > (FVG skipped, no time bounds) ──
function buildLiquidityCandidates({ evidence, symbol, timeframe, time }) {
  const out = [];
  const liq = evidence?.liquidityContext;
  const currentPrice = evidence?.sessionContext?.current?.last_close;

  if (liq?.sweepReclaim?.swept && Number.isFinite(liq.sweepReclaim.level)) {
    const label = `LIQUIDITY SWEEP (${liq.sweepReclaim.sweepType}) — ${liq.sweepReclaim.reclaimed ? 'RECLAIMED' : 'PENDING RECLAIM'}`;
    addCandidate(out, { role: 'liquidity_primary', category: 'liquidity', tier: 2, intent: buildHLine({ role: 'liquidity_primary', symbol, timeframe, time, price: liq.sweepReclaim.level, text: label, overrides: styleFor('liquidity'), source: 'evidence.liquidityContext.sweepReclaim' }) });
    return out;
  }

  const pools = [...(liq?.equalHighs ?? []), ...(liq?.equalLows ?? [])];
  if (pools.length && Number.isFinite(currentPrice)) {
    const nearest = pools.reduce((best, p) => (!best || Math.abs(p.price - currentPrice) < Math.abs(best.price - currentPrice)) ? p : best, null);
    addCandidate(out, { role: 'liquidity_primary', category: 'liquidity', tier: 2, intent: buildHLine({ role: 'liquidity_primary', symbol, timeframe, time, price: nearest.price, text: `LIQUIDITY POOL x${nearest.touch_count}`, overrides: styleFor('liquidity'), source: 'evidence.liquidityContext.equalHighs/equalLows' }) });
    return out;
  }

  // Fair value gaps are deliberately never visualized -- see module header.
  skip(out, { role: 'liquidity_primary', category: 'liquidity', tier: 2, reason: 'NO_RELEVANT_SWEEP_OR_POOL' });
  return out;
}

// ── Classical pattern (max 1): strongest CURRENT relevant pattern only ──
function selectPrimaryPattern(classicalPatterns) {
  if (!Array.isArray(classicalPatterns) || classicalPatterns.length === 0) return null;
  const rank = (p) => (p.completion_state === 'CONFIRMED' ? 2 : (p.completion_state === 'COMPLETE_UNCONFIRMED' || p.completion_state === 'FORMING') ? 1 : 0);
  const eligible = classicalPatterns.filter((p) => rank(p) > 0);
  if (!eligible.length) return null;
  eligible.sort((a, b) => rank(b) - rank(a) || (b.end_time ?? 0) - (a.end_time ?? 0));
  return eligible[0];
}

function buildPatternCandidates({ evidence, symbol, timeframe }) {
  const out = [];
  const pattern = selectPrimaryPattern(evidence?.classicalPatterns);
  if (!pattern) { skip(out, { role: 'pattern_primary', category: 'pattern_breakout', tier: 2, reason: 'NO_CURRENT_RELEVANT_PATTERN' }); return out; }

  // patterns.js DOES expose real bar timestamps (start_time/end_time,
  // looked up from the actual bars it was given) -- unlike structure/
  // breakout/liquidity evidence, no "current bar" substitution is needed.
  const anchorTime = pattern.end_time;
  const levelPrice = Number.isFinite(pattern.breakout_level) ? pattern.breakout_level : Number.isFinite(pattern.neckline) ? pattern.neckline : null;
  const label = `${pattern.pattern_type} — ${pattern.completion_state}`;

  if (Number.isFinite(levelPrice) && Number.isFinite(anchorTime)) {
    addCandidate(out, { role: 'pattern_primary', category: 'pattern_breakout', tier: 2, intent: buildHLine({ role: 'pattern_primary', symbol, timeframe, time: anchorTime, price: levelPrice, text: label, overrides: styleFor('pattern'), source: `evidence.classicalPatterns[${pattern.pattern_id}].neckline/breakout_level` }) });
    return out;
  }
  const lastPivotPrice = pattern.pivot_points?.at(-1)?.price;
  if (Number.isFinite(lastPivotPrice) && Number.isFinite(anchorTime)) {
    addCandidate(out, { role: 'pattern_primary', category: 'pattern_breakout', tier: 2, intent: buildText({ role: 'pattern_primary', symbol, timeframe, time: anchorTime, price: lastPivotPrice, text: label, overrides: styleFor('pattern'), source: `evidence.classicalPatterns[${pattern.pattern_id}].pivot_points` }) });
    return out;
  }
  skip(out, { role: 'pattern_primary', category: 'pattern_breakout', tier: 2, reason: 'NO_OBJECTIVE_PATTERN_GEOMETRY' });
  return out;
}

// ── Breakout/retest lifecycle (max 1) ────────────────────────────────────
function breakoutLabel(state) {
  switch (state) {
    case 'BREAKOUT_FORMING': return 'BREAKOUT FORMING';
    case 'BREAKOUT_RETEST_PENDING': return 'BREAKOUT — RETEST PENDING';
    case 'RETEST_TESTING': return 'BREAKOUT — RETEST TESTING';
    case 'RETEST_HOLD': return 'BREAKOUT — RETEST HOLD';
    case 'BREAKOUT_CONFIRMED': return 'BREAKOUT CONFIRMED';
    case 'BREAKOUT_RECLAIMED': return 'BREAKOUT — RECLAIMED (back inside)';
    case 'OVEREXTENDED_BREAKOUT': return 'BREAKOUT — OVEREXTENDED (not a new entry)';
    case 'FAILED_BREAKOUT': return 'BREAKOUT — FAILED';
    case 'FALSE_BREAKOUT': return 'BREAKOUT — FALSE (fakeout)';
    default: return `BREAKOUT — ${state}`;
  }
}

function buildBreakoutCandidates({ anticipation, evidence, symbol, timeframe, time }) {
  const out = [];
  const bs = evidence?.breakoutState;
  if (!bs || bs.state === 'NO_BREAKOUT') { skip(out, { role: 'breakout_level', category: 'pattern_breakout', tier: 2, reason: 'NO_BREAKOUT' }); return out; }

  const isFailedLike = bs.state === 'FAILED_BREAKOUT' || bs.state === 'FALSE_BREAKOUT';
  if (isFailedLike && anticipation?.state !== 'INVALIDATED') {
    skip(out, { role: 'breakout_level', category: 'pattern_breakout', tier: 2, reason: 'FAILED_BREAKOUT_NOT_CURRENTLY_RELEVANT' });
    return out;
  }

  const level = evidence?.structure?.lastEvent?.level;
  if (!Number.isFinite(level)) { skip(out, { role: 'breakout_level', category: 'pattern_breakout', tier: 2, reason: 'NO_OBJECTIVE_BREAKOUT_LEVEL' }); return out; }

  addCandidate(out, { role: 'breakout_level', category: 'pattern_breakout', tier: 2, intent: buildHLine({ role: 'breakout_level', symbol, timeframe, time, price: level, text: breakoutLabel(bs.state), overrides: styleFor('breakout'), source: 'evidence.structure.lastEvent.level (breakout.js state)' }) });
  return out;
}

// ── Anticipation: primary scenario / trigger / invalidation (P1, max 3) ──
function scenarioLabel(scenario) {
  const dir = scenario.direction ?? 'DIRECTION UNKNOWN';
  const fam = (scenario.strategy_family ?? scenario.mapped_model_code ?? 'SETUP').toString().toUpperCase();
  return `${dir} ${fam} — ${scenario.state}`;
}

function buildPrimaryCandidates({ decision, anticipation, evidence, symbol, timeframe, time }) {
  const out = [];
  const currentPrice = evidence?.sessionContext?.current?.last_close;
  const scenario = anticipation?.primary_scenario;
  const isWait = decision.action === 'WAIT';

  // anticipation.state is itself "WAIT" in the no-scenario-developing
  // case -- avoid the redundant "WAIT — WAIT (reason)"; show the
  // pre-entry state only when it is more specific than bare WAIT.
  const preEntryState = anticipation?.state ?? null;
  const statePart = preEntryState && preEntryState !== 'WAIT' ? ` — ${preEntryState}` : '';
  const reasonPart = anticipation?.authoritative_wait_reason ? ` (${anticipation.authoritative_wait_reason})` : '';
  const waitPrefix = isWait ? `WAIT${statePart}${reasonPart}` : null;
  const label = isWait
    ? `${waitPrefix}${scenario ? ` | ${scenarioLabel(scenario)}` : ''}`
    : (scenario ? `PRIMARY — ${scenarioLabel(scenario)}` : null);

  if (label) {
    const anchorPrice = scenario?.location?.price ?? currentPrice;
    if (Number.isFinite(anchorPrice)) {
      addCandidate(out, { role: 'primary_scenario', category: 'primary', tier: 1, intent: buildText({ role: 'primary_scenario', symbol, timeframe, time, price: anchorPrice, text: label, overrides: styleFor('primary', scenario?.direction), source: 'anticipation.primary_scenario / authoritative_wait_reason' }) });
    } else skip(out, { role: 'primary_scenario', category: 'primary', tier: 1, reason: 'NO_OBJECTIVE_ANCHOR' });
  } else {
    skip(out, { role: 'primary_scenario', category: 'primary', tier: 1, reason: 'DECISION_CONFIRMED_NO_PRE_ENTRY_SCENARIO' });
  }

  if (scenario && Number.isFinite(scenario.location?.price)) {
    addCandidate(out, { role: 'primary_trigger', category: 'primary', tier: 1, intent: buildHLine({ role: 'primary_trigger', symbol, timeframe, time, price: scenario.location.price, text: `TRIGGER (conditional) — ${scenario.state}`, overrides: styleFor('primary', scenario.direction), source: 'anticipation.primary_scenario.location' }) });
  } else skip(out, { role: 'primary_trigger', category: 'primary', tier: 1, reason: scenario ? 'NO_OBJECTIVE_TRIGGER_GEOMETRY' : 'NO_PRIMARY_SCENARIO' });

  if (scenario && Number.isFinite(scenario.invalidation?.level)) {
    // Explicitly distinct from a trade SL -- this is PRE-ENTRY invalidation, never labeled SL.
    addCandidate(out, { role: 'primary_invalidation', category: 'primary', tier: 1, intent: buildHLine({ role: 'primary_invalidation', symbol, timeframe, time, price: scenario.invalidation.level, text: 'PRE-ENTRY INVALIDATION (not SL)', overrides: styleFor('primary_invalidation'), source: 'anticipation.primary_scenario.invalidation' }) });
  } else skip(out, { role: 'primary_invalidation', category: 'primary', tier: 1, reason: scenario ? 'NO_OBJECTIVE_INVALIDATION_LEVEL' : 'NO_PRIMARY_SCENARIO' });

  return out;
}

// ── Anticipation: alternate scenario (P3, max 2, only when objectively present) ──
function buildAlternateCandidates({ anticipation, symbol, timeframe, time }) {
  const out = [];
  const alt = anticipation?.alternate_scenario;
  if (!alt) {
    skip(out, { role: 'alternate_scenario', category: 'alternate', tier: 3, reason: 'NO_OBJECTIVE_OPPOSING_EVIDENCE' });
    return out;
  }

  const label = `ALTERNATE — ${alt.direction ?? 'DIRECTION UNKNOWN'} ${(alt.strategy_family ?? 'REVERSAL').toString().toUpperCase()}`;
  const anchorPrice = alt.location?.price;
  if (Number.isFinite(anchorPrice)) {
    addCandidate(out, { role: 'alternate_scenario', category: 'alternate', tier: 3, intent: buildText({ role: 'alternate_scenario', symbol, timeframe, time, price: anchorPrice, text: label, overrides: styleFor('alternate'), source: 'anticipation.alternate_scenario' }) });
  } else skip(out, { role: 'alternate_scenario', category: 'alternate', tier: 3, reason: 'NO_OBJECTIVE_ANCHOR' });

  if (Number.isFinite(alt.invalidation?.level)) {
    addCandidate(out, { role: 'alternate_invalidation', category: 'alternate', tier: 3, intent: buildHLine({ role: 'alternate_invalidation', symbol, timeframe, time, price: alt.invalidation.level, text: 'ALT INVALIDATION', overrides: styleFor('alternate'), source: 'anticipation.alternate_scenario.invalidation' }) });
  } else skip(out, { role: 'alternate_invalidation', category: 'alternate', tier: 3, reason: 'NO_OBJECTIVE_INVALIDATION_LEVEL' });

  return out;
}

// ── Confirmed trade geometry (P1, only when decision.action is BUY/SELL) ──
function buildTradeCandidates({ decision, symbol, timeframe, time }) {
  const out = [];
  if (decision.action !== 'BUY' && decision.action !== 'SELL') {
    for (const role of ['trade_entry', 'trade_sl', 'trade_tp1', 'trade_tp2', 'trade_status']) skip(out, { role, category: 'trade', tier: 1, reason: 'DECISION_IS_NOT_CONFIRMED' });
    return out;
  }

  const fields = [
    ['trade_entry', decision.entry, 'ENTRY'],
    ['trade_sl', decision.sl, 'SL'],
    ['trade_tp1', decision.tp1, 'TP1'],
    ['trade_tp2', decision.tp2, 'TP2'],
  ];
  for (const [role, value, label] of fields) {
    if (Number.isFinite(value)) {
      addCandidate(out, { role, category: 'trade', tier: 1, intent: buildHLine({ role, symbol, timeframe, time, price: value, text: `${label} ${round2(value)}`, overrides: styleFor('trade', decision.action), source: `decision.${role === 'trade_entry' ? 'entry' : role === 'trade_sl' ? 'sl' : role === 'trade_tp1' ? 'tp1' : 'tp2'}` }) });
    } else skip(out, { role, category: 'trade', tier: 1, reason: 'MISSING_PROTECTED_TRADE_GEOMETRY' });
  }

  const statusText = `${decision.action} | ${decision.setup ?? 'N/A'} | RR ${decision.rr ?? 'NA'} | Q ${decision.quality ?? 'NA'}`;
  if (Number.isFinite(decision.entry)) {
    addCandidate(out, { role: 'trade_status', category: 'trade', tier: 1, intent: buildText({ role: 'trade_status', symbol, timeframe, time, price: decision.entry, text: statusText, overrides: styleFor('trade', decision.action), source: 'decision (action/setup/rr/quality)' }) });
  } else skip(out, { role: 'trade_status', category: 'trade', tier: 1, reason: 'NO_ENTRY_ANCHOR' });

  return out;
}

// ── Coincident-level merge: multiple independent roles landing on the
// EXACT same price never become multiple stacked, overlapping lines.
// Real market confluence (a CHoCH level that is also a pattern neckline
// that is also a swept liquidity level) is genuinely meaningful -- but a
// chart with 3 identical-price lines is poor hygiene regardless of
// whether the confluence is real or coincidental. The highest-priority
// candidate's role/point/primitive is kept as the visible drawing; the
// other roles' labels are appended (length-capped) rather than silently
// discarded, and each is recorded in the audit trail as merged, never as
// simply gone. Confirmed trade geometry (`category: 'trade'`) is NEVER
// merged -- ENTRY/SL/TP1/TP2 must always stay exact and separately
// labeled, per the protected-decision-geometry rule.
const MERGED_TEXT_MAX_LENGTH = 100;

function mergeCoincidentLevels(candidates) {
  const mergeable = candidates.filter((c) => c.included && c.category !== 'trade' && c.intent.primitive === 'horizontal_line');
  const rest = candidates.filter((c) => !(c.included && c.category !== 'trade' && c.intent.primitive === 'horizontal_line'));

  const byPrice = new Map();
  for (const c of mergeable) {
    const key = `${c.intent.symbol}|${c.intent.timeframe}|${c.intent.point.price}`;
    if (!byPrice.has(key)) byPrice.set(key, []);
    byPrice.get(key).push(c);
  }

  const merged = [];
  for (const group of byPrice.values()) {
    if (group.length === 1) { merged.push(group[0]); continue; }
    const ordered = [...group].sort((a, b) => a.tier - b.tier);
    const primary = ordered[0];
    const combinedText = ordered.map((c) => c.intent.text).filter(Boolean).join(' | ').slice(0, MERGED_TEXT_MAX_LENGTH);
    merged.push({ ...primary, intent: { ...primary.intent, text: combinedText }, merged_from_roles: ordered.map((c) => c.role) });
    for (const c of ordered.slice(1)) rest.push({ ...c, included: false, reason_excluded: `MERGED_INTO_${primary.role}_SAME_PRICE` });
  }

  return [...rest, ...merged];
}

// ── Clutter budget: priority-ordered suppression, never a raw sum of category maxima ──
function applyClutterBudget(candidates) {
  const included = candidates.filter((c) => c.included);
  const sorted = [...included].sort((a, b) => a.tier - b.tier); // stable: tier 1 first, original order preserved within a tier
  const kept = sorted.slice(0, CLUTTER_BUDGET.MAX_TOTAL);
  const suppressedByBudget = sorted.slice(CLUTTER_BUDGET.MAX_TOTAL);
  return { kept, suppressedByBudget };
}

/**
 * Maps already-computed decision/evidence/anticipation (+ optional
 * confluence, accepted for interface stability -- not currently read, see
 * module header) into a validated, budget-limited array of Stage 4
 * drawing intents, ready for src/core/xauusd_visualize.js.
 *
 * Returns { intents, candidates, summary } -- `candidates` is the full
 * audit trail (every role considered, included or not, and why), useful
 * for a dry-run report; `intents` is the pure Stage 4 schema array.
 */
export function buildMarketVisualizationIntents({ decision, evidence = null, anticipation = null, confluence = null } = {}) {
  void confluence; // accepted for interface stability -- see module header
  if (!decision) return { intents: [], candidates: [], summary: { total_candidates: 0, total_included: 0, total_suppressed: 0, reason: 'NO_DECISION' } };

  const symbol = decision.symbol ?? null;
  const timeframe = decision.diagnostics?.source_timeframe ?? null;
  const time = timeframe ? (decision.market_data_times?.[timeframe] ?? decision.timeframes?.[timeframe]?.last_confirmed_bar_time ?? null) : null;

  if (!symbol || !timeframe || !Number.isFinite(time)) {
    return { intents: [], candidates: [], summary: { total_candidates: 0, total_included: 0, total_suppressed: 0, symbol, timeframe, reason: 'NO_OBJECTIVE_ANCHOR_TIME_AVAILABLE' } };
  }

  const candidates = [
    ...buildTradeCandidates({ decision, symbol, timeframe, time }),
    ...buildPrimaryCandidates({ decision, anticipation, evidence, symbol, timeframe, time }),
    ...buildStructureCandidates({ evidence, symbol, timeframe, time }),
    ...buildSRCandidates({ evidence, symbol, timeframe, time }),
    ...buildSupplyDemandCandidates({ evidence, symbol, timeframe, time }),
    ...buildBreakoutCandidates({ anticipation, evidence, symbol, timeframe, time }),
    ...buildPatternCandidates({ evidence, symbol, timeframe }),
    ...buildLiquidityCandidates({ evidence, symbol, timeframe, time }),
    ...buildAlternateCandidates({ anticipation, symbol, timeframe, time }),
  ];

  const merged = mergeCoincidentLevels(candidates);
  const { kept, suppressedByBudget } = applyClutterBudget(merged);
  for (const c of suppressedByBudget) c.reason_excluded_by_budget = true;

  return {
    intents: kept.map((c) => c.intent),
    candidates: merged,
    summary: {
      total_candidates: merged.length,
      total_included: kept.length,
      total_suppressed: merged.length - kept.length,
      symbol, timeframe,
      decision_action: decision.action,
      anticipation_state: anticipation?.state ?? null,
    },
  };
}
