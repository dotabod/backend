import { EventSubStreamOnlineEvent } from '@twurple/eventsub-base'

import { prisma } from '../../db/prisma.js'

export function onlineEvent(data: EventSubStreamOnlineEvent) {
  console.log(`${data.broadcasterId} just went online`)
  prisma.account
    .update({
      data: {
        user: {
          update: {
            stream_online: true,
            stream_start_date: data.startDate,
          },
        },
      },
      where: {
        provider_providerAccountId: {
          provider: 'twitch',
          providerAccountId: data.broadcasterId,
        },
      },
    })
    .then(() => {
      console.log('updated online event', data.broadcasterId)
    })
    .catch((e) => {
      console.log(e, 'online event save error', e.broadcasterId)
    })
}
