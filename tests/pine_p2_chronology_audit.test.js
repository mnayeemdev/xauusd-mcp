/**
 * Pine P2 chronology / non-repaint static source audit.
 *
 * There is no Pine execution/bar-replay test harness available outside
 * TradingView's own runtime, and this task explicitly forbids installing
 * the indicator on a live chart. These tests are therefore STATIC SOURCE
 * AUDITS — they grep the actual .pine file for the specific guard
 * expressions that make each chronology invariant hold, the same technique
 * used throughout this project for non-repaint auditing (e.g. the Phase 2A
 * "never calls setSymbol" source audits). They prove the guard exists
 * exactly where required; they are not a substitute for eventually running
 * the script on real bar data, which this task does not authorize.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PINE_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master.pine', import.meta.url));
const source = readFileSync(PINE_PATH, 'utf8');

describe('Pine P2 non-repaint / chronology source audit', () => {
  // P1/P2 asserted "no BUY/SELL literal anywhere" because those phases were
  // forbidden from ever reaching a trade decision. Pine P3 is explicitly
  // authorized to introduce BUY/SELL, gated behind the full decision
  // pipeline — see tests/pine_p3_*.test.js for P3's own safety proofs. The
  // invariant this file continues to audit is narrower but still absolute:
  // BUY/SELL may appear in exactly ONE place in the whole script — the
  // single `contractAction` assignment — and nowhere else (no other
  // variable, label, alert, or debug field independently produces or
  // hardcodes a trade side).
  it('every CODE line (not comments) mentioning BUY/SELL is gated by finalTradeApproved', () => {
    // Comment lines may freely discuss BUY/SELL in prose (documentation).
    // Every actual code line — the ACTION assignment, the two
    // alertcondition() calls, and the two plotshape() signal markers — must
    // be conditioned on finalTradeApproved, the single conjunction of every
    // gate in the pipeline.
    const codeLinesWithBuyOrSell = source.split('\n').filter((l) => !l.trim().startsWith('//') && /\bBUY\b|\bSELL\b/.test(l));
    assert.equal(codeLinesWithBuyOrSell.length, 5, `expected exactly 5 code lines mentioning BUY/SELL (ACTION assignment, 2 alertconditions, 2 plotshapes), found ${codeLinesWithBuyOrSell.length}`);
    for (const line of codeLinesWithBuyOrSell) {
      assert.ok(line.includes('finalTradeApproved'), `every BUY/SELL-mentioning code line must be gated by finalTradeApproved: ${line.trim()}`);
    }
  });

  it('ACTION is only ever assigned once, via the single finalTradeApproved-gated ternary', () => {
    const assignments = [...source.matchAll(/^contractAction\s*=.*$/gm)];
    assert.equal(assignments.length, 1, 'contractAction must be assigned exactly once in the whole file');
    assert.ok(assignments[0][0].includes('finalTradeApproved'), 'the single assignment must be gated by finalTradeApproved');
    assert.ok(assignments[0][0].includes('"WAIT"'), 'the single assignment must fall back to "WAIT" when finalTradeApproved is false');
  });

  it('every request.security call uses lookahead = barmerge.lookahead_off; lookahead_on never appears', () => {
    // Each call in this file is a single line — match per-line rather than
    // with a paren-balancing regex (request.security's arguments themselves
    // contain nested parens, e.g. htfEmaFastExpr()[1]).
    const callLines = source.split('\n').filter((l) => !l.trim().startsWith('//') && l.includes('request.security('));
    assert.ok(callLines.length >= 4, `expected at least 4 request.security calls (2 HTF + PDH + PDL), found ${callLines.length}`);
    for (const line of callLines) {
      assert.ok(line.includes('barmerge.lookahead_off'), `request.security call missing lookahead_off: ${line.trim()}`);
    }
    // Excludes comment lines — the file's own documentation legitimately
    // says "never lookahead_on" while explaining the pattern.
    const codeLines = source.split('\n').filter((l) => !l.trim().startsWith('//'));
    assert.ok(!codeLines.some((l) => l.includes('lookahead_on')), 'lookahead_on must not appear in actual code');
  });

  it('PDH/PDL use high[1]/low[1] inside the daily security context (confirmed previous day only)', () => {
    assert.ok(/request\.security\(syminfo\.tickerid,\s*"D",\s*high\[1\]/.test(source));
    assert.ok(/request\.security\(syminfo\.tickerid,\s*"D",\s*low\[1\]/.test(source));
  });

  it('HTF EMA context uses the [1]-inside-expression non-repaint pattern', () => {
    assert.ok(/htfEmaFastExpr\(\)\[1\]/.test(source));
    assert.ok(/htfEmaSlowExpr\(\)\[1\]/.test(source));
  });

  it('pivot location bar is computed as an offset from the confirmation bar, never equal to it', () => {
    // lastSwingHighBar/lastSwingLowBar := bar_index - pivotRightBars, always
    // strictly less than bar_index (the confirmation bar) since
    // pivotRightBars has minval=1.
    assert.ok(/lastSwingHighBar\s*:=\s*bar_index\s*-\s*pivotRightBars/.test(source));
    assert.ok(/lastSwingLowBar\s*:=\s*bar_index\s*-\s*pivotRightBars/.test(source));
    assert.ok(/lastSwingHighConfirmBar\s*:=\s*bar_index\b/.test(source));
    assert.ok(/lastSwingLowConfirmBar\s*:=\s*bar_index\b/.test(source));
  });

  it('born-consumed/wick-interacted flags are wired directly into the new level\'s consumed/swept fields at creation (StructLevel.new)', () => {
    // Updated in the P2 review/fix pass: a level's initial eligibility now
    // comes from its own StructLevel.new(...) constructor args, not a
    // scalar assignment — see tests/pine_p2_structure_model.test.js for the
    // executable proof this actually prevents born-consumed/born-swept
    // levels from firing later.
    assert.ok(/StructLevel\.new\(pivotHighVal,\s*newHighType,.*bornCloseConsumedHigh,\s*bornWickInteractedHigh,\s*bornCloseConsumedHigh,\s*bornWickInteractedHigh\)/.test(source));
    assert.ok(/StructLevel\.new\(pivotLowVal,\s*newLowType,.*bornCloseConsumedLow,\s*bornWickInteractedLow,\s*bornCloseConsumedLow,\s*bornWickInteractedLow\)/.test(source));
    // And the scalar debug mirrors are still populated from the CLOSE-based flag.
    assert.ok(/lastSwingHighBornConsumed\s*:=\s*bornCloseConsumedHigh/.test(source));
    assert.ok(/lastSwingLowBornConsumed\s*:=\s*bornCloseConsumedLow/.test(source));
  });

  it('BOS/CHoCH/sweep evaluation is chronology-guarded: only strictly after EACH retained level\'s OWN confirmation bar', () => {
    // Updated for the bounded multi-level store — the guard is now applied
    // per-level inside the selection loop (`lvl.confirmBar`), not against a
    // single scalar. Four occurrences: high-break, high-sweep, low-break,
    // low-sweep loops.
    const matches = [...source.matchAll(/bar_index\s*>\s*lvl\d?\.confirmBar/g)];
    assert.ok(matches.length >= 4, `expected at least 4 per-level chronology guards (high break/sweep, low break/sweep), found ${matches.length}`);
  });

  it('a structural level latches "consumed"/"swept" so the same crossing cannot fire repeatedly', () => {
    // Updated for the bounded multi-level store: retirement now happens on
    // the per-level object (`lvl2.consumed`/`lvl2.swept`) inside the
    // "retire every crossed level" loops, not a single scalar.
    assert.ok(/lvl2\.consumed\s*:=\s*true/.test(source));
    assert.ok(/lvl2\.swept\s*:=\s*true/.test(source));
    // And the eligibility check for a level to even be CONSIDERED requires
    // "not already consumed"/"not already swept" — the actual dedup gate.
    assert.ok(/not\s+lvl\.consumed/.test(source));
    assert.ok(/not\s+lvl\.swept/.test(source));
  });

  it('PDH/PDL sweep eligibility resets only when the tracked daily value itself changes (once per day, not once per bar)', () => {
    assert.ok(/if\s+pdh\s*!=\s*trackedPdh/.test(source));
    assert.ok(/if\s+pdl\s*!=\s*trackedPdl/.test(source));
    assert.ok(/pdhSweptForValue\s*:=\s*false/.test(source));
    assert.ok(/pdlSweptForValue\s*:=\s*false/.test(source));
  });

  it('anchored range boundaries are assigned exactly once (at anchor time) and never reassigned elsewhere', () => {
    const highAssignments = [...source.matchAll(/\brangeHigh\s*:=/g)];
    const lowAssignments = [...source.matchAll(/\brangeLow\s*:=/g)];
    assert.equal(highAssignments.length, 1, 'rangeHigh must be assigned exactly once (at anchoring) — found ' + highAssignments.length);
    assert.equal(lowAssignments.length, 1, 'rangeLow must be assigned exactly once (at anchoring) — found ' + lowAssignments.length);
  });

  it('range breakout is chronology-guarded: only strictly after the range\'s own confirmation bar', () => {
    assert.ok(/bar_index\s*>\s*rangeConfirmBar/.test(source));
  });

  it('a new anchored range gets a new identity (rangeId increments) rather than rewriting the old one', () => {
    assert.ok(/rangeId\s*:=\s*rangeId\s*\+\s*1/.test(source));
  });

  it('correction resolution retains its P1 chronology guard: strictly after the activation bar', () => {
    assert.ok(/bar_index\s*>\s*corrStartBar/.test(source));
  });

  it('correction resolution still requires a multi-bar streak, not a single-bar structural event, to resolve', () => {
    assert.ok(/corrRecoverStreak\s*>=\s*corrResolveConfirmBars/.test(source));
    // The fresh-structure evidence feeds into `recovered`, which still only
    // increments the streak by one per bar — it does not set the streak
    // directly to the required threshold.
    assert.ok(!/corrRecoverStreak\s*:=\s*corrResolveConfirmBars/.test(source), 'a single event must not fast-track the streak to the threshold');
  });

  it('correction activation accepts structural evidence as an ALTERNATIVE to, not instead of, the original EMA-based evidence', () => {
    assert.ok(/emaEvidence\s+or\s+freshBearishStructureThisBar/.test(source));
    assert.ok(/emaEvidenceL\s+or\s+freshBullishStructureThisBar/.test(source));
  });

  it('every persistent structure/correction/range state transition is gated behind confirmedBar', () => {
    // Spot-check: the three major "if confirmedBar" blocks for structure,
    // correction, and range all exist (P1's regime block already audited
    // in Pine P1's own test suite).
    const confirmedBarBlocks = [...source.matchAll(/if confirmedBar\b/g)];
    assert.ok(confirmedBarBlocks.length >= 5, `expected at least 5 confirmed-bar-gated blocks (regime, swing-high, swing-low, structure events, PDH/PDL, range, correction), found ${confirmedBarBlocks.length}`);
  });

  // ── P2 review/fix pass additions ─────────────────────────────────────────

  it('born-consumed is split into CLOSE and WICK variants, computed separately for both sides', () => {
    assert.ok(/bornWickInteractedHigh\s*=/.test(source));
    assert.ok(/bornWickInteractedLow\s*=/.test(source));
    assert.ok(/bornCloseConsumedHigh\s*=/.test(source));
    assert.ok(/bornCloseConsumedLow\s*=/.test(source));
    // Wick uses high/low; close uses close — genuinely different source series.
    assert.ok(/gapHighestHigh\s*>\s*pivotHighVal/.test(source));
    assert.ok(/gapHighestClose\s*>\s*pivotHighVal/.test(source));
  });

  it('active structural levels are stored in a BOUNDED array (not a single scalar, not unlimited)', () => {
    assert.ok(/array\.new<StructLevel>\(\)/.test(source));
    assert.ok(/if\s+array\.size\(activeHighLevels\)\s*>\s*maxActiveLevels/.test(source));
    assert.ok(/if\s+array\.size\(activeLowLevels\)\s*>\s*maxActiveLevels/.test(source));
    assert.ok(/maxActiveLevels\s*=\s*input\.int\(\d+,.*maxval\s*=\s*10/.test(source), 'maxActiveLevels must have a hard upper bound input, never unbounded');
  });

  it('exactly one authoritative structure event is selected per side per bar (single winner tracked via max confirmBar, not first-match)', () => {
    const authTrackers = [...source.matchAll(/int\s+auth\w+Idx\s*=\s*-1/g)];
    assert.ok(authTrackers.length >= 4, `expected 4 authoritative-selection trackers (high break/sweep, low break/sweep), found ${authTrackers.length}`);
  });
});
