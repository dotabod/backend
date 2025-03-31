import { getAppToken } from '@twurple/auth'
import { ApiClient } from '@twurple/api'
import { getAuthProvider } from './twitch/lib/getAuthProvider'
import { logger } from './logger'
import { getTwitchTokens } from './twitch/lib/getTwitchTokens'

// The API client is a singleton that shares the auth provider
let api: ApiClient | null = null

export const getTwitchAPI = async (twitchId: string): Promise<ApiClient> => {
  const authProvider = getAuthProvider()

  // Check if user is already in the auth provider
  try {
    if (!authProvider.hasUser(twitchId)) {
      const isBotAccount = twitchId === process.env.TWITCH_BOT_PROVIDERID

      // Get tokens based on account type
      const tokens = await getTwitchTokens(twitchId)

      // Check if tokens exist
      const accessToken = tokens?.access_token
      const refreshToken = tokens?.refresh_token

      if (!accessToken || !refreshToken) {
        logger.info('[TWITCHSETUP] Missing twitch tokens', { twitchId, isBotAccount })
        throw new Error('Missing twitch tokens')
      }

      // Create token data object
      const tokenData = {
        scope: tokens.scope?.split(' ') ?? [],
        expiresIn: tokens.expires_in ?? 0,
        obtainmentTimestamp: new Date(tokens.obtainment_timestamp || '')?.getTime(),
        accessToken,
        refreshToken,
      }

      // Add user to the auth provider
      authProvider.addUser(twitchId, tokenData)
    }
  } catch (e) {
    logger.error('[TWITCHAPI] Error adding user to auth provider', { twitchId, e })
  }

  // Create API client if it doesn't exist yet
  if (!api) {
    api = new ApiClient({ authProvider })
    logger.info('[TWITCHAPI] Created new API client', { twitchId })
  }

  // The API client uses the auth provider which now has the user,
  // so it will have access to the user's authentication
  return api
}

// Remove and re-add the user to get the new tokens in Twurple cache
function updateTwurpleTokenForTwitchId(twitchId: string) {
  const authProvider = getAuthProvider()

  authProvider.removeUser(twitchId)
  getTwitchAPI(twitchId).catch((e) => {
    logger.error('[TWITCHAPI] Error updating twurple token', { twitchId, e })
  })
}

// Cache for Twitch headers by twitchId
const headerCache: Record<string, { headers: Record<string, string>; timestamp: number }> = {}
const TOKEN_REFRESH_INTERVAL = 3600000 // 1 hour in milliseconds

// Function to get Twitch headers with per-user caching
export async function getTwitchHeaders(twitchId?: string): Promise<Record<string, string>> {
  const now = Date.now()
  const cacheKey = twitchId || 'app_token'

  // Return cached headers if they exist and aren't expired
  if (headerCache[cacheKey] && now - headerCache[cacheKey].timestamp < TOKEN_REFRESH_INTERVAL) {
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
