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

// ── Presentation-only priority tiers (Zone-Based Market Map upgrade,
// mission item 11C). These numbers control ONLY sort order for clutter-
// budget suppression and label-lane contention -- they are never read by
// any analytical/decision/measurement code and never alter which zones
// are detected or what calculateEntry() decides. Lower number = higher
// priority (survives suppression first, wins a contested label lane).
export const TIER = Object.freeze({
  TRADE: 1,            // confirmed BUY/SELL geometry (ENTRY/SL/TP1/TP2/status)
  CURRENT_ZONE: 2,      // price is objectively INSIDE this Supply/Demand zone right now
  CANDIDATE_ENTRY: 3,   // Pre-Entry Opportunity Planner's candidate zone / provisional invalidation
  NEAREST_ZONE: 4,      // nearest (but not current) Supply/Demand zone
  PRIMARY: 5,           // primary anticipation scenario/trigger/invalidation
  ALTERNATE: 6,         // alternate anticipation scenario/invalidation
  SR: 7,                // nearest support/resistance
  STRUCTURE: 8,         // structural swing / BOS / CHoCH
  LIQUIDITY: 9,         // sweep/reclaim/liquidity pool
  PATTERN_BREAKOUT: 10, // classical pattern / breakout-retest lifecycle
  RANGE: 11,            // range high/low/equilibrium (secondary informational)
});

// A zone rectangle's right edge is anchored a FIXED number of real bars
// after its own real origin bar (clamped to the latest available bar) --
// NEVER "now". Anchoring to "now" would make the rectangle's content
// signature change on every single confirmed bar (drawingRegistry.js's
// computeIntentSignature() correctly treats BOTH of a rectangle's time
// coordinates as real geometry, never time-invariant -- see its own doc
// comment), causing unnecessary remove+recreate churn every cycle. Anchoring
// to a fixed offset from the zone's OWN origin means the signature stops
// changing (zero churn) once the zone is older than this many bars --
// before that point, the rectangle legitimately grows bar-by-bar as real
// time elapses, which is genuine new information, not spurious churn.
// Presentation-only: never a trading threshold, never read by any
// analytical file, never fed back into zone detection.
const ZONE_RECT_FORWARD_BARS = 40;

// Deterministic, ATR-based label-collision spacing (mission item 11B).
// Presentation-only: reuses the SAME already-computed, objective ATR value
// evidence.volatilityContext already exposes -- never a new indicator,
// never random, never the same value twice for the same inputs.
const LABEL_COLLISION_ATR_MULTIPLE = 0.35;
const LABEL_LANE_STEP_ATR_MULTIPLE = 0.6;
const LABEL_LANE_MAX_ATTEMPTS = 8;

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// ── Presentation-only SHORT DISPLAY LABELS (chart-readability hardening,
// "short chart labels" upgrade). The chart must show CONCISE labels (a
// handful of words), never a full diagnostic sentence -- rich state/
// reason/model/blocking-condition context remains fully available via
// each candidate's own `diagnostic` field (part of the `candidates` audit
// trail returned alongside `intents` -- NEVER sent to TradingView) and,
// upstream, via the already-existing evidence/anticipation/pre_entry_plan
// objects themselves, completely unaffected by anything in this file.
// This is a presentation-only translation layer -- it never removes,
// rounds, or alters a single analytical value; it only decides what TEXT
// gets drawn on the chart, exactly like the line/label decoupling above.
const DISPLAY_LABEL_MAX_LENGTH = 60;

function shortDirectionWord(direction) { return direction === 'BEARISH' ? 'SELL' : 'BUY'; }

/** Concise word for an anticipation/opportunity lifecycle state -- omitted entirely (bare "<DIR> WATCH") for the earliest, least-specific states, since those add no information beyond "something is developing". */
function shortStateWord(state) {
  switch (state) {
    case 'CONFIRMATION_PENDING':
    case 'ARMED': return 'CONFIRMATION';
    case 'INVALIDATED': return 'INVALIDATION';
    case 'MISSED': return 'MISSED';
    case 'REACTION_PENDING': return 'REACTION';
    case 'ZONE_TOUCHED': return 'TOUCH';
    default: return null;
  }
}

function shortWatchLabel(direction, stateWord) {
  const dir = shortDirectionWord(direction);
  return stateWord ? `${dir} WATCH • ${stateWord}` : `${dir} WATCH`;
}

function shortBreakoutLabel(state) {
  switch (state) {
    case 'BREAKOUT_FORMING': return 'BREAKOUT';
    case 'BREAKOUT_RETEST_PENDING': return 'BREAKOUT • RETEST';
    case 'RETEST_TESTING': return 'RETEST';
    case 'RETEST_HOLD': return 'RETEST HOLD';
    case 'BREAKOUT_CONFIRMED': return 'BREAKOUT CONFIRMED';
    case 'BREAKOUT_RECLAIMED': return 'BREAKOUT RECLAIMED';
    case 'OVEREXTENDED_BREAKOUT': return 'BREAKOUT (LATE)';
    case 'FAILED_BREAKOUT': return 'BREAKOUT FAILED';
    case 'FALSE_BREAKOUT': return 'BREAKOUT (FALSE)';
    default: return 'BREAKOUT';
  }
}

function shortPatternLabel(patternType) { return patternType.replace(/_/g, ' '); }

function shortLiquidityLabel(reclaimed) { return `LIQUIDITY SWEEP • ${reclaimed ? 'RECLAIM' : 'PENDING'}`; }

function shortZoneLabel(direction, { current = false, state = null } = {}) {
  return `${current ? 'CURRENT ' : ''}${direction.toUpperCase()}${zoneStateSuffix(state)}`;
}

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
    case 'range': return { linecolor: '#546E7A', linewidth: 1, linestyle: 2 };
    default: return { linecolor: '#787B86', linewidth: 1, linestyle: 0 };
  }
}

// ── Zone rectangle fill (Zone-Based Market Map upgrade). `backgroundColor`/
// `transparency` are TradingView's own standard rectangle-shape override
// properties (drawShape() passes `overrides` straight through to
// createShape()/createMultipointShape() -- see src/core/drawing.js and
// drawingRegistry.js's own doc comment on exactly what gets forwarded).
// Unlike linecolor/linewidth/linestyle, this specific pairing had not
// previously been exercised via a live CDP proof in this codebase before
// this upgrade -- see docs/XAUUSD_LIVE_RUNTIME.md's live-proof section for
// the verification run. `current: true` renders a lower transparency
// (more opaque) than a distant/nearest-only zone, per mission item 4/12
// ("current relevant area visually stronger than distant zones").
function zoneStyleFor(direction, { current = false } = {}) {
  const linecolor = direction === 'supply' ? '#FF6D00' : '#2196F3';
  return { linecolor, linewidth: 1, linestyle: 0, backgroundColor: linecolor, transparency: current ? 75 : 88 };
}

function zoneStateSuffix(state) {
  if (state === 'FRESH') return ' — FRESH';
  if (state === 'MITIGATED') return ' — MITIGATED';
  return '';
}

/** The real timestamp of a specific confirmed bar, or null -- never a fabricated/interpolated time. */
function resolveBarTime(primaryBars, index) {
  if (!Array.isArray(primaryBars) || !Number.isInteger(index) || index < 0 || index >= primaryBars.length) return null;
  const bar = primaryBars[index];
  return Number.isFinite(bar?.time) ? bar.time : null;
}

/**
 * A zone's rectangle time span: real origin bar time -> a real bar time
 * ZONE_RECT_FORWARD_BARS later (clamped to the latest available bar).
 * Returns null (never a fabricated span) when `primaryBars` is unavailable
 * or `originBarIndex` cannot be resolved against it -- the caller must then
 * fall back to the pre-existing horizontal_line-at-one-edge presentation,
 * exactly as before this upgrade (see module header's original "SUPPLY/
 * DEMAND ZONE LIMITATION" note -- this resolves that limitation ONLY when
 * a real bars array is available, e.g. via analyzeMarket()'s Stage 7
 * `primary_confirmed_bars` field; never invents one when it is not).
 */
function resolveZoneRectangleSpan({ originBarIndex, primaryBars }) {
  const startTime = resolveBarTime(primaryBars, originBarIndex);
  if (startTime == null) return null;
  const endIndex = Math.min(primaryBars.length - 1, originBarIndex + ZONE_RECT_FORWARD_BARS);
  const endTime = resolveBarTime(primaryBars, endIndex);
  if (endTime == null || endTime <= startTime) return null;
  return { startTime, endTime };
}

function buildHLine({ role, symbol, timeframe, time, price, text, overrides, source }) {
  if (!Number.isFinite(time) || !Number.isFinite(price)) return null;
  return makeDrawingIntent({ role, primitive: 'horizontal_line', point: { time, price: round2(price) }, text: text ?? null, overrides, source, symbol, timeframe });
}

