import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { z } from 'zod'

const moderatorErrorSchema = z.object({ _body: z.string() })

export const ensureBotIsModerator = async function ensureBotIsModerator(
  broadcasterId: string
): Promise<void> {
  try {
    const botProviderId = process.env.TWITCH_BOT_PROVIDERID
    const clientId = process.env.TWITCH_CLIENT_ID
    if (
      botProviderId === undefined ||
      botProviderId.length === 0 ||
      clientId === undefined ||
      clientId.length === 0
    ) {
      logger.warn('[TWITCHEVENTS] Missing bot ID or client ID, cannot check moderator status', {
        broadcasterId,
        hasBotId: Boolean(botProviderId),
      })
      return
    }

    const api = await getTwitchAPI(broadcasterId)
    logger.info('[TWITCHEVENTS] Adding bot as moderator', { broadcasterId })

    try {
      await api.moderation.addModerator(broadcasterId, botProviderId)
    } catch (moderatorError) {
      const parsedError = moderatorErrorSchema.safeParse(moderatorError)
      if (parsedError.success && parsedError.data._body.includes('user is already a mod')) {
        logger.debug('[TWITCHEVENTS] Bot is already a moderator', { broadcasterId })
        return
      }
      throw moderatorError
    }
  } catch (error) {
    logger.error('[TWITCHEVENTS] Error ensuring bot is moderator', {
      broadcasterId,
      error,
    })
  }
}
