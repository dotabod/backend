import { fetchConduitId, logger } from '@dotabod/shared-utils'

import { initUserSubscriptions } from './init-user-subscriptions'
import { subscribeToAuthGrantOrRevoke } from './subscribe-chat-messages-for-user'
import { getAccountIds } from './twitch/lib/get-account-ids'
import { rateLimiter } from './utils/rate-limiter-core'

const CHUNK_SIZE = 30

const subscribeAccount = async function subscribeAccount(
  providerAccountId: string,
  errors: Map<string, number>
): Promise<boolean> {
  try {
    await initUserSubscriptions(providerAccountId)
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorKey = errorMessage.slice(0, 100)
    const errorCount = (errors.get(errorKey) ?? 0) + 1
    errors.set(errorKey, errorCount)

    if (errorCount <= 5) {
      logger.error('[TWITCHEVENTS] Subscription error', {
        error: errorMessage,
        providerAccountId,
      })
    }
    return false
  }
}

const logProgress = function logProgress(
  accountCount: number,
  errors: ReadonlyMap<string, number>,
  processed: number,
  startTime: number,
  successCount: number
): void {
  const percentComplete = Math.round((processed / accountCount) * 100)
  const elapsedSec = (Date.now() - startTime) / 1000
  const estimatedTotalSec = elapsedSec / (processed / accountCount)
  const remainingSec = Math.max(0, estimatedTotalSec - elapsedSec)

  logger.info('[TWITCHEVENTS] Subscription progress', {
    errors: errors.size > 0 ? Object.fromEntries(errors) : 'none',
    estimatedTimeRemaining: `${Math.round(remainingSec / 60)} minutes`,
    percent: `${percentComplete}%`,
    processed,
    queueLength: rateLimiter.queueLength,
    rateLimitRemaining: rateLimiter.rateLimitStatus.remaining,
    success: successCount,
    total: accountCount,
  })
}

const processAccountChunks = async function processAccountChunks(
  accountIds: readonly string[],
  errors: Map<string, number>,
  startIndex: number,
  startTime: number,
  successCount: number
): Promise<number> {
  if (startIndex >= accountIds.length) {
    return successCount
  }

  const chunk = accountIds.slice(startIndex, startIndex + CHUNK_SIZE)
  const outcomes = await Promise.all(
    chunk.map(async (providerAccountId) => await subscribeAccount(providerAccountId, errors))
  )
  const nextSuccessCount = successCount + outcomes.filter(Boolean).length
  const processed = Math.min(startIndex + CHUNK_SIZE, accountIds.length)
  if (processed % 200 === 0 || processed === accountIds.length) {
    logProgress(accountIds.length, errors, processed, startTime, nextSuccessCount)
  }

  return await processAccountChunks(
    accountIds,
    errors,
    startIndex + CHUNK_SIZE,
    startTime,
    nextSuccessCount
  )
}

export const subscribeToEvents = async function subscribeToEvents(): Promise<void> {
  const conduitId = await fetchConduitId()
  logger.info('[TWITCHEVENTS] Subscribing to events', { conduitId })

  if (conduitId === null || conduitId.length === 0) {
    logger.error('[TWITCHEVENTS] No conduit ID found')
    return
  }

  const clientId = process.env.TWITCH_CLIENT_ID
  if (clientId === undefined || clientId.length === 0) {
    logger.error('[TWITCHEVENTS] No Twitch client ID found')
    return
  }
  await subscribeToAuthGrantOrRevoke(conduitId, clientId)

  const accountIds = await getAccountIds()

  if (accountIds.length === 0) {
    logger.info('[TWITCHEVENTS] No accounts to subscribe to')
    return
  }

  logger.info('[TWITCHEVENTS] Starting subscription process', {
    chunks: Math.ceil(accountIds.length / CHUNK_SIZE),
    rateLimit: rateLimiter.rateLimitStatus,
    total: accountIds.length,
  })

  const errors = new Map<string, number>()
  const startTime = Date.now()
  const successCount = await processAccountChunks(accountIds, errors, 0, startTime, 0)

  const totalTime = (Date.now() - startTime) / 1000
  logger.info('[TWITCHEVENTS] Subscription process completed', {
    errorCount: accountIds.length - successCount,
    errorSummary: errors.size > 0 ? Object.fromEntries(errors) : 'none',
    success: successCount,
    timeElapsed: `${Math.round(totalTime / 60)} minutes ${Math.round(totalTime % 60)} seconds`,
    total: accountIds.length,
  })
}
