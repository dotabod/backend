import { EventSubStreamOnlineEvent } from '@twurple/eventsub-base'

import { prisma } from '../../db/prisma.js'
import { getStreamDelay } from './getStreamDelay.js'

export function onlineEvent(e: EventSubStreamOnlineEvent) {
  console.log(`${e.broadcasterId} just went online`)
  async function handler() {
    let delay = 0
    try {
      delay = await getStreamDelay(e.broadcasterId)
      console.log('found delay of', delay, 'for', e.broadcasterId)
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
              stream_start_date: e.startDate,
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
        console.log('updated online event', e.broadcasterId)
      })
      .catch((e) => {
        console.log(e, 'online event save error', e.broadcasterId)
      })
  }

  void handler()
}
