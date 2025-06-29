import { moderateText } from '@dotabod/profanity-filter'
import { getTwitchAPI, logger, supabase, trackDisableReason } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { getTokenFromTwitchId } from '../../dota/lib/connectedStreamers.js'
import { say } from '../../dota/say.js'
import { DBSettings, defaultSettings, getValueOrDefault } from '../../settings.js'
import type { SocketClient } from '../../types.js'

// Disable the bet in settings for this user
export async function disableBetsForTwitchId(twitchId: string, errorMessage: string) {
  const token = getTokenFromTwitchId(twitchId)
  if (!token) return

  // Track the disable reason before disabling
  await trackDisableReason(token, DBSettings.bets, 'api_error', {
    api_endpoint: 'Twitch Predictions API',
    error_type: 'twitch_betting_api_failure',
    error_message: errorMessage || 'Failed to create betting prediction',
    additional_info: 'Betting disabled due to repeated API failures',
  })

  await supabase.from('settings').upsert(
    {
      userId: token,
      key: DBSettings.bets,
      value: false,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'userId, key',
    },
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

  logger.info('[PREDICT] [BETS] Opening twitch bet', { twitchId, heroName })

  const isTitleDefault = betsInfo.title === defaultSettings.betsInfo.title
  const title = isTitleDefault
    ? t('predictions.title', { lng: locale, heroName })
    : betsInfo.title.replace('[heroname]', heroName ?? '')
  const filteredTitle =
    (await moderateText(title)) || t('predictions.title', { lng: locale, heroName })

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
      `Predictions opened for ${heroName} on match ${client.gsi?.map?.matchid}`,
    )
  } catch (e) {
    logger.error('[PREDICT] [BETS] Failed to create stream marker (open)', { twitchId, e })
  }

  return await api.predictions
    .createPrediction(twitchId, {
      title: filteredTitle.substring(0, 45),
      outcomes: [filteredYes.substring(0, 25), filteredNo.substring(0, 25)],
      autoLockAfter,
    })
    .catch(async (e) => {
      try {
        if (e.stack?.includes('The user context for the user')) {
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
      } catch (e) {
        // just means couldn't find the error in the stack
      }

      try {
        if (JSON.parse(e?.body)?.message?.includes('channel points not enabled')) {
          await disableBetsForTwitchId(twitchId, 'Channel points not enabled')
          logger.info('[PREDICT] [BETS] Channel points not enabled for', {
            twitchId,
          })
        }
        return
      } catch (e) {
        // just means couldn't json parse the message for the case above
      }

      try {
        // "message\": \"Invalid refresh token\"\n}" means they have to logout and login
        if (JSON.parse(e?.body)?.message?.includes('refresh token')) {
          say(
            client,
            t('bets.error', {
              channel: `@${client.name}`,
              lng: client.locale,
            }),
            {
              delay: false,
            },
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
      } catch (e) {
        // just means couldn't json parse the message for the two cases above
      }

      logger.error('[PREDICT] [BETS] Failed to open twitch bet', { twitchId, heroName, e })

      throw e
    })
}
