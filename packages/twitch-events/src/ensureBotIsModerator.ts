import { getTwitchAPI, logger } from '@dotabod/shared-utils'

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

    try {
      await api.moderation.addModerator(broadcasterId, process.env.TWITCH_BOT_PROVIDERID!)
    } catch (modError: any) {
      // If the error is because the bot is already a moderator, this is not a real error
      if (modError?._body?.includes('user is already a mod')) {
        logger.debug('[TWITCHEVENTS] Bot is already a moderator', { broadcasterId })
        return
      }
      // Re-throw for other errors
      throw modError
    }
  } catch (error) {
    logger.error('[TWITCHEVENTS] Error ensuring bot is moderator', {
      broadcasterId,
      error,
    })
  }
}