function buildText({ role, symbol, timeframe, time, price, text, overrides, source }) {
  if (!Number.isFinite(time) || !Number.isFinite(price) || !text) return null;
  return makeDrawingIntent({ role, primitive: 'text', point: { time, price: round2(price) }, text, overrides, source, symbol, timeframe });
}

/**
 * `diagnostic`, when passed, is the FULL, verbose, human-readable sentence
 * describing this candidate (state/reason/model/blocking-conditions/etc.)
 * -- it is carried on the audit-trail candidate object returned alongside
 * `intents` (see buildMarketVisualizationIntents()'s return), NEVER on
 * `intent` itself, so it is never sent to TradingView as chart text. This
 * is what lets the chart-facing `intent.text` be short while nothing is
 * actually lost -- every full explanation remains inspectable via
 * `candidates[].diagnostic` (and, further upstream, via the already-
 * existing evidence/anticipation/plan objects themselves).
 */
function addCandidate(list, { role, category, tier, intent, diagnostic = null }) {
  if (intent) list.push({ role, category, tier, included: true, intent, diagnostic });
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
    const shortLabel = `STRUCTURE ${relevantSwing.label}`;
    addCandidate(out, {
      role: 'structure_primary', category: 'structure', tier: TIER.STRUCTURE,
      intent: buildHLine({ role: 'structure_primary', symbol, timeframe, time, price: relevantSwing.price, text: shortLabel, overrides: styleFor('structure'), source: 'evidence.structure.lastSwingLow/lastSwingHigh' }),
      diagnostic: shortLabel,
    });
  } else skip(out, { role: 'structure_primary', category: 'structure', tier: TIER.STRUCTURE, reason: 'STRUCTURE_DIRECTION_UNRESOLVED' });

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
      role: 'structure_event', category: 'structure', tier: TIER.STRUCTURE,
      intent: buildHLine({ role: 'structure_event', symbol, timeframe, time, price: structure.lastEvent.level, text: structure.lastEvent.type, overrides: styleFor('structure'), source: 'evidence.structure.lastEvent' }),
      diagnostic: `${structure.lastEvent.type} ${structure.lastEvent.direction}`,
    });
  } else if (breakoutCoversSameLevel) {
    skip(out, { role: 'structure_event', category: 'structure', tier: TIER.STRUCTURE, reason: 'COVERED_BY_BREAKOUT_LEVEL_SAME_PRICE' });
  } else skip(out, { role: 'structure_event', category: 'structure', tier: TIER.STRUCTURE, reason: 'NO_STRUCTURE_EVENT' });

  return out;
}

// ── Support / Resistance (max 2) ─────────────────────────────────────────
function buildSRCandidates({ evidence, symbol, timeframe, time }) {
  const out = [];
  const lvl = evidence?.levelsContext;
  if (lvl?.nearestSupport && Number.isFinite(lvl.nearestSupport.price)) {
    const l = lvl.nearestSupport;
    addCandidate(out, { role: 'nearest_support', category: 'sr', tier: TIER.SR, intent: buildHLine({ role: 'nearest_support', symbol, timeframe, time, price: l.price, text: `SUPPORT x${l.touch_count}`, overrides: styleFor('support_resistance'), source: 'evidence.levelsContext.nearestSupport' }), diagnostic: `SUPPORT${l.fresh ? ' (fresh)' : ''} x${l.touch_count}` });
  } else skip(out, { role: 'nearest_support', category: 'sr', tier: TIER.SR, reason: 'NO_NEAREST_SUPPORT' });

  if (lvl?.nearestResistance && Number.isFinite(lvl.nearestResistance.price)) {
    const l = lvl.nearestResistance;
    addCandidate(out, { role: 'nearest_resistance', category: 'sr', tier: TIER.SR, intent: buildHLine({ role: 'nearest_resistance', symbol, timeframe, time, price: l.price, text: `RESISTANCE x${l.touch_count}`, overrides: styleFor('support_resistance'), source: 'evidence.levelsContext.nearestResistance' }), diagnostic: `RESISTANCE${l.fresh ? ' (fresh)' : ''} x${l.touch_count}` });
  } else skip(out, { role: 'nearest_resistance', category: 'sr', tier: TIER.SR, reason: 'NO_NEAREST_RESISTANCE' });

  return out;
}

// ── Supply / Demand (max 2). Rendered as a translucent rectangle spanning
// the zone's REAL price bounds and a REAL bar-time span (see
// resolveZoneRectangleSpan()) whenever `primaryBars` is supplied; falls
// back to the original single-edge horizontal_line (byte-identical to the
// pre-upgrade behavior) when no bars array is available to resolve a real
// time span from -- NEVER a fabricated time span. A zone price is fully
// determined by evidence.levelsContext.supplyDemandZones alone; only the
// PRESENTATION (rectangle vs. line, "CURRENT" emphasis) depends on
// currentPrice/primaryBars.
function buildSupplyDemandCandidates({ evidence, symbol, timeframe, time, primaryBars }) {
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

  function addZone(role, direction, zone) {
    const isCurrent = Number.isFinite(currentPrice) && currentPrice >= zone.zone_low && currentPrice <= zone.zone_high;
    const tier = isCurrent ? TIER.CURRENT_ZONE : TIER.NEAREST_ZONE;
    const span = resolveZoneRectangleSpan({ originBarIndex: zone.origin_bar_index, primaryBars });

    const label = shortZoneLabel(direction, { current: isCurrent, state: zone.state });
    const diagnostic = `${direction} zone ${round2(zone.zone_low)}-${round2(zone.zone_high)} (${zone.state}${isCurrent ? ', CURRENT' : ''})`;

    if (span) {
      addCandidate(out, {
        role, category: 'supply_demand', tier,
        intent: makeDrawingIntent({
          role, primitive: 'rectangle',
          point: { time: span.startTime, price: round2(zone.zone_low) },
          point2: { time: span.endTime, price: round2(zone.zone_high) },
          text: label, overrides: zoneStyleFor(direction, { current: isCurrent }),
          source: 'evidence.levelsContext.supplyDemandZones', symbol, timeframe,
        }),
        diagnostic,
      });
      return;
    }

    // No resolvable real bar-time span -- fall back to the original,
    // pre-upgrade single-edge horizontal_line. Never fabricate a time span.
    const edge = direction === 'demand'
      ? (Number.isFinite(currentPrice) && currentPrice >= zone.zone_high ? zone.zone_high : zone.zone_low)
      : (Number.isFinite(currentPrice) && currentPrice <= zone.zone_low ? zone.zone_low : zone.zone_high);
    addCandidate(out, { role, category: 'supply_demand', tier, intent: buildHLine({ role, symbol, timeframe, time, price: edge, text: label, overrides: styleFor('supply_demand'), source: 'evidence.levelsContext.supplyDemandZones' }), diagnostic });
  }

  const demand = nearestZone('demand');
  if (demand) addZone('active_demand', 'demand', demand);
  else skip(out, { role: 'active_demand', category: 'supply_demand', tier: TIER.NEAREST_ZONE, reason: 'NO_ACTIVE_DEMAND_ZONE' });

  const supply = nearestZone('supply');
  if (supply) addZone('active_supply', 'supply', supply);
  else skip(out, { role: 'active_supply', category: 'supply_demand', tier: TIER.NEAREST_ZONE, reason: 'NO_ACTIVE_SUPPLY_ZONE' });

  return out;
}

