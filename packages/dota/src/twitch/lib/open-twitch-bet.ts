import { moderateText } from '@dotabod/profanity-filter'
import { getTwitchAPI, logger, supabase, trackDisableReason } from '@dotabod/shared-utils'
import { StreamNotLiveError } from '@twurple/api'
import { t } from 'i18next'

import { getTokenFromTwitchId } from '../../dota/lib/connected-streamers'
import { say } from '../../dota/say'
import { DBSettings, defaultSettings, getValueOrDefault } from '../../settings'
import type { SocketClient } from '../../types'

export const isPredictionAlreadyActiveError = function isPredictionAlreadyActiveError(
  error: unknown
): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const { statusCode, body } = error as { statusCode?: unknown; body?: unknown }
  if (statusCode !== 400 || typeof body !== 'string') {
    return false
  }

  try {
    const parsedBody = JSON.parse(body) as { message?: unknown }
    return (
      typeof parsedBody.message === 'string' &&
      parsedBody.message.includes('prediction event already active')
    )
  } catch {
    return false
  }
}

// Disable the bet in settings for this user
const disableBetsForTwitchId = async function disableBetsForTwitchId(
  twitchId: string,
  errorMessage: string
) {
  const token = getTokenFromTwitchId(twitchId)
  if (token === null || token.length === 0) {
    return
  }

  // Track the disable reason before disabling
  await trackDisableReason(token, DBSettings.bets, 'API_ERROR', {
    additional_info: 'Betting disabled due to repeated API failures',
    api_endpoint: 'Twitch Predictions API',
    error_message: errorMessage || 'Failed to create betting prediction',
    error_type: 'twitch_betting_api_failure',
  })

  await supabase.from('settings').upsert(
    {
      key: DBSettings.bets,
      updated_at: new Date().toISOString(),
      userId: token,
      value: false,
    },
    {
      onConflict: 'userId, key',
    }
  )
}

export const openTwitchBet = async ({
  heroName,
  client,
}: {
  heroName?: string
  client: SocketClient
}) => {
  const { settings, locale, subscription } = client
  const twitchId = client.Account?.providerAccountId ?? ''

  const api = await getTwitchAPI(twitchId)
  const betsInfo = getValueOrDefault(DBSettings.betsInfo, settings, subscription)

  logger.info('[PREDICT] [BETS] Opening twitch bet', { heroName, twitchId })

  const isTitleDefault = betsInfo.title === defaultSettings.betsInfo.title
  const title = isTitleDefault
    ? t('predictions.title', { heroName, lng: locale })
    : betsInfo.title.replace('[heroname]', heroName ?? '')
  const moderatedTitle = await moderateText(title)
  const filteredTitle =
    moderatedTitle === null || moderatedTitle === undefined || moderatedTitle.length === 0
      ? t('predictions.title', { heroName, lng: locale })
      : moderatedTitle

  const isYesDefault = betsInfo.yes === defaultSettings.betsInfo.yes
  const yes = isYesDefault ? t('predictions.yes', { lng: locale }) : betsInfo.yes
  const moderatedYes = await moderateText(yes)
  const filteredYes =
    moderatedYes === null || moderatedYes === undefined || moderatedYes.length === 0
      ? t('predictions.yes', { lng: locale })
      : moderatedYes

  const isNoDefault = betsInfo.no === defaultSettings.betsInfo.no
  const no = isNoDefault ? t('predictions.no', { lng: locale }) : betsInfo.no
  const moderatedNo = await moderateText(no)
  const filteredNo =
    moderatedNo === null || moderatedNo === undefined || moderatedNo.length === 0
      ? t('predictions.no', { lng: locale })
      : moderatedNo

  const isValidDuration = betsInfo.duration >= 30 && betsInfo.duration <= 1800
  // 4 min default
  const autoLockAfter = isValidDuration ? betsInfo.duration : 240

  try {
    await api.streams.createStreamMarker(
      twitchId,
      `Predictions opened for ${heroName} on match ${client.gsi?.map?.matchid}`
    )
  } catch (error) {
    if (error instanceof StreamNotLiveError) {
      logger.info('[PREDICT] [BETS] Skipped stream marker (open) — channel offline', { twitchId })
    } else {
      logger.error('[PREDICT] [BETS] Failed to create stream marker (open)', { error, twitchId })
    }
  }

  return await api.predictions
    .createPrediction(twitchId, {
      autoLockAfter,
      outcomes: [filteredYes.slice(0, 25), filteredNo.slice(0, 25)],
      title: filteredTitle.slice(0, 45),
    })
    .catch(async (error: { body?: string; stack?: string }) => {
      if (isPredictionAlreadyActiveError(error)) {
        throw error
      }

      try {
        if (error.stack?.includes('The user context for the user') === true) {
          await supabase
            .from('accounts')
            .update({
              requires_refresh: true,
              updated_at: new Date().toISOString(),
            })
            .eq('providerAccountId', twitchId)
            .eq('provider', 'twitch')
          logger.info('[PREDICT] [BETS] User context disabled for', {
            twitchId,
          })
          return
        }
      } catch {
        // just means couldn't find the error in the stack
      }

      try {
        const parsedError = JSON.parse(error.body ?? '{}') as { message?: string }
        if (parsedError.message?.includes('channel points not enabled') === true) {
          await disableBetsForTwitchId(twitchId, 'Channel points not enabled')
          logger.info('[PREDICT] [BETS] Channel points not enabled for', {
            twitchId,
          })
          return
        }
      } catch {
        // just means couldn't json parse the message for the case above
      }

      try {
        // "message\": \"Invalid refresh token\"\n}" means they have to logout and login
        const parsedError = JSON.parse(error.body ?? '{}') as { message?: string }
        if (parsedError.message?.includes('refresh token') === true) {
          say(
            client,
            t('bets.error', {
              channel: `@${client.name}`,
              lng: client.locale,
            }),
            {
              delay: false,
            }
          )

          await supabase
            .from('accounts')
            .update({
              requires_refresh: true,
              updated_at: new Date().toISOString(),
            })
            .eq('providerAccountId', twitchId)
            .eq('provider', 'twitch')

          return
        }
      } catch {
        // just means couldn't json parse the message for the two cases above
      }

      logger.error('[PREDICT] [BETS] Failed to open twitch bet', { error, heroName, twitchId })

      throw error
    })
}
