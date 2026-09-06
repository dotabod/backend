import { setTimeout as delay } from 'node:timers/promises'

import { checkBotStatus, fetchConduitId, logger } from '@dotabod/shared-utils'

import { eventSubMap } from './chat-sub-ids'
import { ensureBotIsModerator } from './ensure-bot-is-moderator'
import { genericSubscribe } from './subscribe-chat-messages-for-user'
import type { TwitchEventTypes } from './twitch-event-types'

type SubscriptionType = keyof TwitchEventTypes

interface SubscriptionResults {
  criticalFailed: number
  criticalSuccess: number
  failed: number
  success: number
  total: number
}

interface SubscriptionAttemptOutcome {
  error: Error | null
  success: boolean
}

export interface InitUserSubscriptionDependencies {
  waitForRetry: (milliseconds: number) => Promise<void>
}

const CHAT_SUBSCRIPTION_TYPE = 'channel.chat.message'
const REQUIRED_SUBSCRIPTION_TYPES = [
  CHAT_SUBSCRIPTION_TYPE,
  'stream.offline',
  'stream.online',
  'user.update',
  'channel.prediction.begin',
  'channel.prediction.progress',
  'channel.prediction.lock',
  'channel.prediction.end',
  'channel.poll.begin',
  'channel.poll.progress',
  'channel.poll.end',
] satisfies readonly SubscriptionType[]
const CRITICAL_SUBSCRIPTION_TYPES = new Set<SubscriptionType>([
  'stream.online',
  'stream.offline',
  'user.update',
  CHAT_SUBSCRIPTION_TYPE,
])
const defaultDependencies: InitUserSubscriptionDependencies = {
  waitForRetry: async (milliseconds) => {
    await delay(milliseconds)
  },
}

const conduitId = await fetchConduitId()
logger.info('Conduit ID', {
  conduitId: conduitId !== null && conduitId.length > 0 ? `${conduitId.slice(0, 8)}...` : 'null',
})

const isRetryableSubscriptionError = function isRetryableSubscriptionError(error: Error): boolean {
  return error.message.includes('Rate limit') || error.message.includes('network')
}

const subscribeWithRetry = async function subscribeWithRetry(
  type: SubscriptionType,
  providerAccountId: string,
  isCritical: boolean,
  dependencies: InitUserSubscriptionDependencies
): Promise<boolean> {
  if (conduitId === null || conduitId.length === 0) {
    logger.error('[TWITCHEVENTS] Missing conduit ID for subscription', {
      providerAccountId,
      type,
    })
    return false
  }

  const maxAttempts = isCritical ? 3 : 1

  const runAttempt = async function runAttempt(
    attempt: number
  ): Promise<SubscriptionAttemptOutcome> {
    try {
      const success = await genericSubscribe(conduitId, providerAccountId, type, attempt > 1)
      if (success) {
        if (attempt > 1) {
          logger.info('[TWITCHEVENTS] Subscription succeeded after retry', {
            attempt,
            providerAccountId,
            type,
          })
        }
        return { error: null, success: true }
      }

      logger.warn('[TWITCHEVENTS] genericSubscribe returned false', {
        attempt,
        providerAccountId,
        type,
      })
    } catch (error) {
      const attemptError =
        error instanceof Error ? error : new Error(String(error), { cause: error })
      logger.debug('[TWITCHEVENTS] Subscription attempt failed', {
        attempt,
        error: attemptError.message,
        providerAccountId,
        type,
      })

      if (!isCritical || !isRetryableSubscriptionError(attemptError)) {
        return { error: attemptError, success: false }
      }
      if (attempt < maxAttempts) {
        await dependencies.waitForRetry(1000 * attempt)
        return await runAttempt(attempt + 1)
      }
      return { error: attemptError, success: false }
    }

    return attempt < maxAttempts ? await runAttempt(attempt + 1) : { error: null, success: false }
  }

  const outcome = await runAttempt(1)
  if (outcome.success) {
    return true
  }

  const errorMessage = outcome.error?.message ?? 'Unknown error'
  if (isCritical) {
    logger.error('[TWITCHEVENTS] Failed to create critical subscription after retries', {
      error: errorMessage,
      errorStack: outcome.error?.stack,
      providerAccountId,
      type,
    })
  } else {
    logger.warn('[TWITCHEVENTS] Failed to create non-critical subscription', {
      error: errorMessage,
      providerAccountId,
      type,
    })
  }
  return false
}

