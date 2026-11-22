import { checkBotStatus, fetchConduitId, logger } from '@dotabod/shared-utils'

import { eventSubMap } from '../chat-sub-ids'
import {
  cleanUpSubscriptions,
  fetchExistingSubscriptions,
} from '../fetch-existing-subscriptions.js'
import { genericSubscribe } from '../subscribe-chat-messages-for-user'
import { CRITICAL_SUBSCRIPTION_TYPES, findMissingSubscriptions } from '../subscription-topics.js'
import type { CriticalSubscriptionType } from '../subscription-topics.js'
import { getAccountIds } from '../twitch/lib/get-account-ids'

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
    const missingCritical = findMissingSubscriptions(
      CRITICAL_SUBSCRIPTION_TYPES,
      existingSubscriptions ?? {},
      context.isBanned,
      context.conduitId
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

    const subsToCleanup = await fetchExistingSubscriptions(conduitId)
    await cleanUpSubscriptions(subsToCleanup)

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
