import { getTwitchHeaders } from '@dotabod/shared-utils'
import { logger } from '@dotabod/shared-utils'
import type { TwitchConduitResponse } from './interfaces.js'

const headers = await getTwitchHeaders()

// Allow explicit override through environment variable
const TWITCH_CONDUIT_ID = process.env.TWITCH_CONDUIT_ID || null

let cachedConduitId: string | null = TWITCH_CONDUIT_ID
let fetchPromise: Promise<string | null> | null = null

/**
 * Fetches the ID of an available EventSub conduit from Twitch API,
 * or creates a new one if none exists.
 *
 * Makes a GET request to retrieve existing conduits. The conduit ID is used
 * to establish a connection for receiving EventSub notifications.
 *
 * The result is memoized to avoid redundant API calls.
 *
 * @throws {Error} If the request fails due to missing/invalid auth token or other API errors
 * @returns {Promise<string | null>} ID of the available conduit, or null if none can be created/fetched
 */
export async function fetchConduitId(): Promise<string | null> {
  // If we have an explicitly set environment variable, use it
  if (TWITCH_CONDUIT_ID) {
    logger.info('[TWITCHEVENTS] Using conduit ID from environment')
    return TWITCH_CONDUIT_ID
  }

  // Return cached value if available
  if (cachedConduitId) {
    return cachedConduitId
  }

  // Return existing promise if one is in progress
  if (fetchPromise) {
    return fetchPromise
  }

  // Start a new fetch operation
  fetchPromise = (async () => {
    try {
      // First try to get existing conduits
      logger.info('[TWITCHEVENTS] Fetching existing conduits')
      const conduitsReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
        method: 'GET',
        headers,
      })

      if (conduitsReq.status === 401) {
        logger.error('[TWITCHEVENTS] Authorization error when fetching conduits')
        throw new Error('Authorization header required with valid app access token')
      }

      if (!conduitsReq.ok) {
        const errorText = await conduitsReq.text()
        logger.error('[TWITCHEVENTS] Failed to fetch conduits', {
          status: conduitsReq.status,
          response: errorText,
        })
        throw new Error(`Failed to fetch conduits: ${conduitsReq.status} ${errorText}`)
      }

      const { data } = (await conduitsReq.json()) as TwitchConduitResponse

      // If we found existing conduits, use the first one
      if (data && data.length > 0 && data[0]?.id) {
        cachedConduitId = data[0].id
        logger.info('[TWITCHEVENTS] Using existing conduit', {
          conduitId: `${cachedConduitId.substring(0, 8)}...`,
          totalConduits: data.length,
        })
        return cachedConduitId
      }

      // No existing conduits, try to create one
      logger.info('[TWITCHEVENTS] No existing conduits found')
      throw new Error('No existing conduits found')
    } catch (error) {
      // Reset fetch promise so we can try again next time
      fetchPromise = null

      logger.error('[TWITCHEVENTS] Error obtaining conduit ID', {
        error: error instanceof Error ? error.message : String(error),
      })

      // Return null to indicate failure
      return null
    }
  })()

  return fetchPromise
}
