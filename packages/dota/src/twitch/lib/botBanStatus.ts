import { getTwitchTokens } from './getTwitchTokens'
import { logger } from '../../utils/logger.js'

// Bot status tracking
export const botStatus = {
  isBanned: false,
  lastChecked: 0,
  banCheckCooldown: 60000, // Only check once per minute
}

// Function to check if the bot is banned and update status
export async function checkBotStatus() {
  // Skip check if we've checked recently
  if (Date.now() - botStatus.lastChecked < botStatus.banCheckCooldown) {
    return botStatus.isBanned
  }

  botStatus.lastChecked = Date.now()

  try {
    // Try to check the bot's validation status
    const tokens = await getTwitchTokens(process.env.TWITCH_BOT_PROVIDERID)

    if (!tokens || tokens.requires_refresh) {
      logger.info('[TWITCHCHAT] Bot is banned, tokens are invalid')
      botStatus.isBanned = true
      return botStatus.isBanned
    }

    botStatus.isBanned = false
    return botStatus.isBanned
  } catch (error) {
    botStatus.isBanned = true
    return botStatus.isBanned
  }
}
