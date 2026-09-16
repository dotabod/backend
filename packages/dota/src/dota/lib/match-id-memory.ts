// Dedup guards keyed by match id used to live in plain Maps that were written but never
// cleaned, so every match a process ever saw stayed resident for its whole lifetime. The
// question these answer ("did we already fire for this match?") only matters while the match
// is live, so entries expire on a generous match-length horizon and the map keeps a hard cap
// as a backstop. Insertion order is kept equal to expiry order so cleanup can stop at the
// first live entry instead of scanning everything.

// Longer than any realistic Dota match plus its draft, short enough that a stuck or
// malformed key cannot suppress a later match for the rest of the process lifetime.
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000
// Backstop only. Well above plausible concurrent-match counts, so the TTL is what normally
// bounds the map and eviction never silently breaks dedup for live matches.
const DEFAULT_MAX_ENTRIES = 20_000

interface MatchIdMemoryOptions {
  maxEntries?: number
  now?: () => number
  ttlMs?: number
}

export class MatchIdMemory {
  private readonly entries = new Map<string, number>()
  private readonly maxEntries: number
  private readonly now: () => number
  private readonly ttlMs: number

  constructor({
    maxEntries = DEFAULT_MAX_ENTRIES,
    now = Date.now,
    ttlMs = DEFAULT_TTL_MS,
  }: MatchIdMemoryOptions = {}) {
    this.maxEntries = maxEntries
    this.now = now
    this.ttlMs = ttlMs
  }

  get size(): number {
    return this.entries.size
  }

  add(matchId: string): void {
    const expiresAt = this.now() + this.ttlMs
    // Reinsert so Map order keeps matching expiry order for oldest-first cleanup.
    this.entries.delete(matchId)
    this.entries.set(matchId, expiresAt)
    this.prune()
  }

  has(matchId: string): boolean {
    const expiresAt = this.entries.get(matchId)
    if (expiresAt === undefined) {
      return false
    }
    if (expiresAt > this.now()) {
      return true
    }
    this.entries.delete(matchId)
    return false
  }

  private prune(): void {
    const now = this.now()
    for (const [matchId, expiresAt] of this.entries) {
      if (expiresAt > now) {
        break
      }
      this.entries.delete(matchId)
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) {
        return
      }
      this.entries.delete(oldest)
    }
  }
}
