import { toUserName } from '@twurple/chat/lib'

import { server } from '..'
import { prisma } from '../../db/prisma'
import { chatClient } from '../../twitch/commands'
import { findUserByName } from './connectedStreamers'

export function updateMmr(mmr: string | number, steam32Id: number, channel: string) {
  if (!steam32Id) return

  if (!mmr || !Number(mmr) || Number(mmr) > 20000) {
    console.log('Invalid mmr', mmr, steam32Id)

    return
  }

  prisma.steamAccount
    .update({
      data: {
        mmr: Number(mmr),
      },
      where: {
        steam32Id,
      },
    })
    .then(() => {
      void chatClient.say(channel, `Updated MMR to ${mmr}`)
      const client = findUserByName(toUserName(channel))

      if (client) {
        client.mmr = Number(mmr)

        if (client.sockets.length) {
          console.log('[MMR] Sending mmr to socket', client.mmr, client.sockets, channel)
          server.io.to(client.sockets).emit('update-medal', { mmr, steam32Id: client.steam32Id })
        } else {
          console.log('[MMR] No sockets found to send update to', channel)
        }
      }
    })
    .catch(() => {
      void chatClient.say(channel, `Failed to update MMR to ${mmr}`)
    })
}
