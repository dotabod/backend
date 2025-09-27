import { moderateText } from '@dotabod/profanity-filter'
import { logger } from '@dotabod/shared-utils'
import { translate } from '@vitalets/google-translate-api'
import { franc } from 'franc'
import { DotaEventTypes } from '../../../types.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
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

    const message = moderateText(event.message?.trim())
    if (!message || typeof message !== 'string') return

    const detectedLang = franc(message)
    if (detectedLang !== 'eng' && detectedLang !== 'und') {
      try {
        const { text } = await translate(message, { to: 'en' })
        server.io.to(dotaClient.getToken()).emit('chatMessage', moderateText(text))

        // TODO: maybe say the translated message in chat
        // say(dotaClient.client, text)
      } catch (error) {
        logger.error('Translation error:', { error, message })
      }
    }
  },
})
