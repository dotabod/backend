import { server } from '..'
import { prisma } from '../../db/prisma'
import { chatClient } from '../../twitch/commands'
import { findUserByTwitchId } from './connectedStreamers'

export function updateMmr(mmr: string | number, channelId: string, channel: string) {
  if (!channel) return

  if (!mmr || !Number(mmr) || Number(mmr) > 20000) {
    console.log('Invalid mmr', mmr, channel)

    return
  }

  prisma.account
    .update({
      data: {
        user: {
          update: {
            mmr: Number(mmr),
          },
        },
      },
      where: {
        provider_providerAccountId: {
          provider: 'twitch',
          providerAccountId: channelId,
        },
      },
    })
    .then(() => {
      void chatClient.say(channel, `Updated MMR to ${mmr}`)
      const client = findUserByTwitchId(channelId)

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
