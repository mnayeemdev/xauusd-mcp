/**
 * V8 CORE PATTERN EXECUTION AUDIT -- minimal correction definitions (RESEARCH ONLY, never applied to src/).
 * Each correction is a list of exact text replacements against the PRODUCTION file; build_engines.mjs asserts that every
 * `old` string occurs exactly once, applies the edits to research copies under engines/<variant>/ and emits unified diffs.
 */
export const CORRECTIONS = [
  {
    id: 'D1', title: 'STRUCTURE_EVENT_CHRONOLOGY', category: 'PATTERN', file: 'engine/structure.js',
    edits: [{
      old: `  for (const piv of allPivotsSorted) {
    const confirmedAt = piv.index + right;
    for (let j = confirmedAt + 1; j < bars.length; j++) {
      if (piv.type === 'high' && bars[j].close > piv.price) {
        const isContinuation = structureDirection === 'BULLISH';
        lastEvent = { type: isContinuation ? 'BOS' : (structureDirection === null ? 'BOS' : 'CHOCH'), direction: 'BULLISH', bar: j, level: piv.price, pivotIndex: piv.index };
        structureDirection = 'BULLISH';
        break;
      }
      if (piv.type === 'low' && bars[j].close < piv.price) {
        const isContinuation = structureDirection === 'BEARISH';
        lastEvent = { type: isContinuation ? 'BOS' : (structureDirection === null ? 'BOS' : 'CHOCH'), direction: 'BEARISH', bar: j, level: piv.price, pivotIndex: piv.index };
        structureDirection = 'BEARISH';
        break;
      }
    }
  }`,
      new: `  // V8 D1: find each pivot's FIRST confirmed close-break, then walk the breaks in TIME order (break bar, then pivot
  // index) so the running direction and lastEvent describe the most recent genuine break, not the newest broken pivot.
  const breaks = [];
  for (const piv of allPivotsSorted) {
    const confirmedAt = piv.index + right;
    for (let j = confirmedAt + 1; j < bars.length; j++) {
      if (piv.type === 'high' && bars[j].close > piv.price) { breaks.push({ j, piv, direction: 'BULLISH' }); break; }
      if (piv.type === 'low' && bars[j].close < piv.price) { breaks.push({ j, piv, direction: 'BEARISH' }); break; }
    }
  }
  breaks.sort((a, b) => a.j - b.j || a.piv.index - b.piv.index);
  for (const { j, piv, direction } of breaks) {
    const isContinuation = structureDirection === direction;
    lastEvent = { type: isContinuation ? 'BOS' : (structureDirection === null ? 'BOS' : 'CHOCH'), direction, bar: j, level: piv.price, pivotIndex: piv.index };
    structureDirection = direction;
  }`,
    }],
  },
  {
    id: 'D2', title: 'SWEEP_RECENCY', category: 'TRIGGER', file: 'engine/structure.js',
    edits: [{
      old: `  let lastSweep = null;
  for (const piv of [...allPivotsSorted].reverse()) {
    const confirmedAt = piv.index + right;
    for (let j = confirmedAt + 1; j < bars.length; j++) {
      const tol = piv.price * (STRUCTURE_PARAMS.sweepTolerancePct / 100);
      if (piv.type === 'high' && bars[j].high > piv.price + tol && bars[j].close <= piv.price) {
        lastSweep = { type: 'SWEEP_HIGH', bar: j, level: piv.price };
      }
      if (piv.type === 'low' && bars[j].low < piv.price - tol && bars[j].close >= piv.price) {
        lastSweep = { type: 'SWEEP_LOW', bar: j, level: piv.price };
      }
    }
    if (lastSweep) break;
  }`,
      new: `  // V8 D2: the MOST RECENT sweep event in time (largest bar; ties -> the more recent pivot), not the last sweep of the
  // newest pivot that was ever swept. The per-bar sweep definition itself is unchanged.
  let lastSweep = null;
  let lastSweepPivot = -1;
  for (const piv of allPivotsSorted) {
    const confirmedAt = piv.index + right;
    for (let j = confirmedAt + 1; j < bars.length; j++) {
      const tol = piv.price * (STRUCTURE_PARAMS.sweepTolerancePct / 100);
      let ev = null;
      if (piv.type === 'high' && bars[j].high > piv.price + tol && bars[j].close <= piv.price) ev = { type: 'SWEEP_HIGH', bar: j, level: piv.price };
      if (piv.type === 'low' && bars[j].low < piv.price - tol && bars[j].close >= piv.price) ev = { type: 'SWEEP_LOW', bar: j, level: piv.price };
      if (ev && (!lastSweep || j > lastSweep.bar || (j === lastSweep.bar && piv.index > lastSweepPivot))) { lastSweep = ev; lastSweepPivot = piv.index; }
    }
  }`,
    }],
  },
  {
    id: 'D3', title: 'PULLBACK_DEPTH_MEASURED_AT_CURRENT_CLOSE', category: 'SETUP', file: 'engine/intraday/models5m.js',
    edits: [
      { old: `import { INTRADAY_PARAMS } from './params.js';`, new: `import { INTRADAY_PARAMS } from './params.js';\nimport { atr } from '../math.js';` },
      {
        old: `  if (corr.state !== 'RESOLVED') return null;

  // Freshness: resolution happened when the trend-side run reached N bars.`,
        new: `  // V8 D3: the pullback DEPTH (20-bar extreme -> deepest point AFTER it) must reach pbCorrAtrMultiplier x ATR (checked
  // below). The correction state measured the REMAINING distance at the current close, so a deep pullback with a strong
  // reclaim was never RESOLVED. Resolution (pbResolveConfirmBars closes back on the bias side of EMA20) and freshness
  // are unchanged.

  // Freshness: resolution happened when the trend-side run reached N bars.`,
      },
      {
        old: `  const pullbackExtreme = side === 'BUY' ? Math.min(...pullbackLeg.map((b) => b.low)) : Math.max(...pullbackLeg.map((b) => b.high));
`,
        new: `  const pullbackExtreme = side === 'BUY' ? Math.min(...pullbackLeg.map((b) => b.low)) : Math.max(...pullbackLeg.map((b) => b.high));
  if (extremeIdx >= i) return null;
  const afterExtreme = bars.slice(extremeIdx + 1, i + 1);
  const depth = side === 'BUY' ? bars[extremeIdx].high - Math.min(...afterExtreme.map((b) => b.low)) : Math.max(...afterExtreme.map((b) => b.high)) - bars[extremeIdx].low;
  const atrNow = atr(bars, 14).at(-1);
  if (!(atrNow > 0) || !(depth >= p.pbCorrAtrMultiplier * atrNow)) return null;
`,
      },
      {
        old: "    reason: `5m pullback of ${corr.evidence?.pullbackAtr?.toFixed(2) ?? '?'}x ATR against the ${bias.direction} 15m bias resolved ${barsSinceResolved} bar(s) ago`,",
        new: "    reason: `5m pullback of ${(depth / atrNow).toFixed(2)}x ATR against the ${bias.direction} 15m bias resolved ${barsSinceResolved} bar(s) ago`,",
      },
    ],
  },
  {
    id: 'D4', title: 'MEAN_REVERSION_LOCATION', category: 'LOCATION', file: 'engine/intraday/models5m.js',
    edits: [{
      old: `  const objectiveOverride = rh !== null && rl !== null ? (rh + rl) / 2 : null;
  const sweepBar = bars[sweep.bar];`,
      new: `  const objectiveOverride = rh !== null && rl !== null ? (rh + rl) / 2 : null;
  // V8 D4: MR's own objective is the 15m range midpoint; the entry must lie on the far side of it (SELL above, BUY below).
  // A sweep on the wrong side of the midpoint is not a mean-reversion location and is not traded.
  if (objectiveOverride === null || (side === 'BUY' ? !(objectiveOverride > bars[i].close) : !(objectiveOverride < bars[i].close))) return null;
  const sweepBar = bars[sweep.bar];`,
    }],
  },
  {
    id: 'D5', title: 'RR_GATE_ON_ROUNDED_VALUE', category: 'RR', file: 'engine/intraday/risk5m.js',
    edits: [
      { old: `  const rr = +(Math.abs(tp2 - entry) / risk).toFixed(2);`, new: `  const rrRaw = Math.abs(tp2 - entry) / risk;\n  const rr = +rrRaw.toFixed(2);` },
      { old: `  if (rr < p.minRR) {`, new: `  // V8 D5: gate on the unrounded RR (toFixed(2) rounded 1.695 up to 1.70 and let it through).\n  if (rrRaw < p.minRR - 1e-9) {` },
    ],
  },
  {
    id: 'D6', title: 'STALE_ENTRY_TIMEFRAME_NOT_FAIL_CLOSED', category: 'DATA', file: 'core/xauusd_calculate.js',
    edits: [{
      old: `  if (ENTRY_TIMEFRAMES.some((tf) => split[tf].error)) {`,
      new: `  // V8 D6: a STALE entry-timeframe snapshot (last confirmed bar older than STALE_BAR_MULTIPLE + 1 bar durations) is never
  // substituted for current data: the call fails closed exactly like invalid data, with the exact reason recorded.
  for (const tf of ENTRY_TIMEFRAMES) if (!split[tf].error && split[tf].stale) dataErrors.push(\`\${TF_LABEL[tf]}: stale data (last confirmed bar \${Math.round(split[tf].lastConfirmedAgeSec)}s old)\`);
  if (ENTRY_TIMEFRAMES.some((tf) => split[tf].error || split[tf].stale)) {`,
    }],
  },
];

/** Engine variants replayed by v8_replay.mjs. D6 lives in the live orchestrator; the replay emulates it with the same rule. */
export const VARIANTS = { CONTROL: [], D1: ['D1'], D2: ['D2'], D3: ['D3'], D4: ['D4'], D5: ['D5'], D6: ['D6'], ALL: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] };
export const ENGINE_FILES = ['engine/math.js', 'engine/regime.js', 'engine/structure.js', 'engine/correction.js', 'engine/models.js', 'engine/risk.js', 'engine/quality.js', 'engine/htf.js', 'engine/pipeline.js', 'engine/intraday/params.js', 'engine/intraday/bias.js', 'engine/intraday/models5m.js', 'engine/intraday/risk5m.js', 'engine/intraday/pipeline5m.js'];
