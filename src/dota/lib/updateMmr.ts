import { toUserName } from '@twurple/chat'

import { server } from '..'
import { prisma } from '../../db/prisma'
import { chatClient } from '../../twitch/commands'
import { findUserByName } from './connectedStreamers'

export function updateMmr(
  mmr: string | number,
  steam32Id: number,
  channel: string,
  channelId?: string | null,
) {
  if (!mmr || !Number(mmr) || Number(mmr) > 20000) {
    console.log('Invalid mmr', mmr, steam32Id)

    return
  }

  if (!steam32Id) {
    if (!channelId) {
      console.log('[MMR]', 'No channel id provided, will not update user table', { channel })
      return
    }

    console.log('[MMR]', 'No steam32Id provided, will update the users table until they get one', {
      channel,
    })

    // Have to lookup by channel id because name is case sensitive in the db
    // Not sure if twitch returns channel names or display names
    prisma.account
      .update({
        where: {
          provider_providerAccountId: {
            provider: 'twitch',
            providerAccountId: channelId,
          },
        },
        data: {
          User: {
            update: {
              mmr: Number(mmr),
            },
          },
        },
      })
      .catch((e) => {
        console.log('[MMR]', 'Error updating user table', { channel, e })
        void chatClient.say(channel, `Error updating mmr for ${channel}`)
      })

    return
  }

  prisma.steamAccount
    .update({
      data: {
        user: {
          update: {
            mmr: 0,
          },
        },
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
        const currentSteam = client.SteamAccount.findIndex((s) => s.steam32Id === steam32Id)
        if (currentSteam >= 0) {
          client.SteamAccount[currentSteam].mmr = Number(mmr)
        }

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
