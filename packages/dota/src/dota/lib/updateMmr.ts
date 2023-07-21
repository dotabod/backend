import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { chatClient } from '../../twitch/index.js'
import { logger } from '../../utils/logger.js'
import findUser from './connectedStreamers.js'
import { GLOBAL_DELAY } from './consts.js'

interface TellChatNewMMRParams {
  locale: string
  token: string
  mmr?: number
  oldMmr?: number
  streamDelay: number
}

export function tellChatNewMMR({
  streamDelay,
  locale,
  token,
  mmr = 0,
  oldMmr = 0,
}: TellChatNewMMRParams) {
  const client = findUser(token)
  if (!client) return

  const mmrEnabled = getValueOrDefault(DBSettings['mmr-tracker'], client.settings)
  const tellChatNewMMR = getValueOrDefault(DBSettings.tellChatNewMMR, client.settings)
  const chattersEnabled = getValueOrDefault(DBSettings.chatter, client.settings)

  const newMmr = mmr - oldMmr
  if (mmrEnabled && chattersEnabled && tellChatNewMMR && newMmr !== 0 && mmr !== 0) {
    const isAuto = [20, 25].includes(Math.abs(newMmr))
    setTimeout(
      () => {
        chatClient.say(
          client.name,
          t('updateMmr', {
            context: isAuto ? 'auto' : 'manual',
            mmr,
            delta: `${newMmr > 0 ? '+' : ''}${newMmr}`,
            lng: locale,
          }),
        )
      },
      isAuto ? streamDelay + GLOBAL_DELAY : 0,
    )
  }
}

interface Mmr {
  newMmr: string | number
  steam32Id: number | null | undefined
  channel: string
  currentMmr: number
  token?: string | null
  force?: boolean
}

export function updateMmr({ force = false, currentMmr, newMmr, steam32Id, channel, token }: Mmr) {
  // uncalibrated (0) mmr do not deserve an update
  if (!currentMmr && !force) return

  let mmr = Number(newMmr)
  if (!newMmr || !mmr || mmr > 20000 || mmr < 0) {
    logger.info('Invalid mmr, forcing to 0', { channel, mmr })
    mmr = 0
  }

  if (!steam32Id) {
    if (!token) {
      logger.info('[UPDATE MMR] No token id provided, will not update user table', { channel })
      return
    }

    logger.info(
      '[UPDATE MMR] No steam32Id provided, will update the users table until they get one',
      {
        channel,
      },
    )

    // Have to lookup by channel id because name is case sensitive in the db
    // Not sure if twitch returns channel names or display names
    prisma.account
      .update({
        where: {
          userId: token,
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
        logger.info('[UPDATE MMR] Error updating user table', { channel, e })
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
      logger.error('[UPDATE MMR] Error updating account table', { channel, e })
    })
}
