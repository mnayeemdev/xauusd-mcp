/**
 * Deterministic support/resistance level registry + supply/demand zones,
 * built ONLY from confirmed OHLCV bars and an already-computed
 * `computeStructure()` result (../engine/structure.js) -- pivots are
 * REUSED from `structure.pivots`, never recomputed here.
 *
 * No lookahead: a level's `broken`/`role_reversed`/`fresh` state and each
 * supply/demand zone's `state` are derived only from bars at or before the
 * index the caller passed in. A caller wanting the registry "as of" some
 * historical bar i must pass `bars.slice(0, i + 1)` and a `structure`
 * computed from that same prefix.
 */
import { atr } from './math.js';

export const LEVELS_PARAMS = {
  clusterTolerancePct: 0.15,
  freshnessLookbackBars: 20,
  minTouches: 1,
  displacementAtrMult: 1.8,
  mitigationTolerancePct: 0.1,
};

function clusterPivots(pivots, tolerancePct) {
  if (!pivots.length) return [];
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters = [];
  let current = [sorted[0]];
  let currentAvg = sorted[0].price;
  for (let k = 1; k < sorted.length; k++) {
    const p = sorted[k];
    const tol = currentAvg * (tolerancePct / 100);
    if (Math.abs(p.price - currentAvg) <= tol) {
      current.push(p);
      currentAvg = current.reduce((s, x) => s + x.price, 0) / current.length;
    } else {
      clusters.push(current);
      current = [p];
      currentAvg = p.price;
    }
  }
  clusters.push(current);
  return clusters;
}

function buildLevelFromCluster(cluster, bars, params, isHighType, lastIndex) {
  const price = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
  const type = isHighType ? 'resistance' : 'support';
  const touch_count = cluster.length;
  const first_touch_bar_index = Math.min(...cluster.map((p) => p.index));
  const last_touch_bar_index = Math.max(...cluster.map((p) => p.index));

  let broken = false;
  let broken_direction = null;
  let brokenAtIndex = null;
  for (let j = last_touch_bar_index + 1; j < bars.length; j++) {
    if (isHighType && bars[j].close > price) { broken = true; broken_direction = 'up'; brokenAtIndex = j; break; }
    if (!isHighType && bars[j].close < price) { broken = true; broken_direction = 'down'; brokenAtIndex = j; break; }
  }

  let role_reversed = false;
  if (broken) {
    const tol = price * (params.clusterTolerancePct / 100);
    for (let j = brokenAtIndex + 1; j < bars.length; j++) {
      if (broken_direction === 'up' && bars[j].low <= price + tol && bars[j].close > price) { role_reversed = true; break; }
      if (broken_direction === 'down' && bars[j].high >= price - tol && bars[j].close < price) { role_reversed = true; break; }
    }
  }

  const tolTouch = price * (params.clusterTolerancePct / 100);
  let retested = false;
  for (let j = last_touch_bar_index + 1; j < bars.length; j++) {
    if (isHighType && bars[j].high >= price - tolTouch) { retested = true; break; }
    if (!isHighType && bars[j].low <= price + tolTouch) { retested = true; break; }
  }
  const fresh = (lastIndex - last_touch_bar_index) <= params.freshnessLookbackBars && !retested;

  const lastClose = bars[lastIndex].close;
  const distance_from_current = Math.abs(lastClose - price);
  const distance_from_current_pct = lastClose !== 0 ? (distance_from_current / lastClose) * 100 : null;

  return {
    price, type, touch_count, first_touch_bar_index, last_touch_bar_index,
    broken, broken_direction, role_reversed, fresh,
    distance_from_current, distance_from_current_pct,
  };
}

function buildSupplyDemandZones(bars, params) {
  if (!Array.isArray(bars) || bars.length < 15) return [];
  const atrSeries = atr(bars, 14);
  const zones = [];
  for (let j = 0; j < bars.length; j++) {
    const atrVal = atrSeries[j];
    if (atrVal === null) continue;
    const b = bars[j];
    const bodySize = Math.abs(b.close - b.open);
    if (bodySize < params.displacementAtrMult * atrVal) continue;

    const bullish = b.close > b.open;
    // Anchored to the candle's low/high (the wick that produced the
    // displacement) through its own open -- the base the price displaced
    // away from, per the documented zone definition for this module.
    const zone_low = bullish ? b.low : b.open;
    const zone_high = bullish ? b.open : b.high;
    const direction = bullish ? 'demand' : 'supply';
    const mid = (zone_low + zone_high) / 2;
    const tol = mid * (params.mitigationTolerancePct / 100);

    let state = 'FRESH';
    for (let k = j + 1; k < bars.length; k++) {
      const kb = bars[k];
      const intersects = kb.low <= zone_high + tol && kb.high >= zone_low - tol;
      if (!intersects) continue;
      if (direction === 'demand' && kb.close < zone_low - tol) { state = 'INVALIDATED'; break; }
      if (direction === 'supply' && kb.close > zone_high + tol) { state = 'INVALIDATED'; break; }
      state = 'MITIGATED';
    }

    zones.push({ origin_bar_index: j, direction, zone_low, zone_high, state });
  }
  return zones;
}

export function buildLevels(bars, structure, params = LEVELS_PARAMS) {
  const pivots = structure?.pivots;
  if (!Array.isArray(bars) || bars.length === 0 || !Array.isArray(pivots) || pivots.length === 0) {
    return { levels: [], nearestResistance: null, nearestSupport: null, supplyDemandZones: [] };
  }

  const lastIndex = bars.length - 1;
  const highs = pivots.filter((p) => p.type === 'high');
  const lows = pivots.filter((p) => p.type === 'low');

  const levels = [
    ...clusterPivots(highs, params.clusterTolerancePct)
      .filter((c) => c.length >= params.minTouches)
      .map((c) => buildLevelFromCluster(c, bars, params, true, lastIndex)),
    ...clusterPivots(lows, params.clusterTolerancePct)
      .filter((c) => c.length >= params.minTouches)
      .map((c) => buildLevelFromCluster(c, bars, params, false, lastIndex)),
  ];

  const lastClose = bars[lastIndex].close;
  const above = levels.filter((l) => l.price > lastClose).sort((a, b) => a.price - b.price);
  const below = levels.filter((l) => l.price < lastClose).sort((a, b) => b.price - a.price);
  const nearestResistance = above.length ? above[0] : null;
  const nearestSupport = below.length ? below[0] : null;

  const supplyDemandZones = buildSupplyDemandZones(bars, params);

  return { levels, nearestResistance, nearestSupport, supplyDemandZones };
}
