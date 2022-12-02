import { toUserName } from '@twurple/chat'

import { server } from '..'
import { prisma } from '../../db/prisma'
import { chatClient } from '../../twitch/commands'
import { findUserByName } from './connectedStreamers'
import { getRankDetail } from './ranks'

export function updateMmr(
  newMmr: string | number,
  steam32Id: number,
  channel: string,
  channelId?: string | null,
) {
  let mmr = newMmr
  if (!mmr || !Number(mmr) || Number(mmr) > 20000 || mmr < 0) {
    console.log('Invalid mmr, forcing to 0', { channel, mmr })
    mmr = 0
  }

  if (!steam32Id) {
    if (!channelId) {
      console.log('[UPDATE MMR]', 'No channel id provided, will not update user table', { channel })
      return
    }

    console.log(
      '[UPDATE MMR]',
      'No steam32Id provided, will update the users table until they get one',
      {
        channel,
      },
    )

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
          user: {
            update: {
              mmr: Number(mmr),
            },
          },
        },
      })
      .catch((e) => {
        console.log('[UPDATE MMR]', 'Error updating user table', { channel, e })
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
          console.log('[UPDATE MMR] Sending mmr to socket', client.mmr, client.sockets, channel)
          getRankDetail(mmr, client.steam32Id)
            .then((deets) => {
              server.io.to(client.sockets).emit('update-medal', deets)
            })
            .catch((e) => {
              console.error('[MMR] !mmr= Error getting rank detail', e)
            })
        } else {
          console.log('[UPDATE MMR] No sockets found to send update to', channel)
        }
      }
    })
    .catch(() => {
      void chatClient.say(channel, `Failed to update MMR to ${mmr}`)
    })
}
