import { setTimeout as sleep } from 'node:timers/promises'

import { z } from 'zod'

import { logger } from '../logger'
import { getTwitchHeaders } from './get-twitch-headers'

// Cache controls
// 24 hours
const CACHE_TIMEOUT = 1000 * 60 * 60 * 24
const CONDUITS_URL = 'https://api.twitch.tv/helix/eventsub/conduits'
const CONDUIT_SHARDS_URL = `${CONDUITS_URL}/shards`
let lastFetchTime = 0
let cachedConduitId: string | null = null
let fetchPromise: Promise<string | null> | null = null

// Environment variable override
const configuredConduitId = process.env.TWITCH_CONDUIT_ID
const TWITCH_CONDUIT_ID =
  configuredConduitId === undefined || configuredConduitId.length === 0 ? null : configuredConduitId

// Set initial value if env var is provided
if (TWITCH_CONDUIT_ID !== null) {
  cachedConduitId = TWITCH_CONDUIT_ID
}

const conduitSchema = z.object({
  id: z.string().min(1),
  shard_count: z.number(),
  transport: z
    .object({
      method: z.string(),
      session_id: z.string().optional(),
    })
    .optional(),
})

const conduitResponseSchema = z.object({ data: z.array(conduitSchema) })
const conduitCreateResponseSchema = z.object({
  data: z.array(conduitSchema.pick({ id: true, shard_count: true })),
})
const conduitShardResponseSchema = z.object({
  errors: z.array(z.object({ message: z.string() })).optional(),
})

export type TwitchConduitResponse = z.infer<typeof conduitResponseSchema>
export type TwitchConduitCreateResponse = z.infer<typeof conduitCreateResponseSchema>
type RetryWait = (milliseconds: number) => Promise<void>

const waitForRetry = async function waitForRetry(milliseconds: number): Promise<void> {
  await sleep(milliseconds)
}

