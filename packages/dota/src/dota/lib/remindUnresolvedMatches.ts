import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { redisClient } from '../../db/redisInstance'
import { DBSettings, getValueOrDefault } from '../../settings'
import { say } from '../say'
import { gsiHandlers } from './consts'
import { formatUnresolvedMatch, getUnresolvedMatches } from './unresolvedMatches'

// Wait this long after a match becomes unresolved before nudging mods, so the
// reminder doesn't pile onto the initial DC prompt.
const REMINDER_AFTER_MS = 10 * 60 * 1000
// Each match is reminded at most once; the flag outlives a streaming session.
const REMINDER_FLAG_TTL_S = 24 * 60 * 60

export async function remindUnresolvedMatches(): Promise<void> {
  const now = Date.now()

  for (const handler of gsiHandlers.values()) {
    const client = handler?.client
    if (!client?.stream_online || !client.token) continue

    const tellChatBets = getValueOrDefault(
      DBSettings.tellChatBets,
      client.settings,
      client.subscription,
    )
    if (!tellChatBets) continue

    try {
      const matches = await getUnresolvedMatches(client)
      if (matches.length === 0) continue

      const due: { matchId: string; flagKey: string }[] = []
      for (const match of matches) {
        const endedAt = new Date(match.updated_at || match.created_at).getTime()
        if (now - endedAt < REMINDER_AFTER_MS) continue

        const flagKey = `${client.token}:${match.matchId}:unresolvedReminderSent`
        if (await redisClient.client.get(flagKey)) continue

        due.push({ matchId: match.matchId, flagKey })
      }

      if (due.length === 0) continue

      const dueIds = new Set(due.map((d) => d.matchId))
      const matchList = matches
        .filter((m) => dueIds.has(m.matchId))
        .map((m) => formatUnresolvedMatch(m, new Date(now)))
        .join(', ')

      say(
        client,
        t('bets.unresolvedReminder', {
          count: due.length,
          matchList,
          emote: 'PauseChamp',
          lng: client.locale,
        }),
        { key: DBSettings.tellChatBets },
      )

      for (const { flagKey } of due) {
        await redisClient.client.setEx(flagKey, REMINDER_FLAG_TTL_S, '1')
      }
    } catch (e) {
      logger.error('[BETS] Error reminding unresolved matches', {
        name: client.name,
        e: (e as Error)?.message || e,
      })
    }
  }
}
