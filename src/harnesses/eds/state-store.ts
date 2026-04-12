/**
 * EDS harness state store — re-exports the generic store.
 *
 * EDS uses the identical STATUS.json / TASKS.json / PROGRESS_LOG.md layout
 * as the generic harness (both under ai-docs/SPEC/...). Rather than duplicate,
 * we re-export. If EDS ever diverges, swap this for a copy.
 */
export * from '../generic/state-store.js';
