import { moderateText } from '@dotabod/profanity-filter'
import { logger } from '@dotabod/shared-utils'
import { translate } from '@vitalets/google-translate-api'
import { franc } from 'franc'
import { t } from 'i18next'
import { DBSettings, getValueOrDefault } from '../../../settings.js'
import { DotaEventTypes } from '../../../types.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import { server } from '../../server.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`event:${DotaEventTypes.ChatMessage}`, {
  handler: async (
    dotaClient,
    event: {
      game_time: number
      player_id: number
      channel_type: number
      event_type: string
      message: string
    },
  ) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    // Check global chatter access
    const translateEnabled = getValueOrDefault(
      DBSettings.autoTranslate,
      dotaClient.client.settings,
      dotaClient.client.subscription,
    )

    if (!translateEnabled) return

    const message = await moderateText(event.message?.trim())
    if (!message || typeof message !== 'string' || message === '***') return

    const detectedLang = franc(message)
    if (detectedLang !== 'eng' && detectedLang !== 'und') {
      try {
        const { text } = await translate(message, { to: 'en' })
        const moderatedTranslation = await moderateText(text)

        if (moderatedTranslation) {
          server.io.to(dotaClient.getToken()).emit('chatMessage', moderatedTranslation)
          say(
            dotaClient.client,
            t('autoTranslate', {
              playerId: event.player_id,
              message: moderatedTranslation,
              lng: dotaClient.client.locale,
            }),
          )
        }
      } catch (error) {
        logger.error('Translation error:', { error, message })
      }
    }
  },
})
