import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { chatClient } from '../../twitch/index.js'
import { logger } from '../../utils/logger.js'
import findUser from './connectedStreamers.js'
import { GLOBAL_DELAY } from './consts.js'

export function tellChatNewMMR(locale: string, token: string, mmr = 0, oldMmr = 0) {
  const client = findUser(token)
  if (!client) return
  const mmrEnabled = getValueOrDefault(DBSettings['mmr-tracker'], client.settings)
  const newMmr = mmr - oldMmr
  if (mmrEnabled && newMmr !== 0 && mmr !== 0) {
    const isAuto = Math.abs(newMmr) === 30
    setTimeout(
      () => {
        void chatClient.say(
          client.name,
          t('updateMmr', {
            context: isAuto ? 'auto' : 'manual',
            mmr,
            delta: `${newMmr > 0 ? '+' : ''}${newMmr}`,
            lng: locale,
          }),
        )
      },
      isAuto ? GLOBAL_DELAY : 0,
    )
  }
}

export function updateMmr(newMmr: string | number, steam32Id?: number | null) {
  let mmr = Number(newMmr)
  if (!newMmr || !mmr || mmr > 20000 || mmr < 0) {
    logger.info('Invalid mmr, forcing to 0', { steam32Id, mmr })
    mmr = 0
  }

  if (!steam32Id) {
    return false
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
      logger.error('[UPDATE MMR] Error updating account table', { steam32Id, e })
    })
}