// ── Liquidity (max 1): active sweep/reclaim > nearest EQH/EQL pool > (FVG skipped, no time bounds) ──
function buildLiquidityCandidates({ evidence, symbol, timeframe, time }) {
  const out = [];
  const liq = evidence?.liquidityContext;
  const currentPrice = evidence?.sessionContext?.current?.last_close;

  if (liq?.sweepReclaim?.swept && Number.isFinite(liq.sweepReclaim.level)) {
    const label = shortLiquidityLabel(liq.sweepReclaim.reclaimed);
    const diagnostic = `LIQUIDITY SWEEP (${liq.sweepReclaim.sweepType}) — ${liq.sweepReclaim.reclaimed ? 'RECLAIMED' : 'PENDING RECLAIM'}`;
    addCandidate(out, { role: 'liquidity_primary', category: 'liquidity', tier: TIER.LIQUIDITY, intent: buildHLine({ role: 'liquidity_primary', symbol, timeframe, time, price: liq.sweepReclaim.level, text: label, overrides: styleFor('liquidity'), source: 'evidence.liquidityContext.sweepReclaim' }), diagnostic });
    return out;
  }

  const pools = [...(liq?.equalHighs ?? []), ...(liq?.equalLows ?? [])];
  if (pools.length && Number.isFinite(currentPrice)) {
    const nearest = pools.reduce((best, p) => (!best || Math.abs(p.price - currentPrice) < Math.abs(best.price - currentPrice)) ? p : best, null);
    const label = `LIQUIDITY POOL x${nearest.touch_count}`;
    addCandidate(out, { role: 'liquidity_primary', category: 'liquidity', tier: TIER.LIQUIDITY, intent: buildHLine({ role: 'liquidity_primary', symbol, timeframe, time, price: nearest.price, text: label, overrides: styleFor('liquidity'), source: 'evidence.liquidityContext.equalHighs/equalLows' }), diagnostic: label });
    return out;
  }

  // Fair value gaps are deliberately never visualized -- see module header.
  skip(out, { role: 'liquidity_primary', category: 'liquidity', tier: TIER.LIQUIDITY, reason: 'NO_RELEVANT_SWEEP_OR_POOL' });
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
  if (!pattern) { skip(out, { role: 'pattern_primary', category: 'pattern_breakout', tier: TIER.PATTERN_BREAKOUT, reason: 'NO_CURRENT_RELEVANT_PATTERN' }); return out; }

  // patterns.js DOES expose real bar timestamps (start_time/end_time,
  // looked up from the actual bars it was given) -- unlike structure/
  // breakout/liquidity evidence, no "current bar" substitution is needed.
  const anchorTime = pattern.end_time;
  const levelPrice = Number.isFinite(pattern.breakout_level) ? pattern.breakout_level : Number.isFinite(pattern.neckline) ? pattern.neckline : null;
  const label = shortPatternLabel(pattern.pattern_type);
  const diagnostic = `${pattern.pattern_type} — ${pattern.completion_state}`;

  if (Number.isFinite(levelPrice) && Number.isFinite(anchorTime)) {
    addCandidate(out, { role: 'pattern_primary', category: 'pattern_breakout', tier: TIER.PATTERN_BREAKOUT, intent: buildHLine({ role: 'pattern_primary', symbol, timeframe, time: anchorTime, price: levelPrice, text: label, overrides: styleFor('pattern'), source: `evidence.classicalPatterns[${pattern.pattern_id}].neckline/breakout_level` }), diagnostic });
    return out;
  }
  const lastPivotPrice = pattern.pivot_points?.at(-1)?.price;
  if (Number.isFinite(lastPivotPrice) && Number.isFinite(anchorTime)) {
    addCandidate(out, { role: 'pattern_primary', category: 'pattern_breakout', tier: TIER.PATTERN_BREAKOUT, intent: buildText({ role: 'pattern_primary', symbol, timeframe, time: anchorTime, price: lastPivotPrice, text: label, overrides: styleFor('pattern'), source: `evidence.classicalPatterns[${pattern.pattern_id}].pivot_points` }), diagnostic });
    return out;
  }
  skip(out, { role: 'pattern_primary', category: 'pattern_breakout', tier: TIER.PATTERN_BREAKOUT, reason: 'NO_OBJECTIVE_PATTERN_GEOMETRY' });
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
  if (!bs || bs.state === 'NO_BREAKOUT') { skip(out, { role: 'breakout_level', category: 'pattern_breakout', tier: TIER.PATTERN_BREAKOUT, reason: 'NO_BREAKOUT' }); return out; }

  const isFailedLike = bs.state === 'FAILED_BREAKOUT' || bs.state === 'FALSE_BREAKOUT';
  if (isFailedLike && anticipation?.state !== 'INVALIDATED') {
    skip(out, { role: 'breakout_level', category: 'pattern_breakout', tier: TIER.PATTERN_BREAKOUT, reason: 'FAILED_BREAKOUT_NOT_CURRENTLY_RELEVANT' });
    return out;
  }

  const level = evidence?.structure?.lastEvent?.level;
  if (!Number.isFinite(level)) { skip(out, { role: 'breakout_level', category: 'pattern_breakout', tier: TIER.PATTERN_BREAKOUT, reason: 'NO_OBJECTIVE_BREAKOUT_LEVEL' }); return out; }

  addCandidate(out, { role: 'breakout_level', category: 'pattern_breakout', tier: TIER.PATTERN_BREAKOUT, intent: buildHLine({ role: 'breakout_level', symbol, timeframe, time, price: level, text: shortBreakoutLabel(bs.state), overrides: styleFor('breakout'), source: 'evidence.structure.lastEvent.level (breakout.js state)' }), diagnostic: breakoutLabel(bs.state) });
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
  const diagnostic = isWait
    ? `${waitPrefix}${scenario ? ` | ${scenarioLabel(scenario)}` : ''}`
    : (scenario ? `PRIMARY — ${scenarioLabel(scenario)}` : null);
  // Short chart label: "<BUY|SELL> WATCH" (+ "• CONFIRMATION"/"• INVALIDATION"/
  // etc. when the pre-entry state is more specific than bare "developing"),
  // bare "WAIT" when there is no scenario yet, or "PRIMARY <BUY|SELL>" in the
  // rare edge case where a scenario survives alongside an already-confirmed
  // decision. The full state/reason sentence lives only in `diagnostic`.
  const label = isWait
    ? (scenario ? shortWatchLabel(scenario.direction, shortStateWord(preEntryState)) : 'WAIT')
    : (scenario ? `PRIMARY ${shortDirectionWord(scenario.direction)}` : null);

  if (label) {
    const anchorPrice = scenario?.location?.price ?? currentPrice;
    if (Number.isFinite(anchorPrice)) {
      addCandidate(out, { role: 'primary_scenario', category: 'primary', tier: TIER.PRIMARY, intent: buildText({ role: 'primary_scenario', symbol, timeframe, time, price: anchorPrice, text: label, overrides: styleFor('primary', scenario?.direction), source: 'anticipation.primary_scenario / authoritative_wait_reason' }), diagnostic });
    } else skip(out, { role: 'primary_scenario', category: 'primary', tier: TIER.PRIMARY, reason: 'NO_OBJECTIVE_ANCHOR' });
  } else {
    skip(out, { role: 'primary_scenario', category: 'primary', tier: TIER.PRIMARY, reason: 'DECISION_CONFIRMED_NO_PRE_ENTRY_SCENARIO' });
  }

  if (scenario && Number.isFinite(scenario.location?.price)) {
    addCandidate(out, { role: 'primary_trigger', category: 'primary', tier: TIER.PRIMARY, intent: buildHLine({ role: 'primary_trigger', symbol, timeframe, time, price: scenario.location.price, text: 'TRIGGER', overrides: styleFor('primary', scenario.direction), source: 'anticipation.primary_scenario.location' }), diagnostic: `TRIGGER (conditional) — ${scenario.state}` });
  } else skip(out, { role: 'primary_trigger', category: 'primary', tier: TIER.PRIMARY, reason: scenario ? 'NO_OBJECTIVE_TRIGGER_GEOMETRY' : 'NO_PRIMARY_SCENARIO' });

  if (scenario && Number.isFinite(scenario.invalidation?.level)) {
    // Explicitly distinct from a trade SL -- this is PRE-ENTRY invalidation, never labeled SL.
    addCandidate(out, { role: 'primary_invalidation', category: 'primary', tier: TIER.PRIMARY, intent: buildHLine({ role: 'primary_invalidation', symbol, timeframe, time, price: scenario.invalidation.level, text: 'INVALIDATION', overrides: styleFor('primary_invalidation'), source: 'anticipation.primary_scenario.invalidation' }), diagnostic: 'PRE-ENTRY INVALIDATION (not SL)' });
  } else skip(out, { role: 'primary_invalidation', category: 'primary', tier: TIER.PRIMARY, reason: scenario ? 'NO_OBJECTIVE_INVALIDATION_LEVEL' : 'NO_PRIMARY_SCENARIO' });

  return out;
}

// ── Anticipation: alternate scenario (P3, max 2, only when objectively present) ──
function buildAlternateCandidates({ anticipation, symbol, timeframe, time }) {
  const out = [];
  const alt = anticipation?.alternate_scenario;
  if (!alt) {
    skip(out, { role: 'alternate_scenario', category: 'alternate', tier: TIER.ALTERNATE, reason: 'NO_OBJECTIVE_OPPOSING_EVIDENCE' });
    return out;
  }

  const label = `ALT ${shortDirectionWord(alt.direction)} WATCH`;
  const diagnostic = `ALTERNATE — ${alt.direction ?? 'DIRECTION UNKNOWN'} ${(alt.strategy_family ?? 'REVERSAL').toString().toUpperCase()}`;
  const anchorPrice = alt.location?.price;
  if (Number.isFinite(anchorPrice)) {
    addCandidate(out, { role: 'alternate_scenario', category: 'alternate', tier: TIER.ALTERNATE, intent: buildText({ role: 'alternate_scenario', symbol, timeframe, time, price: anchorPrice, text: label, overrides: styleFor('alternate'), source: 'anticipation.alternate_scenario' }), diagnostic });
  } else skip(out, { role: 'alternate_scenario', category: 'alternate', tier: TIER.ALTERNATE, reason: 'NO_OBJECTIVE_ANCHOR' });

  if (Number.isFinite(alt.invalidation?.level)) {
    addCandidate(out, { role: 'alternate_invalidation', category: 'alternate', tier: TIER.ALTERNATE, intent: buildHLine({ role: 'alternate_invalidation', symbol, timeframe, time, price: alt.invalidation.level, text: 'ALT INVALIDATION', overrides: styleFor('alternate'), source: 'anticipation.alternate_scenario.invalidation' }), diagnostic: 'ALT INVALIDATION' });
  } else skip(out, { role: 'alternate_invalidation', category: 'alternate', tier: TIER.ALTERNATE, reason: 'NO_OBJECTIVE_INVALIDATION_LEVEL' });

  return out;
}

