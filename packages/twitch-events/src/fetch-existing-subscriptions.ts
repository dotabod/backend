import { getTwitchHeaders, logger } from '@dotabod/shared-utils'
import { z } from 'zod'

import { eventSubMap } from './chat-sub-ids'
import { EVENT_SUB_STATUSES } from './interfaces'
import type { EventSubStatus } from './interfaces'
import { TWITCH_EVENT_TYPE_NAMES } from './twitch-event-types'
import { rateLimiter } from './utils/rate-limiter-core'

interface FetchProgress {
  lastLogTime: number
  pageCount: number
}

interface ProgressMetadata {
  broadcasters: number
  cleanup: number
  pages: number
  percent: string
  processed: number
  rateLimit: {
    queueLength: number
    remaining: number
  }
  timeElapsed: string
  timeEstimate?: string
  total: number | 'unknown'
}

const subscriptionPageSchema = z.object({
  data: z.array(
    z.object({
      condition: z.object({
        broadcaster_user_id: z.string().optional(),
        client_id: z.string().optional(),
        user_id: z.string().optional(),
      }),
      id: z.string(),
      status: z.enum(EVENT_SUB_STATUSES),
      transport: z.object({ method: z.string() }),
      type: z.enum(TWITCH_EVENT_TYPE_NAMES),
    })
  ),
  pagination: z.object({ cursor: z.string().optional() }).optional(),
  total: z.number().optional(),
})

type SubscriptionPage = z.infer<typeof subscriptionPageSchema>
type Subscription = SubscriptionPage['data'][number]

const AUTH_GRANT = 'user.authorization.grant'
const AUTH_REVOKE = 'user.authorization.revoke'
const headers = await getTwitchHeaders()

export const subsToCleanup: string[] = []
let fetchedCount = 0
let startTime = 0
let totalSubscriptions = 0
const uniqueBroadcasters = new Set<string>()
const statusCounts = new Map<EventSubStatus, number>()

const resetMetrics = function resetMetrics(): void {
  fetchedCount = 0
  startTime = Date.now()
  totalSubscriptions = 0
  uniqueBroadcasters.clear()
  statusCounts.clear()
}

const fetchPage = async function fetchPage(cursor?: string): Promise<SubscriptionPage> {
  return await rateLimiter.schedule(async () => {
    const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
    if (cursor !== undefined && cursor.length > 0) {
      url.searchParams.append('after', cursor)
    }

    const response = await fetch(url.toString(), { headers, method: 'GET' })
    rateLimiter.updateLimits(response.headers)
    if (response.status === 429) {
      logger.warn('Rate limit hit, will retry automatically')
      throw new Error('Rate limit hit')
    }
    return subscriptionPageSchema.parse(await response.json())
  })
}

const storeSubscription = function storeSubscription(subscription: Subscription): void {
  if (subscription.type === AUTH_GRANT || subscription.type === AUTH_REVOKE) {
    return
  }

  const broadcasterId = subscription.condition.broadcaster_user_id ?? subscription.condition.user_id
  if (
    broadcasterId === undefined ||
    broadcasterId.length === 0 ||
    subscription.transport.method === 'webhook'
  ) {
    subsToCleanup.push(subscription.id)
    return
  }

  uniqueBroadcasters.add(broadcasterId)
  statusCounts.set(subscription.status, (statusCounts.get(subscription.status) ?? 0) + 1)
  const subscriptions = eventSubMap.get(broadcasterId) ?? {}
  subscriptions[subscription.type] = {
    id: subscription.id,
    status: subscription.status,
  }
  eventSubMap.set(broadcasterId, subscriptions)
  fetchedCount += 1
}

const storePage = function storePage(page: SubscriptionPage): void {
  if (page.total !== undefined && totalSubscriptions === 0) {
    totalSubscriptions = page.total
  }
  for (const subscription of page.data) {
    storeSubscription(subscription)
  }
}

const logProgress = function logProgress(progress: FetchProgress): number {
  const now = Date.now()
  if (fetchedCount % 1000 !== 0 && now - progress.lastLogTime <= 5000) {
    return progress.lastLogTime
  }

  const elapsedSeconds = (now - startTime) / 1000
  const percent =
    totalSubscriptions > 0 ? `${Math.round((fetchedCount / totalSubscriptions) * 100)}%` : '?'
  const metadata: ProgressMetadata = {
    broadcasters: uniqueBroadcasters.size,
    cleanup: subsToCleanup.length,
    pages: progress.pageCount,
    percent,
    processed: fetchedCount,
    rateLimit: {
      queueLength: rateLimiter.queueLength,
      remaining: rateLimiter.rateLimitStatus.remaining,
    },
    timeElapsed: `${Math.round(elapsedSeconds / 60)}m ${Math.round(elapsedSeconds % 60)}s`,
    total: totalSubscriptions > 0 ? totalSubscriptions : 'unknown',
  }
  if (totalSubscriptions > 0 && fetchedCount > 0) {
    const estimatedTotalSeconds = elapsedSeconds / (fetchedCount / totalSubscriptions)
    const remainingSeconds = Math.max(0, estimatedTotalSeconds - elapsedSeconds)
    metadata.timeEstimate = `~${Math.round(remainingSeconds / 60)} minutes remaining`
  }
  logger.info('[TWITCHEVENTS] Subscription fetch progress', metadata)
  return now
}

const fetchPages = async function fetchPages(
  cursor: string | undefined,
  progress: FetchProgress
): Promise<number> {
  const page = await fetchPage(cursor)
  storePage(page)
  const nextProgress = {
    lastLogTime: progress.lastLogTime,
    pageCount: progress.pageCount + 1,
  }
  nextProgress.lastLogTime = logProgress(nextProgress)

  const nextCursor = page.pagination?.cursor
  return nextCursor === undefined || nextCursor.length === 0
    ? nextProgress.pageCount
    : await fetchPages(nextCursor, nextProgress)
}

const logSummary = function logSummary(pageCount: number): void {
  const totalSeconds = (Date.now() - startTime) / 1000
  logger.info('[TWITCHEVENTS] Finished loading subscriptions', {
    rateLimit: {
      queueLength: rateLimiter.queueLength,
      remaining: rateLimiter.rateLimitStatus.remaining,
    },
    statusBreakdown: Object.fromEntries(statusCounts),
    timing: {
      averageRate: `${Math.round(fetchedCount / totalSeconds)} subs/sec`,
      pagesProcessed: pageCount,
      totalTime: `${Math.floor(totalSeconds / 60)}m ${Math.round(totalSeconds % 60)}s`,
    },
    total: {
      broadcasters: uniqueBroadcasters.size,
      cleanupNeeded: subsToCleanup.length,
      subscriptions: fetchedCount,
    },
  })
}

export const fetchExistingSubscriptions =
  async function fetchExistingSubscriptions(): Promise<void> {
    resetMetrics()
    logger.info('[TWITCHEVENTS] Fetching existing subscriptions')
    const pageCount = await fetchPages(undefined, { lastLogTime: Date.now(), pageCount: 0 })
    logSummary(pageCount)
  }
