/**
 * Phase 2A regression suite: profile security, quote/screenshot hardening,
 * the XAUUSD guard, Master Indicator discovery, xauusd_master_state, and
 * xauusd_market_snapshot. No CDP/TradingView connection needed — everything
 * here is either a pure function or exercised with injected _deps mocks.
 *
 * Expanded in the Phase 2A review/fix pass with adversarial coverage:
 * duplicate/partition audits of the tool classification lists, a
 * setSymbol-throwing mock proving quote_get's guard never lets a symbol
 * reach the switch code path, exhaustive screenshot-method variants, exact
 * profile fail-closed matrix, and a bullish/bearish-data injection test
 * proving xauusd_master_state never infers Pine-owned state from raw
 * OHLCV/indicator values.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import {
  resolveProfile, DEFAULT_PROFILE,
  APPROVED_RESEARCH_TOOLS, APPROVED_DEVELOPMENT_EXTRA_TOOLS,
  PROHIBITED_MUTATING_TOOLS, OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE,
} from '../src/profiles.js';
import { createProfileGate, guardedQuoteGet, guardedCaptureScreenshot } from '../src/profile_gate.js';
import { checkXauusdSymbol, getApprovedAliases, DEFAULT_XAUUSD_SYMBOLS, XAUUSD_ALIASES_ENV_VAR } from '../src/xauusd_guard.js';
import { discoverMasterCandidates, MASTER_NAMES_ENV_VAR } from '../src/master_identity.js';
import { getMasterState, getMarketSnapshot, getResearchHealth } from '../src/core/xauusd.js';

import { registerHealthTools } from '../src/tools/health.js';
import { registerChartTools } from '../src/tools/chart.js';
import { registerPineTools } from '../src/tools/pine.js';
import { registerDataTools } from '../src/tools/data.js';
import { registerCaptureTools } from '../src/tools/capture.js';
import { registerDrawingTools } from '../src/tools/drawing.js';
import { registerAlertTools } from '../src/tools/alerts.js';
import { registerBatchTools } from '../src/tools/batch.js';
import { registerReplayTools } from '../src/tools/replay.js';
import { registerIndicatorTools } from '../src/tools/indicators.js';
import { registerWatchlistTools } from '../src/tools/watchlist.js';
import { registerUiTools } from '../src/tools/ui.js';
import { registerPaneTools } from '../src/tools/pane.js';
import { registerTabTools } from '../src/tools/tab.js';
import { registerXauusdTools } from '../src/tools/xauusd.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function mockMcpServer() {
  const calls = [];
  return {
    calls,
    tool(name, description, schema, handler) {
      calls.push({ name, description, schema, handler });
    },
  };
}

function buildGate(profileName) {
  const profile = resolveProfile(profileName);
  const raw = mockMcpServer();
  const gate = createProfileGate(raw, profile);
  registerHealthTools(gate);
  registerChartTools(gate);
  registerPineTools(gate);
  registerDataTools(gate);
  registerCaptureTools(gate);
  registerDrawingTools(gate);
  registerAlertTools(gate);
  registerBatchTools(gate);
  registerReplayTools(gate);
  registerIndicatorTools(gate);
  registerWatchlistTools(gate);
  registerUiTools(gate);
  registerPaneTools(gate);
  registerTabTools(gate);
  registerXauusdTools(gate, { profile });
  return { profile, raw, gate };
}

function parseResult(mcpResult) {
  return JSON.parse(mcpResult.content[0].text);
}

// Ground truth: every tool name actually registered by the 14 original
// tools/*.js files (excludes our own tools/xauusd.js). Extracted from source
// rather than hand-maintained, so this suite can't drift from reality.
function extractUpstreamToolNames() {
  const toolsDir = fileURLToPath(new URL('../src/tools/', import.meta.url));
  const files = readdirSync(toolsDir).filter((f) => f.endsWith('.js') && f !== 'xauusd.js' && f !== '_format.js');
  const names = [];
  for (const f of files) {
    const source = readFileSync(join(toolsDir, f), 'utf8');
    for (const m of source.matchAll(/\.tool\('([a-zA-Z_]+)'/g)) names.push(m[1]);
  }
  return names;
}

// ═══════════════════════════════════════════════════════════════════════
// PROFILE SECURITY (1–10) + review items 2 & 3 (duplicates, partition, coherence)
// ═══════════════════════════════════════════════════════════════════════

describe('Profile security', () => {
  it('1. Research is the default profile', () => {
    assert.equal(resolveProfile(undefined).name, 'XAUUSD_RESEARCH');
    assert.equal(resolveProfile('').name, 'XAUUSD_RESEARCH');
    assert.equal(DEFAULT_PROFILE, 'XAUUSD_RESEARCH');
  });

  it('2. Invalid/unknown profile fails closed (throws, never falls back to all-tools)', () => {
    assert.throws(() => resolveProfile('NOT_A_REAL_PROFILE'), /Unknown MCP profile/);
    assert.throws(() => resolveProfile('xauusd_research'), /Unknown MCP profile/); // case-sensitive, no fuzzy fallback
  });

  it('3. Research exposes only the approved tool list', () => {
    const { gate } = buildGate('XAUUSD_RESEARCH');
    assert.deepEqual(gate.getRegisteredTools().sort(), [...APPROVED_RESEARCH_TOOLS].sort());
  });

  it('4. Research exposes zero prohibited state-changing tools', () => {
    const { gate } = buildGate('XAUUSD_RESEARCH');
    const registered = new Set(gate.getRegisteredTools());
    const leaked = PROHIBITED_MUTATING_TOOLS.filter((t) => registered.has(t));
    assert.deepEqual(leaked, []);
  });

  it('5. Development tools do not leak into Research', () => {
    const { gate } = buildGate('XAUUSD_RESEARCH');
    const registered = new Set(gate.getRegisteredTools());
    for (const t of APPROVED_DEVELOPMENT_EXTRA_TOOLS) {
      assert.ok(!registered.has(t), `${t} must not be registered in Research`);
      assert.ok(gate.getBlockedTools().includes(t), `${t} must be recorded as blocked`);
    }
  });

  it('6. ui_evaluate is inaccessible in both Research and Development', () => {
    for (const p of ['XAUUSD_RESEARCH', 'XAUUSD_DEVELOPMENT']) {
      const { gate } = buildGate(p);
      assert.ok(!gate.getRegisteredTools().includes('ui_evaluate'), `ui_evaluate must not register under ${p}`);
      assert.ok(gate.getBlockedTools().includes('ui_evaluate'));
    }
  });

  it('7. alert_create/alert_delete are inaccessible', () => {
    const { gate } = buildGate('XAUUSD_RESEARCH');
    const registered = gate.getRegisteredTools();
    assert.ok(!registered.includes('alert_create'));
    assert.ok(!registered.includes('alert_delete'));
  });

  it('8. replay_trade is inaccessible', () => {
    const { gate } = buildGate('XAUUSD_RESEARCH');
    assert.ok(!gate.getRegisteredTools().includes('replay_trade'));
  });

  it('9. watchlist mutations are inaccessible', () => {
    const { gate } = buildGate('XAUUSD_RESEARCH');
    const registered = gate.getRegisteredTools();
    for (const t of ['watchlist_add', 'watchlist_add_bulk', 'watchlist_remove']) {
      assert.ok(!registered.includes(t), `${t} must not be registered`);
    }
  });

  it('10. Pine write tools are inaccessible in Research', () => {
    const { gate } = buildGate('XAUUSD_RESEARCH');
    const registered = gate.getRegisteredTools();
    for (const t of ['pine_set_source', 'pine_save', 'pine_compile', 'pine_new', 'pine_open']) {
      assert.ok(!registered.includes(t), `${t} must not be registered in Research`);
    }
  });

  it('Development = Research ∪ exactly the 5 approved Pine dev tools, nothing else extra', () => {
    const research = new Set(buildGate('XAUUSD_RESEARCH').gate.getRegisteredTools());
    const dev = new Set(buildGate('XAUUSD_DEVELOPMENT').gate.getRegisteredTools());
    const extra = [...dev].filter((t) => !research.has(t)).sort();
    assert.deepEqual(extra, [...APPROVED_DEVELOPMENT_EXTRA_TOOLS].sort());
  });

  it('No dangerous tool leaks into either profile except the approved Development Pine tools', () => {
    for (const p of ['XAUUSD_RESEARCH', 'XAUUSD_DEVELOPMENT']) {
      const { gate } = buildGate(p);
      const registered = new Set(gate.getRegisteredTools());
      for (const dangerous of PROHIBITED_MUTATING_TOOLS) {
        assert.ok(!registered.has(dangerous), `${dangerous} must never be registered under ${p}`);
      }
    }
  });

  it('Review #2: none of the four classification lists contain a duplicate tool name', () => {
    for (const [label, list] of [
      ['APPROVED_RESEARCH_TOOLS', APPROVED_RESEARCH_TOOLS],
      ['APPROVED_DEVELOPMENT_EXTRA_TOOLS', APPROVED_DEVELOPMENT_EXTRA_TOOLS],
      ['PROHIBITED_MUTATING_TOOLS', PROHIBITED_MUTATING_TOOLS],
      ['OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE', OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE],
    ]) {
      assert.equal(new Set(list).size, list.length, `${label} contains a duplicate entry`);
    }
  });

  it('Review #3: the four classification lists exactly partition the 84 upstream tools (no omission, no double-classification)', () => {
    const upstream = extractUpstreamToolNames();
    assert.equal(upstream.length, 84, 'ground-truth upstream tool count changed — update the partition, not this assertion');
    assert.equal(new Set(upstream).size, 84, 'source scan itself found a duplicate registration — investigate tools/*.js');

    const researchUpstreamOnly = APPROVED_RESEARCH_TOOLS.filter((t) => upstream.includes(t)); // exclude our own 3 new tools
    const classified = [...researchUpstreamOnly, ...APPROVED_DEVELOPMENT_EXTRA_TOOLS, ...PROHIBITED_MUTATING_TOOLS, ...OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE];

    assert.equal(classified.length, 84, `classification lists cover ${classified.length} tools, expected exactly 84`);
    assert.deepEqual([...classified].sort(), [...upstream].sort(), 'classification lists must exactly equal the upstream tool set (a diff here means a tool is either missing or double-counted)');
    assert.equal(new Set(classified).size, 84, 'a tool appears in more than one classification list');
  });

  it('Review #3: xauusd_research_health only flags PROHIBITED_MUTATING_TOOLS, never a scope-excluded read-only tool', async () => {
    // Simulate a "leak" of a scope-excluded (but harmless) read-only tool —
    // this must NOT be reported as dangerous.
    const result = await getResearchHealth({
      profileName: 'XAUUSD_RESEARCH',
      registeredTools: ['chart_get_state', 'symbol_info', 'watchlist_get'], // symbol_info/watchlist_get are scope-excluded, not dangerous
      blockedTools: [],
      _deps: {
        getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '30' }),
        getMasterState: async () => ({ status: 'NOT_FOUND', indicator_found: false }),
      },
    });
    assert.deepEqual(result.dangerous_tools_exposed, []);
    assert.equal(result.status, 'OK');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// QUOTE SAFETY (11–13) + review item 5 (adversarial, setSymbol call count)
// ═══════════════════════════════════════════════════════════════════════

describe('Quote safety (guardedQuoteGet)', () => {
  it('11. Cannot switch symbol — different symbol request never reaches getQuote with a symbol', async () => {
    let quoteCalledWith = 'not-called';
    const _deps = {
      getState: async () => ({ symbol: 'OANDA:XAUUSD' }),
      getQuote: async (args) => { quoteCalledWith = args; return { success: true, symbol: 'OANDA:XAUUSD', last: 4287.6 }; },
    };
    const result = parseResult(await guardedQuoteGet({ symbol: 'BINANCE:BTCUSDT', _deps }));
    assert.equal(result.success, false);
    assert.match(result.error, /cannot switch symbols/i);
    assert.equal(quoteCalledWith, 'not-called', 'getQuote must never be invoked on a symbol mismatch');
  });

  it('12. Different-symbol request is rejected with current_symbol/requested_symbol reported', async () => {
    const _deps = {
      getState: async () => ({ symbol: 'OANDA:XAUUSD' }),
      getQuote: async () => { throw new Error('should not be called'); },
    };
    const result = parseResult(await guardedQuoteGet({ symbol: 'AAPL', _deps }));
    assert.equal(result.success, false);
    assert.equal(result.current_symbol, 'OANDA:XAUUSD');
    assert.equal(result.requested_symbol, 'AAPL');
  });

  it('13. Current-symbol (or blank) quote succeeds and never forwards a symbol arg', async () => {
    let quoteCalledWith;
    const _deps = {
      getState: async () => ({ symbol: 'OANDA:XAUUSD' }),
      getQuote: async (args) => { quoteCalledWith = args; return { success: true, symbol: 'OANDA:XAUUSD', last: 4287.6 }; },
    };
    const bare = parseResult(await guardedQuoteGet({ _deps }));
    assert.equal(bare.success, true);
    assert.deepEqual(quoteCalledWith, {});

    const sameSymbol = parseResult(await guardedQuoteGet({ symbol: 'XAUUSD', _deps }));
    assert.equal(sameSymbol.success, true);
    assert.deepEqual(quoteCalledWith, {}, 'symbol must never be forwarded even when it matches');
  });

  // ── Review item 5: adversarial trace with a mock that mimics upstream's
  // own setSymbol-then-restore logic and THROWS if it is ever reached. ────
  function realisticGetQuoteMock(currentSymbol) {
    const setSymbolCalls = [];
    const fn = async ({ symbol } = {}) => {
      const requested = (symbol ?? '').toString().trim();
      if (requested) {
        const bare = (s) => (s ?? '').toString().split(':').pop().toUpperCase();
        if (bare(currentSymbol) !== bare(requested)) {
          setSymbolCalls.push(requested);
          throw new Error(`MOCK FAILURE: setSymbol("${requested}") was invoked — a Research-profile quote_get must never switch the chart.`);
        }
      }
      return { success: true, symbol: currentSymbol, last: 4287.6 };
    };
    fn.setSymbolCalls = setSymbolCalls;
    return fn;
  }

  const currentSymbol = 'OANDA:XAUUSD';
  const adversarialInputs = [
    { label: 'omitted', symbol: undefined },
    { label: 'empty string', symbol: '' },
    { label: 'whitespace only', symbol: '   ' },
    { label: 'exact current symbol', symbol: 'OANDA:XAUUSD' },
    { label: 'bare ticker only, uppercase', symbol: 'XAUUSD' },
    { label: 'bare ticker only, lowercase', symbol: 'xauusd' },
    { label: 'mixed case full symbol', symbol: 'OaNdA:XaUuSd' },
    { label: 'leading/trailing whitespace around matching symbol', symbol: '  OANDA:XAUUSD  ' },
    { label: 'numeric-looking value (schema would reject, defends anyway)', symbol: '0' },
  ];

  for (const { label, symbol } of adversarialInputs) {
    it(`Review #5 (setSymbol count = 0): ${label}`, async () => {
      const mockGetQuote = realisticGetQuoteMock(currentSymbol);
      const _deps = { getState: async () => ({ symbol: currentSymbol }), getQuote: mockGetQuote };
      const result = parseResult(await guardedQuoteGet({ symbol, _deps }));
      assert.equal(mockGetQuote.setSymbolCalls.length, 0, `setSymbol must never be invoked for input "${symbol}"`);
      // '0' is a real mismatch (bare('0') !== bare('XAUUSD')) so it is correctly
      // rejected by the guard itself — still zero setSymbol invocations either way.
      if (label.startsWith('numeric')) {
        assert.equal(result.success, false);
      } else {
        assert.equal(result.success, true, `expected success for "${label}"`);
      }
    });
  }

  it('Review #5: a genuinely different symbol is rejected BEFORE the mock (and its internal setSymbol) ever runs', async () => {
    const mockGetQuote = realisticGetQuoteMock(currentSymbol);
    const _deps = { getState: async () => ({ symbol: currentSymbol }), getQuote: mockGetQuote };
    const result = parseResult(await guardedQuoteGet({ symbol: 'NASDAQ:AAPL', _deps }));
    assert.equal(result.success, false);
    assert.equal(mockGetQuote.setSymbolCalls.length, 0);
  });

  it('Review #5: a cross-broker same-ticker request (e.g. FOREXCOM:XAUUSD while chart shows OANDA:XAUUSD) is treated as "current" by bare-ticker comparison — documented, not a bug, and still zero setSymbol calls', async () => {
    const mockGetQuote = realisticGetQuoteMock(currentSymbol);
    const _deps = { getState: async () => ({ symbol: currentSymbol }), getQuote: mockGetQuote };
    const result = parseResult(await guardedQuoteGet({ symbol: 'FOREXCOM:XAUUSD', _deps }));
    assert.equal(result.success, true, 'bare-ticker match (ignoring exchange prefix) is accepted, mirroring upstream\'s own restore-comparison logic');
    assert.equal(mockGetQuote.setSymbolCalls.length, 0);
  });

  it('Review #5: failure to read current chart state cannot change symbol (getQuote never invoked)', async () => {
    let getQuoteCalled = false;
    const _deps = {
      getState: async () => { throw new Error('CDP unavailable'); },
      getQuote: async () => { getQuoteCalled = true; return { success: true }; },
    };
    const result = parseResult(await guardedQuoteGet({ symbol: 'AAPL', _deps }));
    assert.equal(result.success, false);
    assert.equal(getQuoteCalled, false, 'getQuote must never run if the current symbol could not be verified');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SCREENSHOT SAFETY (14–15) + review item 6 (exhaustive method variants)
// ═══════════════════════════════════════════════════════════════════════

describe('Screenshot safety (guardedCaptureScreenshot)', () => {
  it('14. CDP screenshot is allowed and forced explicitly', async () => {
    let calledWith;
    const _deps = { captureScreenshot: async (args) => { calledWith = args; return { success: true, method: 'cdp' }; } };
    const result = parseResult(await guardedCaptureScreenshot({ method: 'cdp', region: 'chart', _deps }));
    assert.equal(result.success, true);
    assert.equal(calledWith.method, 'cdp');
  });

  it('15. API/share screenshot mode is rejected and never reaches core capture', async () => {
    const _deps = { captureScreenshot: async () => { throw new Error('should not be called'); } };
    const result = parseResult(await guardedCaptureScreenshot({ method: 'api', _deps }));
    assert.equal(result.success, false);
    assert.match(result.error, /only supports method "cdp"/i);
  });

  // ── Review item 6: exhaustive method variants against a mock that fails
  // the test outright if it ever receives anything other than 'cdp'. ─────
  function strictCdpOnlyMock() {
    const calls = [];
    const fn = async (args) => {
      calls.push(args);
      if (args.method !== 'cdp') throw new Error(`MOCK FAILURE: capture reached with method="${args.method}" — the API/share path must never execute.`);
      return { success: true, method: 'cdp' };
    };
    fn.calls = calls;
    return fn;
  }

  const variants = [
    { label: 'omitted', method: undefined, expectAllowed: true },
    { label: 'cdp lowercase', method: 'cdp', expectAllowed: true },
    { label: 'CDP uppercase', method: 'CDP', expectAllowed: true },
    { label: 'CdP mixed case', method: 'CdP', expectAllowed: true },
    { label: 'cdp with whitespace', method: '  cdp  ', expectAllowed: true },
    { label: 'api lowercase', method: 'api', expectAllowed: false },
    { label: 'API uppercase', method: 'API', expectAllowed: false },
    { label: 'Api mixed case', method: 'Api', expectAllowed: false },
    { label: 'api with whitespace', method: '  api  ', expectAllowed: false },
    { label: 'unknown method', method: 'sharepoint', expectAllowed: false },
    { label: 'empty string', method: '', expectAllowed: true }, // treated like omitted
    { label: 'null', method: null, expectAllowed: true },
    { label: 'malformed: numeric', method: 123, expectAllowed: false },
    { label: 'malformed: object', method: { toString: () => 'api' }, expectAllowed: false },
  ];

  for (const { label, method, expectAllowed } of variants) {
    it(`Review #6: method variant — ${label}`, async () => {
      const mock = strictCdpOnlyMock();
      const result = parseResult(await guardedCaptureScreenshot({ method, _deps: { captureScreenshot: mock } }));
      assert.equal(result.success, expectAllowed, `expected success=${expectAllowed} for method=${JSON.stringify(method)}`);
      if (expectAllowed) {
        assert.equal(mock.calls.length, 1);
        assert.equal(mock.calls[0].method, 'cdp');
      } else {
        assert.equal(mock.calls.length, 0, 'the underlying capture must never be invoked when the method is rejected');
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PROFILE FAIL-CLOSED MATRIX (review item 7)
// ═══════════════════════════════════════════════════════════════════════

describe('Review #7: profile fail-closed matrix', () => {
  const cases = [
    { label: 'env missing (undefined)', value: undefined, expected: 'XAUUSD_RESEARCH' },
    { label: 'empty string', value: '', expected: 'XAUUSD_RESEARCH' },
    { label: 'explicit XAUUSD_RESEARCH', value: 'XAUUSD_RESEARCH', expected: 'XAUUSD_RESEARCH' },
    { label: 'explicit XAUUSD_DEVELOPMENT', value: 'XAUUSD_DEVELOPMENT', expected: 'XAUUSD_DEVELOPMENT' },
    { label: 'surrounding whitespace only, otherwise valid', value: '  XAUUSD_RESEARCH  ', expected: 'XAUUSD_RESEARCH' },
    { label: 'lowercase', value: 'xauusd_research', expected: null },
    { label: 'mixed case', value: 'Xauusd_Research', expected: null },
    { label: 'hyphen instead of underscore', value: 'XAUUSD-RESEARCH', expected: null },
    { label: 'internal whitespace', value: 'XAUUSD RESEARCH', expected: null },
    { label: 'whitespace-only value (blank after trim)', value: '   ', expected: 'XAUUSD_RESEARCH' },
    { label: 'unknown value', value: 'PRODUCTION', expected: null },
    { label: 'malicious-looking value (path traversal)', value: '../../etc/passwd', expected: null },
    { label: 'malicious-looking value (injection-shaped)', value: "XAUUSD_RESEARCH'; DROP TABLE profiles; --", expected: null },
    { label: 'prototype-pollution-shaped key', value: '__proto__', expected: null },
    { label: 'very long garbage string', value: 'X'.repeat(5000), expected: null },
  ];

  for (const { label, value, expected } of cases) {
    it(label, () => {
      if (expected) {
        assert.equal(resolveProfile(value).name, expected);
      } else {
        assert.throws(() => resolveProfile(value), /Unknown MCP profile/, `"${label}" must fail closed`);
      }
    });
  }

  it('a refused value never falls back to any profile, including the default', () => {
    let threw = false;
    try { resolveProfile('totally-bogus'); } catch { threw = true; }
    assert.ok(threw, 'must throw, not silently return XAUUSD_RESEARCH or any other profile');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// XAUUSD GUARD (16–19) + review item 4 (union semantics, not replace)
// ═══════════════════════════════════════════════════════════════════════

describe('XAUUSD identity guard', () => {
  it('16. OANDA:XAUUSD is accepted (built-in default)', () => {
    assert.equal(checkXauusdSymbol('OANDA:XAUUSD').approved, true);
  });

  it('Review #4: XAUUSD_ALLOWED_SYMBOLS is ADDITIVE (union), not a replacement', () => {
    const _deps = { env: { [XAUUSD_ALIASES_ENV_VAR]: 'MYBROKER:XAUUSD' } };
    const aliases = getApprovedAliases({ _deps });
    // Every built-in default must still be present...
    for (const d of DEFAULT_XAUUSD_SYMBOLS) assert.ok(aliases.includes(d), `default ${d} must survive when the env var only adds an alias`);
    // ...plus the new one.
    assert.ok(aliases.includes('MYBROKER:XAUUSD'));
    // The previously-tested "replaces" behavior must NOT hold:
    assert.equal(checkXauusdSymbol('OANDA:XAUUSD', { _deps }).approved, true, 'defaults must remain approved after adding an alias');
    assert.equal(checkXauusdSymbol('MyBroker:XauUsd', { _deps }).approved, true);
  });

  it('Review #4: trims whitespace around each additional alias', () => {
    const _deps = { env: { [XAUUSD_ALIASES_ENV_VAR]: '  MYBROKER:XAUUSD  ,  OTHERBROKER:XAUUSD  ' } };
    const aliases = getApprovedAliases({ _deps });
    assert.ok(aliases.includes('MYBROKER:XAUUSD'));
    assert.ok(aliases.includes('OTHERBROKER:XAUUSD'));
  });

  it('Review #4: normalizes case consistently (uppercase) for defaults and additions alike', () => {
    const _deps = { env: { [XAUUSD_ALIASES_ENV_VAR]: 'mybroker:xauusd' } };
    assert.ok(getApprovedAliases({ _deps }).includes('MYBROKER:XAUUSD'));
  });

  it('Review #4: rejects/drops empty aliases from stray or trailing commas', () => {
    const _deps = { env: { [XAUUSD_ALIASES_ENV_VAR]: 'MYBROKER:XAUUSD,,  ,OTHERBROKER:XAUUSD,' } };
    const aliases = getApprovedAliases({ _deps });
    assert.ok(!aliases.includes(''));
    assert.equal(aliases.filter((a) => a === '').length, 0);
    assert.ok(aliases.includes('MYBROKER:XAUUSD'));
    assert.ok(aliases.includes('OTHERBROKER:XAUUSD'));
  });

  it('Review #4: deduplicates (default repeated in env, or same alias twice)', () => {
    const _deps = { env: { [XAUUSD_ALIASES_ENV_VAR]: 'OANDA:XAUUSD,MYBROKER:XAUUSD,MYBROKER:XAUUSD,mybroker:xauusd' } };
    const aliases = getApprovedAliases({ _deps });
    assert.equal(aliases.filter((a) => a === 'OANDA:XAUUSD').length, 1);
    assert.equal(aliases.filter((a) => a === 'MYBROKER:XAUUSD').length, 1);
  });

  it('Review #4: no env var set → effective list equals the built-in defaults exactly (normalized)', () => {
    const _deps = { env: {} };
    assert.deepEqual(getApprovedAliases({ _deps }).sort(), DEFAULT_XAUUSD_SYMBOLS.map((s) => s.toUpperCase()).sort());
  });

  it('18 / Review #4: unrelated symbols are rejected, including ones that merely contain "GOLD" — exact matching only', () => {
    assert.equal(checkXauusdSymbol('NASDAQ:AAPL').approved, false);
    assert.equal(checkXauusdSymbol('BINANCE:GOLDUSDT').approved, false, 'substring "GOLD" must not match');
    assert.equal(checkXauusdSymbol('SOMEEXCHANGE:GOLDMINE').approved, false);
    assert.equal(checkXauusdSymbol('').approved, false);
    assert.equal(checkXauusdSymbol(null).approved, false);
    assert.equal(checkXauusdSymbol(undefined).approved, false);
    assert.equal(checkXauusdSymbol('   ').approved, false, 'whitespace-only must not be treated as approved');
  });

  it('19. Guard rejection performs no chart mutation (source audit: core/xauusd.js never calls a setter)', () => {
    const path = fileURLToPath(new URL('../src/core/xauusd.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    for (const forbidden of ['setSymbol', 'setTimeframe', 'setType', 'createStudy', 'createShape', 'removeEntity', 'manageIndicator']) {
      assert.ok(!source.includes(forbidden), `core/xauusd.js must not reference ${forbidden}`);
    }
  });

  it('never switches the chart even when the symbol is approved — checkXauusdSymbol is pure/read-only', () => {
    const path = fileURLToPath(new URL('../src/xauusd_guard.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    assert.ok(!source.includes('setSymbol'));
    assert.ok(!/evaluate\(/.test(source), 'the guard must never touch CDP at all — it is pure string comparison');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MASTER DISCOVERY (20–23) + review item 9 (adversarial identity audit)
// ═══════════════════════════════════════════════════════════════════════

describe('Master Indicator discovery', () => {
  it('20. No matching study → NOT_FOUND', () => {
    const result = discoverMasterCandidates([{ id: 'a', name: 'Relative Strength Index' }]);
    assert.equal(result.status, 'NOT_FOUND');
    assert.deepEqual(result.candidates, []);
  });

  it('20b. Zero candidates (empty studies array) → NOT_FOUND', () => {
    const result = discoverMasterCandidates([]);
    assert.equal(result.status, 'NOT_FOUND');
  });

  it('21. Exact approved name → FOUND with identity fields', () => {
    const result = discoverMasterCandidates([{ id: 'abc123', name: 'XAUUSD Adaptive Master' }]);
    assert.equal(result.status, 'FOUND');
    assert.equal(result.indicator.entity_id, 'abc123');
    assert.equal(result.indicator.display_name, 'XAUUSD Adaptive Master');
    assert.equal(result.indicator.matching_reason, 'exact_name_match');
  });

  it('Review #9: approved alias (configured via env) matches exactly', () => {
    const _deps = { env: { [MASTER_NAMES_ENV_VAR]: 'XAUUSD Adaptive Master,XAUUSD Master (Beta)' } };
    const result = discoverMasterCandidates([{ id: 'b1', name: 'XAUUSD Master (Beta)' }], { _deps });
    assert.equal(result.status, 'FOUND');
    assert.equal(result.indicator.entity_id, 'b1');
  });

  it('Review #9: case-insensitive exact match', () => {
    const result = discoverMasterCandidates([{ id: 'c1', name: 'xauusd adaptive master' }]);
    assert.equal(result.status, 'FOUND');
  });

  it('Review #9: one substring/prefix-like UNRELATED study must NOT match (name-squatting defense)', () => {
    const result = discoverMasterCandidates([
      { id: 'x1', name: 'XAUUSD Adaptive Master Pro' },      // different, unrelated indicator by another author
      { id: 'x2', name: 'XAUUSD Adaptive Master (Community Fork)' },
      { id: 'x3', name: 'Not XAUUSD Adaptive Master At All' },
    ]);
    assert.equal(result.status, 'NOT_FOUND', 'prefix/substring matches must never count as candidates');
    assert.deepEqual(result.candidates, []);
  });

  it('22. Two legitimate (exact-name) candidates → AMBIGUOUS', () => {
    const result = discoverMasterCandidates([
      { id: 'a', name: 'XAUUSD Adaptive Master' },
      { id: 'b', name: 'XAUUSD Adaptive Master' },
    ]);
    assert.equal(result.status, 'AMBIGUOUS');
    assert.equal(result.candidates.length, 2);
  });

  it('Review #9: duplicate display names with different IDs are both reported, never merged', () => {
    const result = discoverMasterCandidates([
      { id: 'study-111', name: 'XAUUSD Adaptive Master' },
      { id: 'study-222', name: 'XAUUSD Adaptive Master' },
    ]);
    assert.equal(result.status, 'AMBIGUOUS');
    assert.deepEqual(result.candidates.map((c) => c.entity_id).sort(), ['study-111', 'study-222']);
  });

  it('Review #9: missing entity ID does not crash and reports entity_id: null', () => {
    const result = discoverMasterCandidates([{ name: 'XAUUSD Adaptive Master' }]); // no `id` field
    assert.equal(result.status, 'FOUND');
    assert.equal(result.indicator.entity_id, null);
  });

  it('Review #9: malformed study objects (null, missing name, non-object) do not crash discovery', () => {
    const studies = [null, undefined, {}, { id: 'z1' }, 'not-an-object', 42, { id: 'z2', name: 'XAUUSD Adaptive Master' }];
    let result;
    assert.doesNotThrow(() => { result = discoverMasterCandidates(studies); });
    assert.equal(result.status, 'FOUND');
    assert.equal(result.indicator.entity_id, 'z2');
  });

  it('23. Ambiguous result never silently chooses one', () => {
    const result = discoverMasterCandidates([
      { id: 'a', name: 'XAUUSD Adaptive Master' },
      { id: 'b', name: 'XAUUSD Adaptive Master' },
    ]);
    assert.equal(result.status, 'AMBIGUOUS');
    assert.equal(result.indicator, undefined, 'no single `indicator` field should be set when ambiguous');
    assert.equal(result.candidates.length, 2, 'AMBIGUOUS must return every legitimate candidate identity');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MASTER STATE (24–27) + review item 10 (no-fabrication under adversarial data)
// ═══════════════════════════════════════════════════════════════════════

describe('xauusd_master_state (Phase 2A discovery layer — Phase 2B contract fixtures live in tests/master_contract.test.js)', () => {
  // Every FOUND scenario below must mock getPineTables — getMasterState now
  // reads the matched study's Pine table to locate the contract. Without a
  // mock this would fall through to the real core/data.js implementation and
  // hit live CDP, hanging/failing in a unit test environment.
  const noContractDeps = async () => ({ success: true, studies: [{ name: 'XAUUSD Adaptive Master', tables: [] }] });

  it('24. Missing indicator → NOT_FOUND, decision.action UNKNOWN, all trade/context fields null', async () => {
    const _deps = { getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '30', studies: [] }) };
    const result = await getMasterState({ _deps });
    assert.equal(result.status, 'NOT_FOUND');
    assert.equal(result.indicator_found, false);
    assert.equal(result.decision.action, 'UNKNOWN');
    for (const field of ['regime', 'correction_state', 'session']) assert.equal(result.market[field], null);
    for (const field of ['model', 'setup_state', 'trigger_state', 'quality']) assert.equal(result.setup[field], null);
    for (const field of ['entry', 'stop_loss', 'tp1', 'tp2', 'rr']) assert.equal(result.decision[field], null);
  });

  it('25. Indicator found but no contract table → NO_CONTRACT, action still UNKNOWN', async () => {
    const _deps = {
      getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '30', studies: [{ id: 'x1', name: 'XAUUSD Adaptive Master' }] }),
      getPineTables: noContractDeps,
    };
    const result = await getMasterState({ _deps });
    assert.equal(result.status, 'NO_CONTRACT');
    assert.equal(result.indicator_found, true);
    assert.equal(result.decision.action, 'UNKNOWN', 'action must never be invented before a valid contract table exists');
  });

  it('26. decision.action is never BUY or SELL under discovery-layer scenarios (no contract present)', async () => {
    const scenarios = [
      { studies: [] },
      { studies: [{ id: 'x1', name: 'XAUUSD Adaptive Master' }] },
      { studies: [{ id: 'x1', name: 'XAUUSD Adaptive Master' }, { id: 'x2', name: 'XAUUSD Adaptive Master' }] },
    ];
    for (const s of scenarios) {
      const _deps = { getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '30', ...s }), getPineTables: noContractDeps };
      const result = await getMasterState({ _deps });
      assert.notEqual(result.decision.action, 'BUY');
      assert.notEqual(result.decision.action, 'SELL');
    }
  });

  it('27. Provenance container is present on every status branch', async () => {
    for (const studies of [[], [{ id: 'x1', name: 'XAUUSD Adaptive Master' }], [{ id: 'x1', name: 'XAUUSD Adaptive Master' }, { id: 'x2', name: 'XAUUSD Adaptive Master' }]]) {
      const _deps = { getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '30', studies }), getPineTables: noContractDeps };
      const result = await getMasterState({ _deps });
      assert.equal(typeof result.provenance, 'object');
      assert.ok(result.provenance !== null);
      assert.ok('source' in result.provenance);
      assert.ok('capture_time' in result.provenance);
    }
  });

  // ── Review item 10 (Phase 2A) + Phase 2B section 17: inject strongly
  // bullish AND strongly bearish raw data through every dependency
  // getMasterState's resolveDeps exposes, and prove (a) those data-source
  // functions are never even called, and (b) no semantic field is populated
  // from them regardless. ─────────────────────────────────────────────────
  function biasedDeps(studies, bias) {
    const spy = { ohlcvCalled: false, studyValuesCalled: false, quoteCalled: false };
    const bullishBars = Array.from({ length: 20 }, (_, i) => ({ time: i, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i + 1, volume: 1000 }));
    const bearishBars = Array.from({ length: 20 }, (_, i) => ({ time: i, open: 200 - i, high: 201 - i, low: 199 - i, close: 200 - i - 1, volume: 1000 }));
    return {
      spy,
      deps: {
        getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '30', studies }),
        getPineTables: noContractDeps,
        getQuote: async () => { spy.quoteCalled = true; return { success: true, last: bias === 'bullish' ? 9999 : 1 }; },
        getOhlcv: async () => { spy.ohlcvCalled = true; return { success: true, bars: bias === 'bullish' ? bullishBars : bearishBars }; },
        getStudyValues: async () => {
          spy.studyValuesCalled = true;
          return { success: true, studies: [{ name: 'Relative Strength Index', values: { RSI: bias === 'bullish' ? '95' : '5' } }] };
        },
      },
    };
  }

  for (const bias of ['bullish', 'bearish']) {
    it(`Review #10 / Phase 2B §17: extreme ${bias} OHLCV/RSI data injected via deps is never read or inferred into action/regime/etc.`, async () => {
      const { spy, deps } = biasedDeps([{ id: 'x1', name: 'XAUUSD Adaptive Master' }], bias);
      const result = await getMasterState({ _deps: deps });
      assert.equal(spy.ohlcvCalled, false, 'getMasterState must never call getOhlcv');
      assert.equal(spy.studyValuesCalled, false, 'getMasterState must never call getStudyValues');
      assert.equal(spy.quoteCalled, false, 'getMasterState must never call getQuote');
      assert.equal(result.decision.action, 'UNKNOWN');
      assert.equal(result.market.regime, null);
      assert.equal(result.setup.trigger_state, null);
      assert.equal(result.setup.quality, null);
    });
  }

  it('Review #10: source audit — getMasterState\'s implementation never references OHLCV/indicator fields by name', () => {
    const path = fileURLToPath(new URL('../src/core/xauusd.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    // Extract just the getMasterState function body to avoid false positives
    // from getMarketSnapshot elsewhere in the same file.
    const start = source.indexOf('export async function getMasterState');
    const nextExport = source.indexOf('export async function getResearchHealth');
    const body = source.slice(start, nextExport);
    for (const forbidden of ['getOhlcv', 'getStudyValues', 'getQuote', 'RSI', 'bullish', 'bearish']) {
      // Word-boundary match, not a plain substring — "RSI" is also a
      // substring of "VERSION" (used legitimately throughout this file for
      // SCHEMA_VERSION constants), which a naive .includes() falsely flags.
      const re = new RegExp(`\\b${forbidden}\\b`);
      assert.ok(!re.test(body), `getMasterState body must not reference "${forbidden}"`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MARKET SNAPSHOT (28–30) + review item 11 (capture-window consistency)
// ═══════════════════════════════════════════════════════════════════════

describe('xauusd_market_snapshot', () => {
  const REQUIRED_KEYS = [
    'schema_version', 'captured_at', 'capture_started_at', 'capture_completed_at', 'capture_is_atomic',
    'product', 'symbol', 'provider', 'timeframe', 'chart_type',
    'xauusd_guard', 'quote', 'latest_bar', 'recent_ohlcv', 'visible_studies', 'study_values',
    'pine', 'data_availability', 'status', 'warnings', 'errors',
  ];

  function fullDeps(overrides = {}) {
    return {
      getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '30', chartType: 1, studies: [] }),
      getQuote: async () => ({ success: true, symbol: 'OANDA:XAUUSD', last: 4287.6, exchange: 'OANDA' }),
      getOhlcv: async () => ({ success: true, bars: [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }] }),
      getStudyValues: async () => ({ success: true, studies: [] }),
      getPineLines: async () => ({ success: true, study_count: 0, studies: [] }),
      getPineLabels: async () => ({ success: true, study_count: 0, studies: [] }),
      getPineTables: async () => ({ success: true, study_count: 0, studies: [] }),
      getPineBoxes: async () => ({ success: true, study_count: 0, studies: [] }),
      ...overrides,
    };
  }

  it('28. Structured schema is stable', async () => {
    const result = await getMarketSnapshot({ _deps: fullDeps() });
    for (const key of REQUIRED_KEYS) assert.ok(key in result, `missing key: ${key}`);
    assert.equal(result.status, 'ok');
    assert.equal(result.symbol, 'OANDA:XAUUSD');
    assert.equal(result.latest_bar.close, 1.5);
  });

  it('29. Unavailable fields are reported, never fabricated', async () => {
    const _deps = fullDeps({ getQuote: async () => { throw new Error('quote unavailable'); } });
    const result = await getMarketSnapshot({ _deps });
    assert.equal(result.quote, null);
    assert.equal(result.status, 'partial');
    assert.ok(result.errors.some((e) => e.includes('quote_get failed')));
  });

  it('30. Snapshot performs no setter/mutator call (same source audit as guard test 19)', () => {
    const path = fileURLToPath(new URL('../src/core/xauusd.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    assert.ok(!source.includes('.setSymbol('), 'getMarketSnapshot must never switch symbol');
    assert.ok(source.includes('deps.getQuote({})'), 'getQuote must be called with an empty args object, never a symbol');
  });

  it('Review #11: capture is explicitly documented as sequential/non-atomic, with a start/end window reported', async () => {
    const result = await getMarketSnapshot({ _deps: fullDeps() });
    assert.equal(result.capture_is_atomic, false);
    assert.equal(typeof result.capture_started_at, 'string');
    assert.equal(typeof result.capture_completed_at, 'string');
    assert.ok(new Date(result.capture_started_at).getTime() <= new Date(result.capture_completed_at).getTime());
    assert.equal(result.captured_at, result.capture_completed_at);
  });

  it('Review #11: source audit — reads happen as separate sequential awaits, not a single batched call', () => {
    const path = fileURLToPath(new URL('../src/core/xauusd.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    const start = source.indexOf('export async function getMarketSnapshot');
    const end = source.indexOf('// Fields below are the full xauusd_master_state contract');
    const body = source.slice(start, end);
    // Each read is awaited in its own try/catch — proves no Promise.all
    // batching that might imply false atomicity.
    assert.ok(!body.includes('Promise.all'), 'snapshot must not claim atomicity via Promise.all batching');
    const awaitCount = (body.match(/await deps\./g) || []).length;
    assert.ok(awaitCount >= 8, 'expected at least 8 separate sequential awaits (state, quote, ohlcv, study values, 4x pine)');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// xauusd_research_health
// ═══════════════════════════════════════════════════════════════════════

describe('xauusd_research_health', () => {
  it('reports FAIL status and lists any dangerous tool that leaked through', async () => {
    const result = await getResearchHealth({
      profileName: 'XAUUSD_RESEARCH',
      registeredTools: ['chart_get_state', 'chart_set_symbol'], // simulated leak
      blockedTools: [],
      _deps: {
        getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '30' }),
        getMasterState: async () => ({ status: 'NOT_FOUND', indicator_found: false }),
      },
    });
    assert.equal(result.status, 'FAIL');
    assert.deepEqual(result.dangerous_tools_exposed, ['chart_set_symbol']);
  });

  it('reports OK when connected, guard passes, and nothing dangerous is exposed', async () => {
    const result = await getResearchHealth({
      profileName: 'XAUUSD_RESEARCH',
      registeredTools: ['chart_get_state', 'quote_get'],
      blockedTools: ['chart_set_symbol'],
      _deps: {
        getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '30' }),
        getMasterState: async () => ({ status: 'NOT_FOUND', indicator_found: false }),
      },
    });
    assert.equal(result.status, 'OK');
    assert.equal(result.cdp_connectivity, true);
    assert.equal(result.xauusd_guard.approved, true);
    assert.deepEqual(result.dangerous_tools_exposed, []);
  });
});
