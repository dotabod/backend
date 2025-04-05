import { logger } from '@dotabod/shared-utils'
import { getTwitchTokens } from './getTwitchTokens.js'

// Bot status tracking
export const botStatus = {
  isBanned: false,
  lastChecked: 0,
  banCheckCooldown: 60000, // Only check once per minute
}

/**
 * Check if the bot is banned from Twitch
 * @returns Whether the bot is banned
 */
export async function checkBotStatus() {
  // Skip check if we've checked recently
  if (Date.now() - botStatus.lastChecked < botStatus.banCheckCooldown) {
    return botStatus.isBanned
  }

  botStatus.lastChecked = Date.now()

  try {
    // Try to check the bot's validation status
    const tokens = await getTwitchTokens(process.env.TWITCH_BOT_PROVIDERID!)

    if (!tokens || tokens.requires_refresh) {
      logger.info('[TWITCH] Bot is banned, tokens are invalid')
      botStatus.isBanned = true
      return botStatus.isBanned
    }

    botStatus.isBanned = false
    return botStatus.isBanned
  } catch (error) {
    logger.error('[TWITCH] Error checking bot status', { error })
    botStatus.isBanned = true
    return botStatus.isBanned
  }
}
