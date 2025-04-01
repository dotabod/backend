import { logger } from './twitch/lib/logger.js'
import { getTwitchAPI } from './getTwitchAPI'

/**
 * Check if the bot is a moderator in a broadcaster's channel and make it one if not
 * @param broadcasterId The broadcaster's Twitch ID
 */
export async function ensureBotIsModerator(broadcasterId: string) {
  try {
    if (!process.env.TWITCH_BOT_PROVIDERID || !process.env.TWITCH_CLIENT_ID) {
      logger.warn('[TWITCHEVENTS] Missing bot ID or client ID, cannot check moderator status', {
        broadcasterId,
        hasBotId: Boolean(process.env.TWITCH_BOT_PROVIDERID),
      })
      return
    }

    const api = await getTwitchAPI(broadcasterId)
    logger.info('[TWITCHEVENTS] Adding bot as moderator', { broadcasterId })

    await api.moderation.addModerator(broadcasterId, process.env.TWITCH_BOT_PROVIDERID!)
  } catch (error) {
    logger.error('[TWITCHEVENTS] Error ensuring bot is moderator', {
      broadcasterId,
      error,
    })
  }
}
