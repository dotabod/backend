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

export function normalizeStatsStartDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return value
}

export function getWinLossChallenge(
  statsDays: unknown,
  statsStartDate: unknown,
  now = new Date(),
): {
  elapsedDays: number
  expired: boolean
  startDate: Date
  totalDays: number
} | null {
  const totalDays = normalizeStatsDays(statsDays)
  const normalizedStartDate = normalizeStatsStartDate(statsStartDate)
  if (totalDays === null || normalizedStartDate === null) return null

  const startDate = new Date(`${normalizedStartDate}T00:00:00.000Z`)
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / DAY_MS))

  return {
    elapsedDays: Math.min(totalDays, elapsedDays),
    expired: elapsedDays >= totalDays,
    startDate,
    totalDays,
  }
}

export function getWinLossStartDate(
  statsDays: unknown,
  streamStartDate?: Date | null,
  resetAt?: unknown,
  now = new Date(),
  fixedStartDate?: Date | null,
): Date {
  const normalizedStatsDays = normalizeStatsDays(statsDays)
  const windowStart =
    fixedStartDate ??
    (normalizedStatsDays === null
      ? getSessionStartDate(streamStartDate)
      : new Date(now.getTime() - normalizedStatsDays * DAY_MS))
  if (!(typeof resetAt === 'string' || resetAt instanceof Date)) return windowStart

  const resetDate = resetAt instanceof Date ? resetAt : new Date(resetAt)
  const resetTime = resetDate.getTime()
  if (!Number.isFinite(resetTime) || resetTime > now.getTime()) return windowStart

  return resetTime > windowStart.getTime() ? resetDate : windowStart
}

export function getTodayStartDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
