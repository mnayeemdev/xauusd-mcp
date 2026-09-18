/**
 * Stage 5 profile/tool exposure -- proves xauusd_visualize_market is
 * registered ONLY for the Development profile, remains unreachable from
 * Research, accepts no destructive/arbitrary drawing-ID parameter, and
 * that draw_clear plus every other raw mutation tool remain unexposed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APPROVED_RESEARCH_TOOLS, APPROVED_DEVELOPMENT_EXTRA_TOOLS, PROHIBITED_MUTATING_TOOLS,
  OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE, resolveProfile,
} from '../src/profiles.js';
import { createProfileGate } from '../src/profile_gate.js';

describe('xauusd_visualize_market: profile registration', () => {
  it('is in APPROVED_DEVELOPMENT_EXTRA_TOOLS, and nowhere else', () => {
    assert.ok(APPROVED_DEVELOPMENT_EXTRA_TOOLS.includes('xauusd_visualize_market'));
    assert.ok(!APPROVED_RESEARCH_TOOLS.includes('xauusd_visualize_market'));
    assert.ok(!PROHIBITED_MUTATING_TOOLS.includes('xauusd_visualize_market'));
    assert.ok(!OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE.includes('xauusd_visualize_market'));
  });

  it('is registered (reachable) for XAUUSD_DEVELOPMENT', () => {
    const profile = resolveProfile('XAUUSD_DEVELOPMENT');
    const fakeServer = { tool: (name) => ({ registered: name }) };
    const gate = createProfileGate(fakeServer, profile);
    const result = gate.tool('xauusd_visualize_market', 'desc', {}, () => {});
    assert.ok(result);
    assert.ok(gate.getRegisteredTools().includes('xauusd_visualize_market'));
  });

  it('is BLOCKED (never forwarded to the real MCP server) for XAUUSD_RESEARCH', () => {
    const profile = resolveProfile('XAUUSD_RESEARCH');
    let realServerCalled = false;
    const fakeServer = { tool: () => { realServerCalled = true; } };
    const gate = createProfileGate(fakeServer, profile);
    const result = gate.tool('xauusd_visualize_market', 'desc', {}, () => {});
    assert.equal(result, undefined);
    assert.equal(realServerCalled, false);
    assert.ok(gate.getBlockedTools().includes('xauusd_visualize_market'));
  });
});

describe('xauusd_visualize_market: draw_clear and unrelated mutation tools remain excluded', () => {
  it('draw_clear is not registrable through the gate for either profile', () => {
    for (const profileName of ['XAUUSD_RESEARCH', 'XAUUSD_DEVELOPMENT']) {
      const profile = resolveProfile(profileName);
      const gate = createProfileGate({ tool: () => ({}) }, profile);
      const result = gate.tool('draw_clear', 'desc', {}, () => {});
      assert.equal(result, undefined, `draw_clear must be blocked for ${profileName}`);
    }
  });

  it('no other raw drawing tool (draw_shape/draw_list/draw_remove_one/draw_get_properties) is registrable through the gate either', () => {
    for (const profileName of ['XAUUSD_RESEARCH', 'XAUUSD_DEVELOPMENT']) {
      const profile = resolveProfile(profileName);
      for (const tool of ['draw_shape', 'draw_list', 'draw_remove_one', 'draw_get_properties']) {
        const gate = createProfileGate({ tool: () => ({}) }, profile);
        assert.equal(gate.tool(tool, 'desc', {}, () => {}), undefined, `${tool} must be blocked for ${profileName}`);
      }
    }
  });

  it('unrelated upstream mutation tools (chart_set_symbol, alert_create, replay_trade, ui_click) remain unregistrable', () => {
    const profile = resolveProfile('XAUUSD_DEVELOPMENT');
    for (const tool of ['chart_set_symbol', 'alert_create', 'replay_trade', 'ui_click', 'watchlist_add']) {
      const gate = createProfileGate({ tool: () => ({}) }, profile);
      assert.equal(gate.tool(tool, 'desc', {}, () => {}), undefined, `${tool} must remain blocked even for Development`);
    }
  });
});

describe('xauusd_visualize_market: cannot accept an arbitrary/destructive drawing-ID parameter', () => {
  it('the registered tool schema accepts only dry_run -- no entity_id/shape/role parameter of any kind', () => {
    const src = readFileSync(new URL('../src/tools/xauusd.js', import.meta.url), 'utf8');
    // Isolate ONLY the zod schema object itself (from its one real field,
    // `dry_run:`, through the closing brace right before `}, async (...)`)
    // -- deliberately NOT the preceding description string, which is
    // free-text prose that legitimately explains draw_clear is unreachable
    // and would otherwise trip a naive "no forbidden word" scan on itself.
    const schemaMatch = src.match(/dry_run: z\.boolean\(\)[\s\S]*?\n {2}\}, async \(\{ dry_run \}\) => \{/);
    assert.ok(schemaMatch, 'xauusd_visualize_market schema object not found in the expected shape');
    const schemaSection = schemaMatch[0];
    assert.ok(!/entity_id\s*:/.test(schemaSection));
    assert.ok(!/\bshape\s*:/.test(schemaSection));
    assert.ok(!/\brole\s*:/.test(schemaSection));
    assert.ok(!/clear/i.test(schemaSection));
    assert.ok(/dry_run\s*:/.test(schemaSection));
  });

  it('the handler forwards only dryRun into visualizeXauusdMarket -- no other caller-supplied value reaches the drawing layer', () => {
    const src = readFileSync(new URL('../src/tools/xauusd.js', import.meta.url), 'utf8');
    assert.ok(/visualizeXauusdMarket\(\{ dryRun: dry_run \}\)/.test(src));
  });
});
