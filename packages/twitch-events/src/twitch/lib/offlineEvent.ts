import type { EventSubStreamOfflineEvent } from '@twurple/eventsub-base'

import supabase from '../../db/supabase.js'
import { onlineEvents } from '../events/events.js'
import { logger } from './logger.js'

export function offlineEvent(e: EventSubStreamOfflineEvent) {
  logger.info(`${e.broadcasterId} just went offline`)

  // check onlineEvents to see if we have an online event for this user within the last 5 seconds
  // if we do, then we can safely assume that the offline event is a false positive
  setTimeout(() => {
    if (onlineEvents.has(e.broadcasterId)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const onlineEventDate = onlineEvents.get(e.broadcasterId)
      const now = new Date()
      const diff = now.getTime() - (onlineEventDate?.getTime() ?? now.getTime())
      if (diff < 10000) {
        logger.info('ignoring offline event for', { twitchId: e.broadcasterId })
        return
      }

      onlineEvents.delete(e.broadcasterId)
    }

    async function handler() {
      const { data: user } = await supabase
        .from('accounts')
        .select('userId')
        .eq('provider', 'twitch')
        .eq('providerAccountId', e.broadcasterId)
        .single()

      if (!user || !user.userId) {
        logger.info('[TWITCHEVENTS] user not found', {
          twitchId: e.broadcasterId,
        })
        return
      }

      await supabase
        .from('users')
        .update({
          stream_online: false,
        })
        .eq('id', user.userId)
        .then(() => {
          logger.info('updated online event', { twitchId: e.broadcasterId })
        })
    }

    void handler()
  }, 10000)
}
