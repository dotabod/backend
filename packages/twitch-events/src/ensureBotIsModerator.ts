import { logger } from './twitch/lib/logger.js'
import { rateLimiter } from './utils/rateLimiter.js'
import supabase from './db/supabase.js'

/**
 * Check if the bot is a moderator in a broadcaster's channel and make it one if not
 * @param broadcasterId The broadcaster's Twitch ID
 */
export async function ensureBotIsModerator(broadcasterId: string) {
  try {
    if (!process.env.TWITCH_BOT_PROVIDERID || !process.env.TWITCH_CLIENT_ID) {
      logger.warn('[TWITCHEVENTS] Missing bot ID or client ID, cannot check moderator status', {
        broadcasterId,
        hasBotId: Boolean(process.env.TWITCH_BOT_PROVIDERID),
      })
      return
    }

    // Fetch broadcaster tokens from the database - we need their token to add bot as moderator
    const { data: broadcasterAccount, error: tokenError } = await supabase
      .from('accounts')
      .select('access_token, refresh_token, scope')
      .eq('providerAccountId', broadcasterId)
      .eq('provider', 'twitch')
      .single()

    if (tokenError || !broadcasterAccount?.access_token) {
      logger.warn('[TWITCHEVENTS] Could not find broadcaster tokens', {
        broadcasterId,
        error: tokenError,
      })
      return
    }

    // Check if token has the required scope
    if (!broadcasterAccount.scope?.includes('channel:manage:moderators')) {
      logger.warn('[TWITCHEVENTS] Broadcaster token missing channel:manage:moderators scope', {
        broadcasterId,
        scope: broadcasterAccount.scope,
      })
      return
    }

    let accessToken = broadcasterAccount.access_token

    // Validate the token first
    try {
      const validateResponse = await fetch('https://id.twitch.tv/oauth2/validate', {
        method: 'GET',
        headers: {
          Authorization: `OAuth ${accessToken}`,
        },
      })

      // If token is invalid, try to refresh it
      if (validateResponse.status === 401 && broadcasterAccount.refresh_token) {
        const refreshResponse = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: broadcasterAccount.refresh_token,
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET || '',
          }),
        })

        if (refreshResponse.status === 200) {
          const newTokens = (await refreshResponse.json()) as {
            access_token: string
            refresh_token: string
          }

          // Update the tokens in the database
          await supabase
            .from('accounts')
            .update({
              access_token: newTokens.access_token,
              refresh_token: newTokens.refresh_token,
              updated_at: new Date().toISOString(),
            })
            .eq('providerAccountId', broadcasterId)
            .eq('provider', 'twitch')

          accessToken = newTokens.access_token
          logger.info('[TWITCHEVENTS] Refreshed broadcaster token', { broadcasterId })
        } else {
          logger.warn('[TWITCHEVENTS] Failed to refresh broadcaster token', {
            broadcasterId,
            status: refreshResponse.status,
          })
          return
        }
      } else if (validateResponse.status !== 200) {
        logger.warn('[TWITCHEVENTS] Failed to validate broadcaster token', {
          broadcasterId,
          status: validateResponse.status,
        })
        return
      }
    } catch (error) {
      logger.error('[TWITCHEVENTS] Error validating/refreshing token', {
        broadcasterId,
        error,
      })
      return
    }

    // Check if bot is already a moderator
    const checkModUrl = new URL('https://api.twitch.tv/helix/moderation/moderators')
    checkModUrl.searchParams.append('broadcaster_id', broadcasterId)
    checkModUrl.searchParams.append('user_id', process.env.TWITCH_BOT_PROVIDERID)

    const authHeaders = {
      'Client-Id': process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    }

    await rateLimiter.schedule(async () => {
      const modCheckReq = await fetch(checkModUrl.toString(), {
        method: 'GET',
        headers: authHeaders,
      })

      // Update rate limit info
      rateLimiter.updateLimits(modCheckReq.headers)

      if (modCheckReq.status === 429) {
        logger.warn('[TWITCHEVENTS] Rate limit hit checking moderator status', { broadcasterId })
        throw new Error('Rate limit hit')
      }

      if (modCheckReq.status === 401) {
        logger.warn('[TWITCHEVENTS] Unauthorized to check moderator status', {
          broadcasterId,
          statusCode: modCheckReq.status,
        })
        return
      }

      if (!modCheckReq.ok) {
        logger.warn('[TWITCHEVENTS] Failed to check if bot is moderator', {
          broadcasterId,
          status: modCheckReq.status,
          statusText: modCheckReq.statusText,
        })
        return
      }

      const modResponse = (await modCheckReq.json()) as { data?: Array<{ user_id: string }> }

      // If bot is not already a moderator, add it
      if (!modResponse.data || modResponse.data.length === 0) {
        logger.info('[TWITCHEVENTS] Bot is not a moderator, adding as moderator', { broadcasterId })

        await rateLimiter.schedule(async () => {
          const addModUrl = new URL('https://api.twitch.tv/helix/moderation/moderators')
          addModUrl.searchParams.append('broadcaster_id', broadcasterId)
          addModUrl.searchParams.append('user_id', process.env.TWITCH_BOT_PROVIDERID!)

          const addModReq = await fetch(addModUrl.toString(), {
            method: 'POST',
            headers: authHeaders,
          })

          // Update rate limit info
          rateLimiter.updateLimits(addModReq.headers)

          if (addModReq.status === 429) {
            logger.warn('[TWITCHEVENTS] Rate limit hit adding moderator', { broadcasterId })
            throw new Error('Rate limit hit')
          }

          if (addModReq.status === 204) {
            logger.info('[TWITCHEVENTS] Successfully added bot as moderator', { broadcasterId })
          } else {
            const errorBody = await addModReq.text()
            logger.warn('[TWITCHEVENTS] Failed to add bot as moderator', {
              broadcasterId,
              statusCode: addModReq.status,
              error: errorBody,
            })
          }
        })
      } else {
        logger.debug('[TWITCHEVENTS] Bot is already a moderator', { broadcasterId })
      }
    })
  } catch (error) {
    logger.error('[TWITCHEVENTS] Error ensuring bot is moderator', {
      broadcasterId,
      error,
    })
  }
}
