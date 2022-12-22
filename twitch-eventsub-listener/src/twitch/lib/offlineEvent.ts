import { EventSubStreamOfflineEvent } from '@twurple/eventsub-base'

import { prisma } from '../../db/prisma.js'

export function offlineEvent(e: EventSubStreamOfflineEvent) {
  console.log(`${e.broadcasterId} just went offline`)

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
}
