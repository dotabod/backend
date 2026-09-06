import { checkBotStatus, fetchConduitId, getTwitchHeaders, logger } from '@dotabod/shared-utils'
import { z } from 'zod'

import { eventSubMap } from '../chat-sub-ids'
import { EVENT_SUB_STATUSES } from '../interfaces'
import { genericSubscribe } from '../subscribe-chat-messages-for-user'
import { TWITCH_EVENT_TYPE_NAMES } from '../twitch-event-types'
import type { TwitchEventTypes } from '../twitch-event-types'
import { getAccountIds } from '../twitch/lib/get-account-ids'
import { rateLimiter } from './rate-limiter-core'

// The periodic sweep only scans these. Secondary types (predictions, polls)
// are still registered up-front by initUserSubscriptions on signup and on every
// requires_refresh flip; the 5-min reconciliation just doesn't re-check them.
// Empirically the rescan was always a no-op and the user-visible failure
// (predictions not appearing in a stream) self-heals on the next sign-in.
const CRITICAL_SUBSCRIPTION_TYPES = [
  'stream.online',
  'stream.offline',
  'user.update',
  'channel.chat.message',
] as const satisfies readonly (keyof TwitchEventTypes)[]
type CriticalSubscriptionType = (typeof CRITICAL_SUBSCRIPTION_TYPES)[number]
const CHAT_SUBSCRIPTION_TYPE = 'channel.chat.message'
const subscriptionPageSchema = z.object({
  data: z.array(
    z.object({
      condition: z
        .object({
          broadcaster_user_id: z.string().optional(),
          user_id: z.string().optional(),
        })
        .optional(),
      id: z.string(),
      status: z.enum(EVENT_SUB_STATUSES),
      type: z.enum(TWITCH_EVENT_TYPE_NAMES),
    })
  ),
  pagination: z.object({ cursor: z.string().optional() }).optional(),
})

interface HealthCheckContext {
  accountIds: string[]
  conduitId: string
  isBanned: boolean
  lastLogTime: number
  processedCount: number
  result: HealthCheckResult
  startTime: number
  usersWithMissingCritical: Map<string, CriticalSubscriptionType[]>
}

interface SubscriptionPageResult {
  cursor?: string
  fetchedCount: number
}

interface HealthCheckResult {
  totalUsers: number
  usersWithIssues: number
  fixedSubscriptions: number
  criticalFixCount: number
  errorCount: number
  userErrors: Record<string, number>
}

