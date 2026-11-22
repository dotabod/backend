import { getTwitchHeaders, logger } from '@dotabod/shared-utils'
import { TWITCH_EVENT_TYPE_NAMES } from '@dotabod/shared-utils/event-sub'
import { z } from 'zod'

import { eventSubMap } from './chat-sub-ids'
import type { EventSubscriptions } from './chat-sub-ids'
import { EVENT_SUB_STATUSES } from './interfaces'
import type { EventSubStatus } from './interfaces'
import { rateLimiter } from './utils/rate-limiter-core'

interface FetchProgress {
  cleanupIds: string[]
  fetchedCount: number
  inventory: Map<string, EventSubscriptions>
  lastLogTime: number
  pageCount: number
  startTime: number
  statusCounts: Map<EventSubStatus, number>
  totalSubscriptions: number
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

const fetchPage = async function fetchPage(
  headers: Awaited<ReturnType<typeof getTwitchHeaders>>,
  cursor?: string
): Promise<SubscriptionPage> {
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

const storeSubscription = function storeSubscription(
  progress: FetchProgress,
  subscription: Subscription
): void {
  if (subscription.type === AUTH_GRANT || subscription.type === AUTH_REVOKE) {
    return
  }

  const broadcasterId = subscription.condition.broadcaster_user_id ?? subscription.condition.user_id
  if (
    broadcasterId === undefined ||
    broadcasterId.length === 0 ||
    subscription.transport.method === 'webhook'
  ) {
    progress.cleanupIds.push(subscription.id)
    return
  }

  const { inventory, statusCounts } = progress
  statusCounts.set(subscription.status, (statusCounts.get(subscription.status) ?? 0) + 1)
  const subscriptions = inventory.get(broadcasterId) ?? {}
  subscriptions[subscription.type] = {
    id: subscription.id,
    status: subscription.status,
  }
  inventory.set(broadcasterId, subscriptions)
  progress.fetchedCount += 1
}

const storePage = function storePage(progress: FetchProgress, page: SubscriptionPage): void {
  if (page.total !== undefined && progress.totalSubscriptions === 0) {
    progress.totalSubscriptions = page.total
  }
  for (const subscription of page.data) {
    storeSubscription(progress, subscription)
  }
}

const logProgress = function logProgress(progress: FetchProgress): void {
  const { cleanupIds, fetchedCount, inventory, startTime, totalSubscriptions } = progress
  const now = Date.now()
  if (fetchedCount % 1000 !== 0 && now - progress.lastLogTime <= 5000) {
    return
  }

  const elapsedSeconds = (now - startTime) / 1000
  const percent =
    totalSubscriptions > 0 ? `${Math.round((fetchedCount / totalSubscriptions) * 100)}%` : '?'
  const metadata: ProgressMetadata = {
    broadcasters: inventory.size,
    cleanup: cleanupIds.length,
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
  progress.lastLogTime = now
}

const fetchPages = async function fetchPages(
  headers: Awaited<ReturnType<typeof getTwitchHeaders>>,
  progress: FetchProgress,
  cursor?: string
): Promise<void> {
  const page = await fetchPage(headers, cursor)
  storePage(progress, page)
  progress.pageCount += 1
  logProgress(progress)

  const nextCursor = page.pagination?.cursor
  if (nextCursor !== undefined && nextCursor.length > 0) {
    await fetchPages(headers, progress, nextCursor)
  }
}

const logSummary = function logSummary(progress: FetchProgress): void {
  const { cleanupIds, fetchedCount, inventory, pageCount, startTime, statusCounts } = progress
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
      broadcasters: inventory.size,
      cleanupNeeded: cleanupIds.length,
      subscriptions: fetchedCount,
    },
  })
}

export const fetchExistingSubscriptions = async function fetchExistingSubscriptions(): Promise<
  string[]
> {
  const startTime = Date.now()
  const progress: FetchProgress = {
    cleanupIds: [],
    fetchedCount: 0,
    inventory: new Map(),
    lastLogTime: startTime,
    pageCount: 0,
    startTime,
    statusCounts: new Map(),
    totalSubscriptions: 0,
  }
  logger.info('[TWITCHEVENTS] Fetching existing subscriptions')
  await fetchPages(await getTwitchHeaders(), progress)
  for (const [broadcasterId, discovered] of progress.inventory) {
    // A realtime update can finish while Twitch is still returning pages.
    eventSubMap.set(broadcasterId, { ...discovered, ...eventSubMap.get(broadcasterId) })
  }
  logSummary(progress)
  return progress.cleanupIds
}
