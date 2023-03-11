import { EventSubChannelUpdateEvent } from '@twurple/eventsub-base'

import { prisma } from '../../db/prisma.js'

export function updateChannelEvent(e: EventSubChannelUpdateEvent) {
  console.log(`${e.broadcasterId} updateChannelEvent`)

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
      console.log('updateChannelEvent event', e.broadcasterId)
    })
    .catch((e) => {
      console.error(e, 'updateChannelEvent error', e.broadcasterId)
    })
}
