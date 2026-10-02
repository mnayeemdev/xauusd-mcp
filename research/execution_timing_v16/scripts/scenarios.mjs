/**
 * V16 DELAY SCENARIO GRID -- deterministic execution-time states for real frozen-V8 forward-shadow signals (RESEARCH ONLY).
 * The two signal snapshots are copied verbatim from forward-shadow decision records (engine output, unchanged). The quotes and
 * clocks of each scenario are CONSTRUCTED (labelled SCENARIO): they are test states, never market data and never evidence of
 * what the market did. The grid shows that the decision depends on the state at execution, not on the delay number.
 */
import { DELAY_SCENARIOS_S, BEYOND_SCENARIOS_S } from './timing.mjs';
import { initGate } from '../../trade_gate_v14/scripts/gate.mjs';

const snap = (o) => Object.freeze({ engine_wait_reason: null, wait_category: null, wait_detail: null, bias: { direction: o.side === 'BUY' ? 'BULLISH' : 'BEARISH' }, input_stale: null, data_integrity: null, ...o });
/** V8 SELL BO, forward-shadow bar closing 2026-10-02T15:45:00Z (record fields copied). */
export const SIGNAL_SELL = snap({ bar_time: 1790955600 - 300, engine_action: 'SELL', model: 'BO', candidate_side: 'SELL', side: 'SELL', stages: { BUY: '00000', SELL: '00300' },
  candidate: { model: 'BO', side: 'SELL', anchor: 4139.072, entry: 4134.85, stop_loss: 4149.81, tp2_engine: 4104.92, rr_engine: 2, risk_atr: 1.66, sl_source: 'candidate_anchor', origin_bar_time: null, tp_170r: null }, atr_exact: 9.02 });
/** V8 BUY BO, forward-shadow bar closing 2026-10-01T17:45:00Z (record fields copied). */
export const SIGNAL_BUY = snap({ bar_time: 1790876700 - 300, engine_action: 'BUY', model: 'BO', candidate_side: 'BUY', side: 'BUY', stages: { BUY: '00300', SELL: '00000' },
  candidate: { model: 'BO', side: 'BUY', anchor: 4176.719, entry: 4176.82, stop_loss: 4172.85, tp2_engine: 4185.93, rr_engine: 2.3, risk_atr: 0.64, sl_source: 'candidate_anchor', origin_bar_time: null, tp_170r: null }, atr_exact: 6.175 });

export const VARIANTS = Object.freeze(['UNCHANGED', 'SMALL_MOVE_WITHIN_RULES', 'TRIGGER_GONE', 'DIRECTION_CHANGED', 'LOCATION_OVEREXTENDED', 'SL_BREACHED', 'SL_INSIDE_ENGINE_MIN_RISK', 'RR_INVALID', 'ENTRY_DRIFT_ABOVE_LIMIT', 'SPREAD_ABOVE_LIMIT', 'NEWS_BLOCK', 'STRUCTURAL_SL_REVISED', 'NEW_BAR_CLOSED', 'RISK_REJECTED', 'BROKER_REJECTED', 'STALE_QUOTE', 'MISSING_QUOTE', 'NO_WITNESSED_TICK', 'QUOTE_RECEIVED_AFTER_DECISION', 'SIGNAL_AFTER_DECISION', 'QUOTE_AHEAD_OF_BROKER_BARS', 'QUOTE_PREDATES_BARS', 'OUT_OF_ORDER_TICK', 'BID_INVALID', 'CLOCK_DRIFT_1230MS_MONITOR']);
export const GRID_DELAYS_S = Object.freeze([...DELAY_SCENARIOS_S, ...BEYOND_SCENARIOS_S]);
const SPEC = Object.freeze({ symbol: 'XAUUSDm', contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, point: 0.001, digits: 3, stops_level_points: 0, freeze_level_points: 0, leverage: 200, margin_call_pct: 60, currency_profit: 'USD', account_currency: 'USD', platform_tick_value: 0.1, account_is_real: false });
export const SCENARIO_SPEC = SPEC;

/** Execution-time price that keeps every existing rule satisfied (SELL at bid, BUY at ask). */
const base = (sig) => ({ bid: sig.candidate.entry, ask: sig.candidate.entry + 0.24 }); // market unchanged since the bar close (MT5 bars are bid-based)

