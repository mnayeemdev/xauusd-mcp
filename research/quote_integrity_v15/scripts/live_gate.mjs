/**
 * V15 LIVE GATE WRAPPER -- the unchanged V14 gate with quote integrity first (RESEARCH ONLY; no order code).
 */
import { decideGate } from '../../trade_gate_v14/scripts/gate.mjs';
import { SAFETY_LIMITS } from '../../entry_risk_integration_v11/scripts/integrate.mjs';
import { evaluateExecutableGeometry } from '../../../src/engine/mt5Policy.js';
import { REAL_DEFAULTS } from '../../../src/engine/mt5RealPolicy.js';
import { validateQuote, entryPrice } from './quote.mjs';

export const PRODUCTION_MAX_QUOTE_AGE_MS = SAFETY_LIMITS.maxQuoteAgeSec * 1000; // existing production rule (REAL_DEFAULTS.maxQuoteAgeSec)
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * Live decision: the unchanged V14 gate, with quote integrity checked first for any decision that carries a valid entry.
 * A valid quote supplies the quote age and live spread; the existing production executable-geometry recheck (minEffectiveRr) and
 * entry-drift limit are applied at the side price. Any failure leaves the gate state as if no entry happened (nothing opened).
 */
export function decideWithQuote(state, input, quote, config, { prev = null, maxAgeMs = PRODUCTION_MAX_QUOTE_AGE_MS } = {}) {
  const qc = validateQuote(quote, { prev, maxAgeMs }); const valid = qc.status === 'VALID';
  const side = input.engine?.action; const ep = valid ? entryPrice(side, quote) : null; const engineEntry = num(input.row?.g?.e);
  const cfg = { ...config, maxEntryDriftUsd: REAL_DEFAULTS.maxEntryDriftUsd, entryDriftUsd: ep && engineEntry != null ? Math.abs(ep.price - engineEntry) : null };
  const out = decideGate(state, { ...input, quoteAgeSec: valid ? qc.quote_age_ms / 1000 : null, spread: valid ? quote.spread : input.spread }, cfg);
  const rec = { ...out.record, quote, quote_check: { status: qc.status, reasons: qc.reasons, duplicate: qc.duplicate, quote_age_ms: qc.quote_age_ms } };
  const untouched = () => { const s = JSON.parse(JSON.stringify(state)); s.last_t = input.t; s.decided = (s.decided ?? 0) + 1; return s; };
  if (!rec.valid_entry) return { state: out.state, record: rec, accepted_quote: valid ? quote : prev };
  if (!valid) return { state: untouched(), record: { ...rec, decision: qc.gate_state, reason: `QUOTE:${qc.primary}`, risk_data: 'INCOMPLETE', risk_validation: 'FAIL' }, accepted_quote: prev };
  const geo = evaluateExecutableGeometry({ side, price: ep.price, engineSl: input.row.g.sl, engineTp2: input.row.g.tp2, minRr: REAL_DEFAULTS.minEffectiveRr });
  rec.execution_price = { side_price: ep.price, side_source: ep.source, engine_entry: engineEntry, drift_usd: cfg.entryDriftUsd, executable_geometry: geo.valid ? 'VALID' : geo.reason, effective_rr: geo.rr };
  if (!geo.valid) return { state: untouched(), record: { ...rec, decision: geo.reason === 'PRICE_BEYOND_STRUCTURAL_STOP' ? 'WAIT_INVALID_SL' : 'WAIT_INVALID_RR', reason: `EXECUTABLE_GEOMETRY:${geo.reason}` }, accepted_quote: quote };
  return { state: out.state, record: rec, accepted_quote: quote };
}
