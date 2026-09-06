import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { redisClient } from '../../db/redis-instance'
import { DBSettings, getValueOrDefault } from '../../settings'
import { say } from '../say'
import { gsiHandlers } from './consts'
import {
  formatUnresolvedMatch,
  getUnresolvedMatches,
  REMINDER_FLAG_TTL_S,
  reminderSentFlagKey,
} from './unresolved-matches'

// Wait this long after a match becomes unresolved before nudging mods, so the
// reminder doesn't pile onto the initial DC prompt.
const REMINDER_AFTER_MS = 10 * 60 * 1000

// Guards against overlapping runs: the interval keeps firing every few minutes,
// but a slow run (many handlers / slow DB) must not race a second run into
// double-sending before the dedup flags are written.
let running = false

export const remindUnresolvedMatches = async function remindUnresolvedMatches(): Promise<void> {
  if (running) {
    return
  }
  running = true
  const now = Date.now()

  try {
    for (const handler of gsiHandlers.values()) {
      const client = handler?.client
      if (!client?.stream_online || !client.token) {
        continue
      }

      // Mirror the gates `say()` applies, so we only mark a match reminded when
      // the message will actually be delivered (otherwise it'd be permanently
      // suppressed without ever reaching chat).
      const canSpeak =
        !getValueOrDefault(DBSettings.commandDisable, client.settings, client.subscription) &&
        getValueOrDefault(DBSettings.chatter, client.settings, client.subscription) &&
        getValueOrDefault(DBSettings.tellChatBets, client.settings, client.subscription)
      if (!canSpeak) {
        continue
      }

      try {
        const matches = await getUnresolvedMatches(client)
        if (matches.length === 0) {
          continue
        }

        const dueIds = new Set<string>()
        for (const match of matches) {
          const endedAt = new Date(match.updated_at || match.created_at).getTime()
          if (Number.isNaN(endedAt) || now - endedAt < REMINDER_AFTER_MS) {
            continue
          }
          if (await redisClient.client.get(reminderSentFlagKey(client.token, match.matchId))) {
            continue
          }
          dueIds.add(match.matchId)
        }

        if (dueIds.size === 0) {
          continue
        }

        const matchList = matches
          .filter((m) => dueIds.has(m.matchId))
          .map((m) => formatUnresolvedMatch(m, new Date(now)))
          .join(', ')

        // delay:false sends immediately; a queued (delayed) send would be lost
        // on a deploy/restart while the dedup flag below already marked it sent.
        say(
          client,
          t('bets.unresolvedReminder', {
            count: dueIds.size,
            emote: 'PauseChamp',
            lng: client.locale,
            matchList,
          }),
          { delay: false, key: DBSettings.tellChatBets }
        )

        for (const matchId of dueIds) {
          await redisClient.client.setEx(
            reminderSentFlagKey(client.token, matchId),
            REMINDER_FLAG_TTL_S,
            '1'
          )
        }
      } catch (error) {
        logger.error('[BETS] Error reminding unresolved matches', {
          e: (error as Error)?.message || error,
          name: client.name,
        })
      }
    }
  } finally {
    running = false
  }
}