// ── Confirmed trade geometry (P1, only when decision.action is BUY/SELL) ──
function buildTradeCandidates({ decision, symbol, timeframe, time }) {
  const out = [];
  if (decision.action !== 'BUY' && decision.action !== 'SELL') {
    for (const role of ['trade_entry', 'trade_sl', 'trade_tp1', 'trade_tp2', 'trade_status']) skip(out, { role, category: 'trade', tier: TIER.TRADE, reason: 'DECISION_IS_NOT_CONFIRMED' });
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
      const text = `${label} ${round2(value)}`;
      addCandidate(out, { role, category: 'trade', tier: TIER.TRADE, intent: buildHLine({ role, symbol, timeframe, time, price: value, text, overrides: styleFor('trade', decision.action), source: `decision.${role === 'trade_entry' ? 'entry' : role === 'trade_sl' ? 'sl' : role === 'trade_tp1' ? 'tp1' : 'tp2'}` }), diagnostic: text });
    } else skip(out, { role, category: 'trade', tier: TIER.TRADE, reason: 'MISSING_PROTECTED_TRADE_GEOMETRY' });
  }

  const statusText = `${decision.action} • ${decision.setup ?? 'N/A'} • RR ${decision.rr ?? 'NA'} • Q ${decision.quality ?? 'NA'}`;
  if (Number.isFinite(decision.entry)) {
    addCandidate(out, { role: 'trade_status', category: 'trade', tier: TIER.TRADE, intent: buildText({ role: 'trade_status', symbol, timeframe, time, price: decision.entry, text: statusText, overrides: styleFor('trade', decision.action), source: 'decision (action/setup/rr/quality)' }), diagnostic: statusText });
  } else skip(out, { role: 'trade_status', category: 'trade', tier: TIER.TRADE, reason: 'NO_ENTRY_ANCHOR' });

  return out;
}

// ── Coincident-level merge: multiple independent roles landing on the
// EXACT same price never become multiple stacked, overlapping lines OR
// labels. Real market confluence (a CHoCH level that is also a pattern
// neckline that is also a swept liquidity level) is genuinely meaningful
// -- but a chart with 3 identical-price lines/labels is poor hygiene
// regardless of whether the confluence is real or coincidental. Eligible
// primitives are `horizontal_line`, `rectangle` (matched on BOTH edges --
// two zone rectangles with identical bounds are the same zone, e.g. the
// Pre-Entry Opportunity Planner's candidate zone and a general active
// Supply/Demand zone selecting the exact same real zone), and `text`
// (mission item 11D -- a floating scenario label anchored at the exact
// same price as a line/rectangle edge is the SAME underlying level, and
// merging it into that shape's own label removes a redundant overlapping
// text object rather than just visually separating it). The highest-
// PRESENTATION-priority candidate's role/point/primitive is kept as the
// visible drawing -- among equal-price candidates, a line/rectangle is
// ALWAYS preferred over a bare `text` marker (the geometry is strictly
// more informative and a text's own content is fully preserved in the
// combined label), then ties broken by `tier`. The other roles' labels
// are appended (length-capped, concise separator per mission item 11E)
// rather than silently discarded, and each is recorded in the audit trail
// as merged, never as simply gone. Confirmed trade geometry
// (`category: 'trade'`) is NEVER merged -- ENTRY/SL/TP1/TP2 must always
// stay exact and separately labeled, per the protected-decision-geometry
// rule.
const MERGE_ELIGIBLE_PRIMITIVES = new Set(['horizontal_line', 'rectangle', 'text']);

function mergeKey(intent) {
  const p2 = intent.point2 ? `|${intent.point2.price}` : '';
  return `${intent.symbol}|${intent.timeframe}|${intent.point.price}${p2}`;
}

/** Lines/rectangles are preferred over a bare text marker when merging two candidates at the identical price -- the shape geometry is strictly more informative and the text's own content is preserved in the combined label either way. */
function mergeShapePriority(c) { return c.intent.primitive === 'text' ? 1 : 0; }

/**
 * Builds a combined label from highest-priority-first text items, stopping
 * at a whole-ITEM boundary rather than an arbitrary character count --
 * this is what makes the merge NEVER produce a truncated fragment (e.g. a
 * dangling trailing "|" or a half-written word). The highest-priority item
 * is always included in full, even if it alone exceeds `maxLength` (never
 * an empty label); a subsequent item is included only if it fits whole.
 * Items dropped for length are still fully present in `merged_from_roles`
 * -- never silently lost from the audit trail, only from the rendered text.
 */
function buildCombinedText(orderedTexts, maxLength) {
  const parts = [];
  let used = 0;
  for (const text of orderedTexts) {
    if (!text) continue;
    const additional = parts.length === 0 ? text.length : text.length + 3; // ' • '.length === 3
    if (parts.length > 0 && used + additional > maxLength) break;
    parts.push(text);
    used += additional;
  }
  return parts.join(' • ');
}

function mergeCoincidentLevels(candidates) {
  const isMergeable = (c) => c.included && c.category !== 'trade' && MERGE_ELIGIBLE_PRIMITIVES.has(c.intent.primitive);
  const mergeable = candidates.filter(isMergeable);
  const rest = candidates.filter((c) => !isMergeable(c));

  const byPrice = new Map();
  for (const c of mergeable) {
    const key = mergeKey(c.intent);
    if (!byPrice.has(key)) byPrice.set(key, []);
    byPrice.get(key).push(c);
  }

  const merged = [];
  for (const group of byPrice.values()) {
    // Runs BEFORE splitLineLabels() (see both call sites below) precisely so
    // this never has to distinguish a genuine multi-role confluence from a
    // line/rectangle and its own already-decoupled label companion -- at
    // this point in the pipeline no candidate has been split yet, so every
    // group member is still a genuinely distinct role. The pairKey fallback
    // below is defensive only (harmless no-op on this call order; keeps this
    // function correct if it were ever run on already-split input).
    const distinctPairKeys = new Set(group.map((c) => c.pairKey ?? c.role));
    if (group.length === 1 || distinctPairKeys.size === 1) { merged.push(...group); continue; }

    const ordered = [...group].sort((a, b) => mergeShapePriority(a) - mergeShapePriority(b) || a.tier - b.tier);
    const primary = ordered[0];
    const combinedText = buildCombinedText(ordered.map((c) => c.intent.text), DISPLAY_LABEL_MAX_LENGTH);
    // The rendered chart text stays within the short display budget, but the
    // audit-trail `diagnostic` combines every merged item's FULL diagnostic
    // sentence (unbounded, ' | '-joined) -- nothing is lost to the merge,
    // even an item too long to fit in the on-chart combined label.
    const combinedDiagnostic = ordered.map((c) => c.diagnostic ?? c.intent.text).filter(Boolean).join(' | ');
    merged.push({ ...primary, intent: { ...primary.intent, text: combinedText }, diagnostic: combinedDiagnostic, merged_from_roles: ordered.map((c) => c.role) });
    for (const c of ordered.slice(1)) rest.push({ ...c, included: false, reason_excluded: `MERGED_INTO_${primary.role}_SAME_PRICE` });
  }

  return [...rest, ...merged];
}

