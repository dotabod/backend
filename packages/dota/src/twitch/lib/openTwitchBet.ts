import { moderateText } from '@dotabod/profanity-filter'
import { getTwitchAPI, logger, supabase, trackDisableReason } from '@dotabod/shared-utils'
import { StreamNotLiveError } from '@twurple/api'
import { t } from 'i18next'

import { getTokenFromTwitchId } from '../../dota/lib/connectedStreamers'
import { say } from '../../dota/say'
import { DBSettings, defaultSettings, getValueOrDefault } from '../../settings'
import type { SocketClient } from '../../types'

export function isPredictionAlreadyActiveError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {return false}

  const { statusCode, body } = error as { statusCode?: unknown; body?: unknown }
  if (statusCode !== 400 || typeof body !== 'string') {return false}

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
async function disableBetsForTwitchId(twitchId: string, errorMessage: string) {
  const token = getTokenFromTwitchId(twitchId)
  if (!token) {return}

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
  const filteredTitle =
    (await moderateText(title)) || t('predictions.title', { heroName, lng: locale })

  const isYesDefault = betsInfo.yes === defaultSettings.betsInfo.yes
  const yes = isYesDefault ? t('predictions.yes', { lng: locale }) : betsInfo.yes
  const filteredYes = (await moderateText(yes)) || t('predictions.yes', { lng: locale })

  const isNoDefault = betsInfo.no === defaultSettings.betsInfo.no
  const no = isNoDefault ? t('predictions.no', { lng: locale }) : betsInfo.no
  const filteredNo = (await moderateText(no)) || t('predictions.no', { lng: locale })

  const isValidDuration = betsInfo.duration >= 30 && betsInfo.duration <= 1800
  const autoLockAfter = isValidDuration ? betsInfo.duration : 240 // 4 min default

  try {
    await api.streams.createStreamMarker(
      twitchId,
      `Predictions opened for ${heroName} on match ${client.gsi?.map?.matchid}`
    )
  } catch (error) {
    if (error instanceof StreamNotLiveError) {
      logger.info('[PREDICT] [BETS] Skipped stream marker (open) — channel offline', { twitchId })
    } else {
      logger.error('[PREDICT] [BETS] Failed to create stream marker (open)', { twitchId, error })
    }
  }

  return await api.predictions
    .createPrediction(twitchId, {
      autoLockAfter,
      outcomes: [filteredYes.substring(0, 25), filteredNo.substring(0, 25)],
      title: filteredTitle.substring(0, 45),
    })
    .catch(async (error) => {
      if (isPredictionAlreadyActiveError(error)) throw error

      try {
        if (error.stack?.includes('The user context for the user')) {
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
      } catch (_e) {
        // just means couldn't find the error in the stack
      }

      try {
        if (JSON.parse(error?.body)?.message?.includes('channel points not enabled')) {
          await disableBetsForTwitchId(twitchId, 'Channel points not enabled')
          logger.info('[PREDICT] [BETS] Channel points not enabled for', {
            twitchId,
          })
          return
        }
      } catch (_e) {
        // just means couldn't json parse the message for the case above
      }

      try {
        // "message\": \"Invalid refresh token\"\n}" means they have to logout and login
        if (JSON.parse(error?.body)?.message?.includes('refresh token')) {
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
      } catch (_e) {
        // just means couldn't json parse the message for the two cases above
      }

      logger.error('[PREDICT] [BETS] Failed to open twitch bet', { twitchId, heroName, error })

      throw error
    })
}
