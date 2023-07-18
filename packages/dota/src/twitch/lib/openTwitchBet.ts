import { DBSettings, defaultSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { getTokenFromTwitchId } from '../../dota/lib/connectedStreamers.js'
import { SocketClient } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { getTwitchAPI } from './getTwitchAPI.js'

// Disable the bet in settings for this user
export function disableBetsForTwitchId(twitchId: string) {
  const token = getTokenFromTwitchId(twitchId)
  if (!token) return

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

export function openTwitchBet(
  locale: string,
  twitchId: string,
  heroName?: string,
  settings?: SocketClient['settings'],
) {
  const api = getTwitchAPI(twitchId)
  const betsInfo = getValueOrDefault(DBSettings.betsInfo, settings)
  logger.info('[PREDICT] [BETS] Opening twitch bet', { twitchId, heroName })

  const title =
    betsInfo.title !== defaultSettings.betsInfo.title
      ? betsInfo.title.replace('[heroname]', heroName ?? '')
      : t('predictions.title', { lng: locale, heroName })

  const yes =
    betsInfo.yes === defaultSettings.betsInfo.yes
      ? t('predictions.yes', { lng: locale })
      : betsInfo.yes

  const no =
    betsInfo.no === defaultSettings.betsInfo.no ? t('predictions.no', { lng: locale }) : betsInfo.no

  return api.predictions
    .createPrediction(twitchId || '', {
      title: title.substring(0, 45),
      outcomes: [yes.substring(0, 25), no.substring(0, 25)],
      autoLockAfter: betsInfo.duration >= 30 && betsInfo.duration <= 1800 ? betsInfo.duration : 240, // 4 min default
    })
    .catch((e: any) => {
      try {
        if (JSON.parse(e?.body)?.message?.includes('channel points not enabled')) {
          disableBetsForTwitchId(twitchId)

          logger.info('[PREDICT] [BETS] Channel points not enabled for', { twitchId })
          throw new Error('Bets not enabled')
        }
      } catch (e) {
        // oops
      }

      throw e
    })
}
