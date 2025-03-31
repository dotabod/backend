import { ApiClient } from '@twurple/api'
import { logger } from './twitch/lib/logger.js'
import { getBotAuthProvider } from './getBotAuthProvider.js'

// Bot status tracking
export const botStatus = {
  isBanned: false,
  lastChecked: 0,
  banCheckCooldown: 60000, // Only check once per minute
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  requiredFailures: 2, // Require multiple consecutive failures before considering banned
  requiredSuccesses: 3, // Require multiple consecutive successes before considering unbanned
}

// Remember last error to prevent log spam
export let lastAuthErrorTime = 0
export const ERROR_LOG_COOLDOWN = 60000 // 1 minute

// Function to update lastAuthErrorTime
export function updateLastAuthErrorTime(time: number): void {
  lastAuthErrorTime = time
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
    const authProvider = await getBotAuthProvider()
    const api = new ApiClient({ authProvider })

    // A simple API call that will fail if bot is banned/unauthorized
    const result = await api.users.getUserByName(process.env.TWITCH_BOT_USERNAME || 'dotabod')

    if (!result) {
      return handleFailedCheck(true)
    }

    return handleSuccessfulCheck()
  } catch (error) {
    // Check if this is an auth error (401)
    const isAuthError =
      error instanceof Error &&
      (error.message.includes('401') || error.message.includes('Unauthorized'))

    if (isAuthError) {
      return handleFailedCheck(false)
    }

    // If not an auth error, log it but don't update ban status
    logger.error('Failed to check bot status', error)
  }

  return botStatus.isBanned
}

// Helper function to handle a successful bot status check
export function handleSuccessfulCheck() {
  botStatus.consecutiveSuccesses++
  botStatus.consecutiveFailures = 0

  // Only consider the bot unbanned after multiple successful checks
  if (botStatus.isBanned && botStatus.consecutiveSuccesses >= botStatus.requiredSuccesses) {
    logger.info('Bot authorization restored')
    botStatus.isBanned = false
  }

  return botStatus.isBanned
}

// Helper function to handle a failed bot status check
export function handleFailedCheck(isNullResult: boolean) {
  botStatus.consecutiveFailures++
  botStatus.consecutiveSuccesses = 0

  // Only consider the bot banned after multiple consecutive failures
  if (!botStatus.isBanned && botStatus.consecutiveFailures >= botStatus.requiredFailures) {
    logger.warn('Bot is currently banned or unauthorized')
    botStatus.isBanned = true
  }

  return botStatus.isBanned
}

// Simple function to check if the bot is currently banned
export function isBotBanned(): boolean {
  return botStatus.isBanned
}

// Set up periodic bot status check with different intervals based on ban status
const NORMAL_CHECK_INTERVAL = 10 * 60 * 1000 // 10 minutes when not banned
const BANNED_CHECK_INTERVAL = 2 * 60 * 1000 // 2 minutes when banned
let statusCheckInterval: NodeJS.Timeout

export function setupStatusCheckInterval() {
  // Clear any existing interval
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
  }

  // Set interval based on current ban status
  const interval = botStatus.isBanned ? BANNED_CHECK_INTERVAL : NORMAL_CHECK_INTERVAL

  statusCheckInterval = setInterval(async () => {
    try {
      const wasBanned = botStatus.isBanned
      await checkBotStatus()

      // If ban status changed, update the check interval
      if (wasBanned !== botStatus.isBanned) {
        setupStatusCheckInterval()
      }

      if (!botStatus.isBanned) {
        logger.debug('Periodic check: Bot is operational')
      }
    } catch (error) {
      logger.error('Error in periodic bot status check', error)
    }
  }, interval)

  logger.debug(`Bot status check interval set to ${interval / 1000} seconds`)
}
