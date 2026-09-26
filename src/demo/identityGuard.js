/**
 * STAGE 12 DEMO ACCOUNT IDENTITY GUARD (2026-09-26). The highest-priority safety component of the DEMO
 * validator: every trade-changing bridge command (open / close / modify) is preceded by a FRESH broker
 * `hello` and a deterministic identity check. Any mismatch blocks with no fallback, no alternate account,
 * no "current terminal" assumption. It cannot widen anything: it only refuses.
 *
 * Expected identity is a frozen constant; the REAL identity is deliberately NOT referenced here (no REAL
 * credentials or identifiers in Stage 12 source).
 */
export const DEMO_IDENTITY = Object.freeze({ login: 480236873, server: 'Exness-MT5Trial11', symbol: 'XAUUSDm', lot: 0.01, trade_mode_demo: 0, account_class: 'DEMO' });
export const TRADE_COMMANDS = Object.freeze(['open', 'close', 'modify']);

/** Pure identity verification of a bridge hello payload (and, for open, of the order parameters). */
export function verifyDemoIdentity(hello, { params = null, identity = DEMO_IDENTITY } = {}) {
  const reasons = [];
  const acct = hello?.account ?? null; const sym = hello?.symbol ?? null;
  if (!acct) reasons.push('ACCOUNT_IDENTITY_MISSING');
  else {
    if (Number(acct.login) !== identity.login) reasons.push(`LOGIN_MISMATCH:${acct.login ?? 'missing'}`);
    if (acct.server !== identity.server) reasons.push(`SERVER_MISMATCH:${acct.server ?? 'missing'}`);
    if (Number(acct.trade_mode) !== identity.trade_mode_demo) reasons.push(`ACCOUNT_NOT_DEMO:${acct.trade_mode ?? 'missing'}`);
  }
  if (hello?.demo_verified !== true) reasons.push('BRIDGE_DEMO_NOT_VERIFIED');
  if (!sym || sym.name !== identity.symbol) reasons.push(`SYMBOL_MISMATCH:${sym?.name ?? 'missing'}`);
  if (params) {
    if (params.symbol !== undefined && params.symbol !== identity.symbol) reasons.push(`ORDER_SYMBOL_MISMATCH:${params.symbol}`);
    if (params.volume !== undefined && Math.abs(Number(params.volume) - identity.lot) > 1e-9) reasons.push(`LOT_NOT_EXACT:${params.volume}`);
    if (params.expected_login !== undefined && Number(params.expected_login) !== identity.login) reasons.push(`EXPECTED_LOGIN_MISMATCH:${params.expected_login}`);
    if (params.expected_server !== undefined && params.expected_server !== identity.server) reasons.push(`EXPECTED_SERVER_MISMATCH:${params.expected_server}`);
  }
  return { ok: reasons.length === 0, reasons, verified: reasons.length === 0 ? { login: acct.login, server: acct.server, trade_mode: acct.trade_mode, symbol: sym.name, lot: params?.volume ?? null } : null };
}

export class DemoIdentityError extends Error { constructor(reasons, extra = {}) { super(`DEMO_ACCOUNT_MISMATCH: ${reasons.join(', ')}`); this.code = 'DEMO_ACCOUNT_MISMATCH'; this.reasons = reasons; Object.assign(this, extra); } }

/**
 * Wraps a bridge so that TRADE_COMMANDS run only after a fresh hello passes verifyDemoIdentity. Read-only
 * commands pass through unchanged. `onBlock` receives every refusal (for audit/alerts); `stats` counts them.
 */
export function createGuardedBridge(bridge, { identity = DEMO_IDENTITY, log = () => {}, onBlock = () => {}, helloParams = {} } = {}) {
  const stats = { trade_requests: 0, blocked: 0, last_block: null };
  return {
    stats,
    async request(cmd, params = {}) {
      if (!TRADE_COMMANDS.includes(cmd)) return bridge.request(cmd, params);
      stats.trade_requests++;
      let hello;
      try { hello = await bridge.request('hello', { ...helloParams, expected_login: identity.login, expected_server: identity.server, symbol: identity.symbol }); } catch (err) { const e = new DemoIdentityError([`HELLO_FAILED:${err.message}`]); stats.blocked++; stats.last_block = { at: new Date().toISOString(), cmd, reasons: e.reasons }; onBlock({ cmd, reasons: e.reasons, params }); throw e; }
      const v = verifyDemoIdentity(hello, { params: cmd === 'open' ? params : { expected_login: params.expected_login, expected_server: params.expected_server }, identity });
      if (!v.ok) { const e = new DemoIdentityError(v.reasons, { hello_login: hello?.account?.login ?? null, hello_server: hello?.account?.server ?? null }); stats.blocked++; stats.last_block = { at: new Date().toISOString(), cmd, reasons: v.reasons }; log(`[DEMO GUARD] BLOCKED ${cmd}: ${v.reasons.join(', ')} (expected_login=${identity.login} expected_server=${identity.server} symbol=${identity.symbol} lot=${identity.lot})`); onBlock({ cmd, reasons: v.reasons, params }); throw e; }
      log(`[DEMO GUARD] ${cmd} identity verified: expected_login=${identity.login} verified_login=${v.verified.login} server=${v.verified.server} trade_mode=${v.verified.trade_mode} symbol=${v.verified.symbol}${cmd === 'open' ? ` lot=${params.volume}` : ''}`);
      return bridge.request(cmd, params);
    },
    stop: () => bridge.stop?.(),
  };
}