// ── Clutter budget: priority-ordered suppression, never a raw sum of
// category maxima. Groups a line/rectangle with its own decoupled label
// companion (same `pairKey`) into ONE accounting unit, so the budget can
// never keep a label without its host geometry or vice versa -- MAX_TOTAL
// bounds the number of distinct PIECES OF INFORMATION on the chart, not
// the raw number of draw calls that happen to render them. ──
function applyClutterBudget(candidates) {
  const included = candidates.filter((c) => c.included);
  const groups = new Map();
  for (const c of included) {
    const key = c.pairKey ?? c.role;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const groupList = [...groups.values()];
  groupList.sort((a, b) => Math.min(...a.map((c) => c.tier)) - Math.min(...b.map((c) => c.tier))); // stable: tier 1 first, original order preserved within a tier
  const keptGroups = groupList.slice(0, CLUTTER_BUDGET.MAX_TOTAL);
  const suppressedGroups = groupList.slice(CLUTTER_BUDGET.MAX_TOTAL);
  return { kept: keptGroups.flat(), suppressedByBudget: suppressedGroups.flat() };
}

// ── Range / equilibrium (max 3, lowest priority, mission item 7-8):
// derived ONLY from structure.js's own already-computed rangeHigh/rangeLow
// -- equilibrium is the plain arithmetic midpoint of those two REAL,
// objective bounds, never a new premium/discount strategy or threshold.
function buildRangeCandidates({ evidence, symbol, timeframe, time }) {
  const out = [];
  const high = evidence?.structure?.rangeHigh;
  const low = evidence?.structure?.rangeLow;
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) {
    skip(out, { role: 'range_high', category: 'range', tier: TIER.RANGE, reason: 'NO_OBJECTIVE_RANGE' });
    skip(out, { role: 'range_low', category: 'range', tier: TIER.RANGE, reason: 'NO_OBJECTIVE_RANGE' });
    skip(out, { role: 'range_equilibrium', category: 'range', tier: TIER.RANGE, reason: 'NO_OBJECTIVE_RANGE' });
    return out;
  }
  addCandidate(out, { role: 'range_high', category: 'range', tier: TIER.RANGE, intent: buildHLine({ role: 'range_high', symbol, timeframe, time, price: high, text: 'RANGE HIGH', overrides: styleFor('range'), source: 'evidence.structure.rangeHigh' }), diagnostic: 'RANGE HIGH' });
  addCandidate(out, { role: 'range_low', category: 'range', tier: TIER.RANGE, intent: buildHLine({ role: 'range_low', symbol, timeframe, time, price: low, text: 'RANGE LOW', overrides: styleFor('range'), source: 'evidence.structure.rangeLow' }), diagnostic: 'RANGE LOW' });
  addCandidate(out, { role: 'range_equilibrium', category: 'range', tier: TIER.RANGE, intent: buildHLine({ role: 'range_equilibrium', symbol, timeframe, time, price: round2((high + low) / 2), text: 'EQUILIBRIUM', overrides: styleFor('range'), source: 'evidence.structure.rangeHigh/rangeLow midpoint' }), diagnostic: 'EQUILIBRIUM' });
  return out;
}

// ── Decoupled labels (label-readability hardening): TradingView renders a
// horizontal_line/rectangle's OWN `text` pinned exactly at that shape's
// price/edge -- there is no override that lets the label float away from
// the line while the line stays put. That is precisely why dense,
// near-(but not exactly)-identical-price levels near the current price
// (e.g. a real resistance at 4351.37 and a real breakout/liquidity level
// at 4352.10) rendered with visually crowded/overlapping labels even
// though mergeCoincidentLevels() and applyLabelLanes() already existed:
// neither one can help a label that is welded to its own line's exact
// price. `splitLineLabels()` gives every line/rectangle's label a genuine,
// independently-positionable `text` companion (role `<role>__LABEL_SUFFIX`,
// same tier, linked back via `pairKey`) so the ALREADY-DETERMINISTIC
// applyLabelLanes() pass below can space out ANY combination of labels --
// line-derived or scenario-text -- without ever moving the line/rectangle
// itself (mission item 1/11A, unconditionally preserved: the split line
// keeps its EXACT original point/point2, only `text` becomes null).
//
// Confirmed trade geometry (`category: 'trade'`) is deliberately EXCLUDED
// from splitting -- its label stays welded to its own protected price,
// exactly as before, per the protected-decision-geometry rule (mission
// item 8: trade info is highest priority and never displaced). `rectangle`
// primitives are ALSO excluded: a zone rectangle is large and distinctly
// colored/filled, so its own inline label reads as clearly "belonging to"
// the shape without the same precise-pixel collision risk a thin single-
// price line has -- only `horizontal_line` labels are welded to a single
// exact Y-coordinate, which is the actual source of the reported crowding.
//
// Runs AFTER mergeCoincidentLevels() (see both call sites below), not
// before -- a genuinely multi-role merged combined label lands on a normal
// horizontal_line candidate exactly like any single-role one, so it goes
// through this SAME decoupling rather than staying welded to the line's
// own TradingView-positioned (not `point.time`-controlled) inline text,
// which is what the short-display-label upgrade needs to actually keep a
// combined label off the candles (mission: "no long horizontal spans").
const LABEL_SUFFIX = '__label';

function splitLineLabels(candidates) {
  const out = [];
  for (const c of candidates) {
    if (!c.included || c.category === 'trade' || c.intent.primitive !== 'horizontal_line' || !c.intent.text) {
      out.push({ ...c, pairKey: c.pairKey ?? c.role });
      continue;
    }
    out.push({ ...c, pairKey: c.role, intent: { ...c.intent, text: null } });
    const labelIntent = makeDrawingIntent({
      role: `${c.role}${LABEL_SUFFIX}`, primitive: 'text', point: { time: c.intent.point.time, price: c.intent.point.price },
      text: c.intent.text, overrides: c.intent.overrides, source: c.intent.source, symbol: c.intent.symbol, timeframe: c.intent.timeframe,
    });
    if (labelIntent) out.push({ role: `${c.role}${LABEL_SUFFIX}`, category: c.category, tier: c.tier, pairKey: c.role, included: true, intent: labelIntent, diagnostic: c.diagnostic ?? null });
  }
  return out;
}

// ── Label lanes (mission item 11A/11B): deterministic, ATR-based vertical
// separation for `text`-primitive intents ONLY. NEVER touches a
// horizontal_line/rectangle's own point/point2 -- a line's analytical
// price and a zone's analytical bounds are never altered by this pass,
// exactly per mission item 11A. Runs AFTER the clutter budget, over the
// final KEPT set only. Deterministic and idempotent: the same kept set
// (same roles, same prices, same ATR) always produces the identical lane
// assignment -- sorted by presentation priority (tier) then role name,
// never by insertion order or anything non-reproducible, and the search
// pattern below is a fixed, non-random sequence.
function displayPricesOf(intent) {
  return intent.point2 ? [intent.point.price, intent.point2.price] : [intent.point.price];
}

/** Counts distinct PIECES OF INFORMATION (a line/rectangle + its own decoupled label companion count as ONE), not raw draw calls -- this is what CLUTTER_BUDGET.MAX_TOTAL actually bounds. */
function countGroups(candidates) {
  return new Set(candidates.map((c) => c.pairKey ?? c.role)).size;
}

function applyLabelLanes(keptCandidates, { atrValue } = {}) {
  const unit = Number.isFinite(atrValue) && atrValue > 0 ? atrValue : null;
  if (!unit) return keptCandidates; // no objective spacing unit available -- never guess one

  // Each occupied position is tagged with the pairKey it belongs to so a
  // label is never considered to "collide" with its OWN host line/
  // rectangle -- that is its intended starting position, not an obstacle.
  const occupied = keptCandidates
    .filter((c) => c.intent.primitive !== 'text')
    .flatMap((c) => displayPricesOf(c.intent).map((price) => ({ price, pairKey: c.pairKey ?? c.role })));
  const textCandidates = keptCandidates
    .filter((c) => c.intent.primitive === 'text')
    .sort((a, b) => a.tier - b.tier || a.role.localeCompare(b.role));

  const placed = [...occupied];
  for (const c of textCandidates) {
    const ownKey = c.pairKey ?? c.role;
    let price = c.intent.point.price;
    for (let lane = 0; lane < LABEL_LANE_MAX_ATTEMPTS; lane++) {
      const collides = placed.some((p) => p.pairKey !== ownKey && Math.abs(p.price - price) < LABEL_COLLISION_ATR_MULTIPLE * unit);
      if (!collides) break;
      const direction = lane % 2 === 0 ? 1 : -1;
      const step = Math.ceil((lane + 1) / 2);
      price = round2(c.intent.point.price + direction * step * LABEL_LANE_STEP_ATR_MULTIPLE * unit);
    }
    c.intent = { ...c.intent, point: { ...c.intent.point, price } };
    placed.push({ price, pairKey: ownKey });
  }
  return keptCandidates;
}

// ── Stage 6, Part 7-15: ACTIVE CHART TIMEFRAME (never the decision
// timeframe) local visualization. Reuses the SAME per-category builders
// above verbatim (they already take generic {symbol, timeframe, time},
// never hardcoded to the 15m decision timeframe) -- never a second,
// divergent implementation of structure/SR/supply-demand/liquidity/
// pattern/breakout mapping.
//
// Deliberately OMITS buildTradeCandidates/buildPrimaryCandidates/
// buildAlternateCandidates: confirmed trade geometry and anticipation
// scenarios are inherently DECISION-TIMEFRAME concepts (the protected
// engine only ever runs on 5m/15m/30m entry timeframes) -- drawing them
// at an arbitrary active chart timeframe (e.g. the user viewing a 1D
// chart) would misrepresent geometry that was never computed for that
// timeframe. This function draws only what genuinely IS computed
// per-timeframe: TF-local structure/levels/patterns/liquidity/breakout,
// from `src/core/xauusd_analyze_market.js`'s exported `computeEvidence()`
// re-run on the active chart TF's OWN bars.
//
// ROLE NAMESPACE: every role is prefixed with CHART_LOCAL_ROLE_PREFIX.
// Required because the drawing registry (src/engine/drawingRegistry.js)
// keys ownership as (symbol, timeframe, role) -- when the active chart
// TF happens to equal the decision TF (e.g. user is looking at the same
// 15m chart the decision itself uses), an UNPREFIXED 'structure_primary'
// role here would collide with the decision-TF's OWN 'structure_primary'
// entry in the SAME registry scope, silently overwriting one owner's
// drawing with the other's. The prefix makes every chart-local role
// distinct from every decision-TF role, in EVERY case, not just the
// common (different-timeframe) one.
export const CHART_LOCAL_ROLE_PREFIX = 'chart_';

