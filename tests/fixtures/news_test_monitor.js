/**
 * Test doubles for the NEWS + SHOCK protection layer. No network, no files.
 *
 *   permissiveNewsMonitor()          calendar OK and fresh, no relevant event => NORMAL
 *   scriptedNewsMonitor(fn)          fn(now) -> partial news state (state/event/...) merged over NORMAL
 *   fixtureCalendarMonitor(opts)     a real createNewsMonitor over an in-memory provider fed with the
 *                                    synthetic Forex-Factory-shaped fixture (or any raw list)
 */
import { createNewsMonitor, createCalendarProvider } from '../../src/engine/newsMonitor.js';

function normal(now) {
  const iso = (now instanceof Date ? now : new Date(now)).toISOString();
  return { state: 'NORMAL', reason: 'NO_RELEVANT_EVENT_IN_WINDOW', event: null, next_event: null, contributing_events: [], evaluated_at: iso, calendar: { status: 'OK', source: 'test', source_timestamp: iso, last_success_at: iso, error: null, consecutive_failures: 0, freshness: { age_sec: 0, fresh: true, reason: 'OK' }, stale_after_sec: 21600 }, transition: null };
}

export function permissiveNewsMonitor() {
  return { refresh: async () => ({ skipped: false }), evaluate: ({ now }) => normal(now), status: () => ({ provider: { kind: 'test', source: 'test' }, calendar: normal(new Date()).calendar }) };
}

export function scriptedNewsMonitor(fn) {
  let last = null;
  return {
    refresh: async () => ({ skipped: false }),
    evaluate: ({ now }) => {
      const base = normal(now);
      const over = fn(now) ?? {};
      const next = { ...base, ...over, calendar: { ...base.calendar, ...(over.calendar ?? {}) } };
      const transition = last && last.state !== next.state ? { at: base.evaluated_at, from: last.state, to: next.state, event: next.event ?? null, reason: next.reason ?? null } : null;
      last = next;
      return { ...next, transition };
    },
    status: () => ({ provider: { kind: 'test', source: 'test' }, calendar: normal(new Date()).calendar }),
  };
}

/** In-memory provider: `payloads` is a queue of { ok, raw, source_timestamp, error } results, last one repeats. */
export function memoryProvider(payloads, { source = 'memory', minFetchIntervalSec = 0 } = {}) {
  const queue = [...payloads];
  const calls = [];
  return {
    kind: 'http_json', source, url: null, filePath: null, minFetchIntervalSec, calls,
    async fetch({ now }) {
      const fetchedAt = (now instanceof Date ? now : new Date(now)).toISOString();
      calls.push(fetchedAt);
      const p = queue.length > 1 ? queue.shift() : queue[0];
      if (!p) return { ok: false, source, error: 'EMPTY', raw: null, source_timestamp: null, fetched_at: fetchedAt };
      return { ok: p.ok !== false, source, error: p.error ?? null, raw: p.raw ?? null, source_timestamp: p.source_timestamp ?? fetchedAt, fetched_at: fetchedAt };
    },
  };
}

export function fixtureCalendarMonitor({ raw, sourceTimestamp, params, now, snapshot = null } = {}) {
  const provider = memoryProvider([{ ok: true, raw, source_timestamp: sourceTimestamp }]);
  const monitor = createNewsMonitor({ provider, params, now, snapshotPath: 'mem', _deps: { loadSnapshot: () => snapshot, saveSnapshot: () => {} } });
  return { provider, monitor };
}

export { createCalendarProvider };
