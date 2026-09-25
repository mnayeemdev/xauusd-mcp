/**
 * CAPITAL-AWARE ARCHITECTURE for the REAL profile. PURE, reporting-first.
 *
 * Four concerns are kept SEPARATE and never conflated:
 *   A) capital state          -- truthful broker equity/balance/free margin
 *   B) monetary target policy -- the configured +target / -max-loss (outer authorities)
 *   C) lot-sizing policy      -- WHO decides the executed lot; today: USER_FIXED 0.01
 *   D) structural risk        -- the strategy's own stop distance for a given trade
 *
 * `computeLotSizingPolicy()` may CALCULATE what an approved scaling policy
 * would size (via src/engine/mt5RealScaling.js) but it returns
 * `executed_lot` = the user-fixed lot and `enabled: false`. Nothing in this
 * module can change an order; the executor reads only `config.exactLot`.
 * No loss-recovery sizing exists anywhere: the projection depends on equity
 * only and is monotonically non-decreasing in equity.
 */
import { computeDynamicSizing } from './mt5RealScaling.js';

export const LOT_AUTHORITY = Object.freeze({ USER_FIXED: 'USER_FIXED', APPROVED_SCALING: 'APPROVED_SCALING' });

export function computeCapitalState({ account }) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return { balance: n(account?.balance), equity: n(account?.equity), margin: n(account?.margin), free_margin: n(account?.margin_free), leverage: n(account?.leverage), currency: account?.currency ?? null, margin_call_pct: n(account?.margin_so_call), stop_out_pct: n(account?.margin_so_so) };
}

export function computeMonetaryTargetPolicy({ config }) {
  return { profit_target_usd: config.profitTargetUsd, maximum_loss_usd: config.maximumLossUsd, meaning: 'outer authorities: a trade may close earlier through structural, deterioration or profit-protection exits' };
}

export function computeStructuralRisk({ side, fill, structuralStop, lot, contractSize = 100 }) {
  const dist = Number.isFinite(fill) && Number.isFinite(structuralStop) ? (side === 'BUY' ? fill - structuralStop : structuralStop - fill) : null;
  return { risk_price: dist == null ? null : Math.round(dist * 1000) / 1000, risk_usd: dist == null || !Number.isFinite(lot) ? null : Math.round(dist * lot * contractSize * 100) / 100 };
}

/**
 * The executed lot is ALWAYS config.exactLot (user authority). The scaling
 * projection is informational only and is reported beside it.
 */
export function computeLotSizingPolicy({ config, account, market }) {
  const executed_lot = config.exactLot ?? config.lotSize;
  let projection = null;
  try {
    const s = computeDynamicSizing({ equity: Number(account?.equity), freeMargin: Number(account?.margin_free ?? account?.equity), leverage: Number(account?.leverage), price: Number(market?.ask ?? market?.bid), contractSize: Number(market?.contract_size ?? 100), volumeMin: Number(market?.volume_min ?? 0.01), volumeMax: Number(market?.volume_max ?? 200), volumeStep: Number(market?.volume_step ?? 0.01), spreadUsd: Number(market?.spread_price ?? 0), marginCallLevelPct: Number(account?.margin_so_call ?? 60), stopOutLevelPct: Number(account?.margin_so_so ?? 0) });
    projection = s.approved ? { lot: s.lot, profit_target_usd: s.profitTargetUsd, maximum_loss_usd: s.maximumLossUsd, required_margin_usd: s.requiredMarginUsd } : { lot: null, reason: s.reason };
  } catch (err) { projection = { lot: null, reason: err.message }; }
  return {
    authority: LOT_AUTHORITY.USER_FIXED, enabled_scaling: false, executed_lot, max_lot: config.maxLotSize,
    approved_scaling_projection: projection, note: 'projection is informational; execution uses executed_lot only until an explicit user-approved scaling policy exists',
  };
}

/** Full capital snapshot for audit events (OPENED / CLOSED). */
export function capitalSnapshot({ config, account, market, position = null }) {
  return {
    capital: computeCapitalState({ account }),
    monetary_policy: computeMonetaryTargetPolicy({ config }),
    lot_policy: computeLotSizingPolicy({ config, account, market }),
    structural_risk: position ? computeStructuralRisk({ side: position.side, fill: Number(position.open_price), structuralStop: Number(position.engine?.structural_stop), lot: Number(position.volume) }) : null,
  };
}