function namespaceCandidates(candidates, prefix) {
  return candidates.map((c) => ({
    ...c,
    role: `${prefix}${c.role}`,
    intent: c.intent ? { ...c.intent, role: `${prefix}${c.role}` } : c.intent,
  }));
}

/**
 * Maps an ALREADY-COMPUTED TF-local evidence object (the active chart
 * timeframe's own computeEvidence() output -- see
 * src/core/xauusd_chart_context.js) into the SAME validated,
 * budget-limited Stage 4 drawing-intent array shape as
 * buildMarketVisualizationIntents() above. No decision, no anticipation,
 * no trade geometry -- purely descriptive TF-local market structure for
 * whatever timeframe the user's chart is actually showing.
 */
export function buildChartLocalVisualizationIntents({ evidence = null, symbol, timeframe, time } = {}) {
  if (!symbol || !timeframe || !Number.isFinite(time)) {
    return { intents: [], candidates: [], summary: { total_candidates: 0, total_included: 0, total_suppressed: 0, symbol: symbol ?? null, timeframe: timeframe ?? null, reason: 'NO_OBJECTIVE_ANCHOR_TIME_AVAILABLE' } };
  }

  const rawCandidates = [
    ...buildStructureCandidates({ evidence, symbol, timeframe, time }),
    ...buildSRCandidates({ evidence, symbol, timeframe, time }),
    ...buildSupplyDemandCandidates({ evidence, symbol, timeframe, time }),
    ...buildBreakoutCandidates({ anticipation: null, evidence, symbol, timeframe, time }),
    ...buildPatternCandidates({ evidence, symbol, timeframe }),
    ...buildLiquidityCandidates({ evidence, symbol, timeframe, time }),
    // Parity with buildDecisionAnalyticsIntents()'s own category set (clean
    // chart presentation upgrade) -- range/equilibrium is an objective,
    // already-concise level exactly like the others above.
    ...buildRangeCandidates({ evidence, symbol, timeframe, time }),
  ];

  const namespaced = namespaceCandidates(rawCandidates, CHART_LOCAL_ROLE_PREFIX);
  // Merge BEFORE split (see buildMarketVisualizationIntents() below for why):
  // this lets a genuinely multi-role merged label flow through the SAME
  // decoupling mechanism a single line's label already gets, instead of
  // staying welded to a horizontal_line's own TradingView-positioned text.
  const mergedRaw = mergeCoincidentLevels(namespaced);
  const merged = splitLineLabels(mergedRaw);
  const { kept, suppressedByBudget } = applyClutterBudget(merged);
  for (const c of suppressedByBudget) c.reason_excluded_by_budget = true;
  applyLabelLanes(kept, { atrValue: evidence?.volatilityContext?.atrValue });

  return {
    intents: kept.map((c) => c.intent),
    candidates: merged,
    summary: { total_candidates: countGroups(merged), total_included: countGroups(kept), total_suppressed: countGroups(merged) - countGroups(kept), symbol, timeframe },
  };
}

// ── Pre-Entry Opportunity Planner (Section 33-34): candidate/provisional
// geometry ONLY, at TIER.CANDIDATE_ENTRY (this IS the primary scenario's
// own enrichment -- see src/engine/opportunityPlanner.js). Deliberately
// only 2 roles (never candidate_tp1/tp2, which usually coincide with the
// SAME nearest-S/R/structural-objective levels
// buildSRCandidates()/buildStructureCandidates() already draw -- letting
// mergeCoincidentLevels() combine them, rather than a third/fourth
// separate line, keeps this from turning the chart into a diagnostic
// dashboard). Every label is explicitly prefixed CANDIDATE/PROVISIONAL/
// PLAN -- structurally distinct from `trade_entry`/`trade_sl`'s bare
// "ENTRY"/"SL" text, never confusable with confirmed trade geometry.
//
// Label is truthfully state-aware (mission item 9): a blocked plan with a
// known direction reads "BUY/SELL PLAN — BLOCKED (<reason>)"; otherwise
// "CANDIDATE ENTRY — <opportunity_state>" -- both derived VERBATIM from
// plan.blocking_conditions[0]/plan.opportunity_state, never invented.
//
// Rendered as a translucent rectangle (same real bar-time-span mechanism
// as buildSupplyDemandCandidates()) ONLY when the selected zone is
// objectively traceable back to a real Supply/Demand zone entry (matched
// by rounded bounds+direction against evidence.levelsContext.
// supplyDemandZones, which is the one zone source carrying a real
// origin_bar_index) AND a real bars array is available -- otherwise falls
// back to the original single-edge horizontal_line (byte-identical to the
// pre-upgrade behavior for a zero-width S/R/structural/liquidity-sourced
// zone, which has no genuine area to shade in the first place).
function findOriginZone({ plan, evidence }) {
  if (!plan?.zone || plan.zone.source !== 'levels.js supplyDemandZones') return null;
  const zones = evidence?.levelsContext?.supplyDemandZones ?? [];
  const wantDirection = plan.direction === 'BEARISH' ? 'supply' : 'demand';
  return zones.find((z) => z.direction === wantDirection && round2(z.zone_low) === plan.zone.lower && round2(z.zone_high) === plan.zone.upper) ?? null;
}

/** Short chart label: "<BUY|SELL> WATCH" (+ "• BLOCKED"/"• CONFIRMATION"/etc. when more specific than bare "developing"). Numeric zone bounds are deliberately omitted here -- the rectangle/line's own position already shows them; see planStateDiagnostic() for the full sentence. */
function planStateLabel(plan) {
  return shortWatchLabel(plan.direction, plan.blocking_conditions?.length ? 'BLOCKED' : shortStateWord(plan.opportunity_state));
}

function planStateDiagnostic(plan) {
  const dirWord = plan.direction === 'BEARISH' ? 'SELL' : 'BUY';
  if (plan.blocking_conditions?.length) return `${dirWord} PLAN — BLOCKED (${plan.blocking_conditions[0]})`;
  if (plan.opportunity_state) return `CANDIDATE ENTRY — ${plan.opportunity_state}`;
  return 'CANDIDATE ENTRY';
}

function buildPlanCandidates({ plan, evidence, symbol, timeframe, time, primaryBars }) {
  const out = [];
  if (!plan || plan.status !== 'PLAN') {
    const reason = plan?.status === 'SUPERSEDED_BY_CONFIRMED_TRADE' ? 'DECISION_CONFIRMED_NO_PRE_ENTRY_SCENARIO' : 'NO_OBJECTIVE_PLAN';
    skip(out, { role: 'plan_candidate_zone', category: 'primary', tier: TIER.CANDIDATE_ENTRY, reason });
    skip(out, { role: 'plan_provisional_invalidation', category: 'primary', tier: TIER.CANDIDATE_ENTRY, reason });
    return out;
  }

  const zone = plan.candidate_entry_zone;
  const label = planStateLabel(plan);
  if (zone && Number.isFinite(zone.lower) && Number.isFinite(zone.upper)) {
    const originZone = zone.lower !== zone.upper ? findOriginZone({ plan, evidence }) : null;
    const span = originZone ? resolveZoneRectangleSpan({ originBarIndex: originZone.origin_bar_index, primaryBars }) : null;
    const diagnostic = `${planStateDiagnostic(plan)} ${zone.lower === zone.upper ? round2(zone.lower) : `${round2(zone.lower)}-${round2(zone.upper)}`}`;

    if (span) {
      addCandidate(out, {
        role: 'plan_candidate_zone', category: 'primary', tier: TIER.CANDIDATE_ENTRY,
        intent: makeDrawingIntent({
          role: 'plan_candidate_zone', primitive: 'rectangle',
          point: { time: span.startTime, price: round2(zone.lower) },
          point2: { time: span.endTime, price: round2(zone.upper) },
          text: label,
          overrides: zoneStyleFor(plan.direction === 'BEARISH' ? 'supply' : 'demand', { current: true }),
          source: 'opportunityPlanner.js candidate_entry_zone', symbol, timeframe,
        }),
        diagnostic,
      });
    } else {
      const nearEdge = plan.direction === 'BEARISH' ? zone.lower : zone.upper;
      addCandidate(out, { role: 'plan_candidate_zone', category: 'primary', tier: TIER.CANDIDATE_ENTRY, intent: buildHLine({ role: 'plan_candidate_zone', symbol, timeframe, time, price: nearEdge, text: label, overrides: styleFor('primary', plan.direction), source: 'opportunityPlanner.js candidate_entry_zone' }), diagnostic });
    }
  } else skip(out, { role: 'plan_candidate_zone', category: 'primary', tier: TIER.CANDIDATE_ENTRY, reason: 'NO_OBJECTIVE_ZONE' });

  if (plan.provisional_invalidation && Number.isFinite(plan.provisional_invalidation.level)) {
    addCandidate(out, { role: 'plan_provisional_invalidation', category: 'primary', tier: TIER.CANDIDATE_ENTRY, intent: buildHLine({ role: 'plan_provisional_invalidation', symbol, timeframe, time, price: plan.provisional_invalidation.level, text: 'INVALIDATION', overrides: styleFor('primary_invalidation'), source: 'opportunityPlanner.js provisional_invalidation' }), diagnostic: 'PROVISIONAL INVALIDATION (not SL)' });
  } else skip(out, { role: 'plan_provisional_invalidation', category: 'primary', tier: TIER.CANDIDATE_ENTRY, reason: 'NO_OBJECTIVE_INVALIDATION' });

  return out;
}

