export type IdGenerator = (prefix: string) => string

/**
 * Default generator preserving existing runtime behavior:
 * uses Date.now() + Math.random().
 */
export function defaultIdGenerator(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Creates a deterministic, repeatable ID generator based on a seed.
 * Given the same seed and sequence of calls, produces identical IDs.
 */
export function createSeededIdGenerator(seed: number | string = 1): IdGenerator {
  let s = typeof seed === 'string'
    ? Array.from(seed).reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0)
    : seed

  function nextRandom(): number {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  let counter = 0
  return (prefix: string) => {
    counter++
    const randPart = Math.floor(nextRandom() * 0x10000000000).toString(36).padStart(9, '0')
    return `${prefix}-${counter.toString().padStart(6, '0')}-${randPart}`
  }
}

let activeIdGenerator: IdGenerator = defaultIdGenerator

/**
 * Core ID generation entry point.
 * Plugged with activeIdGenerator (injectable via setIdGenerator / setSeededIdGenerator).
 */
export function makeId(prefix: string): string {
  return activeIdGenerator(prefix)
}

export function setIdGenerator(generator: IdGenerator): void {
  activeIdGenerator = generator
}

export function resetIdGenerator(): void {
  activeIdGenerator = defaultIdGenerator
}

export function setSeededIdGenerator(seed: number | string = 1): void {
  activeIdGenerator = createSeededIdGenerator(seed)
}
