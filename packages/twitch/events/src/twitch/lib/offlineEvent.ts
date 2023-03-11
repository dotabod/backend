import { EventSubStreamOfflineEvent } from '@twurple/eventsub-base'

import { prisma } from '../../db/prisma.js'
import { onlineEvents } from '../events/events.js'

export function offlineEvent(e: EventSubStreamOfflineEvent) {
  console.log(`${e.broadcasterId} just went offline`)

  // check onlineEvents to see if we have an online event for this user within the last 5 seconds
  // if we do, then we can safely assume that the offline event is a false positive
  setTimeout(() => {
    if (onlineEvents.has(e.broadcasterId)) {
      const onlineEventDate = onlineEvents.get(e.broadcasterId)!
      const now = new Date()
      const diff = now.getTime() - onlineEventDate.getTime()
      if (diff < 10000) {
        console.log('ignoring offline event for', e.broadcasterId)
        return
      }

      onlineEvents.delete(e.broadcasterId)
    }

    prisma.account
      .update({
        data: {
          user: {
            update: {
              stream_online: false,
            },
          },
        },
        where: {
          provider_providerAccountId: {
            provider: 'twitch',
            providerAccountId: e.broadcasterId,
          },
        },
      })
      .then(() => {
        console.log('updated offline event', e.broadcasterId)
      })
      .catch((e) => {
        console.log(e, 'offline save error', e.broadcasterId)
      })
  }, 10000)
}
