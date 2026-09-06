import { getAppToken } from '@twurple/auth'

import { getTwitchTokens } from './get-twitch-tokens'

// Cache for Twitch headers by twitchId
const headerCache = new Map<string, { headers: Record<string, string>; timestamp: number }>()
// 1 hour in milliseconds
const TOKEN_REFRESH_INTERVAL = 3_600_000

// Function to get Twitch headers with per-user caching
export const getTwitchHeaders = async function getTwitchHeaders(
  twitchId?: string,
  forceRefresh = false
): Promise<Record<string, string>> {
  const now = Date.now()
  const cacheKey = twitchId === undefined || twitchId.length === 0 ? 'app_token' : twitchId
  const cached = headerCache.get(cacheKey)

  // Return cached headers if they exist and aren't expired and not forcing refresh
  if (!forceRefresh && cached !== undefined && now - cached.timestamp < TOKEN_REFRESH_INTERVAL) {
    return cached.headers
  }

  let accessToken = ''

  if (
    twitchId === undefined ||
    twitchId.length === 0 ||
    twitchId === process.env.TWITCH_BOT_PROVIDERID
  ) {
    // Fetch new token if needed
    const appToken = await getAppToken(
      process.env.TWITCH_CLIENT_ID ?? '',
      process.env.TWITCH_CLIENT_SECRET ?? ''
    )
    accessToken = appToken?.accessToken ?? ''
  } else {
    const tokens = await getTwitchTokens(twitchId)
    accessToken = tokens?.access_token ?? ''
  }

  // Create headers and cache them for this specific twitchId
  const headers = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
    Authorization: `Bearer ${accessToken}`,
    'Client-Id': process.env.TWITCH_CLIENT_ID ?? '',
  }

  // Store in cache with timestamp
  headerCache.set(cacheKey, {
    headers,
    timestamp: now,
  })

  return headers
}
