import { logger } from '../logger'
import { getTwitchHeaders } from './get-twitch-headers'

// Cache controls
// 24 hours
const CACHE_TIMEOUT = 1000 * 60 * 60 * 24
let lastFetchTime = 0
let cachedConduitId: string | null = null
let fetchPromise: Promise<string | null> | null = null

// Environment variable override
const TWITCH_CONDUIT_ID = process.env.TWITCH_CONDUIT_ID || null

// Set initial value if env var is provided
if (TWITCH_CONDUIT_ID) {
  cachedConduitId = TWITCH_CONDUIT_ID
}

/**
 * Interface for Twitch conduit response
 */
export interface TwitchConduitResponse {
  data: {
    id: string
    shard_count: number
    transport?: {
      method: string
      session_id?: string
    }
  }[]
}

/**
 * Interface for Twitch conduit create response
 */
export interface TwitchConduitCreateResponse {
  data: {
    id: string
    shard_count: number
  }[]
}

const createConduit = async function createConduit(): Promise<string> {
  logger.info('[CONDUIT_MANAGER] Creating new conduit')

  // Get fresh headers for the request
  const headers = await getTwitchHeaders()

  const createReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
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
    const response = (await createReq.json()) as { data?: { id: string }[] }
    if (response.data && response.data.length > 0 && response.data[0].id) {
      const newConduitId = response.data[0].id
      logger.info('[CONDUIT_MANAGER] Successfully created new conduit', {
        conduitId: `${newConduitId.slice(0, 8)}...`,
      })
      return newConduitId
    }

    throw new Error('Invalid response format when creating conduit')
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
  if (TWITCH_CONDUIT_ID) {
    logger.info('[CONDUIT_MANAGER] Using conduit ID from environment')
    return TWITCH_CONDUIT_ID
  }

  const now = Date.now()
  const cacheExpired = now - lastFetchTime > CACHE_TIMEOUT

  // Return cached value if available and not forcing refresh or expired
  if (cachedConduitId && !forceRefresh && !cacheExpired) {
    return cachedConduitId
  }

  // Reset fetch promise if forcing refresh
  if (forceRefresh) {
    fetchPromise = null
    cachedConduitId = null
  }

  // Return existing promise if one is in progress
  if (fetchPromise) {
    return await fetchPromise
  }

  // Start a new fetch operation
  fetchPromise = (async () => {
    try {
      // Get fresh headers for the request
      const headers = await getTwitchHeaders()

      // First try to get existing conduits
      logger.info('[CONDUIT_MANAGER] Fetching existing conduits')
      const conduitsReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
        headers,
        method: 'GET',
      })

      if (conduitsReq.status === 401) {
        logger.error('[CONDUIT_MANAGER] Authorization error when fetching conduits')
        // Try again with fresh headers
        const freshHeaders = await getTwitchHeaders()

        const retryReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
          headers: freshHeaders,
          method: 'GET',
        })

        if (!retryReq.ok) {
          throw new Error('Authorization failed after token refresh')
        }

        const retryData = (await retryReq.json()) as TwitchConduitResponse
        if (retryData.data && retryData.data.length > 0 && retryData.data[0]?.id) {
          cachedConduitId = retryData.data[0].id
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

      const { data } = (await conduitsReq.json()) as TwitchConduitResponse

      // If we found existing conduits, use the first one
      if (data && data.length > 0 && data[0]?.id) {
        cachedConduitId = data[0].id
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
  session_id: string,
  conduitId: string,
  retryCount = 0
): Promise<boolean> {
  const body = {
    conduit_id: conduitId,
    shards: [
      {
        id: 0,
        transport: {
          method: 'websocket',
          session_id,
        },
      },
    ],
  }

  try {
    // Get fresh headers before each attempt to ensure we have the latest token
    const currentHeaders = await getTwitchHeaders(process.env.TWITCH_BOT_PROVIDERID, true)

    const conduitUpdate = await fetch('https://api.twitch.tv/helix/eventsub/conduits/shards', {
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
      const _freshHeaders = await getTwitchHeaders()

      // Retry with exponential backoff (max 5 retries)
      if (retryCount < 5) {
        // Exponential backoff with 30s max
        const delay = Math.min(1000 * 2 ** retryCount, 30_000)
        logger.info(
          `[CONDUIT_MANAGER] Retrying shard update in ${delay}ms, attempt ${retryCount + 1}`
        )

        await new Promise((resolve) => setTimeout(resolve, delay))
        return updateConduitShard(session_id, conduitId, retryCount + 1)
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

        await new Promise((resolve) => setTimeout(resolve, delay))
        return updateConduitShard(session_id, conduitId, retryCount + 1)
      }
      return false
    }

    logger.info('[CONDUIT_MANAGER] Socket assigned to shard')
    const response = (await conduitUpdate.json()) as { errors?: { message: string }[] }
    if (response.errors && response.errors.length > 0) {
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

      await new Promise((resolve) => setTimeout(resolve, delay))
      return await updateConduitShard(session_id, conduitId, retryCount + 1)
    }
    return false
  }
}
