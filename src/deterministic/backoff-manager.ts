/**
 * Backoff and rate limit management
 * DETERMINISTIC: Uses fixed backoff calculations
 */

interface BackoffState {
  consecutiveErrors: number;
  lastErrorAt: string | null;
  cooldownUntil: string | null;
}

const backoffState: BackoffState = {
  consecutiveErrors: 0,
  lastErrorAt: null,
  cooldownUntil: null,
};

/**
 * Check if error message indicates rate limiting
 */
export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('too many requests')
  );
}

/**
 * Calculate backoff time in milliseconds using exponential backoff
 * DETERMINISTIC: Fixed calculation based on error count
 */
export function calculateBackoffMs(consecutiveErrors: number): number {
  const baseMs = 60000; // 1 minute
  const maxMs = 3600000; // 1 hour
  const backoffMs = baseMs * Math.pow(2, consecutiveErrors - 1);
  return Math.min(backoffMs, maxMs);
}

/**
 * Check if we're currently in a cooldown period
 * DETERMINISTIC: Simple timestamp comparison
 */
export function isInCooldown(): boolean {
  if (!backoffState.cooldownUntil) return false;
  const now = new Date().toISOString();
  return now < backoffState.cooldownUntil;
}

/**
 * Enter cooldown period after rate limit error
 * DETERMINISTIC: Fixed backoff calculation
 */
export function enterCooldown(error: unknown): void {
  backoffState.consecutiveErrors++;
  backoffState.lastErrorAt = new Date().toISOString();

  const backoffMs = calculateBackoffMs(backoffState.consecutiveErrors);
  const cooldownUntil = new Date(Date.now() + backoffMs);
  backoffState.cooldownUntil = cooldownUntil.toISOString();

  console.log(
    `[Backoff] Entering cooldown #${backoffState.consecutiveErrors} until ${cooldownUntil.toISOString()}`
  );
}

/**
 * Reset backoff state after successful work
 * DETERMINISTIC: Simple state reset
 */
export function resetBackoff(): void {
  if (backoffState.consecutiveErrors > 0) {
    console.log('[Backoff] Resetting after successful work');
  }
  backoffState.consecutiveErrors = 0;
  backoffState.lastErrorAt = null;
  backoffState.cooldownUntil = null;
}

/**
 * Get current backoff state (for debugging)
 */
export function getBackoffState(): Readonly<BackoffState> {
  return { ...backoffState };
}
