import { getAppToken } from '@twurple/auth'
import { getTwitchTokens } from './getTwitchTokens.js'
// Cache for Twitch headers by twitchId
const headerCache: Record<string, { headers: Record<string, string>; timestamp: number }> = {}
const TOKEN_REFRESH_INTERVAL = 3600000 // 1 hour in milliseconds

// Function to get Twitch headers with per-user caching
export async function getTwitchHeaders(
  twitchId?: string,
  forceRefresh = false,
): Promise<Record<string, string>> {
  const now = Date.now()
  const cacheKey = twitchId || 'app_token'

  // Return cached headers if they exist and aren't expired and not forcing refresh
  if (
    !forceRefresh &&
    headerCache[cacheKey] &&
    now - headerCache[cacheKey].timestamp < TOKEN_REFRESH_INTERVAL
  ) {
    return headerCache[cacheKey].headers
  }

  let accessToken = ''

  if (!twitchId || twitchId === process.env.TWITCH_BOT_PROVIDERID) {
    // Fetch new token if needed
    const appToken = await getAppToken(
      process.env.TWITCH_CLIENT_ID || '',
      process.env.TWITCH_CLIENT_SECRET || '',
    )
    accessToken = appToken?.accessToken || ''
  } else {
    const tokens = await getTwitchTokens(twitchId)
    accessToken = tokens?.access_token || ''
  }

  // Create headers and cache them for this specific twitchId
  const headers = {
    'Client-Id': process.env.TWITCH_CLIENT_ID || '',
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
  }

  // Store in cache with timestamp
  headerCache[cacheKey] = {
    headers,
    timestamp: now,
  }

  return headers
}