const recordSubscriptionResult = function recordSubscriptionResult(
  results: SubscriptionResults,
  success: boolean,
  isCritical: boolean
): void {
  results.total += 1
  if (success) {
    results.success += 1
    if (isCritical) {
      results.criticalSuccess += 1
    }
    return
  }

  results.failed += 1
  if (isCritical) {
    results.criticalFailed += 1
  }
}

const subscribeToTypes = async function subscribeToTypes(
  types: readonly SubscriptionType[],
  providerAccountId: string,
  isCritical: boolean,
  results: SubscriptionResults,
  dependencies: InitUserSubscriptionDependencies
): Promise<void> {
  const [type, ...remainingTypes] = types
  if (type === undefined) {
    return
  }

  const success = await subscribeWithRetry(type, providerAccountId, isCritical, dependencies)
  recordSubscriptionResult(results, success, isCritical)
  await subscribeToTypes(remainingTypes, providerAccountId, isCritical, results, dependencies)
}

const setModeratorStatus = async function setModeratorStatus(
  providerAccountId: string
): Promise<void> {
  try {
    await ensureBotIsModerator(providerAccountId)
  } catch (error) {
    logger.debug('[TWITCHEVENTS] Failed to set moderator status', {
      error: error instanceof Error ? error.message : String(error),
      providerAccountId,
    })
  }
}

export const initUserSubscriptions = async function initUserSubscriptions(
  providerAccountId: string,
  dependencies: InitUserSubscriptionDependencies = defaultDependencies
): Promise<boolean> {
  const isBanned = await checkBotStatus()

  try {
    const existingSubscriptions = eventSubMap.get(providerAccountId) ?? {}
    const hadExistingSubscriptions = Object.keys(existingSubscriptions).length > 0
    const missingTypes = REQUIRED_SUBSCRIPTION_TYPES.filter(
      (type) =>
        existingSubscriptions[type] === undefined && !(type === CHAT_SUBSCRIPTION_TYPE && isBanned)
    )
    if (missingTypes.length === 0) {
      return true
    }

    const criticalTypes = missingTypes.filter((type) => CRITICAL_SUBSCRIPTION_TYPES.has(type))
    const secondaryTypes = missingTypes.filter((type) => !CRITICAL_SUBSCRIPTION_TYPES.has(type))
    const results: SubscriptionResults = {
      criticalFailed: 0,
      criticalSuccess: 0,
      failed: 0,
      success: 0,
      total: 0,
    }

    await subscribeToTypes(criticalTypes, providerAccountId, true, results, dependencies)
    await subscribeToTypes(secondaryTypes, providerAccountId, false, results, dependencies)

    if (hadExistingSubscriptions) {
      logger.info('[TWITCHEVENTS] Fixed missing subscriptions', {
        criticalFailed: results.criticalFailed,
        criticalFixed: results.criticalSuccess,
        failed: results.failed,
        fixed: results.success,
        providerAccountId,
      })
    } else {
      logger.info('[TWITCHEVENTS] Initial subscription setup', {
        criticalFailed: results.criticalFailed,
        criticalSuccess: results.criticalSuccess,
        failed: results.failed,
        providerAccountId,
        success: results.success,
        total: results.total,
      })
      if (!isBanned) {
        await setModeratorStatus(providerAccountId)
      }
    }

    return results.criticalFailed === 0
  } catch (error) {
    logger.error('[TWITCHEVENTS] Error in subscription setup', {
      error: error instanceof Error ? error.message : String(error),
      providerAccountId,
    })
    return false
  }
}
