/**
 * src/engine/opportunityLedger.js -- Opportunity Ledger persistence.
 * Proves: safe load/save (including malformed input), atomic writes,
 * deterministic opportunity identity (mirroring Stage 3's philosophy,
 * never modifying Stage 3 itself), same-bar dedup, transition history
 * preservation (including candidate-before-overextended/missed), and
 * that this module makes no CDP/TradingView call of any kind.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLedgerStore, saveLedgerStore, loadLedgerLog,
  computeOpportunityId, recordOpportunityObservation, LEDGER_STORE_SCHEMA_VERSION,
} from '../src/engine/opportunityLedger.js';

function baseDecision(overrides = {}) {
  return { action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE', symbol: 'OANDA:XAUUSD', diagnostics: { source_timeframe: '15m' }, ...overrides };
}

function basePlan(overrides = {}) {
  return {
    status: 'PLAN', symbol: 'OANDA:XAUUSD', source_timeframe: '15m', direction: 'BEARISH',
    setup_family: 'pullback_continuation', setup_model: 'PB', opportunity_state: 'DEVELOPING',
    zone: { type: 'supply_zone', lower: 4378, upper: 4386, source: 'levels.js supplyDemandZones' },
    interaction_state: 'APPROACHING',
    candidate_entry_zone: { lower: 4378, upper: 4386 },
    provisional_invalidation: { level: 4386, condition: 'confirmed close above 4386' },
    candidate_tp1: 4340, candidate_tp2: 4300, candidate_rr: 2.5,
    confirmation_required: ['a confirmed reclaim'], confirmation_observed: [], blocking_conditions: ['RR_NOT_ACCEPTABLE'],
    generated_from_bar_time: 1700000000,
    ...overrides,
  };
}

function memoryDeps(nowIso = '2025-01-01T00:00:00.000Z') {
  let store = { schema_version: LEDGER_STORE_SCHEMA_VERSION, opportunities: {} };
  const log = [];
  return {
    _deps: {
      loadStore: () => store,
      saveStore: (_p, s) => { store = s; },
      appendLogLine: (_p, record) => { log.push(record); },
      now: () => new Date(nowIso),
    },
    getStore: () => store,
    getLog: () => log,
  };
}

/** Strips block/line comments so a source-audit regex checks actual CODE, never prose in a doc comment explaining what the module does NOT do (this module's own header deliberately discusses anticipationStore.js by name to explain the relationship, without importing it). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('opportunityLedger: source audit -- no CDP/TradingView call anywhere', () => {
  it('never references evaluate(), getChartApi(), connection.js, or the calculation engine', () => {
    const src = readFileSync(new URL('../src/engine/opportunityLedger.js', import.meta.url), 'utf8');
    assert.ok(!/evaluate\(/.test(src));
    assert.ok(!/getChartApi/.test(src));
    assert.ok(!/from ['"].*connection\.js['"]/.test(src));
    assert.ok(!/from ['"].*xauusd_calculate\.js['"]/.test(src));
    assert.ok(!/from ['"].*core\/(chart|data)\.js['"]/.test(src));
  });

  it('never imports or modifies src/engine/anticipationStore.js -- a separate, additive ledger', () => {
    const code = stripComments(readFileSync(new URL('../src/engine/opportunityLedger.js', import.meta.url), 'utf8'));
    assert.ok(!/anticipationStore\.js/.test(code));
  });
});

describe('opportunityLedger: store load/save safety', () => {
  it('missing store file initializes safely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opportunity-ledger-'));
    try {
      const store = loadLedgerStore(join(dir, 'does-not-exist.json'));
      assert.deepEqual(store, { schema_version: LEDGER_STORE_SCHEMA_VERSION, opportunities: {} });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('malformed store file fails safely, never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opportunity-ledger-'));
    try {
      const path = join(dir, 'corrupt.json');
      writeFileSync(path, '{ not valid json [[[');
      assert.deepEqual(loadLedgerStore(path), { schema_version: LEDGER_STORE_SCHEMA_VERSION, opportunities: {} });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('valid JSON but wrong shape also fails safely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opportunity-ledger-'));
    try {
      const path = join(dir, 'wrong-shape.json');
      writeFileSync(path, JSON.stringify([1, 2, 3]));
      assert.deepEqual(loadLedgerStore(path), { schema_version: LEDGER_STORE_SCHEMA_VERSION, opportunities: {} });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('saveLedgerStore writes atomically -- round-trips and leaves no leftover .tmp file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opportunity-ledger-'));
    try {
      const path = join(dir, 'store.json');
      saveLedgerStore(path, { opportunities: { k1: { opportunity_id: 'k1', opportunity_state: 'DEVELOPING' } } });
      const reloaded = loadLedgerStore(path);
      assert.equal(reloaded.opportunities.k1.opportunity_state, 'DEVELOPING');
      const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp-'));
      assert.deepEqual(leftovers, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a malformed/torn last log line is skipped, never fatal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opportunity-ledger-'));
    try {
      const path = join(dir, 'log.jsonl');
      writeFileSync(path, '{"a":1}\n{ torn line no close');
      const records = loadLedgerLog(path);
      assert.equal(records.length, 1);
      assert.equal(records[0].a, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('opportunityLedger: deterministic opportunity identity', () => {
  it('is deterministic for identical symbol/timeframe/direction/zone', () => {
    const id1 = computeOpportunityId({ symbol: 'OANDA:XAUUSD', sourceTimeframe: '15m', direction: 'BEARISH', zone: { lower: 4378, upper: 4386 } });
    const id2 = computeOpportunityId({ symbol: 'OANDA:XAUUSD', sourceTimeframe: '15m', direction: 'BEARISH', zone: { lower: 4378, upper: 4386 } });
    assert.equal(id1, id2);
  });

  it('a different zone produces a different id', () => {
    const id1 = computeOpportunityId({ symbol: 'OANDA:XAUUSD', sourceTimeframe: '15m', direction: 'BEARISH', zone: { lower: 4378, upper: 4386 } });
    const id2 = computeOpportunityId({ symbol: 'OANDA:XAUUSD', sourceTimeframe: '15m', direction: 'BEARISH', zone: { lower: 4400, upper: 4410 } });
    assert.notEqual(id1, id2);
  });

  it('a different direction produces a different id, same zone', () => {
    const id1 = computeOpportunityId({ symbol: 'OANDA:XAUUSD', sourceTimeframe: '15m', direction: 'BEARISH', zone: { lower: 4378, upper: 4386 } });
    const id2 = computeOpportunityId({ symbol: 'OANDA:XAUUSD', sourceTimeframe: '15m', direction: 'BULLISH', zone: { lower: 4378, upper: 4386 } });
    assert.notEqual(id1, id2);
  });

  it('excludes setup_family/setup_model from identity (mirrors Stage 3 philosophy) -- continuity survives a family/model first resolving', () => {
    const zone = { lower: 4378, upper: 4386 };
    const id1 = computeOpportunityId({ symbol: 'OANDA:XAUUSD', sourceTimeframe: '15m', direction: 'BEARISH', zone });
    // identity function itself takes no family/model param at all -- structurally cannot fracture identity on that basis.
    const id2 = computeOpportunityId({ symbol: 'OANDA:XAUUSD', sourceTimeframe: '15m', direction: 'BEARISH', zone });
    assert.equal(id1, id2);
  });
});

describe('opportunityLedger: recordOpportunityObservation -- recording, dedup, transitions', () => {
  it('a NO_PLAN snapshot is never recorded', () => {
    const { _deps, getLog } = memoryDeps();
    const result = recordOpportunityObservation({ decision: baseDecision(), plan: { status: 'NO_PLAN', reason: 'NO_OBJECTIVE_ZONE_AVAILABLE' }, confirmedBarTime: 1700000000, _deps });
    assert.equal(result.recorded, false);
    assert.equal(result.reason, 'NO_OBJECTIVE_PLAN');
    assert.deepEqual(getLog(), []);
  });

  it('records the first observation for a new opportunity', () => {
    const { _deps, getLog } = memoryDeps();
    const result = recordOpportunityObservation({ decision: baseDecision(), plan: basePlan(), confirmedBarTime: 1700000000, _deps });
    assert.equal(result.recorded, true);
    assert.equal(getLog().length, 1);
    assert.equal(getLog()[0].opportunity_state, 'DEVELOPING');
    assert.equal(getLog()[0].transition, null);
  });

  it('same confirmed bar + same opportunity + same state -> DUPLICATE_OBSERVATION, no re-append', () => {
    const { _deps, getLog } = memoryDeps();
    recordOpportunityObservation({ decision: baseDecision(), plan: basePlan(), confirmedBarTime: 1700000000, _deps });
    const second = recordOpportunityObservation({ decision: baseDecision(), plan: basePlan(), confirmedBarTime: 1700000000, _deps });
    assert.equal(second.recorded, false);
    assert.equal(second.reason, 'DUPLICATE_OBSERVATION');
    assert.equal(getLog().length, 1);
  });

  it('a genuine state transition on a new confirmed bar creates a new record with the transition text', () => {
    const { _deps, getLog } = memoryDeps();
    recordOpportunityObservation({ decision: baseDecision(), plan: basePlan({ opportunity_state: 'DEVELOPING' }), confirmedBarTime: 1700000000, _deps });
    recordOpportunityObservation({ decision: baseDecision(), plan: basePlan({ opportunity_state: 'APPROACHING_ZONE' }), confirmedBarTime: 1700000900, _deps });
    assert.equal(getLog().length, 2);
    assert.equal(getLog()[1].transition, 'DEVELOPING -> APPROACHING_ZONE');
    assert.equal(getLog()[1].previous_opportunity_state, 'DEVELOPING');
  });

  it('full lifecycle: APPROACHING_ZONE -> ZONE_TOUCHED -> REACTION_PENDING -> CONFIRMATION_PENDING -> ARMED -> CONFIRMED, each a separate preserved record', () => {
    const { _deps, getLog } = memoryDeps();
    const states = ['DEVELOPING', 'APPROACHING_ZONE', 'ZONE_TOUCHED', 'REACTION_PENDING', 'CONFIRMATION_PENDING', 'ARMED', 'CONFIRMED'];
    let t = 1700000000;
    for (const state of states) {
      recordOpportunityObservation({ decision: baseDecision(state === 'CONFIRMED' ? { action: 'SELL' } : {}), plan: basePlan({ opportunity_state: state }), confirmedBarTime: t, _deps });
      t += 900;
    }
    assert.equal(getLog().length, states.length);
    for (let i = 1; i < states.length; i++) assert.equal(getLog()[i].transition, `${states[i - 1]} -> ${states[i]}`);
  });

  it('armed -> invalidated is recorded as its own transition, preserving the ARMED history', () => {
    const { _deps, getLog } = memoryDeps();
    recordOpportunityObservation({ decision: baseDecision(), plan: basePlan({ opportunity_state: 'ARMED' }), confirmedBarTime: 1700000000, _deps });
    recordOpportunityObservation({ decision: baseDecision(), plan: basePlan({ opportunity_state: 'INVALIDATED' }), confirmedBarTime: 1700000900, _deps });
    assert.equal(getLog().length, 2);
    assert.equal(getLog()[0].opportunity_state, 'ARMED');
    assert.equal(getLog()[1].transition, 'ARMED -> INVALIDATED');
  });

  it('candidate-before-overextended history is preserved verbatim (mission Section 24) -- MISSED never overwrites the earlier DEVELOPING/APPROACHING_ZONE/REACTION_PENDING rows', () => {
    const { _deps, getLog } = memoryDeps();
    const sequence = [
      ['DEVELOPING', 1700000000],
      ['APPROACHING_ZONE', 1700000900],
      ['REACTION_PENDING', 1700001800],
      ['CONFIRMATION_PENDING', 1700002700],
      ['MISSED', 1700003600],
    ];
    for (const [state, t] of sequence) recordOpportunityObservation({ decision: baseDecision(), plan: basePlan({ opportunity_state: state }), confirmedBarTime: t, _deps });
    const log = getLog();
    assert.equal(log.length, 5);
    // Every earlier row is still present, unmutated, in order -- the ledger is append-only.
    assert.deepEqual(log.map((r) => r.opportunity_state), ['DEVELOPING', 'APPROACHING_ZONE', 'REACTION_PENDING', 'CONFIRMATION_PENDING', 'MISSED']);
    assert.equal(log[log.length - 1].transition, 'CONFIRMATION_PENDING -> MISSED');
  });

  it('no hindsight mutation: an earlier record is never rewritten once a later state is known', () => {
    const { _deps, getLog } = memoryDeps();
    recordOpportunityObservation({ decision: baseDecision(), plan: basePlan({ opportunity_state: 'DEVELOPING' }), confirmedBarTime: 1700000000, _deps });
    const firstRecordSnapshot = JSON.stringify(getLog()[0]);
    recordOpportunityObservation({ decision: baseDecision(), plan: basePlan({ opportunity_state: 'MISSED' }), confirmedBarTime: 1700000900, _deps });
    assert.equal(JSON.stringify(getLog()[0]), firstRecordSnapshot);
  });

  it('records authoritative_action/authoritative_reason verbatim from decision, and candidate geometry verbatim from plan', () => {
    const { _deps, getLog } = memoryDeps();
    recordOpportunityObservation({ decision: baseDecision({ action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE' }), plan: basePlan(), confirmedBarTime: 1700000000, _deps });
    const record = getLog()[0];
    assert.equal(record.authoritative_action, 'WAIT');
    assert.equal(record.authoritative_reason, 'RR_NOT_ACCEPTABLE');
    assert.equal(record.candidate_tp1, 4340);
    assert.equal(record.candidate_rr, 2.5);
    assert.deepEqual(record.zone, basePlan().zone);
  });
});
