import { logger } from '../logger.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'

// Cache controls
const CACHE_TIMEOUT = 1000 * 60 * 60 * 24 // 24 hours
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
  data: Array<{
    id: string
    shard_count: number
    transport?: {
      method: string
      session_id?: string
    }
  }>
}

/**
 * Interface for Twitch conduit create response
 */
export interface TwitchConduitCreateResponse {
  data: Array<{
    id: string
    shard_count: number
  }>
}

/**
 * Creates a new Twitch EventSub conduit
 * @returns Promise resolving to the created conduit ID
 * @throws Error if conduit creation fails
 */
async function createConduit(): Promise<string> {
  logger.info('[CONDUIT_MANAGER] Creating new conduit')

  // Get fresh headers for the request
  const headers = await getTwitchHeaders()

  const createReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ shard_count: 1 }),
  })

  if (!createReq.ok) {
    const errorText = await createReq.text()
    logger.error('[CONDUIT_MANAGER] Failed to create conduit', {
      status: createReq.status,
      response: errorText,
    })
    throw new Error(`Failed to create conduit: ${createReq.status} ${errorText}`)
  }

  try {
    const response = (await createReq.json()) as { data?: Array<{ id: string }> }
    if (response.data && response.data.length > 0 && response.data[0].id) {
      const newConduitId = response.data[0].id
      logger.info('[CONDUIT_MANAGER] Successfully created new conduit', {
        conduitId: `${newConduitId.substring(0, 8)}...`,
      })
      return newConduitId
    }

    throw new Error('Invalid response format when creating conduit')
  } catch (error) {
    logger.error('[CONDUIT_MANAGER] Error parsing create conduit response', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw new Error('Failed to parse create conduit response')
  }
}

/**
 * Fetches the ID of an available EventSub conduit from Twitch API,
 * or creates a new one if none exists.
 *
 * Makes a GET request to retrieve existing conduits. The conduit ID is used
 * to establish a connection for receiving EventSub notifications.
 *
 * @param {boolean} forceRefresh - Force refresh the conduit ID cache
 * @throws {Error} If the request fails due to missing/invalid auth token or other API errors
 * @returns {Promise<string | null>} ID of the available conduit, or null if none can be created/fetched
 */
export async function fetchConduitId(forceRefresh = false): Promise<string | null> {
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
    return fetchPromise
  }

  // Start a new fetch operation
  fetchPromise = (async () => {
    try {
      // Get fresh headers for the request
      const headers = await getTwitchHeaders()

      // First try to get existing conduits
      logger.info('[CONDUIT_MANAGER] Fetching existing conduits')
      const conduitsReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
        method: 'GET',
        headers,
      })

      if (conduitsReq.status === 401) {
        logger.error('[CONDUIT_MANAGER] Authorization error when fetching conduits')
        // Try again with fresh headers
        const freshHeaders = await getTwitchHeaders()

        const retryReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
          method: 'GET',
          headers: freshHeaders,
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
          status: conduitsReq.status,
          response: errorText,
        })
        throw new Error(`Failed to fetch conduits: ${conduitsReq.status} ${errorText}`)
      }

      const { data } = (await conduitsReq.json()) as TwitchConduitResponse

      // If we found existing conduits, use the first one
      if (data && data.length > 0 && data[0]?.id) {
        cachedConduitId = data[0].id
        lastFetchTime = now
        logger.info('[CONDUIT_MANAGER] Using existing conduit', {
          conduitId: `${cachedConduitId.substring(0, 8)}...`,
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
      // Reset fetch promise so we can try again next time
      fetchPromise = null

      logger.error('[CONDUIT_MANAGER] Error obtaining conduit ID', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Return null to indicate failure
      return null
    }
  })()

  return fetchPromise
}

/**
 * Updates a conduit shard with the given session ID
 * @param session_id - WebSocket session ID to use for transport
 * @param conduitId - ID of conduit to update
 * @param retryCount - Number of retries (for internal use)
 */
export async function updateConduitShard(
  session_id: string,
  conduitId: string,
  retryCount = 0,
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
      method: 'PATCH',
      headers: {
        ...currentHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (conduitUpdate.status === 401) {
      logger.error(
        '[CONDUIT_MANAGER] Unauthorized when assigning socket to shard, refreshing token',
      )

      // Force token refresh by getting fresh headers
      const freshHeaders = await getTwitchHeaders()

      // Retry with exponential backoff (max 5 retries)
      if (retryCount < 5) {
        const delay = Math.min(1000 * 2 ** retryCount, 30000) // Exponential backoff with 30s max
        logger.info(
          `[CONDUIT_MANAGER] Retrying shard update in ${delay}ms, attempt ${retryCount + 1}`,
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
        status: conduitUpdate.status,
        reason: errorText,
      })

      // Retry with exponential backoff for other errors as well
      if (retryCount < 5) {
        const delay = Math.min(1000 * 2 ** retryCount, 30000)
        logger.info(
          `[CONDUIT_MANAGER] Retrying shard update in ${delay}ms, attempt ${retryCount + 1}`,
        )

        await new Promise((resolve) => setTimeout(resolve, delay))
        return updateConduitShard(session_id, conduitId, retryCount + 1)
      }
      return false
    }

    logger.info('[CONDUIT_MANAGER] Socket assigned to shard')
    const response = (await conduitUpdate.json()) as { errors?: Array<{ message: string }> }
    if (response.errors && response.errors.length > 0) {
      logger.error('[CONDUIT_MANAGER] Failed to update the shard', { errors: response.errors })
      return false
    }

    logger.info('[CONDUIT_MANAGER] Shard Updated')
    return true
  } catch (error) {
    logger.error('[CONDUIT_MANAGER] Exception when updating conduit shard', { error })

    if (retryCount < 5) {
      const delay = Math.min(1000 * 2 ** retryCount, 30000)
      logger.info(
        `[CONDUIT_MANAGER] Retrying shard update after error in ${delay}ms, attempt ${retryCount + 1}`,
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
      return updateConduitShard(session_id, conduitId, retryCount + 1)
    }
    return false
  }
}
