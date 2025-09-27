import { logger } from '@dotabod/shared-utils'
import { translate } from '@vitalets/google-translate-api'
import { DotaEventTypes } from '../../../types.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

function isRussian(text: string): boolean {
  // Check if the text contains Cyrillic characters
  const cyrillicRegex = /[\u0400-\u04FF]/
  return cyrillicRegex.test(text)
}

eventHandler.registerEvent(`event:${DotaEventTypes.ChatMessage}`, {
  handler: async (
    dotaClient,
    event: {
      game_time: number
      player_id: number
      channel_type: number
      event_type: string
    },
  ) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    logger.info('Chat message event received', { event, token: dotaClient.client.token })

    const message = ''
    if (!message || typeof message !== 'string') return

    if (isRussian(message)) {
      try {
        const { text } = await translate(message, { to: 'en' })
        // Say the translated message in chat
        // say(dotaClient.client, text)
      } catch (error) {
        logger.error('Translation error:', error)
      }
    }
  },
})