/** Inputs for revalidate() (without configName). delayS: execution delay after the signal observation. */
export function scenario(variant, delayS, sig = SIGNAL_SELL) {
  const S = sig.engine_action, c = sig.candidate, atr = sig.atr_exact, sell = S === 'SELL';
  const OBS = 50_000; const dm = OBS + (delayS === 0 ? 30 : delayS * 1000 - 0.5); const W0 = Date.UTC(2026, 9, 2, 12, 0, 0); const brokerAtObs = (sig.bar_time + 300 + 9) * 1000; // 0 s = right after a 30 ms fetch; k s = the probe instant
  let { bid, ask } = base(sig); const px = (p) => (sell ? { bid: p, ask: p + 0.24 } : { bid: p - 0.24, ask: p });
  const sideOf = (p) => (sell ? 1 : -1) * p; // + moves toward the SL for SELL (up) / BUY (down)
  let current = { ...sig }; let news = { state: 'NORMAL' }; let shock = { state: 'NORMAL_OR_STALE' }; let faults = null; let state = null;
  const pRR = (c.tp2_engine + 1.7 * c.stop_loss) / 2.7; // price at which the RR to the engine objective is exactly 1.70
  let q = { tickMs: brokerAtObs + delayS * 1000 - 300, appeared: dm - 400, first: dm - 250, received: dm - 120, wallFirst: W0 + delayS * 1000 - 250, order_error: false, present: true };
  let signal = { observed_mono: OBS, observed_wall_ms: W0 - 500 }; let bars = { last_closed_open: sig.bar_time, latest_open: sig.bar_time + 300 };
  switch (variant) {
    case 'UNCHANGED': break;
    case 'SMALL_MOVE_WITHIN_RULES': ({ bid, ask } = px((sell ? bid : ask) + sideOf(0.15))); break;
    case 'TRIGGER_GONE': current = { ...sig, engine_action: 'WAIT', engine_wait_reason: null, model: null, candidate: null, candidate_side: null, wait_category: 'NO_TRIGGER', stages: sell ? { BUY: '00000', SELL: '00200' } : { BUY: '00200', SELL: '00000' } }; break;
    case 'DIRECTION_CHANGED': current = { ...sig, engine_action: sell ? 'BUY' : 'SELL', candidate_side: sell ? 'BUY' : 'SELL', candidate: { ...c, side: sell ? 'BUY' : 'SELL' }, stages: sell ? { BUY: '00300', SELL: '00000' } : { BUY: '00000', SELL: '00300' } }; break;
    case 'LOCATION_OVEREXTENDED': ({ bid, ask } = px(c.anchor - (sell ? 1 : -1) * (2.6 * atr))); break;
    case 'SL_BREACHED': ({ bid, ask } = px(c.stop_loss + sideOf(0.5))); break;
    case 'SL_INSIDE_ENGINE_MIN_RISK': ({ bid, ask } = px(c.stop_loss - sideOf(0.4 * atr))); break;
    case 'RR_INVALID': ({ bid, ask } = px(sell ? pRR - 0.1 : pRR + 0.1)); break;
    case 'ENTRY_DRIFT_ABOVE_LIMIT': ({ bid, ask } = px(c.entry - sideOf(2.2))); break;
    case 'SPREAD_ABOVE_LIMIT': if (sell) ask = bid + 0.8; else bid = ask - 0.8; break;
    case 'NEWS_BLOCK': news = { state: 'BLOCK_ENTRIES', event: 'scenario event' }; break;
    case 'STRUCTURAL_SL_REVISED': current = { ...sig, candidate: { ...c, stop_loss: c.stop_loss + sideOf(0.3) } }; break;
    case 'NEW_BAR_CLOSED': current = { ...sig, bar_time: sig.bar_time + 300 }; bars = { last_closed_open: sig.bar_time + 300, latest_open: sig.bar_time + 600 }; break;
    case 'RISK_REJECTED': state = initGate({ equity: 50 }); break; // the minimum lot exceeds the illustrative risk of a 50 USD account
    case 'BROKER_REJECTED': faults = { brokerReject: 'TRADE_RETCODE_INVALID_STOPS' }; break;
    case 'STALE_QUOTE': q.appeared = dm - 6500; q.first = dm - 6400; break;
    case 'MISSING_QUOTE': q.present = false; break;
    case 'NO_WITNESSED_TICK': q.appeared = null; break;
    case 'QUOTE_RECEIVED_AFTER_DECISION': q.received = dm + 5; q.first = dm + 5; q.appeared = dm - 100; break;
    case 'SIGNAL_AFTER_DECISION': signal = { ...signal, observed_mono: dm + 10 }; break;
    case 'QUOTE_AHEAD_OF_BROKER_BARS': q.tickMs = (sig.bar_time + 900) * 1000; break;
    case 'QUOTE_PREDATES_BARS': q.tickMs = (sig.bar_time - 10) * 1000; break;
    case 'OUT_OF_ORDER_TICK': q.order_error = true; break;
    case 'BID_INVALID': bid = 0; break;
    case 'CLOCK_DRIFT_1230MS_MONITOR': q.wallFirst = q.tickMs + 250 - 1230; break; // PC wall clock 1230 ms behind the broker: a monitor value only
    default: throw new Error(`unknown variant ${variant}`);
  }
  const r3 = (x) => Math.round(x * 1000) / 1000; bid = r3(bid); ask = r3(ask);
  const quote = q.present ? { contract: 'timing-v16-1', symbol: 'XAUUSDm', bid, ask, mid: r3((bid + ask) / 2), spread: r3(ask - bid), quote_timestamp_ms: q.tickMs, quote_timestamp_utc: new Date(q.tickMs).toISOString(), tick_flags: 6, tick_id: `${q.tickMs}|${bid}|${ask}`, first_seen_mono: q.first, first_seen_wall_ms: q.wallFirst, appeared_after_mono: q.appeared, received_mono: q.received, received_wall_ms: q.wallFirst + 100, prev_time_msc: q.tickMs - 400, order_error: q.order_error, tick_sequence: 'UNAVAILABLE', data_source: 'SCENARIO (constructed test state, not market data)' } : null;
  return { original: sig, current, quote, signal, decision: { mono: dm, wallMs: W0 + delayS * 1000 }, bars, news, shock, spec: SPEC, faults, state, scenario: { variant, delay_s: delayS, label: 'SCENARIO (constructed; not market data)' } };
}
