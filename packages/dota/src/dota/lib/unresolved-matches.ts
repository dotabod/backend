import { supabase } from '@dotabod/shared-utils'
import { z } from 'zod'

import { getSessionStartDate } from '../../db/stream-window'
import type { SocketClient } from '../../types'
import getHero from './get-hero'

const unresolvedMatchSchema = z.object({
  created_at: z.string(),
  dire_score: z.number().nullable(),
  hero_name: z.string().nullable(),
  kda: z
    .object({
      assists: z.number().nullish(),
      deaths: z.number().nullish(),
      duration: z.number().nullish(),
      kills: z.number().nullish(),
    })
    .nullable(),
  matchId: z.string(),
  radiant_score: z.number().nullable(),
  updated_at: z.string(),
})

export type UnresolvedMatch = z.infer<typeof unresolvedMatchSchema>

// Set once per match when its single reminder is sent; also set eagerly for
// matches that can never be resolved (no-stats) so they're never nudged. TTL
// outlives a streaming session.
export const REMINDER_FLAG_TTL_S = 24 * 60 * 60
export const reminderSentFlagKey = (token: string, matchId: string) =>
  `${token}:${matchId}:unresolvedReminderSent`

export const getUnresolvedMatches = async function getUnresolvedMatches(
  client: SocketClient
): Promise<UnresolvedMatch[]> {
  const startDate = getSessionStartDate(client.stream_start_date)
  const currentMatchId = client.gsi?.map?.matchid

  const { data, error } = await supabase
    .from('matches')
    .select('matchId, hero_name, kda, radiant_score, dire_score, created_at, updated_at')
    .eq('userId', client.token)
    .is('won', null)
    .neq('matchId', currentMatchId ?? '')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  if (error !== null) {
    return []
  }
  return z.array(unresolvedMatchSchema).parse(data ?? [])
}

export const formatTimeAgo = function formatTimeAgo(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime()
  if (Number.isNaN(elapsed)) {
    return ''
  }
  const minutes = Math.max(0, Math.floor(elapsed / 60_000))
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  return remMinutes ? `${hours}h ${remMinutes}m ago` : `${hours}h ago`
}

const formatDuration = function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export const formatUnresolvedMatch = function formatUnresolvedMatch(
  match: UnresolvedMatch,
  now: Date = new Date()
): string {
  const hero = getHero(match.hero_name)
  const heroName = hero?.localized_name ?? match.hero_name ?? 'Unknown'

  const parts: string[] = [heroName]

  const { kda } = match
  if (
    kda &&
    [kda.kills, kda.deaths, kda.assists].some((stat) => stat !== null && stat !== undefined)
  ) {
    parts.push(`${kda.kills ?? 0}/${kda.deaths ?? 0}/${kda.assists ?? 0}`)
  }

  if (match.radiant_score !== null && match.dire_score !== null) {
    parts.push(`${match.radiant_score}-${match.dire_score}`)
  }

  const duration = kda?.duration ?? null
  if (duration !== null) {
    parts.push(formatDuration(duration))
  }

  const endedAt = match.updated_at || match.created_at
  if (endedAt) {
    const ago = formatTimeAgo(new Date(endedAt), now)
    if (ago) {
      parts.push(`~${ago}`)
    }
  }

  return `${match.matchId} (${parts.join(', ')})`
}
