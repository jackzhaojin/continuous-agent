/**
 * Helper for orchestrators that need to emit events from multiple concurrent
 * code paths into a single async iterable.
 *
 * Usage:
 *   const bus = new HarnessEventBus();
 *   (async () => {
 *     bus.emit({ type: 'phase_start', ... });
 *     await doWork();
 *     bus.emit({ type: 'phase_complete', ... });
 *     bus.close();
 *   })();
 *   for await (const evt of bus) { ... }
 *
 * This is a minimal unbounded queue — fine for harness scale (hundreds of
 * events, not millions).
 */

import type { HarnessEvent } from './types.js';

export class HarnessEventBus implements AsyncIterable<HarnessEvent> {
  private queue: HarnessEvent[] = [];
  private waiters: Array<(value: IteratorResult<HarnessEvent>) => void> = [];
  private closed = false;

  emit(event: HarnessEvent): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter({ value: undefined as unknown as HarnessEvent, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<HarnessEvent> {
    return {
      next: (): Promise<IteratorResult<HarnessEvent>> => {
        if (this.queue.length > 0) {
          const value = this.queue.shift()!;
          return Promise.resolve({ value, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as HarnessEvent, done: true });
        }
        return new Promise((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}