/**
 * Maps already-computed decision/evidence/anticipation/pre_entry_plan
 * (+ optional confluence, accepted for interface stability -- not
 * currently read, see module header) into a validated, budget-limited
 * array of Stage 4 drawing intents, ready for src/core/xauusd_visualize.js.
 *
 * Returns { intents, candidates, summary } -- `candidates` is the full
 * audit trail (every role considered, included or not, and why), useful
 * for a dry-run report; `intents` is the pure Stage 4 schema array.
 */
export function buildMarketVisualizationIntents({ decision, evidence = null, anticipation = null, confluence = null, plan = null, primaryBars = null } = {}) {
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
    ...buildPlanCandidates({ plan, evidence, symbol, timeframe, time, primaryBars }),
    ...buildStructureCandidates({ evidence, symbol, timeframe, time }),
    ...buildSRCandidates({ evidence, symbol, timeframe, time }),
    ...buildSupplyDemandCandidates({ evidence, symbol, timeframe, time, primaryBars }),
    ...buildBreakoutCandidates({ anticipation, evidence, symbol, timeframe, time }),
    ...buildPatternCandidates({ evidence, symbol, timeframe }),
    ...buildLiquidityCandidates({ evidence, symbol, timeframe, time }),
    ...buildAlternateCandidates({ anticipation, symbol, timeframe, time }),
    ...buildRangeCandidates({ evidence, symbol, timeframe, time }),
  ];

  // Merge BEFORE split: a horizontal_line's own inline `text` renders at a
  // position TradingView controls, not `point.time` -- fine for a SHORT
  // single-role label, but a genuinely multi-role merged combined label
  // (mission item: "no long horizontal spans through candles") needs the
  // SAME independently lane-positionable treatment a single line's label
  // already gets. Running mergeCoincidentLevels() first means its combined
  // text lands on a normal horizontal_line/rectangle candidate exactly like
  // any single-role one, so splitLineLabels() then decouples it into its
  // own lane-adjustable `__label` text companion, never leaving a long
  // combined string welded to the line's own uncontrollable text slot.
  const mergedRaw = mergeCoincidentLevels(candidates);
  const merged = splitLineLabels(mergedRaw);
  const { kept, suppressedByBudget } = applyClutterBudget(merged);
  for (const c of suppressedByBudget) c.reason_excluded_by_budget = true;
  applyLabelLanes(kept, { atrValue: evidence?.volatilityContext?.atrValue });

  return {
    intents: kept.map((c) => c.intent),
    candidates: merged,
    summary: {
      total_candidates: countGroups(merged),
      total_included: countGroups(kept),
      total_suppressed: countGroups(merged) - countGroups(kept),
      symbol, timeframe,
      decision_action: decision.action,
      anticipation_state: anticipation?.state ?? null,
      opportunity_state: plan?.opportunity_state ?? null,
    },
  };
}

// ── CLEAN CHART PRESENTATION (useful analytics kept, pre-entry/trade
// clutter simplified) ──
// buildMarketVisualizationIntents() above is completely UNCHANGED -- it
// still computes and returns the FULL analytical candidate/intent set
// (structure, S/R, supply/demand, liquidity, patterns, breakout/retest,
// range/equilibrium, alternate scenario, pre-entry plan geometry, all of
// it) exactly as before, in full, via its own `intents`/`candidates`/
// `summary`. Nothing about that computation is removed or weakened.
//
// What actually reaches TradingView is assembled from TWO separate,
// additive pieces an orchestrator combines:
//
//   1. buildDecisionAnalyticsIntents() below -- the genuinely USEFUL
//      market-context categories (structure, S/R, supply/demand,
//      liquidity, breakout/retest, classical patterns, range/equilibrium)
//      run through their OWN independent merge/split/clutter-budget/label-
//      lane pass, exactly mirroring buildChartLocalVisualizationIntents()'s
//      already-established pattern (same category builders, same pipeline
//      stages) -- just for the DECISION timeframe instead of the active
//      chart TF. Deliberately a SEPARATE pipeline run rather than filtering
//      the full buildMarketVisualizationIntents() output post-hoc: that
//      output's merge step can fold an analytical role (e.g.
//      structure_primary) into a same-price primary/alternate role's
//      combined label (see mergeCoincidentLevels()'s own doc comment) --
//      filtering afterward by role name would silently lose that analytical
//      content whenever it happens to get absorbed into a role this module
//      simplifies away below. Running analytics through their own isolated
//      merge pool makes that structurally impossible: only these seven
//      categories ever compete for each other's merge slots.
//
//   2. buildSignalOnlyIntents() below -- the trader-facing signal/status
//      display, driven by the persisted signal-store OPEN/PASS/FAIL
//      lifecycle (src/engine/signalStore.js), never by the CURRENT cycle's
//      bare decision.action alone (that was the proven lifecycle defect:
//      decision.action is a stateless per-bar re-evaluation, so a confirmed
//      trade's action almost always reverts to WAIT the very next bar even
//      while the underlying signal is still genuinely open). The caller
//      passes `openSignal` -- the most-recent OPEN record from the SAME
//      persisted store calculateEntry() itself writes to, for this exact
//      (symbol, timeframe), or null:
//        - `openSignal` present (covers BOTH "just confirmed this very bar"
//          -- calculateEntry() registers it into the store synchronously
//          before visualization ever runs -- AND "still open from a past
//          bar"): the exact trade_entry/trade_sl/trade_tp1/trade_tp2 lines
//          PLUS one compact multi-line "<SIDE>\nEntry ..\nSL ..\nTP1 ..\n
//          TP2 ..\nRR .." card, both built strictly from the store record's
//          own entry/stop_loss/tp1/tp2/rr fields -- which are themselves
//          verbatim decision.entry/sl/tp1/tp2/rr from the ORIGINAL confirming
//          cycle (see signalStore.js's registerOrGetSignal(), called inline
//          from xauusd_calculate.js's calculateEntry()) -- never
//          recomputed, never a candidate/provisional value.
//        - `openSignal` absent: a compact "XAUUSD\n<DIR> WATCH\n<state>"
//          status box when anticipation.primary_scenario objectively exists
//          on a WAIT cycle, or "XAUUSD\nWAIT\nNo Opportunity" otherwise --
//          always exactly one small box, so the trader-facing display is
//          never simply blank.
//      These two cases are mutually exclusive (an early return on the
//      openSignal branch), so a WATCH/WAIT box and confirmed trade geometry
//      can never both appear at once. Never reads plan_candidate_zone/
//      provisional_invalidation/candidate_tp1/candidate_tp2 -- candidate/
//      provisional geometry can therefore never leak into this set,
//      structurally, exactly like the full pipeline above.
//
//   3. buildHistoricalSignalIntents() below -- concise markers for
//      genuinely-persisted TERMINAL (PASS/FAIL) signal-store records only,
//      at their real signal_bar_time/entry -- never the currently-OPEN one
//      (already shown live via #2 above, never duplicated here), never a
//      candidate/observed-only record, never reconstructed from hindsight.
//      Capped at HISTORY_MAX_SIGNALS most-recent-first, per (symbol,
//      timeframe), each its own registry-tracked role so the existing
//      stale-cleanup reconciliation ages older ones out automatically as
//      newer ones push past the cap -- no separate cleanup code needed.
function buildDecisionAnalyticsIntents({ decision, evidence = null, primaryBars = null } = {}) {
  if (!decision) return { intents: [], candidates: [] };
  const symbol = decision.symbol ?? null;
  const timeframe = decision.diagnostics?.source_timeframe ?? null;
  const time = timeframe ? (decision.market_data_times?.[timeframe] ?? decision.timeframes?.[timeframe]?.last_confirmed_bar_time ?? null) : null;
  if (!symbol || !timeframe || !Number.isFinite(time)) return { intents: [], candidates: [] };

  // Same category set, same call signatures buildChartLocalVisualizationIntents()
  // already uses (anticipation: null for buildBreakoutCandidates -- its
  // isFailedLike/INVALIDATED branch only, harmless when absent, exactly as
  // that already-established call site relies on) -- never trade/primary/
  // alternate/plan, which are decision- and anticipation-specific concepts
  // handled entirely separately by buildSignalOnlyIntents() below.
  const rawCandidates = [
    ...buildStructureCandidates({ evidence, symbol, timeframe, time }),
    ...buildSRCandidates({ evidence, symbol, timeframe, time }),
    ...buildSupplyDemandCandidates({ evidence, symbol, timeframe, time, primaryBars }),
    ...buildBreakoutCandidates({ anticipation: null, evidence, symbol, timeframe, time }),
    ...buildPatternCandidates({ evidence, symbol, timeframe }),
    ...buildLiquidityCandidates({ evidence, symbol, timeframe, time }),
    ...buildRangeCandidates({ evidence, symbol, timeframe, time }),
  ];

  const mergedRaw = mergeCoincidentLevels(rawCandidates);
  const merged = splitLineLabels(mergedRaw);
  const { kept, suppressedByBudget } = applyClutterBudget(merged);
  for (const c of suppressedByBudget) c.reason_excluded_by_budget = true;
  applyLabelLanes(kept, { atrValue: evidence?.volatilityContext?.atrValue });

  return { intents: kept.map((c) => c.intent), candidates: merged };
}

