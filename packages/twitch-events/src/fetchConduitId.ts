import { getTwitchHeaders } from './getTwitchHeaders.js'
import type { TwitchConduitResponse } from './interfaces.js'

const headers = await getTwitchHeaders()

let cachedConduitId: string | null = null
let fetchPromise: Promise<string> | null = null

/**
 * Fetches the ID of the first available EventSub conduit from Twitch API.
 *
 * Makes a GET request to retrieve existing conduits. The conduit ID is used
 * to establish a connection for receiving EventSub notifications.
 *
 * The result is memoized to avoid redundant API calls.
 *
 * @throws {Error} If the request fails due to missing/invalid auth token or other API errors
 * @returns {Promise<string>} ID of the first available conduit, or undefined if none exist
 */
export async function fetchConduitId(): Promise<string> {
  if (cachedConduitId) {
    return cachedConduitId
  }

  if (fetchPromise) {
    return fetchPromise
  }

  fetchPromise = (async () => {
    const conduitsReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
      method: 'GET',
      headers,
    })

    if (conduitsReq.status === 401) {
      throw new Error('Authorization header required with an app access token')
    }

    if (!conduitsReq.ok) {
      throw new Error(`Failed to fetch conduits: ${conduitsReq.status}`)
    }

    const { data } = (await conduitsReq.json()) as TwitchConduitResponse
    cachedConduitId = data[0]?.id
    return cachedConduitId
  })()

  return fetchPromise
}