const repairCriticalSubscription = async function repairCriticalSubscription(
  conduitId: string,
  userId: string,
  type: CriticalSubscriptionType,
  result: HealthCheckResult
): Promise<void> {
  try {
    const success = await genericSubscribe(conduitId, userId, type)
    if (success) {
      result.fixedSubscriptions += 1
      result.criticalFixCount += 1
      logger.warn('[TWITCHEVENTS] Fixed critical missing subscription', { type, userId })
      return
    }

    result.errorCount += 1
    logger.error('[TWITCHEVENTS] Subscription returned false but did not throw', {
      type,
      userId,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    result.errorCount += 1
    result.userErrors[errorMessage] = (result.userErrors[errorMessage] ?? 0) + 1
    logger.error('[TWITCHEVENTS] Failed to fix critical subscription', {
      error: errorMessage,
      type,
      userId,
    })
  }
}

const processHealthCheckUser = async function processHealthCheckUser(
  context: HealthCheckContext,
  userId: string
): Promise<void> {
  try {
    const existingSubscriptions = eventSubMap.get(userId)
    const missingCritical = CRITICAL_SUBSCRIPTION_TYPES.filter(
      (type) =>
        existingSubscriptions?.[type] === undefined &&
        !(type === CHAT_SUBSCRIPTION_TYPE && context.isBanned)
    )
    if (missingCritical.length === 0) {
      return
    }

    context.usersWithMissingCritical.set(userId, missingCritical)
    context.result.usersWithIssues += 1
    await Promise.all(
      missingCritical.map(async (type) => {
        await repairCriticalSubscription(context.conduitId, userId, type, context.result)
      })
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    context.result.errorCount += 1
    context.result.userErrors[errorMessage] = (context.result.userErrors[errorMessage] ?? 0) + 1
    logger.error('[TWITCHEVENTS] Error checking user subscriptions', {
      error: errorMessage,
      userId,
    })
  }
}

const logHealthCheckProgress = function logHealthCheckProgress(context: HealthCheckContext) {
  const now = Date.now()
  if (context.processedCount % 200 !== 0 && now - context.lastLogTime <= 5000) {
    return
  }

  context.lastLogTime = now
  const percentComplete = Math.round((context.processedCount / context.accountIds.length) * 100)
  const elapsedSec = (now - context.startTime) / 1000
  logger.info('[TWITCHEVENTS] Health check progress', {
    criticalFixed: context.result.criticalFixCount,
    percent: `${percentComplete}%`,
    processed: context.processedCount,
    timeElapsed: `${Math.round(elapsedSec / 60)}m ${Math.round(elapsedSec % 60)}s`,
    total: context.accountIds.length,
    usersWithIssues: context.result.usersWithIssues,
  })
}

const processAccountChunks = async function processAccountChunks(
  context: HealthCheckContext,
  startIndex = 0
): Promise<void> {
  const chunk = context.accountIds.slice(startIndex, startIndex + 25)
  if (chunk.length === 0) {
    return
  }

  await Promise.all(
    chunk.map(async (userId) => {
      await processHealthCheckUser(context, userId)
    })
  )
  context.processedCount += chunk.length
  logHealthCheckProgress(context)
  await processAccountChunks(context, startIndex + chunk.length)
}

const storeSubscriptionPage = function storeSubscriptionPage(
  page: z.infer<typeof subscriptionPageSchema>
): number {
  let fetchedCount = 0
  for (const subscription of page.data) {
    const broadcasterId =
      subscription.condition?.broadcaster_user_id ?? subscription.condition?.user_id
    if (broadcasterId === undefined || broadcasterId.length === 0) {
      continue
    }

    const subscriptions = eventSubMap.get(broadcasterId) ?? {}
    subscriptions[subscription.type] = {
      id: subscription.id,
      status: subscription.status,
    }
    eventSubMap.set(broadcasterId, subscriptions)
    fetchedCount += 1
  }
  return fetchedCount
}

const fetchSubscriptionPage = async function fetchSubscriptionPage(
  headers: Awaited<ReturnType<typeof getTwitchHeaders>>,
  cursor?: string
): Promise<SubscriptionPageResult> {
  return await rateLimiter.schedule(async () => {
    const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
    if (cursor !== undefined && cursor.length > 0) {
      url.searchParams.append('after', cursor)
    }

    const response = await fetch(url.toString(), { headers, method: 'GET' })
    if (response.status !== 200) {
      logger.error('[TWITCHEVENTS] Failed to fetch subscriptions', { status: response.status })
      return { fetchedCount: 0 }
    }

    const responseBody: unknown = await response.json()
    const parsedPage = subscriptionPageSchema.safeParse(responseBody)
    if (!parsedPage.success) {
      throw new Error('Twitch returned an invalid EventSub subscriptions response')
    }
    return {
      cursor: parsedPage.data.pagination?.cursor,
      fetchedCount: storeSubscriptionPage(parsedPage.data),
    }
  })
}

const fetchSubscriptionPages = async function fetchSubscriptionPages(
  headers: Awaited<ReturnType<typeof getTwitchHeaders>>,
  cursor?: string,
  fetchedCount = 0
): Promise<number> {
  const page = await fetchSubscriptionPage(headers, cursor)
  const totalFetched = fetchedCount + page.fetchedCount
  if (page.cursor === undefined || page.cursor.length === 0) {
    return totalFetched
  }
  return await fetchSubscriptionPages(headers, page.cursor, totalFetched)
}

const fetchSubscriptionsForHealthCheck =
  async function fetchSubscriptionsForHealthCheck(): Promise<void> {
    logger.info('[TWITCHEVENTS] Fetching current subscriptions from Twitch API')
    const headers = await getTwitchHeaders()
    const fetchedCount = await fetchSubscriptionPages(headers)
    logger.info('[TWITCHEVENTS] Fetched current subscriptions', { count: fetchedCount })
  }

export const runSubscriptionHealthCheck =
  async function runSubscriptionHealthCheck(): Promise<HealthCheckResult> {
    logger.info('[TWITCHEVENTS] Starting subscription health check')
    const startTime = Date.now()

    // Get conduit ID for creating subscriptions
    const conduitId = await fetchConduitId()

    // Validate conduit ID before proceeding
    if (conduitId === null || conduitId.length === 0) {
      const errorMessage = 'No valid conduit ID available - health check cannot proceed'
      logger.error(`[TWITCHEVENTS] ${errorMessage}`)
      throw new Error(errorMessage)
    }

    // Check if the bot is banned - we'll skip channel.chat.message subscriptions if so
    const isBanned = await checkBotStatus()
    if (isBanned) {
      logger.warn(
        '[TWITCHEVENTS] Bot is currently banned, will skip channel.chat.message subscriptions'
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
    if (eventSubMap.size === 0) {
      logger.info('[TWITCHEVENTS] EventSubMap is empty, fetching existing subscriptions')
      await fetchSubscriptionsForHealthCheck()
    }

    // Track results
    const result: HealthCheckResult = {
      criticalFixCount: 0,
      errorCount: 0,
      fixedSubscriptions: 0,
      totalUsers: accountIds.length,
      userErrors: {},
      usersWithIssues: 0,
    }

    const usersWithMissingCritical = new Map<string, CriticalSubscriptionType[]>()
    await processAccountChunks({
      accountIds,
      conduitId,
      isBanned,
      lastLogTime: Date.now(),
      processedCount: 0,
      result,
      startTime,
      usersWithMissingCritical,
    })

    // Calculate final timing
    const totalTimeSec = (Date.now() - startTime) / 1000
    const minutes = Math.floor(totalTimeSec / 60)
    const seconds = Math.round(totalTimeSec % 60)

    // Create detailed report of users with missing critical subscriptions
    if (usersWithMissingCritical.size > 0) {
      logger.warn('[TWITCHEVENTS] Users with missing critical subscriptions', {
        count: usersWithMissingCritical.size,
        firstTen: [...usersWithMissingCritical.entries()]
          .slice(0, 10)
          .map(([userId, types]) => ({ missingTypes: types, userId })),
      })
    }

    // Log final summary
    logger.info('[TWITCHEVENTS] Health check completed', {
      errorSummary: Object.keys(result.userErrors).length > 0 ? result.userErrors : 'No errors',
      results: {
        criticalIssuesFixed: result.criticalFixCount,
        errorCount: result.errorCount,
        totalFixed: result.fixedSubscriptions,
        totalUsers: result.totalUsers,
        usersWithIssues: result.usersWithIssues,
      },
      timing: {
        averageTimePerUser: `${(totalTimeSec / accountIds.length).toFixed(3)}s`,
        totalTime: `${minutes}m ${seconds}s`,
      },
    })

    return result
  }

// CLI entry-point lives in src/scripts/runSubscriptionHealthCheck.ts so this
// module stays pure ESM. CJS entry-point gates here get inlined into the
// bundled dist/index.js — combined with top-level await elsewhere in the
// bundle (e.g. handleNewUser.ts:5), Node 24 refuses to load the bundle with
// ERR_AMBIGUOUS_MODULE_SYNTAX. The bundlePurity test in __tests__/ guards
// against re-introduction.
