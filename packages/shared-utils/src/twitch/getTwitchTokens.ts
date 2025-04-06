import { getSupabaseClient } from '../db/supabase.js'
import { logger } from '../logger.js'

export interface TwitchTokens {
  access_token: string
  refresh_token: string
  expires_in?: number
  scope?: string
  obtainment_timestamp?: string
  requires_refresh?: boolean
}

/**
 * Get Twitch access and refresh tokens for a user
 * @param twitchId The Twitch user ID to get tokens for
 * @returns TwitchTokens or null if not found
 */
export const getTwitchTokens = async (lookupTwitchId?: string): Promise<TwitchTokens | null> => {
  let twitchId = lookupTwitchId
  // if no twitchId, use the bot providerId
  if (!twitchId) {
    twitchId = process.env.TWITCH_BOT_PROVIDERID!
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('accounts')
      .select(
        'access_token, refresh_token, expires_in, scope, obtainment_timestamp, requires_refresh',
      )
      .eq('providerAccountId', twitchId)
      .eq('provider', 'twitch')
      .single()

    if (error) {
      logger.error('[TWITCH] Error fetching tokens', { twitchId, error })
      return null
    }

    return data as TwitchTokens
  } catch (error) {
    logger.error('[TWITCH] Error fetching tokens', { twitchId, error })
    return null
  }
}