const createConduit = async function createConduit(): Promise<string> {
  logger.info('[CONDUIT_MANAGER] Creating new conduit')

  // Get fresh headers for the request
  const headers = await getTwitchHeaders()

  const createReq = await fetch(CONDUITS_URL, {
    body: JSON.stringify({ shard_count: 1 }),
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!createReq.ok) {
    const errorText = await createReq.text()
    logger.error('[CONDUIT_MANAGER] Failed to create conduit', {
      response: errorText,
      status: createReq.status,
    })
    throw new Error(`Failed to create conduit: ${createReq.status} ${errorText}`)
  }

  try {
    const response = conduitCreateResponseSchema.parse(await createReq.json())
    const [createdConduit] = response.data
    if (createdConduit === undefined) {
      throw new Error('Invalid response format when creating conduit')
    }
    logger.info('[CONDUIT_MANAGER] Successfully created new conduit', {
      conduitId: `${createdConduit.id.slice(0, 8)}...`,
    })
    return createdConduit.id
  } catch (error) {
    logger.error('[CONDUIT_MANAGER] Error parsing create conduit response', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw new Error('Failed to parse create conduit response', { cause: error })
  }
}

export const fetchConduitId = async function fetchConduitId(
  forceRefresh = false
): Promise<string | null> {
  // If we have an explicitly set environment variable, use it
  if (TWITCH_CONDUIT_ID !== null) {
    logger.info('[CONDUIT_MANAGER] Using conduit ID from environment')
    return TWITCH_CONDUIT_ID
  }

  const now = Date.now()
  const cacheExpired = now - lastFetchTime > CACHE_TIMEOUT

  // Return cached value if available and not forcing refresh or expired
  if (cachedConduitId !== null && cachedConduitId.length > 0 && !forceRefresh && !cacheExpired) {
    return cachedConduitId
  }

  // Reset fetch promise if forcing refresh
  if (forceRefresh) {
    fetchPromise = null
    cachedConduitId = null
  }

  // Return existing promise if one is in progress
  if (fetchPromise !== null) {
    return await fetchPromise
  }

  // Start a new fetch operation
  fetchPromise = (async () => {
    try {
      // Get fresh headers for the request
      const headers = await getTwitchHeaders()

      // First try to get existing conduits
      logger.info('[CONDUIT_MANAGER] Fetching existing conduits')
      const conduitsReq = await fetch(CONDUITS_URL, {
        headers,
        method: 'GET',
      })

      if (conduitsReq.status === 401) {
        logger.error('[CONDUIT_MANAGER] Authorization error when fetching conduits')
        // Try again with fresh headers
        const freshHeaders = await getTwitchHeaders()

        const retryReq = await fetch(CONDUITS_URL, {
          headers: freshHeaders,
          method: 'GET',
        })

        if (!retryReq.ok) {
          throw new Error('Authorization failed after token refresh')
        }

        const retryData = conduitResponseSchema.parse(await retryReq.json())
        const [retryConduit] = retryData.data
        if (retryConduit !== undefined) {
          cachedConduitId = retryConduit.id
          lastFetchTime = now
          return cachedConduitId
        }
      }

      if (!conduitsReq.ok) {
        const errorText = await conduitsReq.text()
        logger.error('[CONDUIT_MANAGER] Failed to fetch conduits', {
          response: errorText,
          status: conduitsReq.status,
        })
        throw new Error(`Failed to fetch conduits: ${conduitsReq.status} ${errorText}`)
      }

      const { data } = conduitResponseSchema.parse(await conduitsReq.json())

      // If we found existing conduits, use the first one
      const [existingConduit] = data
      if (existingConduit !== undefined) {
        cachedConduitId = existingConduit.id
        lastFetchTime = now
        logger.info('[CONDUIT_MANAGER] Using existing conduit', {
          conduitId: `${cachedConduitId.slice(0, 8)}...`,
          totalConduits: data.length,
        })
        return cachedConduitId
      }

      // No existing conduits, create a new one
      logger.info('[CONDUIT_MANAGER] No existing conduits found, creating new one')
      const newConduitId = await createConduit()
      cachedConduitId = newConduitId
      lastFetchTime = now
      return cachedConduitId
    } catch (error) {
      logger.error('[CONDUIT_MANAGER] Error obtaining conduit ID', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Return null to indicate failure
      return null
    } finally {
      // Clear the in-flight handle once settled so the next call after cache
      // expiry starts a real refetch instead of reusing this stale promise
      fetchPromise = null
    }
  })()

  return await fetchPromise
}

export const updateConduitShard = async function updateConduitShard(
  sessionId: string,
  conduitId: string,
  retryCount = 0,
  wait: RetryWait = waitForRetry
): Promise<boolean> {
  const body = {
    conduit_id: conduitId,
    shards: [
      {
        id: 0,
        transport: {
          method: 'websocket',
          session_id: sessionId,
        },
      },
    ],
  }

  try {
    // Get fresh headers before each attempt to ensure we have the latest token
    const currentHeaders = await getTwitchHeaders(process.env.TWITCH_BOT_PROVIDERID, true)

    const conduitUpdate = await fetch(CONDUIT_SHARDS_URL, {
      body: JSON.stringify(body),
      headers: {
        ...currentHeaders,
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    })

    if (conduitUpdate.status === 401) {
      logger.error(
        '[CONDUIT_MANAGER] Unauthorized when assigning socket to shard, refreshing token'
      )

      // Force token refresh by getting fresh headers
      await getTwitchHeaders()

      // Retry with exponential backoff (max 5 retries)
      if (retryCount < 5) {
        // Exponential backoff with 30s max
        const delay = Math.min(1000 * 2 ** retryCount, 30_000)
        logger.info(
          `[CONDUIT_MANAGER] Retrying shard update in ${delay}ms, attempt ${retryCount + 1}`
        )

        await wait(delay)
        return await updateConduitShard(sessionId, conduitId, retryCount + 1, wait)
      }

      logger.error('[CONDUIT_MANAGER] Max retries reached for shard update after token refresh')
      return false
    }

    if (conduitUpdate.status !== 202) {
      const errorText = await conduitUpdate.text()
      logger.error('[CONDUIT_MANAGER] Failed to assign socket to shard', {
        reason: errorText,
        status: conduitUpdate.status,
      })

      // Retry with exponential backoff for other errors as well
      if (retryCount < 5) {
        const delay = Math.min(1000 * 2 ** retryCount, 30_000)
        logger.info(
          `[CONDUIT_MANAGER] Retrying shard update in ${delay}ms, attempt ${retryCount + 1}`
        )

        await wait(delay)
        return await updateConduitShard(sessionId, conduitId, retryCount + 1, wait)
      }
      return false
    }

    logger.info('[CONDUIT_MANAGER] Socket assigned to shard')
    const response = conduitShardResponseSchema.parse(await conduitUpdate.json())
    if (response.errors !== undefined && response.errors.length > 0) {
      logger.error('[CONDUIT_MANAGER] Failed to update the shard', { errors: response.errors })
      return false
    }

    logger.info('[CONDUIT_MANAGER] Shard Updated')
    return true
  } catch (error) {
    logger.error('[CONDUIT_MANAGER] Exception when updating conduit shard', { error })

    if (retryCount < 5) {
      const delay = Math.min(1000 * 2 ** retryCount, 30_000)
      logger.info(
        `[CONDUIT_MANAGER] Retrying shard update after error in ${delay}ms, attempt ${retryCount + 1}`
      )

      await wait(delay)
      return await updateConduitShard(sessionId, conduitId, retryCount + 1, wait)
    }
    return false
  }
}
