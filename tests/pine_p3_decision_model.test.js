/**
 * Pine P3 decision-engine algorithm proof.
 *
 * There is no Pine execution/bar-replay harness outside TradingView's own
 * runtime, and installing the indicator on a live chart is forbidden for
 * this task. This file is a FAITHFUL JAVASCRIPT TRANSLITERATION of the
 * exact arithmetic and gating logic implemented in
 * pine/XAUUSD_Adaptive_Master.pine's "DECISION ENGINE (P3)" section (same
 * variable roles, same formulas, same gate ordering), executed for real in
 * Node against constructed scenarios. tests/pine_p3_audit.test.js
 * cross-checks that the Pine source's actual expressions match what this
 * model asserts, so the two cannot silently drift apart.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── §4 Regime × model × direction eligibility matrix (ported verbatim) ───
function eligibility(regime) {
  return {
    tcLong: regime === 'BULL_TREND',
    tcShort: regime === 'BEAR_TREND',
    pbLong: regime === 'BULL_TREND',
    pbShort: regime === 'BEAR_TREND',
    boLong: regime === 'BULL_TREND' || regime === 'RANGE' || regime === 'COMPRESSION',
    boShort: regime === 'BEAR_TREND' || regime === 'RANGE' || regime === 'COMPRESSION',
    mrLong: regime === 'RANGE',
    mrShort: regime === 'RANGE',
    srLong: regime === 'BULL_TREND' || regime === 'BEAR_TREND' || regime === 'RANGE',
    srShort: regime === 'BULL_TREND' || regime === 'BEAR_TREND' || regime === 'RANGE',
  };
}

// ── Shared structural-anchor helpers (ported verbatim from f_nearestAbove/Below) ──
function nearestAbove(levels, refPrice) {
  let best = null;
  for (const lvl of levels) if (!lvl.consumed && lvl.price > refPrice && (best === null || lvl.price < best)) best = lvl.price;
  return best;
}
function nearestBelow(levels, refPrice) {
  let best = null;
  for (const lvl of levels) if (!lvl.consumed && lvl.price < refPrice && (best === null || lvl.price > best)) best = lvl.price;
  return best;
}

// ── §18/§19/§20 Logical SL → targets → RR (ported verbatim) ───────────────
function computeSlTpRr({ isLong, entry, anchor, atr, activeHighLevels = [], activeLowLevels = [], opts = {} }) {
  const slAtrBuffer = opts.slAtrBuffer ?? 0.25;
  const slAtrFallback = opts.slAtrFallback ?? 1.5;
  const tp1R = opts.tp1RMultiple ?? 1.0;
  const tp2RDefault = opts.tp2RMultipleDefault ?? 2.0;
  const tp2RCap = opts.tp2RMultipleCap ?? 3.0;

  const slRaw = anchor === null
    ? (isLong ? entry - slAtrFallback * atr : entry + slAtrFallback * atr)
    : (isLong ? anchor - slAtrBuffer * atr : anchor + slAtrBuffer * atr);
  const slGeometryOk = isLong ? slRaw < entry : slRaw > entry;
  if (!slGeometryOk) return { slGeometryOk: false, sl: null, tp1: null, tp2: null, risk: null, rr: null };

  const risk = Math.abs(entry - slRaw);
  const tp1 = isLong ? entry + tp1R * risk : entry - tp1R * risk;
  const objective = isLong ? nearestAbove(activeHighLevels, entry) : nearestBelow(activeLowLevels, entry);
  const tp2Default = isLong ? entry + tp2RDefault * risk : entry - tp2RDefault * risk;
  const tp2Cap = isLong ? entry + tp2RCap * risk : entry - tp2RCap * risk;
  const tp2Raw = objective === null ? tp2Default : objective;
  const tp2RawUsable = objective === null ? tp2Default : (isLong ? (tp2Raw > entry ? tp2Raw : tp2Default) : (tp2Raw < entry ? tp2Raw : tp2Default));
  const tp2 = isLong ? Math.min(tp2RawUsable, tp2Cap) : Math.max(tp2RawUsable, tp2Cap);
  const rr = Math.abs(tp2 - entry) / risk;

  return { slGeometryOk: true, sl: slRaw, tp1, tp2, risk, rr };
}

// ── §16 Entry location (ported verbatim) ──────────────────────────────────
function entryLocation({ entry, anchor, atr, overextendAtrMult = 2.5 }) {
  if (anchor === null) return { overextended: false };
  return { overextended: Math.abs(entry - anchor) > overextendAtrMult * atr };
}

// ── §21 Quality score (ported verbatim, 8 components summing to 100) ─────
function qualityScore({ swingType, isLong, triggerType, entry, anchor, atr, adx, adxThreshold = 20, atrRatio, htfBias, session, rr, minRR = 1.5, overextendAtrMult = 2.5 }) {
  const qStructure = isLong
    ? (swingType === 'HH' ? 15 : swingType === 'LH' ? 10 : 5)
    : (swingType === 'LL' ? 15 : swingType === 'HL' ? 10 : 5);
  const qTrigger = triggerType === 'BOS' ? 15 : triggerType === 'CHOCH' ? 12 : (triggerType === 'SWEEP_OR_MR' ? 10 : 0);
  const qEntryLocation = anchor === null ? 0 : Math.max(0, 15 - 15 * (Math.abs(entry - anchor) / (overextendAtrMult * atr)));
  const qMomentum = Math.min(10, 10 * (adx / adxThreshold));
  const qVolatility = (atrRatio >= 0.7 && atrRatio <= 1.3) ? 10 : Math.max(0, 10 - 10 * Math.abs(atrRatio - 1.0));
  const qMtf = isLong ? (htfBias === 'BULL' ? 15 : htfBias === 'FLAT' ? 7.5 : 0) : (htfBias === 'BEAR' ? 15 : htfBias === 'FLAT' ? 7.5 : 0);
  const qSession = (session === 'LONDON' || session === 'NEW_YORK') ? 10 : session === 'ASIA' ? 6 : 2;
  const qRr = rr === null ? 0 : Math.min(10, Math.max(0, 10 * (rr - minRR) / minRR));
  const raw = qStructure + qTrigger + qEntryLocation + qMomentum + qVolatility + qMtf + qSession + qRr;
  return Math.min(100, Math.max(0, raw));
}

// ── §27 WAIT-reason precedence (ported verbatim ternary chain) ────────────
function waitReasonFor(ctx) {
  if (ctx.newsSuppressed) return 'NEWS_SUPPRESSION';
  if (ctx.regime === 'CHOP_UNCERTAIN') return 'CHOP';
  if (ctx.regime === 'TRANSITION') return 'TRANSITION';
  if (ctx.correctionActive) return 'CORRECTION_ACTIVE';
  if (!ctx.anyEligible) return 'NO_ELIGIBLE_STRATEGY';
  if (!ctx.anySetupReady) return 'NO_SETUP';
  if (!ctx.candTriggered) return 'NO_TRIGGER';
  if (!ctx.confirmedBar) return 'CONFIRMATION_INCOMPLETE';
  if (ctx.candEntryLate) return 'ENTRY_LATE';
  if (ctx.candOverextended) return 'OVEREXTENDED';
  if (!ctx.qualityOk) return 'NO_GOOD_ENTRY';
  if (!ctx.rrOk) return 'RR_NOT_ACCEPTABLE';
  return 'UNKNOWN';
}

// ── §14/§28 finalTradeApproved conjunction (ported verbatim) ──────────────
function finalTradeApproved(ctx) {
  return ctx.newsSuppressed === false &&
    ctx.regime !== 'CHOP_UNCERTAIN' && ctx.regime !== 'TRANSITION' &&
    !ctx.correctionActive &&
    ctx.anyEligible && ctx.anySetupReady && ctx.candTriggered &&
    ctx.confirmedBar &&
    !ctx.candEntryLate && !ctx.candOverextended &&
    ctx.qualityOk && ctx.rrOk &&
    ctx.slGeometryOk && ctx.candRr !== null;
}

function fullContext(overrides = {}) {
  return {
    newsSuppressed: false, regime: 'BULL_TREND', correctionActive: false,
    anyEligible: true, anySetupReady: true, candTriggered: true, confirmedBar: true,
    candEntryLate: false, candOverextended: false, qualityOk: true, rrOk: true,
    slGeometryOk: true, candRr: 2.0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// §4 eligibility matrix
// ═══════════════════════════════════════════════════════════════════════

describe('§4 Regime × model × direction eligibility matrix', () => {
  it('BULL_TREND: TC/PB/BO/SR long eligible, MR blocked', () => {
    const e = eligibility('BULL_TREND');
    assert.equal(e.tcLong, true); assert.equal(e.pbLong, true); assert.equal(e.boLong, true); assert.equal(e.srLong, true);
    assert.equal(e.mrLong, false);
    assert.equal(e.tcShort, false); assert.equal(e.pbShort, false); assert.equal(e.mrShort, false);
  });

  it('BEAR_TREND: TC/PB/BO/SR short eligible, MR blocked', () => {
    const e = eligibility('BEAR_TREND');
    assert.equal(e.tcShort, true); assert.equal(e.pbShort, true); assert.equal(e.boShort, true); assert.equal(e.srShort, true);
    assert.equal(e.mrShort, false);
  });

  it('RANGE: MR and SR eligible both directions, BO eligible, TC/PB blocked', () => {
    const e = eligibility('RANGE');
    assert.equal(e.mrLong, true); assert.equal(e.mrShort, true);
    assert.equal(e.srLong, true); assert.equal(e.srShort, true);
    assert.equal(e.boLong, true); assert.equal(e.boShort, true);
    assert.equal(e.tcLong, false); assert.equal(e.tcShort, false);
    assert.equal(e.pbLong, false); assert.equal(e.pbShort, false);
  });

  it('COMPRESSION: only BO eligible (breakout/retest architecture) — no TC/PB/MR/SR', () => {
    const e = eligibility('COMPRESSION');
    assert.equal(e.boLong, true); assert.equal(e.boShort, true);
    for (const k of ['tcLong', 'tcShort', 'pbLong', 'pbShort', 'mrLong', 'mrShort', 'srLong', 'srShort']) {
      assert.equal(e[k], false, `${k} must be blocked in COMPRESSION`);
    }
  });

  it('HIGH_VOLATILITY: every model blocked — explicit, not implicit', () => {
    const e = eligibility('HIGH_VOLATILITY');
    for (const k of Object.keys(e)) assert.equal(e[k], false, `${k} must be blocked in HIGH_VOLATILITY`);
  });

  it('TRANSITION and CHOP_UNCERTAIN: every model blocked (WAIT is decided before model evaluation anyway)', () => {
    for (const regime of ['TRANSITION', 'CHOP_UNCERTAIN']) {
      const e = eligibility(regime);
      for (const k of Object.keys(e)) assert.equal(e[k], false, `${k} must be blocked in ${regime}`);
    }
  });

  it('MR is blocked in every regime except RANGE, including both trend regimes explicitly', () => {
    for (const regime of ['BULL_TREND', 'BEAR_TREND', 'COMPRESSION', 'TRANSITION', 'CHOP_UNCERTAIN', 'HIGH_VOLATILITY']) {
      const e = eligibility(regime);
      assert.equal(e.mrLong, false, `MR long must be blocked in ${regime}`);
      assert.equal(e.mrShort, false, `MR short must be blocked in ${regime}`);
    }
    assert.equal(eligibility('RANGE').mrLong, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §18/§19/§20 SL → targets → RR
// ═══════════════════════════════════════════════════════════════════════

describe('§18-20 Logical SL, then targets, then RR (in that order)', () => {
  it('long: valid structural anchor produces SL below entry, TP1 at 1R, TP2 at default 2R when no objective exists', () => {
    const r = computeSlTpRr({ isLong: true, entry: 100, anchor: 95, atr: 2 });
    assert.equal(r.slGeometryOk, true);
    assert.equal(r.sl, 95 - 0.25 * 2); // anchor - buffer
    assert.equal(r.risk, 100 - r.sl);
    assert.equal(r.tp1, 100 + 1.0 * r.risk);
    assert.equal(r.tp2, 100 + 2.0 * r.risk); // default, no active high levels supplied
    assert.equal(r.rr, 2.0, 'RR against the default 2R target must be exactly 2.0 when no structural objective exists');
  });

  it('short: mirrors long exactly', () => {
    const r = computeSlTpRr({ isLong: false, entry: 100, anchor: 105, atr: 2 });
    assert.equal(r.slGeometryOk, true);
    assert.equal(r.sl, 105 + 0.25 * 2);
    assert.equal(r.tp1, 100 - r.risk);
    assert.equal(r.tp2, 100 - 2.0 * r.risk);
  });

  it('nonsensical geometry (anchor on the wrong side of entry) is rejected — SL must never be repaired', () => {
    // For a LONG, an anchor ABOVE entry would put SL above entry too — invalid.
    const r = computeSlTpRr({ isLong: true, entry: 100, anchor: 110, atr: 2 });
    assert.equal(r.slGeometryOk, false);
    assert.equal(r.sl, null);
    assert.equal(r.rr, null);
  });

  it('no structural anchor at all falls back to the ATR fallback distance, never invents a structure level', () => {
    const r = computeSlTpRr({ isLong: true, entry: 100, anchor: null, atr: 2 });
    assert.equal(r.sl, 100 - 1.5 * 2);
  });

  it('a genuine nearby structural objective produces a SMALLER RR than the 2R default — the RR gate has real teeth', () => {
    // Active high level at 102 (only 1R away if risk=2) — closer than the 2R default (108).
    const r = computeSlTpRr({ isLong: true, entry: 100, anchor: 95, atr: 2, activeHighLevels: [{ price: 102, consumed: false }] });
    assert.equal(r.tp2, 102, 'the real nearby objective must be used, not the default');
    assert.ok(r.rr < 2.0, 'RR must be smaller than the tautological 2.0 default when a closer real objective exists');
  });

  it('a structural objective offering LESS than the entry itself (wrong side) falls back to the default rather than an invalid target', () => {
    // No active high level above entry exists in this store — nearestAbove returns null, so default is used. This test documents that guard exists (covered by the "no anchor" test above);
    // additionally verify a level BELOW entry is never mistakenly used as a long's upside objective (nearestAbove filters by price > refPrice already).
    const r = computeSlTpRr({ isLong: true, entry: 100, anchor: 95, atr: 2, activeHighLevels: [{ price: 90, consumed: false }] });
    assert.equal(r.tp2, 100 + 2.0 * r.risk, 'a level below entry must never be used as a long TP2 objective');
  });

  it('the objective is capped and cannot manufacture an unrealistically distant target', () => {
    const r = computeSlTpRr({ isLong: true, entry: 100, anchor: 95, atr: 2, activeHighLevels: [{ price: 500, consumed: false }] });
    assert.equal(r.tp2, 100 + 3.0 * r.risk, 'TP2 must be capped at tp2RMultipleCap even when a distant "objective" exists');
  });

  it('a consumed active level is never used as an objective', () => {
    const r = computeSlTpRr({ isLong: true, entry: 100, anchor: 95, atr: 2, activeHighLevels: [{ price: 102, consumed: true }] });
    assert.equal(r.tp2, 100 + 2.0 * r.risk, 'a consumed level must be ignored, falling back to default');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §16 Entry location / do-not-chase
// ═══════════════════════════════════════════════════════════════════════

describe('§16 Entry location (ATR-normalized, never raw dollar thresholds)', () => {
  it('entry close to the anchor is not overextended', () => {
    assert.equal(entryLocation({ entry: 100, anchor: 98, atr: 2 }).overextended, false);
  });

  it('entry far beyond the overextension multiple IS overextended', () => {
    assert.equal(entryLocation({ entry: 110, anchor: 98, atr: 2 }).overextended, true); // 12 > 2.5*2=5
  });

  it('scales with ATR (same raw distance, different ATR, different verdict) — never a hardcoded dollar amount', () => {
    const lowVol = entryLocation({ entry: 106, anchor: 100, atr: 1 });   // 6 > 2.5 → overextended
    const highVol = entryLocation({ entry: 106, anchor: 100, atr: 5 }); // 6 < 12.5 → not overextended
    assert.equal(lowVol.overextended, true);
    assert.equal(highVol.overextended, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §21 Quality score
// ═══════════════════════════════════════════════════════════════════════

describe('§21 Quality score (0-100, clamped, never a probability claim)', () => {
  it('a strong scenario scores highly but never exceeds 100', () => {
    const q = qualityScore({ swingType: 'HH', isLong: true, triggerType: 'BOS', entry: 100, anchor: 98, atr: 2, adx: 40, atrRatio: 1.0, htfBias: 'BULL', session: 'LONDON', rr: 3.0 });
    assert.ok(q <= 100);
    assert.ok(q > 65);
  });

  it('a weak scenario scores low but never below 0', () => {
    const q = qualityScore({ swingType: 'EQH', isLong: true, triggerType: 'SWEEP_OR_MR', entry: 100, anchor: 80, atr: 2, adx: 5, atrRatio: 2.0, htfBias: 'BEAR', session: 'OTHER', rr: 1.5 });
    assert.ok(q >= 0);
    assert.ok(q < 65);
  });

  it('quality is monotonic in RR quality component — higher RR never scores lower, all else equal', () => {
    const base = { swingType: 'HH', isLong: true, triggerType: 'BOS', entry: 100, anchor: 98, atr: 2, adx: 25, atrRatio: 1.0, htfBias: 'BULL', session: 'LONDON' };
    const qLowRr = qualityScore({ ...base, rr: 1.5 });
    const qHighRr = qualityScore({ ...base, rr: 4.0 });
    assert.ok(qHighRr >= qLowRr);
  });

  it('quality never exceeds 100 even with an artificially inflated component sum', () => {
    const q = qualityScore({ swingType: 'HH', isLong: true, triggerType: 'BOS', entry: 100, anchor: 100, atr: 2, adx: 1000, atrRatio: 1.0, htfBias: 'BULL', session: 'LONDON', rr: 100 });
    assert.equal(q, 100);
  });

  it('quality is never negative even in a maximally adverse scenario', () => {
    const q = qualityScore({ swingType: 'EQL', isLong: false, triggerType: 'NONE', entry: 100, anchor: null, atr: 2, adx: 0, atrRatio: 5, htfBias: 'BULL', session: 'OTHER', rr: null });
    assert.ok(q >= 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §27 WAIT-reason precedence
// ═══════════════════════════════════════════════════════════════════════

describe('§27 WAIT-reason precedence (single authoritative reason, documented order)', () => {
  it('news suppression takes priority over everything else', () => {
    assert.equal(waitReasonFor({ newsSuppressed: true, regime: 'CHOP_UNCERTAIN', correctionActive: true }), 'NEWS_SUPPRESSION');
  });
  it('chop/transition takes priority over correction', () => {
    assert.equal(waitReasonFor({ newsSuppressed: false, regime: 'CHOP_UNCERTAIN', correctionActive: true }), 'CHOP');
    assert.equal(waitReasonFor({ newsSuppressed: false, regime: 'TRANSITION', correctionActive: true }), 'TRANSITION');
  });
  it('correction takes priority over eligibility/setup/trigger', () => {
    assert.equal(waitReasonFor({ newsSuppressed: false, regime: 'BULL_TREND', correctionActive: true, anyEligible: false }), 'CORRECTION_ACTIVE');
  });
  it('no eligible strategy takes priority over no setup', () => {
    assert.equal(waitReasonFor({ newsSuppressed: false, regime: 'CHOP_UNCERTAIN' === 'x' ? 'x' : 'RANGE', correctionActive: false, anyEligible: false, anySetupReady: false }), 'NO_ELIGIBLE_STRATEGY');
  });
  it('full precedence chain walks through every stage in order when each prior gate is satisfied', () => {
    const base = { newsSuppressed: false, regime: 'BULL_TREND', correctionActive: false, anyEligible: true };
    assert.equal(waitReasonFor({ ...base, anySetupReady: false }), 'NO_SETUP');
    assert.equal(waitReasonFor({ ...base, anySetupReady: true, candTriggered: false }), 'NO_TRIGGER');
    assert.equal(waitReasonFor({ ...base, anySetupReady: true, candTriggered: true, confirmedBar: false }), 'CONFIRMATION_INCOMPLETE');
    assert.equal(waitReasonFor({ ...base, anySetupReady: true, candTriggered: true, confirmedBar: true, candEntryLate: true }), 'ENTRY_LATE');
    assert.equal(waitReasonFor({ ...base, anySetupReady: true, candTriggered: true, confirmedBar: true, candEntryLate: false, candOverextended: true }), 'OVEREXTENDED');
    assert.equal(waitReasonFor({ ...base, anySetupReady: true, candTriggered: true, confirmedBar: true, candEntryLate: false, candOverextended: false, qualityOk: false }), 'NO_GOOD_ENTRY');
    assert.equal(waitReasonFor({ ...base, anySetupReady: true, candTriggered: true, confirmedBar: true, candEntryLate: false, candOverextended: false, qualityOk: true, rrOk: false }), 'RR_NOT_ACCEPTABLE');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §45 FINAL PROOF — executable, not just asserted
// ═══════════════════════════════════════════════════════════════════════

describe('§45 Final proof: every individual gate, alone, forces WAIT', () => {
  it('baseline: all gates satisfied → trade approved (sanity check the harness itself is not vacuously true)', () => {
    assert.equal(finalTradeApproved(fullContext()), true);
  });

  it('Q1: trend alone cannot generate BUY/SELL — anySetupReady/candTriggered false blocks it even with regime set', () => {
    assert.equal(finalTradeApproved(fullContext({ anySetupReady: false, candTriggered: false })), false);
  });

  it('Q2/Q3: a bare BOS or CHoCH alone cannot generate BUY/SELL without every other gate also passing', () => {
    // Modeled as candTriggered=true (the BOS/CHoCH fired) but quality/RR not yet evaluated favorably.
    assert.equal(finalTradeApproved(fullContext({ candTriggered: true, qualityOk: false })), false);
    assert.equal(finalTradeApproved(fullContext({ candTriggered: true, rrOk: false })), false);
  });

  it('Q4: a sweep alone cannot generate BUY/SELL', () => {
    assert.equal(finalTradeApproved(fullContext({ candTriggered: true, anySetupReady: false })), false);
  });

  it('Q5: correctionActive can never coexist with an approved trade, regardless of every other gate', () => {
    assert.equal(finalTradeApproved(fullContext({ correctionActive: true })), false);
  });

  it('Q6: a late or overextended entry can never become BUY/SELL', () => {
    assert.equal(finalTradeApproved(fullContext({ candEntryLate: true })), false);
    assert.equal(finalTradeApproved(fullContext({ candOverextended: true })), false);
  });

  it('Q7: RR below minimum can never become BUY/SELL', () => {
    assert.equal(finalTradeApproved(fullContext({ rrOk: false })), false);
  });

  it('Q8: quality below threshold can never become BUY/SELL', () => {
    assert.equal(finalTradeApproved(fullContext({ qualityOk: false })), false);
  });

  it('Q9: an unconfirmed bar can never become BUY/SELL', () => {
    assert.equal(finalTradeApproved(fullContext({ confirmedBar: false })), false);
  });

  it('every single gate, flipped in isolation, forces WAIT — exhaustive sweep', () => {
    const gates = ['correctionActive', 'candEntryLate', 'candOverextended'];
    for (const g of gates) {
      assert.equal(finalTradeApproved(fullContext({ [g]: true })), false, `flipping ${g} must force WAIT`);
    }
    const falseGates = ['anyEligible', 'anySetupReady', 'candTriggered', 'confirmedBar', 'qualityOk', 'rrOk', 'slGeometryOk'];
    for (const g of falseGates) {
      assert.equal(finalTradeApproved(fullContext({ [g]: false })), false, `clearing ${g} must force WAIT`);
    }
    assert.equal(finalTradeApproved(fullContext({ newsSuppressed: true })), false);
    assert.equal(finalTradeApproved(fullContext({ regime: 'CHOP_UNCERTAIN' })), false);
    assert.equal(finalTradeApproved(fullContext({ regime: 'TRANSITION' })), false);
    assert.equal(finalTradeApproved(fullContext({ candRr: null })), false);
  });
});
