import { toUserName } from '@twurple/chat'

import { prisma } from '../../db/prisma.js'
import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { chatClient } from '../../twitch/commands/index.js'
import { server } from '../index.js'
import { findUserByName } from './connectedStreamers.js'
import { getRankDetail } from './ranks.js'

export function updateMmr(
  newMmr: string | number,
  steam32Id: number,
  channel: string,
  channelId?: string | null,
) {
  let mmr = Number(newMmr)
  if (!newMmr || !mmr || mmr > 20000 || mmr < 0) {
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
              mmr: mmr,
            },
          },
        },
      })
      .then(() => {
        const client = findUserByName(toUserName(channel))

        if (client) {
          const mmrEnabled = getValueOrDefault(DBSettings.mmrTracker, client.settings)

          let oldMmr = client.mmr
          client.mmr = mmr
          const currentSteam = client.SteamAccount.findIndex((s) => s.steam32Id === steam32Id)
          if (currentSteam >= 0) {
            oldMmr = client.SteamAccount[currentSteam].mmr
            client.SteamAccount[currentSteam].mmr = mmr
          }

          if (mmrEnabled)
            void chatClient.say(
              channel,
              `Updated MMR to ${mmr}, ${mmr - oldMmr > 0 ? '+' : ''}${mmr - oldMmr}`,
            )

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
      .catch((e) => {
        console.log('[UPDATE MMR]', 'Error updating user table', { channel, e })
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
        mmr: mmr,
      },
      where: {
        steam32Id,
      },
    })
    .then(() => {
      const client = findUserByName(toUserName(channel))

      if (client) {
        const mmrEnabled = getValueOrDefault(DBSettings.mmrTracker, client.settings)

        let oldMmr = client.mmr
        client.mmr = mmr
        const currentSteam = client.SteamAccount.findIndex((s) => s.steam32Id === steam32Id)
        if (currentSteam >= 0) {
          oldMmr = client.SteamAccount[currentSteam].mmr
          client.SteamAccount[currentSteam].mmr = mmr
        }

        if (mmrEnabled)
          void chatClient.say(
            channel,
            `Updated MMR to ${mmr}, ${mmr - oldMmr > 0 ? '+' : ''}${mmr - oldMmr}`,
          )

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
    .catch((e) => {
      console.log('[UPDATE MMR]', 'Error updating account table', { channel, e })
    })
}
