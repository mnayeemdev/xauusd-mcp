/**
 * CAPITAL HARVEST MASTER -- public surface of the pure capital + position-management modules.
 * NOT imported by src/engine/mt5Executor.js, mt5RealPolicy.js, watcher.js or any frozen file:
 * production behaviour is unchanged until an explicit owner-approved promotion.
 */
export * from './riskPolicy.js';
export * from './positionManager.js';
