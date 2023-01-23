import { EventSubStreamOnlineEvent } from '@twurple/eventsub-base'

import { prisma } from '../../db/prisma.js'
import { getStreamDelay } from './getStreamDelay.js'

export function onlineEvent(data: EventSubStreamOnlineEvent) {
  console.log(`${data.broadcasterId} just went online`)
  async function handler() {
    let delay = 0
    try {
      delay = await getStreamDelay(data.broadcasterId)
      console.log('found delay of', delay, 'for', data.broadcasterId)
    } catch (e) {
      console.log(e, 'could not get delay')
    }

    prisma.account
      .update({
        data: {
          user: {
            update: {
              stream_delay: delay,
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

  void handler()
}
