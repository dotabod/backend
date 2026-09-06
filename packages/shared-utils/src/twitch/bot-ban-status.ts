import { logger } from '../logger'
import { getTwitchTokens } from './get-twitch-tokens'

// Bot status tracking
export const botStatus = {
  // Only check once per minute
  banCheckCooldown: 60_000,
  isBanned: false,
  lastChecked: 0,
}

export const checkBotStatus = async function checkBotStatus() {
  // Skip check if we've checked recently
  if (Date.now() - botStatus.lastChecked < botStatus.banCheckCooldown) {
    return botStatus.isBanned
  }

  botStatus.lastChecked = Date.now()

  try {
    // Try to check the bot's validation status
    const tokens = await getTwitchTokens(process.env.TWITCH_BOT_PROVIDERID)

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
