import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { DBSettings, defaultSettings, getValueOrDefault } from '@dotabod/settings'
import { SocketClient } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { getChannelAPI } from './getChannelAPI.js'

// Disable the bet in settings for this user
export function disableBetsForToken(token: string) {
  prisma.setting
    .upsert({
      where: {
        key_userId: {
          key: DBSettings.bets,
          userId: token,
        },
      },
      create: {
        userId: token,
        key: DBSettings.bets,
        value: false,
      },
      update: {
        value: false,
      },
    })
    .then(() => {
      logger.info('[BETS] Disabled bets for user', {
        token,
      })
    })
    .catch((e) => {
      logger.error('[BETS] Error disabling bets', { e, token })
    })
}

export async function openTwitchBet(
  locale: string,
  token: string,
  heroName?: string,
  settings?: SocketClient['settings'],
) {
  const { api, providerAccountId } = getChannelAPI(token)
  const betsInfo = getValueOrDefault(DBSettings.betsInfo, settings)
  logger.info('[PREDICT] [BETS] Opening twitch bet', { userId: token, heroName })

  const title =
    betsInfo.title !== defaultSettings.betsInfo.title
      ? betsInfo.title.replace('[heroname]', heroName ?? '')
      : t('predictions.title', { lng: locale, heroName })

  const yes =
    betsInfo.yes !== defaultSettings.betsInfo.yes
      ? betsInfo.yes
      : t('predictions.yes', { lng: locale })

  const no =
    betsInfo.no !== defaultSettings.betsInfo.no ? betsInfo.no : t('predictions.no', { lng: locale })

  return api.predictions
    .createPrediction(providerAccountId || '', {
      title: title.substring(0, 45),
      outcomes: [yes.substring(0, 25), no.substring(0, 25)],
      autoLockAfter: betsInfo.duration >= 30 && betsInfo.duration <= 1800 ? betsInfo.duration : 240, // 4 min default
    })
    .catch((e: any) => {
      try {
        if (JSON.parse(e?.body)?.message?.includes('channel points not enabled')) {
          disableBetsForToken(token)

          logger.info('[PREDICT] [BETS] Channel points not enabled for', { userId: token })
          throw new Error('Bets not enabled')
        }
      } catch (e) {
        // oops
      }

      throw e
    })
}
