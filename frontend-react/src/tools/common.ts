/** Small shared helpers ported from upstream src/tools. */

/** Resolve after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random id for layout cards (client-side identity only, not a secret).
 * Uses crypto.getRandomValues rather than Math.random so ids never collide
 * predictably across saved layouts.
 */
export function getRandomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