/**
 * Assembles the FINAL set of intents an orchestrator actually sends to
 * TradingView: useful analytics (buildDecisionAnalyticsIntents(), own
 * merge/budget pool), the current signal/status box or confirmed trade card
 * (buildSignalOnlyIntents()), and concise historical markers
 * (buildHistoricalSignalIntents()). Three independent pipelines,
 * concatenated -- never cross-contaminating each other's clutter budget or
 * merge pool.
 */
export function buildPresentationIntents({
  decision, evidence = null, anticipation = null, candidates = [], primaryBars = null,
  openSignal = null, historicalSignals = [], symbol, timeframe,
} = {}) {
  const analytics = buildDecisionAnalyticsIntents({ decision, evidence, primaryBars });
  const signal = buildSignalOnlyIntents({ decision, evidence, anticipation, openSignal, symbol, timeframe });
  const history = buildHistoricalSignalIntents({ historicalSignals, symbol, timeframe });
  return [...analytics.intents, ...signal, ...history];
}

/** "CONFIRMATION_PENDING" -> "Confirmation Pending". Presentation-only; never alters the underlying constant. */
function humanizeStateWords(state) {
  return String(state ?? '').toLowerCase().split('_').map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}

/**
 * "<SIDE> ACTIVE" is deliberate wording (signal lifecycle audit): this
 * engine's entry is a market fill at the confirming bar's own close (see
 * risk.js's `entry = bars[i].close`), never a pending/limit level -- so a
 * persisted OPEN record is ALREADY an active, already-filled trade, never
 * a "pending entry" recommendation. "TP1 HIT / TP2 Pending" is shown once
 * `openSignal.tp1_hit` is true (see signalStore.js's resolveOpenSignals())
 * -- purely additive, never affects PASS/FAIL/terminal status.
 */
function confirmedCardText(openSignal) {
  const rr = Number.isFinite(openSignal.rr) ? round2(openSignal.rr) : 'NA';
  const lines = [`${openSignal.side} ACTIVE`];
  if (openSignal.tp1_hit) lines.push('TP1 HIT', 'TP2 Pending');
  lines.push(
    `Entry ${round2(openSignal.entry)}`,
    `SL ${round2(openSignal.stop_loss)}`,
    `TP1 ${round2(openSignal.tp1)}`,
    `TP2 ${round2(openSignal.tp2)}`,
    `RR ${rr}`,
  );
  return lines.join('\n');
}

export function buildSignalOnlyIntents({ decision, evidence = null, anticipation = null, openSignal = null, symbol, timeframe } = {}) {
  if (!decision) return [];

  // Same real, already-computed anchor-time formula buildMarketVisualizationIntents()
  // itself uses -- never a fabricated/wall-clock time. `timeframe` here is the
  // caller-supplied decision timeframe (summary.timeframe), so this is not a
  // second independent derivation, just avoiding threading `time` through the
  // orchestrator boundary separately from `decision`.
  const time = timeframe ? (decision.market_data_times?.[timeframe] ?? decision.timeframes?.[timeframe]?.last_confirmed_bar_time ?? null) : null;
  if (!Number.isFinite(time)) return [];

  // OPEN-signal persistence fix: authority is the persisted signal-store
  // lifecycle, never the current cycle's bare decision.action -- see this
  // section's own doc comment above for why.
  if (openSignal) {
    const out = [];
    const fields = [
      ['trade_entry', openSignal.entry, 'ENTRY'],
      ['trade_sl', openSignal.stop_loss, 'SL'],
      ['trade_tp1', openSignal.tp1, 'TP1'],
      ['trade_tp2', openSignal.tp2, 'TP2'],
    ];
    for (const [role, value, label] of fields) {
      if (Number.isFinite(value)) {
        const intent = buildHLine({
          role, symbol, timeframe, time, price: value, text: `${label} ${round2(value)}`,
          overrides: styleFor('trade', openSignal.side), source: 'signalStore OPEN record (verbatim protected decision geometry)',
        });
        if (intent) out.push(intent);
      }
    }
    if (Number.isFinite(openSignal.entry)) {
      const cardIntent = buildText({
        role: 'trade_card', symbol, timeframe, time, price: openSignal.entry, text: confirmedCardText(openSignal),
        overrides: styleFor('trade', openSignal.side), source: 'signalStore OPEN record',
      });
      if (cardIntent) out.push(cardIntent);
    }
    return out;
  }

  const scenario = decision.action === 'WAIT' ? anticipation?.primary_scenario : null;
  const currentPrice = evidence?.sessionContext?.current?.last_close;
  const anchorPrice = scenario?.location?.price ?? currentPrice;
  if (!Number.isFinite(anchorPrice)) return [];

  const text = scenario?.direction
    ? `XAUUSD\n${shortDirectionWord(scenario.direction)} WATCH\n${humanizeStateWords(anticipation?.state)}`
    : 'XAUUSD\nWAIT\nNo Opportunity';
  const boxIntent = buildText({
    role: 'status_box', symbol, timeframe, time, price: anchorPrice, text,
    overrides: styleFor(scenario ? 'primary' : 'default', scenario?.direction),
    source: scenario ? 'anticipation.primary_scenario' : 'decision.action (no objective opportunity)',
  });
  return boxIntent ? [boxIntent] : [];
}

const HISTORY_MAX_SIGNALS = 10;

/** PASS = objectively reached tp2 (the store's own resolution target -- see signalStore.js's resolveOpenSignals(), TP1 alone is never terminal); FAIL = objectively hit stop_loss. Never any other outcome word, never inferred. */
function historicalOutcomeSuffix(record) {
  if (record.status === 'PASS') return '✓ TP2';
  if (record.status === 'FAIL') return '✕ SL';
  return '';
}

/**
 * Concise historical markers for genuinely-persisted TERMINAL signal-store
 * records only -- see this section's own doc comment above (item 3) for the
 * full contract. Pure function: `historicalSignals` is whatever the caller
 * already read from signalStore.js's loadStore() (this module never opens
 * a file itself, per its own PURE/NO-I/O module header).
 */
export function buildHistoricalSignalIntents({ historicalSignals = [], symbol, timeframe } = {}) {
  if (!symbol || !timeframe) return [];
  const terminal = historicalSignals.filter((r) => r.symbol === symbol && r.timeframe === timeframe && (r.status === 'PASS' || r.status === 'FAIL'));
  const recent = terminal.slice().sort((a, b) => b.signal_bar_time - a.signal_bar_time).slice(0, HISTORY_MAX_SIGNALS);

  const out = [];
  for (const record of recent) {
    if (!Number.isFinite(record.signal_bar_time) || !Number.isFinite(record.entry)) continue;
    const text = `${record.side} ${round2(record.entry)} ${historicalOutcomeSuffix(record)}`.trim();
    const intent = buildText({
      role: `history_${record.signal_id}`, symbol, timeframe, time: record.signal_bar_time, price: record.entry, text,
      overrides: styleFor('trade', record.side), source: 'signalStore terminal (PASS/FAIL) record -- genuine persisted history only',
    });
    if (intent) out.push(intent);
  }
  return out;
}
