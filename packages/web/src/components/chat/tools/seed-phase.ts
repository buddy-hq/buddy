/**
 * Stable phase offset derived from a string (a task title, a session id).
 *
 * Siblings in a fan-out share a rate but must not share a phase — five
 * indicators moving in lockstep read as one process, not five workers. Hashing
 * an identifier gives each one its own offset that survives re-renders, unlike
 * a random draw.
 */
export function seedPhase(seed: string, buckets: number): number {
  // FNV-1a.
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return Math.abs(hash) % buckets
}
