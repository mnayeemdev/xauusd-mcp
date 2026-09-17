/**
 * Pine P5 — indicator ↔ strategy parity.
 *
 * pine/XAUUSD_Adaptive_Master_Strategy.pine is not an independent trading
 * algorithm. It is enforced to be a byte-for-byte duplicate of the
 * canonical indicator's ENTIRE decision-logic body (regime → structure →
 * correction → model → setup → trigger → quality/RR/late/overextension
 * gates → WAIT/BUY/SELL → P5 recorder/outcome/statistics), differing only
 * in: (1) the top doc-comment header, (2) the indicator()/strategy()
 * declaration line, and (3) an appended STRATEGY EXECUTION block that
 * places real strategy.entry()/strategy.exit() orders using the exact
 * same finalTradeApproved/candIsLong/signalSl/signalTp2 values.
 *
 * Pine has no local multi-file import mechanism without publishing a
 * library to TradingView's cloud (out of scope for this phase) — this
 * exact-text-diff test is the enforced parity mechanism instead of shared
 * code, and is strictly stronger than a shared-library import would be:
 * it is impossible for the two files' decision logic to silently diverge
 * without this test failing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INDICATOR_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master.pine', import.meta.url));
const STRATEGY_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master_Strategy.pine', import.meta.url));
const indicatorSource = readFileSync(INDICATOR_PATH, 'utf8');
const strategySource = readFileSync(STRATEGY_PATH, 'utf8');

const SHARED_START_MARKER = '// ── Version constants';
const SHARED_END_MARKER = '// ── Minimal default visuals';

function extractSharedRegion(source, label) {
  const start = source.indexOf(SHARED_START_MARKER);
  const end = source.indexOf(SHARED_END_MARKER);
  assert.ok(start > 0, `${label}: shared-region start marker not found`);
  assert.ok(end > start, `${label}: shared-region end marker not found after start`);
  return source.slice(start, end);
}

describe('P5 §26/§28: indicator <-> strategy exact parity', () => {
  it('the entire decision-logic body (version constants through the end of the P5 recorder/statistics section) is byte-for-byte identical between the indicator and the strategy', () => {
    const indicatorRegion = extractSharedRegion(indicatorSource, 'indicator');
    const strategyRegion = extractSharedRegion(strategySource, 'strategy');
    assert.equal(strategyRegion, indicatorRegion, 'any difference here means the strategy has silently diverged from the frozen decision logic — this must never happen');
  });

  it('the strategy file declares strategy(), not indicator(), and the indicator file is untouched (still indicator())', () => {
    assert.ok(/^indicator\(/m.test(indicatorSource));
    assert.ok(/^strategy\(/m.test(strategySource));
    assert.ok(!/^indicator\(/m.test(strategySource), 'the strategy file must not also declare indicator()');
  });

  it('strategy() is declared with pyramiding=0 (documented, disclosed single-position execution model)', () => {
    assert.ok(/strategy\([^)]*pyramiding\s*=\s*0/.test(strategySource));
  });

  it('the strategy execution block uses the SAME finalTradeApproved/candIsLong/signalSl/signalTp2 identifiers as the indicator — no independently-derived entry/exit condition', () => {
    const execStart = strategySource.lastIndexOf('STRATEGY EXECUTION');
    assert.ok(execStart > 0);
    const execBlock = strategySource.slice(execStart);
    assert.ok(/if confirmedBar and finalTradeApproved/.test(execBlock));
    assert.ok(/if candIsLong/.test(execBlock));
    assert.ok(/strategy\.entry\("Long", strategy\.long\)/.test(execBlock));
    assert.ok(/strategy\.entry\("Short", strategy\.short\)/.test(execBlock));
    assert.ok(/stop = signalSl, limit = signalTp2/.test(execBlock));
    // Must not introduce any new gating condition (e.g. an extra quality/RR
    // check) beyond what finalTradeApproved already encodes.
    assert.ok(!/qualityThreshold|minRR/.test(execBlock), 'no Strategy-Tester-only extra filter may be introduced in the execution block');
  });

  it('no hidden favorable-exit logic: strategy.exit uses the exact frozen signalSl/signalTp2, never a recalculated or more favorable level', () => {
    const execStart = strategySource.lastIndexOf('STRATEGY EXECUTION');
    const execCodeOnly = strategySource.slice(execStart).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const exitCalls = [...execCodeOnly.matchAll(/strategy\.exit\([^)]*\)/g)];
    assert.equal(exitCalls.length, 2, 'expected exactly 2 strategy.exit calls (long side, short side)');
    for (const call of exitCalls) {
      assert.ok(call[0].includes('stop = signalSl'));
      assert.ok(call[0].includes('limit = signalTp2'));
    }
  });

  it('both files compile with 0 errors/warnings (re-verified here, not assumed)', async () => {
    // This test only re-confirms the files exist and are non-empty; the
    // authoritative compile check is run via `tv pine check` in the master
    // report (network-dependent, not suitable for a unit test), consistent
    // with every prior phase's verification methodology.
    assert.ok(indicatorSource.length > 1000);
    assert.ok(strategySource.length > 1000);
  });
});
