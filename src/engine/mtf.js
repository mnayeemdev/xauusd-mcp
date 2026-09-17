/**
 * Multi-timeframe combination.
 *
 * 30m = higher-timeframe context, 15m = primary setup/decision
 * timeframe, 5m = lower-timeframe conflict check. This is NOT
 * "any-timeframe-BUY=BUY" voting -- 15m's own independently-computed
 * decision is authoritative UNLESS it materially conflicts with 30m's
 * clear trend context or an actively fresh opposing 5m structural event,
 * in which case the combined result is WAIT/ENTRY_CONFLICT. If 30m's
 * context itself is unclear (insufficient data), the combined result is
 * WAIT/HTF_CONTEXT_UNCLEAR -- never silently ignored.
 */

export function combineTimeframes({ m5, m15, m30 }) {
  const per_timeframe = { '5m': m5, '15m': m15, '30m': m30 };

  if (m15.status !== 'OK') {
    return { action: 'WAIT', wait_reason: m15.status, source_timeframe: '15m', per_timeframe };
  }

  const primaryAction = m15.decision.action;
  if (primaryAction !== 'BUY' && primaryAction !== 'SELL') {
    return { action: 'WAIT', wait_reason: m15.decision.wait_reason, source_timeframe: '15m', per_timeframe };
  }

  if (m30.status !== 'OK' || !m30.regime) {
    return { action: 'WAIT', wait_reason: 'HTF_CONTEXT_UNCLEAR', source_timeframe: '15m', per_timeframe };
  }

  const htfBlocksBuy = m30.regime === 'BEAR_TREND' && primaryAction === 'BUY';
  const htfBlocksSell = m30.regime === 'BULL_TREND' && primaryAction === 'SELL';
  if (htfBlocksBuy || htfBlocksSell) {
    return { action: 'WAIT', wait_reason: 'ENTRY_CONFLICT', source_timeframe: '15m', per_timeframe, conflict: `30m regime is ${m30.regime}, which materially opposes a ${primaryAction} on 15m` };
  }

  // computeStructure() only ever reports the SINGLE most recent event, so
  // this is "fresh" by construction relative to 5m's own last confirmed bar.
  const freshOpposing5m = m5.status === 'OK' && m5.structure?.lastEvent
    && ((primaryAction === 'BUY' && m5.structure.lastEvent.direction === 'BEARISH') || (primaryAction === 'SELL' && m5.structure.lastEvent.direction === 'BULLISH'));
  if (freshOpposing5m) {
    return { action: 'WAIT', wait_reason: 'ENTRY_CONFLICT', source_timeframe: '15m', per_timeframe, conflict: '5m shows a fresh opposing structural break against the 15m setup' };
  }

  return { action: primaryAction, wait_reason: null, source_timeframe: '15m', per_timeframe, decision: m15.decision, model: m15.model, quality: m15.quality, regime: m15.regime };
}
