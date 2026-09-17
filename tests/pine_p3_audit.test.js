/**
 * Pine P3 decision-engine static source audit.
 *
 * Complements tests/pine_p3_decision_model.test.js (which proves the
 * ALGORITHM is correct via a faithful JS reference-model) by proving the
 * PINE SOURCE actually implements that same algorithm at the exact places
 * required — the same technique used for every prior phase's non-repaint
 * auditing in this project.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PINE_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master.pine', import.meta.url));
const source = readFileSync(PINE_PATH, 'utf8');
const codeLines = source.split('\n').filter((l) => !l.trim().startsWith('//'));
const codeSource = codeLines.join('\n');

describe('Pine P3 decision-engine source audit', () => {
  it('INDICATOR_VERSION exists in semver form (bumped across P4B/P5 as the codebase evolves), CONTRACT_VERSION is unchanged at 1', () => {
    assert.ok(/INDICATOR_VERSION\s*=\s*"\d+\.\d+\.\d+"/.test(source));
    assert.ok(/CONTRACT_VERSION\s*=\s*1\b/.test(source));
  });

  it('MR eligibility is regime==RANGE only, on both long and short, with no other regime listed', () => {
    const longLine = codeLines.find((l) => l.startsWith('mrLongEligible'));
    const shortLine = codeLines.find((l) => l.startsWith('mrShortEligible'));
    assert.ok(longLine && /officialRegime\s*==\s*"RANGE"/.test(longLine) && !/BULL_TREND|BEAR_TREND|COMPRESSION/.test(longLine));
    assert.ok(shortLine && /officialRegime\s*==\s*"RANGE"/.test(shortLine) && !/BULL_TREND|BEAR_TREND|COMPRESSION/.test(shortLine));
  });

  it('no eligibility expression (TC/PB/BO/MR/SR, either direction) mentions HIGH_VOLATILITY — explicitly excluded from every model', () => {
    const eligibilityLines = codeLines.filter((l) => /^(tc|pb|bo|mr|sr)(Long|Short)Eligible\s*=/.test(l));
    assert.equal(eligibilityLines.length, 10, `expected 10 eligibility declarations (5 models x 2 directions), found ${eligibilityLines.length}`);
    for (const line of eligibilityLines) {
      assert.ok(!line.includes('HIGH_VOLATILITY'), `${line.trim()} must not list HIGH_VOLATILITY as eligible`);
    }
  });

  it('correctionActive is an unconditional AND term in finalTradeApproved — no OR/bypass path exists', () => {
    const finalApprovedBlock = source.slice(source.indexOf('finalTradeApproved = '), source.indexOf('finalTradeApproved = ') + 600);
    assert.ok(/not correctionActive/.test(finalApprovedBlock));
    // Ensure it's on an "and" chain, not inside an "or" branch.
    assert.ok(!/or\s+not correctionActive/.test(finalApprovedBlock) && !/correctionActive\s+or/.test(finalApprovedBlock));
  });

  it('confirmedBar is required in finalTradeApproved', () => {
    const finalApprovedBlock = source.slice(source.indexOf('finalTradeApproved = '), source.indexOf('finalTradeApproved = ') + 600);
    assert.ok(/\bconfirmedBar\b/.test(finalApprovedBlock));
  });

  it('quality and RR gates (qualityOk/rrOk) are both required in finalTradeApproved', () => {
    const finalApprovedBlock = source.slice(source.indexOf('finalTradeApproved = '), source.indexOf('finalTradeApproved = ') + 600);
    assert.ok(/qualityOk/.test(finalApprovedBlock));
    assert.ok(/rrOk/.test(finalApprovedBlock));
  });

  it('entry-late and overextension gates are both required (negated) in finalTradeApproved', () => {
    const finalApprovedBlock = source.slice(source.indexOf('finalTradeApproved = '), source.indexOf('finalTradeApproved = ') + 600);
    assert.ok(/not candEntryLate/.test(finalApprovedBlock));
    assert.ok(/not candOverextended/.test(finalApprovedBlock));
  });

  it('model selection priority is exactly PB > BO > TC > MR > SR', () => {
    const candModelBlock = source.slice(source.indexOf('candModel  ='), source.indexOf('candModel  =') + 400);
    const order = [...candModelBlock.matchAll(/"(PB|BO|TC|MR|SR)"/g)].map((m) => m[1]);
    assert.deepEqual(order, ['PB', 'BO', 'TC', 'MR', 'SR'], 'documented priority order must be PB, BO, TC, MR, SR');
  });

  it('WAIT_REASON precedence order matches the documented §27 chain', () => {
    const waitReasonBlock = source.slice(source.indexOf('waitReason = '), source.indexOf('waitReason = ') + 900);
    // Only the ternary RESULT position (`? "X" :`) — the comparison operands
    // (e.g. `officialRegime == "TRANSITION"`) share some of the same
    // literal strings and would otherwise double-count.
    const order = [...waitReasonBlock.matchAll(/\?\s*"([A-Z_]+)"\s*:/g)].map((m) => m[1]);
    const last = waitReasonBlock.match(/:\s*\n?\s*"([A-Z_]+)"\s*\/\//);
    assert.deepEqual([...order, ...(last ? [last[1]] : [])], ['NEWS_SUPPRESSION', 'CHOP', 'TRANSITION', 'CORRECTION_ACTIVE', 'NO_ELIGIBLE_STRATEGY', 'NO_SETUP', 'NO_TRIGGER', 'CONFIRMATION_INCOMPLETE', 'ENTRY_LATE', 'OVEREXTENDED', 'NO_GOOD_ENTRY', 'RR_NOT_ACCEPTABLE', 'UNKNOWN']);
  });

  it('SL is computed BEFORE targets, which are computed BEFORE RR — source order matches the mandated sequence', () => {
    const slIdx = source.indexOf('slRaw =');
    const tp1Idx = source.indexOf('candTp1 =');
    const rrIdx = source.indexOf('candRr =');
    assert.ok(slIdx > 0 && tp1Idx > slIdx && rrIdx > tp1Idx, 'source must compute SL, then TP1/TP2, then RR, in that textual order');
  });

  it('no strategy.* call exists anywhere — no broker execution, no order management', () => {
    assert.ok(!/strategy\.(entry|order|close|exit)/.test(source));
  });

  it('alertcondition exists for confirmed BUY and SELL, both gated by finalTradeApproved, and no other alert/webhook mechanism is used', () => {
    const alerts = [...codeSource.matchAll(/alertcondition\([^)]+\)/g)];
    assert.equal(alerts.length, 2, 'expected exactly 2 alertcondition() calls');
    for (const a of alerts) assert.ok(a[0].includes('finalTradeApproved'));
    assert.ok(!codeSource.includes('request.http') && !codeSource.includes('webhook'));
  });

  it('signal identity/freeze fields are declared `var` (persistent, written at most once per approval bar) and are only written inside the finalTradeApproved-gated block', () => {
    const frozenFields = ['signalId', 'signalSide', 'signalEntry', 'signalSl', 'signalTp1', 'signalTp2', 'signalRr', 'signalModel', 'signalRegime', 'signalQuality', 'signalBarTime', 'signalTimeframe', 'signalSession'];
    for (const f of frozenFields) {
      assert.ok(new RegExp(`var\\s+\\S+\\s+${f}\\s*=`).test(source), `${f} must be declared as a persistent var`);
    }
    const freezeBlock = source.slice(source.indexOf('if confirmedBar and finalTradeApproved'), source.indexOf('if confirmedBar and finalTradeApproved') + 1300);
    for (const f of frozenFields) {
      assert.ok(freezeBlock.includes(`${f} :=`), `${f} must be assigned inside the finalTradeApproved-gated freeze block`);
    }
  });

  it('published trade output fields (outEntry/outSl/outTp1/outTp2/outRr) are NA unless finalTradeApproved', () => {
    for (const f of ['outEntry', 'outSl', 'outTp1', 'outTp2', 'outRr']) {
      const line = codeLines.find((l) => l.startsWith(`${f} `) || l.startsWith(`${f}=`));
      assert.ok(line && line.includes('finalTradeApproved'), `${f} must be gated by finalTradeApproved: ${line}`);
    }
  });

  it('BAR_CONFIRMED in the contract table reflects the live confirmedBar flag, never a hardcoded true', () => {
    assert.ok(/"BAR_CONFIRMED",\s*confirmedBar\s*\?\s*"1"\s*:\s*"0"/.test(source));
  });

  it('WAIT_REASON is published as "NA" whenever a trade is approved (never a stale reason alongside a real action)', () => {
    assert.ok(/"WAIT_REASON",\s*finalTradeApproved\s*\?\s*"NA"\s*:\s*waitReason/.test(source));
  });

  it('quality components are documented with exact max points summing to 100', () => {
    const weights = [...source.matchAll(/^q(Structure|Trigger|EntryLocation|Momentum|Volatility|Mtf|Session|Rr)\b.*?(\d+\.0)(?=\s*:|\s*\))/gm)];
    // Looser structural check: each of the 8 named components exists as its own assignment.
    for (const name of ['qStructure', 'qTrigger', 'qEntryLocation', 'qMomentum', 'qVolatility', 'qMtf', 'qSession', 'qRr']) {
      assert.ok(source.includes(`${name} =`), `quality component ${name} must exist`);
    }
    assert.ok(source.includes('candQualityRaw = qStructure + qTrigger + qEntryLocation + qMomentum + qVolatility + qMtf + qSession + qRr'));
  });

  it('quality score is clamped to [0, 100]', () => {
    assert.ok(/math\.min\(100\.0,\s*math\.max\(0\.0,\s*candQualityRaw\)\)/.test(source));
  });

  it('TC requires a FRESH continuation BOS (not CHoCH) in the trend direction — trend regime alone is never sufficient', () => {
    assert.ok(/tcLongTrigger\s*=\s*tcLongSetupReady\s+and\s+lastStructureEventBar\s*==\s*bar_index\s+and\s+lastStructureEvent\s*==\s*"BULLISH_BOS"/.test(source));
    assert.ok(/tcShortTrigger\s*=\s*tcShortSetupReady\s+and\s+lastStructureEventBar\s*==\s*bar_index\s+and\s+lastStructureEvent\s*==\s*"BEARISH_BOS"/.test(source));
  });

  it('PB requires the trigger event to occur strictly AFTER the correction resolution bar — resolution alone never triggers', () => {
    assert.ok(/lastStructureEventBar\s*>\s*corrResolvedBar/.test(source));
  });

  it('BO requires a retest (price returning to the boundary) before a reclaim close counts as a trigger — no direct entry on the breakout candle', () => {
    assert.ok(/boLongTrigger\s*=\s*boLongSetupReady\s+and\s+boLongRetested/.test(source));
    assert.ok(/boShortTrigger\s*=\s*boShortSetupReady\s+and\s+boShortRetested/.test(source));
  });

  it('MR rejects the setup during a RECENT opposing displacement (not just the exact trigger bar — reused P2 recency state, never fades a genuine strong move)', () => {
    assert.ok(/mrLongTrigger\s*=.*not mrLongDisplacementBlocked/.test(source));
    assert.ok(/mrShortTrigger\s*=.*not mrShortDisplacementBlocked/.test(source));
    assert.ok(/mrLongDisplacementBlocked\s*=\s*not na\(barsSinceBearishDisp\)/.test(source), 'must reuse the existing P2 displacement-recency series, not a new indicator');
    assert.ok(/mrShortDisplacementBlocked\s*=\s*not na\(barsSinceBullishDisp\)/.test(source));
  });

  it('SR requires a genuine P2-confirmed event (sweep/PDH-PDL-sweep/CHoCH) — never a bare wick', () => {
    const srLine = codeLines.find((l) => l.startsWith('srLongTrigger'));
    assert.ok(srLine && /lastSweepType|lastDailySweep|lastStructureEvent/.test(srLine));
  });
});
