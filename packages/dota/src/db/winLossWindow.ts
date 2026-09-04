import { getSessionStartDate } from './streamWindow'

const DAY_MS = 24 * 60 * 60 * 1000

export const MAX_WL_STATS_DAYS = 365
export const WL_RESET_SETTING_KEY = 'wlResetAt'

export function normalizeStatsDays(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  const days = Number(value)
  if (!Number.isFinite(days)) return null
  return Math.min(MAX_WL_STATS_DAYS, Math.max(1, Math.trunc(days)))
}

export function getWinLossStartDate(
  statsDays: unknown,
  streamStartDate?: Date | null,
  resetAt?: unknown,
  now = new Date(),
): Date {
  const normalizedStatsDays = normalizeStatsDays(statsDays)
  const windowStart =
    normalizedStatsDays === null
      ? getSessionStartDate(streamStartDate)
      : new Date(now.getTime() - normalizedStatsDays * DAY_MS)
  if (!(typeof resetAt === 'string' || resetAt instanceof Date)) return windowStart

  const resetDate = resetAt instanceof Date ? resetAt : new Date(resetAt)
  const resetTime = resetDate.getTime()
  if (!Number.isFinite(resetTime) || resetTime > now.getTime()) return windowStart

  return resetTime > windowStart.getTime() ? resetDate : windowStart
}

export function getTodayStartDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
