import { checkBotStatus, fetchConduitId, getTwitchHeaders, logger } from '@dotabod/shared-utils'
import { eventSubMap } from '../chatSubIds'
import type { EventSubStatus } from '../interfaces'
import { genericSubscribe } from '../subscribeChatMessagesForUser'
import type { TwitchEventTypes } from '../TwitchEventTypes'
import { getAccountIds } from '../twitch/lib/getAccountIds'
import { rateLimiter } from './rateLimiterCore'

// The periodic sweep only scans these. Secondary types (predictions, polls)
// are still registered up-front by initUserSubscriptions on signup and on every
// requires_refresh flip; the 5-min reconciliation just doesn't re-check them.
// Empirically the rescan was always a no-op and the user-visible failure
// (predictions not appearing in a stream) self-heals on the next sign-in.
const CRITICAL_SUBSCRIPTION_TYPES: (keyof TwitchEventTypes)[] = [
  'stream.online',
  'stream.offline',
  'user.update',
  'channel.chat.message',
] as const

interface HealthCheckResult {
  totalUsers: number
  usersWithIssues: number
  fixedSubscriptions: number
  criticalFixCount: number
  errorCount: number
  userErrors: Record<string, number>
}

/**
 * Runs a comprehensive health check on all user event subscriptions
 *
 * Identifies and repairs missing subscriptions with special focus on
 * critical events like stream.online. Designed to be run as a daily task.
 */
export async function runSubscriptionHealthCheck(): Promise<HealthCheckResult> {
  logger.info('[TWITCHEVENTS] Starting subscription health check')
  const startTime = Date.now()

  // Get conduit ID for creating subscriptions
  const conduitId = await fetchConduitId()

  // Validate conduit ID before proceeding
  if (!conduitId) {
    const errorMessage = 'No valid conduit ID available - health check cannot proceed'
    logger.error(`[TWITCHEVENTS] ${errorMessage}`)
    throw new Error(errorMessage)
  }

  // Check if the bot is banned - we'll skip channel.chat.message subscriptions if so
  const isBanned = await checkBotStatus()
  if (isBanned) {
    logger.warn(
      '[TWITCHEVENTS] Bot is currently banned, will skip channel.chat.message subscriptions',
    )
  }

  // Get all user account IDs
  const accountIds = await getAccountIds()

  if (!accountIds.length) {
    const errorMessage = 'No user accounts found - health check cannot proceed'
    logger.error(`[TWITCHEVENTS] ${errorMessage}`)
    throw new Error(errorMessage)
  }

  logger.info(`[TWITCHEVENTS] joining ${accountIds.length} channels`)

  // Fetch existing subscriptions if eventSubMap is empty
  if (Object.keys(eventSubMap).length === 0) {
    logger.info('[TWITCHEVENTS] EventSubMap is empty, fetching existing subscriptions')
    await fetchSubscriptionsForHealthCheck()
  }

  // Track results
  const result: HealthCheckResult = {
    totalUsers: accountIds.length,
    usersWithIssues: 0,
    fixedSubscriptions: 0,
    criticalFixCount: 0,
    errorCount: 0,
    userErrors: {},
  }

  // Process in chunks for efficiency and rate limit management
  const CHUNK_SIZE = 25
  let lastLogTime = Date.now()
  let processedCount = 0

  // Map to track users with missing critical subscriptions
  const usersWithMissingCritical = new Map<string, string[]>()

  for (let i = 0; i < accountIds.length; i += CHUNK_SIZE) {
    const chunk = accountIds.slice(i, i + CHUNK_SIZE)

    // Process each user in parallel within the chunk
    await Promise.all(
      chunk.map(async (userId) => {
        try {
          const existingSubscriptions = eventSubMap[userId] || {}
          const existingTypes = Object.keys(existingSubscriptions) as (keyof TwitchEventTypes)[]

          // Check for missing critical subscriptions
          const missingCritical = CRITICAL_SUBSCRIPTION_TYPES.filter(
            (type) =>
              !existingTypes.includes(type) && !(type === 'channel.chat.message' && isBanned),
          )

          if (missingCritical.length === 0) return

          usersWithMissingCritical.set(userId, missingCritical)
          result.usersWithIssues++

          for (const type of missingCritical) {
            try {
              // Skip chat subscriptions if bot is banned
              if (type === 'channel.chat.message' && isBanned) {
                logger.info('[TWITCHEVENTS] Skipping chat subscription for banned bot', {
                  userId,
                })
                continue
              }

              const success = await genericSubscribe(conduitId, userId, type)

              if (success) {
                result.fixedSubscriptions++
                result.criticalFixCount++
                logger.warn('[TWITCHEVENTS] Fixed critical missing subscription', {
                  userId,
                  type,
                })
              } else {
                result.errorCount++
                logger.error('[TWITCHEVENTS] Subscription returned false but did not throw', {
                  userId,
                  type,
                })
              }
            } catch (error) {
              result.errorCount++
              const errorMsg = error instanceof Error ? error.message : String(error)
              result.userErrors[errorMsg] = (result.userErrors[errorMsg] || 0) + 1

              logger.error('[TWITCHEVENTS] Failed to fix critical subscription', {
                userId,
                type,
                error: errorMsg,
              })
            }
          }
        } catch (error) {
          result.errorCount++
          const errorMsg = error instanceof Error ? error.message : String(error)
          result.userErrors[errorMsg] = (result.userErrors[errorMsg] || 0) + 1

          logger.error('[TWITCHEVENTS] Error checking user subscriptions', {
            userId,
            error: errorMsg,
          })
        }
      }),
    )

    // Update progress counter
    processedCount += chunk.length

    // Log progress periodically (every 5 seconds or 200 users)
    const now = Date.now()
    if (processedCount % 200 === 0 || now - lastLogTime > 5000) {
      lastLogTime = now
      const percentComplete = Math.round((processedCount / accountIds.length) * 100)
      const elapsedSec = (now - startTime) / 1000

      logger.info('[TWITCHEVENTS] Health check progress', {
        processed: processedCount,
        total: accountIds.length,
        percent: `${percentComplete}%`,
        usersWithIssues: result.usersWithIssues,
        criticalFixed: result.criticalFixCount,
        timeElapsed: `${Math.round(elapsedSec / 60)}m ${Math.round(elapsedSec % 60)}s`,
      })
    }
  }

  // Calculate final timing
  const totalTimeSec = (Date.now() - startTime) / 1000
  const minutes = Math.floor(totalTimeSec / 60)
  const seconds = Math.round(totalTimeSec % 60)

  // Create detailed report of users with missing critical subscriptions
  if (usersWithMissingCritical.size > 0) {
    logger.warn('[TWITCHEVENTS] Users with missing critical subscriptions', {
      count: usersWithMissingCritical.size,
      firstTen: Array.from(usersWithMissingCritical.entries())
        .slice(0, 10)
        .map(([userId, types]) => ({ userId, missingTypes: types })),
    })
  }

  // Log final summary
  logger.info('[TWITCHEVENTS] Health check completed', {
    results: {
      totalUsers: result.totalUsers,
      usersWithIssues: result.usersWithIssues,
      criticalIssuesFixed: result.criticalFixCount,
      totalFixed: result.fixedSubscriptions,
      errorCount: result.errorCount,
    },
    errorSummary: Object.keys(result.userErrors).length > 0 ? result.userErrors : 'No errors',
    timing: {
      totalTime: `${minutes}m ${seconds}s`,
      averageTimePerUser: `${(totalTimeSec / accountIds.length).toFixed(3)}s`,
    },
  })

  return result
}

