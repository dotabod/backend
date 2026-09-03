import type { Cards } from './types/index'

export const PROFILE_CARD_CACHE_TTL_MS = 10 * 60 * 1000

type CachedCard = Pick<Cards, 'createdAt' | 'rank_tier'> & Partial<Pick<Cards, 'lifetime_games'>>

export function shouldRefreshCard(
  card: CachedCard | undefined,
  forceRefresh: boolean,
  now = Date.now(),
): boolean {
  if (forceRefresh || !card) return true
  if (!Number.isFinite(card.rank_tier) || !Number.isFinite(card.lifetime_games)) return true

  const createdAt = new Date(card.createdAt).getTime()
  return !Number.isFinite(createdAt) || now - createdAt >= PROFILE_CARD_CACHE_TTL_MS
}
