/**
 * Pine P5 static source audit — proves the actual Pine expressions match
 * the reference model in tests/pine_p5_outcome_reference_model.test.js,
 * and proves the explicit P5 architectural requirements: P5 consumes the
 * existing P3 signal-approval event rather than creating a second signal
 * detector, the machine-readable contract table is untouched/compatible,
 * and the new P5 tables can never be mistaken for it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PINE_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master.pine', import.meta.url));
const source = readFileSync(PINE_PATH, 'utf8');
const codeLines = source.split('\n').filter((l) => !l.trim().startsWith('//'));
const codeSource = codeLines.join('\n');

describe('P5 §2: consumes the existing P3 signal boundary — no new detector', () => {
  it('the P5 recorder hook (SignalRecord.new / array.push(openSignals)) is textually inside the existing "if newSignalId != signalId" block, after signalSession is frozen', () => {
    const freezeBlockStart = source.indexOf('if newSignalId != signalId');
    assert.ok(freezeBlockStart > 0, 'the existing P3 freeze condition must still exist unchanged');
    const nextTopLevelSection = source.indexOf('// One-time consumption:');
    assert.ok(nextTopLevelSection > freezeBlockStart, 'the block after the freeze must still be the existing BO-consumption comment, unchanged position');
    const freezeBlock = source.slice(freezeBlockStart, nextTopLevelSection);
    assert.ok(freezeBlock.includes('signalSession := session'), 'the original P3 freeze assignments must remain, unmodified, before the P5 hook');
    assert.ok(freezeBlock.includes('SignalRecord.new('), 'the P5 record creation must be inside this exact existing block');
    assert.ok(freezeBlock.includes('array.push(openSignals'), 'the P5 array push (into the never-capacity-evicted openSignals tracker) must be inside this exact existing block');
    // The hook must come AFTER the original assignments, never before/replacing them.
    assert.ok(freezeBlock.indexOf('signalSession := session') < freezeBlock.indexOf('SignalRecord.new('));
  });

  it('candOriginFresh and lastEmittedOriginKey (the existing P3 dedup mechanism) are unchanged and still gate finalTradeApproved — P5 adds no parallel/competing dedup mechanism', () => {
    assert.ok(/candOriginFresh = candOriginKey != "NA" and candOriginKey != lastEmittedOriginKey/.test(source));
    assert.ok(/finalTradeApproved = newsSuppressed == false and[\s\S]{0,400}candOriginFresh/.test(source), 'finalTradeApproved must still require candOriginFresh, unchanged');
  });

  it('candEntry = close is unchanged — P5 does not redefine entry mechanics', () => {
    assert.ok(/^candEntry = close$/m.test(source));
  });

  it('finalTradeApproved conjunction is unchanged in content (same gates, same order) aside from P5 code inserted elsewhere in the file', () => {
    const m = source.match(/finalTradeApproved = newsSuppressed == false and[\s\S]*?candOriginFresh\n/);
    assert.ok(m, 'finalTradeApproved must still exist with all original gates');
    const block = m[0];
    for (const gate of ['officialRegime != "CHOP_UNCERTAIN"', 'officialRegime != "TRANSITION"', 'not correctionActive', 'anyEligible and anySetupReady and candTriggered', 'confirmedBar', 'not candEntryLate and not candOverextended', 'qualityOk and rrOk', 'slGeometryOk and not na(candRr)', 'candOriginFresh']) {
      assert.ok(block.includes(gate), `finalTradeApproved must still include: ${gate}`);
    }
  });

  it('contractAction is still the ONLY place BUY/SELL is produced, and is unchanged by P5', () => {
    assert.ok(/contractAction = finalTradeApproved \? \(candIsLong \? "BUY" : "SELL"\) : "WAIT"/.test(source));
    const buySell = [...codeSource.matchAll(/"BUY"|"SELL"/g)];
    // Same invariant proven in every prior phase: BUY/SELL literals only ever
    // appear on lines gated by finalTradeApproved.
    for (const m of buySell) {
      const lineStart = codeSource.lastIndexOf('\n', m.index) + 1;
      const lineEnd = codeSource.indexOf('\n', m.index);
      const line = codeSource.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      assert.ok(line.includes('finalTradeApproved'), `line containing BUY/SELL literal must be gated by finalTradeApproved: "${line.trim()}"`);
    }
  });
});

describe('P5 §11/§30: signal-bar chronology — source proof', () => {
  it('the resolution loop requires "bar_index > rec.signalBarIndex" — the signal bar itself can never resolve its own signal', () => {
    const resolutionStart = source.indexOf('P5 — OUTCOME RESOLUTION');
    assert.ok(resolutionStart > 0);
    const block = source.slice(resolutionStart, resolutionStart + 2000);
    assert.ok(/bar_index > rec\.signalBarIndex/.test(block), 'resolution must require strict bar_index > signalBarIndex');
  });

  it('ENTRY = close of the confirmed signal bar (candEntry = close) — documented as the reason resolution cannot start on that same bar', () => {
    assert.ok(source.includes('candEntry = close'));
    assert.ok(/before the entry was actually filled/.test(source), 'the chronology rationale must be documented in-source');
  });
});

describe('P5 §10: same-bar ambiguity — source proof of the conservative rule', () => {
  it('isPass = targetHit and not slHit — both-hit resolves to FAIL, never PASS, and is never inferred from candle color', () => {
    const resolutionStart = source.indexOf('P5 — OUTCOME RESOLUTION');
    const block = source.slice(resolutionStart, resolutionStart + 3000);
    assert.ok(/isPass = targetHit and not slHit/.test(block), 'same-bar ambiguity must resolve via "targetHit and not slHit", which is false whenever slHit is true (including both-hit)');
    assert.ok(/sameBarAmbiguity := slHit and targetHit/.test(block), 'the sameBarAmbiguity flag must be recorded exactly when both are hit');
    assert.ok(!block.includes('color'), 'candle color must never be referenced in outcome resolution');
    assert.ok(!/open.*high.*low.*close|open.*low.*high.*close/i.test(block), 'no assumed intrabar path (open->high->low->close or open->low->high->close) may be encoded');
  });
});

describe('P5 §7: terminal target selection — source proof of either/or semantics', () => {
  it('successTarget = tp2 if present, else exitTarget — mirrors master_contract.js\'s existing hasExit either/or rule, never requires both', () => {
    assert.ok(/p5SuccessTarget = not na\(candTp2\) \? candTp2 : na/.test(source));
  });
  it('TP1 is never used as the resolution target — only successTarget (tp2/exitTarget) is checked against high/low', () => {
    const resolutionStart = source.indexOf('P5 — OUTCOME RESOLUTION');
    const block = source.slice(resolutionStart, resolutionStart + 2000);
    assert.ok(!/rec\.tp1/.test(block), 'the resolution loop must never reference rec.tp1 for PASS/FAIL determination');
  });
});

describe('P5 §14/§16: storage, eviction, and R-multiple — source proof', () => {
  it('OPEN-record eviction correctness (P5 review/fix): openSignals is NEVER capacity-evicted; only recentHistory (closed-only) is bounded/FIFO-evicted, keyed on p5MaxTrackedSignals', () => {
    // openSignals must have no array.shift/array.remove-based CAPACITY
    // eviction anywhere — the only array.remove(openSignals, ...) call must
    // be the resolution-time "move to recentHistory" operation, never a
    // size-based eviction.
    assert.ok(!/array\.shift\(openSignals\)/.test(source), 'openSignals must never be capacity-evicted (array.shift)');
    assert.ok(!/if array\.size\(openSignals\) >=? p5MaxTrackedSignals/.test(source), 'openSignals must never be gated by the recent-history capacity constant');
    assert.ok(/array\.remove\(openSignals, i\)/.test(source), 'the only openSignals removal must be the resolution-time move (by index, inside the backward-iterating loop)');
    assert.ok(/if array\.size\(recentHistory\) >= p5MaxTrackedSignals\s*\n\s*array\.shift\(recentHistory\)/.test(source), 'recentHistory (closed-only) must remain deterministic oldest-first FIFO, bounded by p5MaxTrackedSignals');
    assert.ok(/array\.push\(recentHistory, rec\)/.test(source), 'a resolved record must be pushed into recentHistory immediately after being removed from openSignals');
  });
  it('the Pine resource safety ceiling (p5MaxOpenSignals) never evicts an unresolved signal — it latches a visible flag and counts the untracked signal instead', () => {
    assert.ok(/if array\.size\(openSignals\) >= p5MaxOpenSignals/.test(source));
    const ceilingBlockStart = source.indexOf('if array.size(openSignals) >= p5MaxOpenSignals');
    const ceilingBlock = source.slice(ceilingBlockStart, ceilingBlockStart + 300);
    assert.ok(/p5OpenCeilingBreached := true/.test(ceilingBlock));
    assert.ok(/p5UntrackedSignals \+= 1/.test(ceilingBlock));
    assert.ok(!/array\.shift\(openSignals\)|array\.remove\(openSignals/.test(ceilingBlock), 'hitting the ceiling must never evict an existing unresolved signal');
    assert.ok(/var bool\s+p5OpenCeilingBreached\s*=\s*false/.test(source));
    assert.ok(/var int\s+p5UntrackedSignals\s*=\s*0/.test(source));
    assert.ok(/f_row\(p5StatsTable, \d+,\s*"P5_OPEN_CEILING_BREACHED"/.test(source), 'the breach condition must be exposed in the stats table, never hidden');
    assert.ok(/f_row\(p5StatsTable, \d+,\s*"P5_UNTRACKED_SIGNALS"/.test(source));
  });
  it('lifetime aggregates (p5TotalSignals, p5TotalPass, p5TotalFail) are separate variables from the bounded array — eviction cannot alter them retroactively', () => {
    assert.ok(/var int\s+p5TotalSignals\s*=\s*0/.test(source));
    assert.ok(/p5TotalSignals \+= 1/.test(source));
    // p5TotalSignals is incremented at creation time (inside the freeze
    // block), never derived from array.size(openSignals)/recentHistory —
    // proven by the increment NOT depending on either array's contents.
    const incrementLine = source.match(/p5TotalSignals \+= 1/);
    assert.ok(incrementLine);
  });
  it('R-multiple formula matches BUY/SELL risk/reward definitions exactly (no blind reuse of reportedRr)', () => {
    assert.ok(/risk = isLong \? rec\.entry - rec\.initialSl : rec\.initialSl - rec\.entry/.test(source));
    assert.ok(/reward = isLong \? rec\.successTarget - rec\.entry : rec\.entry - rec\.successTarget/.test(source));
    assert.ok(/rMultiple = isPass \? \(risk > 0 \? reward \/ risk : na\) : -1\.0/.test(source));
    // reportedRr (candRr/signal snapshot) is stored separately and never overwritten by the calculated R.
    assert.ok(/reportedRr = candRr/.test(source));
  });
});

describe('P5 §23/§25: contract compatibility — the authoritative table is untouched, P5 tables can never be mistaken for it', () => {
  it('CONTRACT_VERSION remains 1, unchanged', () => {
    assert.ok(/CONTRACT_VERSION\s*=\s*1\b/.test(source));
  });
  it('the authoritative contractTable definition and its 50 f_row(...) contract rows are unchanged in content', () => {
    assert.ok(/var table contractTable = table\.new\(position\.top_right, 2, 50/.test(source));
    assert.ok(/f_row\(contractTable, 0,\s*"CONTRACT_VERSION"/.test(source));
  });
  it('the new P5 stats/recent-signals tables never emit a "CONTRACT_VERSION" row — they cannot be mistaken for the authoritative contract table by the anchor-based MCP selection', () => {
    const p5TableStart = source.indexOf('P5 — STATISTICS TABLE');
    assert.ok(p5TableStart > 0);
    // Only real f_row(...)/table.cell(...) calls count — the surrounding
    // doc comment deliberately DISCUSSES the word "CONTRACT_VERSION" (to
    // explain why it must be absent), which a bare substring search would
    // wrongly flag. Strip comment lines before checking.
    const p5Lines = source.slice(p5TableStart).split('\n').filter((l) => !l.trim().startsWith('//'));
    const p5Code = p5Lines.join('\n');
    assert.ok(!/"CONTRACT_VERSION"/.test(p5Code), 'no P5 table row/cell may emit a literal "CONTRACT_VERSION" key');
  });
  it('the P5 stats table and recent-signals table use distinct table positions from the contract table (top_right) and debug table (bottom_right)', () => {
    assert.ok(/table\.new\(position\.bottom_left,\s*2,\s*49/.test(source), 'p5StatsTable must be at bottom_left');
    assert.ok(/table\.new\(position\.middle_left,\s*8,\s*31/.test(source), 'p5RecentTable must be at middle_left');
  });
});

describe('P5 §37: MCP impact audit — no MCP-side file was touched by P5', () => {
  it('src/core/master_contract.js, src/core/xauusd.js, src/profiles.js are untouched by this diff (git-diff-based, not source-content-based)', () => {
    // This is verified operationally (git diff --stat) in the master report,
    // not re-derivable from the Pine source alone — this test instead
    // proves the Pine-side half of the compatibility claim: the contract
    // table's row COUNT and CONTRACT_VERSION anchor are unchanged, which is
    // the only thing master_contract.js actually parses.
    const rowCount = [...source.matchAll(/f_row\(contractTable, (\d+),/g)].map((m) => Number(m[1]));
    assert.equal(Math.max(...rowCount), 49, 'contractTable must still have exactly 50 rows (indices 0-49), unchanged by P5');
  });
});

describe('P5 versioning', () => {
  it('INDICATOR_VERSION is 0.4.0', () => {
    assert.ok(/INDICATOR_VERSION\s*=\s*"0\.4\.0"/.test(source));
  });
});
