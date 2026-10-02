/**
 * V16 LIVE TIMING PROBES -- re-validates one observed forward-live V8 signal at fixed execution delays after its observation
 * (MEASURE ONLY; execution authority NONE; no order code). For every delay the probe fetches fresh closed bars, re-evaluates the
 * same frozen engine, and decides at the target instant with the latest polled quote. Everything used was received before the
 * decision instant. Each probe record stores its complete inputs, so the study can replay it (same input = same decision).
 */
import { createHash } from 'node:crypto';
import { revalidate, CONFIGS } from './revalidate.mjs';
import { DELAY_SCENARIOS_S, BEYOND_SCENARIOS_S, CONTRACT } from './timing.mjs';

export const PROBE_DELAYS_S = Object.freeze([...DELAY_SCENARIOS_S, ...BEYOND_SCENARIOS_S]);
export const PROBE_LEAD_MS = 600; // inputs are fetched this long before the decision instant (scheduling, not a decision threshold)
const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

/**
 * original: engineSnapshot of the observed signal; signal: { observed_mono, observed_wall_ms, bar_time };
 * deps: { mono(), wallMs(), sleepUntil(mono), fetchContext() -> { current, bars, news, shock }, getQuote() -> quoteSnapshot|null, spec, onRecord(rec) }.
 */
export async function runProbes({ original, signal, deps, delays = PROBE_DELAYS_S, signalId = null }) {
  const out = [];
  for (const k of delays) {
    const target = signal.observed_mono + k * 1000;
    await deps.sleepUntil(target - PROBE_LEAD_MS);
    let ctx = null, ctxErr = null; const f0 = deps.mono();
    try { ctx = await deps.fetchContext(); } catch (e) { ctxErr = String(e?.message ?? e); }
    const fetchMs = deps.mono() - f0;
    await deps.sleepUntil(target - 0.5); // decide at the instant (k s after observation, minus a sub-ms scheduling margin)
    const decisionMono = deps.mono(); const decisionWall = deps.wallMs(); const quote = deps.getQuote();
    const inputs = { original, current: ctx?.current ?? null, quote, signal, decision: { mono: decisionMono, wallMs: decisionWall }, bars: ctx?.bars ?? null, news: ctx?.news ?? null, shock: ctx?.shock ?? null, spec: deps.spec ?? null };
    const results = {}; for (const name of Object.keys(CONFIGS)) { try { results[name] = revalidate({ ...inputs, configName: name }); } catch (e) { results[name] = { decision: 'WAIT_SAFETY_BREAKER', reason: `REVALIDATION_ERROR:${String(e?.message ?? e)}` }; } }
    const rec = { record: 'timing_probe', contract: CONTRACT, signal_id: signalId, bar_time: original.bar_time, delay_s: k, executed: false, execution_authority: 'NONE',
      fetch_ms: Math.round(fetchMs * 1000) / 1000, compute_ms: Math.round((deps.mono() - decisionMono) * 1000) / 1000, context_error: ctxErr, inputs, inputs_hash: sha(inputs), results };
    try { deps.onRecord(rec); } catch { /* recording must never stop the probes */ }
    out.push(rec);
  }
  return out;
}

/** Re-run a stored probe from its recorded inputs (replay parity). */
export function replayProbe(rec) {
  const results = {}; for (const name of Object.keys(CONFIGS)) { try { results[name] = revalidate({ ...rec.inputs, configName: name }); } catch (e) { results[name] = { decision: 'WAIT_SAFETY_BREAKER', reason: `REVALIDATION_ERROR:${String(e?.message ?? e)}` }; } }
  return results;
}
