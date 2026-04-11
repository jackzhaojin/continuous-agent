/**
 * Harness registry — explicit static registration of available harnesses.
 *
 * No filesystem scanning; harnesses register themselves by being imported here.
 * To add a new harness: create the module under src/harnesses/<name>/ and add
 * an import + Map entry below.
 */

import type { HarnessOrchestrator } from './types.js';
import { GenericHarness } from '../generic/index.js';

const REGISTRY: Map<string, HarnessOrchestrator> = new Map();

REGISTRY.set('generic', new GenericHarness());

// eds and study register here in P4 / P5.

export function getHarness(name: string): HarnessOrchestrator {
  const h = REGISTRY.get(name);
  if (!h) {
    const available = [...REGISTRY.keys()].join(', ');
    throw new Error(`Unknown harness '${name}'. Available: ${available}`);
  }
  return h;
}

export function listHarnesses(): string[] {
  return [...REGISTRY.keys()];
}