/**
 * Fetches existing subscriptions directly from Twitch API for health check
 * This ensures we have the most up-to-date information
 */
async function fetchSubscriptionsForHealthCheck(): Promise<void> {
  logger.info('[TWITCHEVENTS] Fetching current subscriptions from Twitch API')
  const headers = await getTwitchHeaders()
  let cursor: string | undefined
  let fetchedCount = 0

  do {
    await rateLimiter.schedule(async () => {
      const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
      if (cursor) url.searchParams.append('after', cursor)

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      })

      if (response.status !== 200) {
        logger.error('[TWITCHEVENTS] Failed to fetch subscriptions', {
          status: response.status,
        })
        return
      }

      const result = (await response.json()) as {
        data: {
          id: string
          status: string
          type: string
          version: string
          condition?: {
            broadcaster_user_id?: string
            user_id?: string
          }
        }[]
        pagination: {
          cursor: string
        }
      }
      const { data, pagination } = result

      // Process subscriptions
      data.forEach((sub) => {
        const broadcasterId = sub.condition?.broadcaster_user_id || sub.condition?.user_id
        if (!broadcasterId) return

        // Initialize broadcaster entry if it doesn't exist
        eventSubMap[broadcasterId] ??= {} as (typeof eventSubMap)[number]

        // Store subscription details
        eventSubMap[broadcasterId][sub.type as keyof TwitchEventTypes] = {
          id: sub.id,
          status: sub.status as EventSubStatus,
        }

        fetchedCount++
      })

      cursor = pagination?.cursor
    })
  } while (cursor)

  logger.info('[TWITCHEVENTS] Fetched current subscriptions', { count: fetchedCount })
}

// CLI entry-point lives in src/scripts/runSubscriptionHealthCheck.ts so this
// module stays pure ESM. CJS entry-point gates here get inlined into the
// bundled dist/index.js — combined with top-level await elsewhere in the
// bundle (e.g. handleNewUser.ts:5), Node 24 refuses to load the bundle with
// ERR_AMBIGUOUS_MODULE_SYNTAX. The bundlePurity test in __tests__/ guards
// against re-introduction.
