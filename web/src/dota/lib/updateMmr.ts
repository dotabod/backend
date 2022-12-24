import { prisma } from '../../db/prisma.js'
import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { chatClient } from '../../twitch/index.js'
import { logger } from '../../utils/logger.js'
import findUser from './connectedStreamers.js'

export function tellChatNewMMR(token: string, mmr = 0, oldMmr = 0) {
  const client = findUser(token)
  if (!client) return
  const mmrEnabled = getValueOrDefault(DBSettings.mmrTracker, client.settings)
  if (mmrEnabled && mmr - oldMmr !== 0 && mmr !== 0) {
    void chatClient.say(
      client.name,
      `Updated MMR to ${mmr}, ${mmr - oldMmr > 0 ? '+' : ''}${mmr - oldMmr}`,
    )
  }
}

export function updateMmr(
  newMmr: string | number,
  steam32Id: number,
  channel: string,
  channelId?: string | null,
) {
  let mmr = Number(newMmr)
  if (!newMmr || !mmr || mmr > 20000 || mmr < 0) {
    logger.info('Invalid mmr, forcing to 0', { channel, mmr })
    mmr = 0
  }

  if (!steam32Id) {
    if (!channelId) {
      logger.info('[UPDATE MMR]', 'No channel id provided, will not update user table', { channel })
      return
    }

    logger.info(
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
      .catch((e) => {
        logger.info('[UPDATE MMR]', 'Error updating user table', { channel, e })
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
    .catch((e) => {
      logger.info('[UPDATE MMR]', 'Error updating account table', { channel, e })
    })
}
