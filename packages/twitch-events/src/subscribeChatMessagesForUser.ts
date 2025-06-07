import { checkBotStatus, logger } from '@dotabod/shared-utils'
import { getTwitchHeaders } from '@dotabod/shared-utils'
import type { TwitchEventTypes } from './TwitchEventTypes.js'
import { eventSubMap } from './chatSubIds.js'
import type { TwitchEventSubResponse } from './interfaces.js'
import { revokeEvent } from './twitch/lib/revokeEvent.js'
import { rateLimiter } from './utils/rateLimiterCore.js'

// Don't cache headers, we'll get fresh ones each time
const botUserId = process.env.TWITCH_BOT_PROVIDERID
if (!botUserId) {
  throw new Error('Bot user id not found')
}

/**
 * Attempts to subscribe to a Twitch EventSub event
 * @param conduit_id The conduit ID
 * @param broadcaster_user_id The broadcaster's Twitch ID
 * @param type The event type to subscribe to
 * @param forceRefreshToken Whether to force refresh the token
 * @returns Promise resolving to true if subscription is successful, false otherwise
 */
export async function genericSubscribe(
  conduit_id: string,
  broadcaster_user_id: string,
  type: keyof TwitchEventTypes,
  forceRefreshToken = false,
): Promise<boolean> {
  // Don't subscribe to chat messages if the bot is banned
  // It will fail to subscribe anyway
  if (type === 'channel.chat.message') {
    const isBanned = await checkBotStatus()
    if (isBanned) {
      return true
    }
  }

  // Validate conduit_id to prevent unnecessary API calls
  if (!conduit_id) {
    logger.error('Missing conduit_id in genericSubscribe', {
      conduit_id,
      broadcaster_user_id,
      type,
    })
    return false
  }

  return rateLimiter.schedule(async (): Promise<boolean> => {
    // Get fresh headers with each request to avoid token expiration issues
    const headers = await getTwitchHeaders(undefined, forceRefreshToken)

    const baseBody = {
      version: '1',
      transport: {
        method: 'conduit',
        conduit_id,
      },
    }
    const body = {
      ...baseBody,
      type,
      condition: (() => {
        if (type === 'user.update') {
          return { user_id: broadcaster_user_id }
        }
        if (type === 'channel.chat.message') {
          return {
            broadcaster_user_id,
            user_id: botUserId,
          }
        }
        if (
          [
            'stream.offline',
            'stream.online',
            'channel.prediction.begin',
            'channel.prediction.progress',
            'channel.prediction.lock',
            'channel.prediction.end',
            'channel.poll.begin',
            'channel.poll.progress',
            'channel.poll.end',
          ].includes(type)
        ) {
          return { broadcaster_user_id }
        }
        // Default case for any other event types
        return {
          broadcaster_user_id,
          user_id: botUserId,
        }
      })(),
    }

    try {
      const subscribeReq = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      // Update rate limit info
      rateLimiter.updateLimits(subscribeReq.headers)

      if (subscribeReq.status === 429) {
        logger.warn('Rate limit hit, will retry automatically', { type })
        throw new Error('Rate limit hit')
      }

      if (subscribeReq.status === 409) {
        logger.info(`Subscription already exists for ${type}`, { type })
        return true
      }

      // Handle 401 errors specifically - we might need to refresh the token
      if (subscribeReq.status === 401) {
        const responseText = await subscribeReq.text()
        const errorData = responseText.length
          ? JSON.parse(responseText)
          : { message: 'Unauthorized' }

        logger.error(`Authentication error: ${subscribeReq.status} ${errorData.message}`, {
          type,
          broadcaster_user_id,
        })

        // If this is our first attempt, try once more with a fresh token
        if (!forceRefreshToken) {
          logger.info('Retrying subscription with fresh token', {
            type,
            broadcaster_user_id,
          })
          return genericSubscribe(conduit_id, broadcaster_user_id, type, true)
        }

        // If we already tried with a fresh token, trigger revocation
        logger.error('Token refresh failed, revoking user', {
          broadcaster_user_id,
          type,
        })
        await revokeEvent({ providerAccountId: broadcaster_user_id })
        throw new Error(`Authentication failed after token refresh: ${errorData.message}`)
      }

      if (subscribeReq.status !== 202) {
        const responseText = await subscribeReq.text()
        const errorData = responseText.length
          ? JSON.parse(responseText)
          : { message: 'Unknown error' }

        logger.error(`Failed to subscribe ${subscribeReq.status} ${responseText}`, {
          type,
          broadcaster_user_id,
          error: errorData,
        })

        // Handle specific error status codes
        if (subscribeReq.status === 403) {
          // These status codes indicate authentication/authorization issues
          // Double check that this is truly an authorization issue
          if (
            errorData.message?.includes('authorization') ||
            errorData.message?.includes('access') ||
            errorData.message?.includes('permission') ||
            errorData.message?.includes('scope')
          ) {
            logger.info(`Authorization issue detected, revoking user ${broadcaster_user_id}`, {
              status: subscribeReq.status,
              message: errorData.message,
            })
            await revokeEvent({ providerAccountId: broadcaster_user_id })
          }
        }

        if (subscribeReq.status === 400) {
          // Log configuration errors differently to make them more visible
          logger.error('Subscription configuration error', {
            status: subscribeReq.status,
            response: responseText,
            broadcaster_user_id,
            type,
            conduit_id,
          })
        }

        throw new Error(
          `Subscription failed with status ${subscribeReq.status}: ${errorData.message}`,
        )
      }

      const response = await subscribeReq.json()
      const { data } = response as TwitchEventSubResponse

      if (
        broadcaster_user_id === '__proto__' ||
        broadcaster_user_id === 'constructor' ||
        broadcaster_user_id === 'prototype'
      ) {
        logger.error(`Invalid broadcaster_user_id: ${broadcaster_user_id}`, { type })
        return false
      }

      // Initialize broadcaster entry if it doesn't exist
      eventSubMap[broadcaster_user_id] ??= {} as (typeof eventSubMap)[number]

      // Store subscription details
      eventSubMap[broadcaster_user_id][type] = {
        id: data[0].id,
        status: data[0].status,
      }
      return true
    } catch (error) {
      // Rethrow the error so that the calling function can handle it
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Unknown error: ${String(error)}`)
    }
  })
}

export async function subscribeToAuthGrantOrRevoke(conduit_id: string, client_id: string) {
  const subscribeToAuthEvent = async (
    eventType: 'user.authorization.revoke' | 'user.authorization.grant',
  ) => {
    return rateLimiter.schedule(async (): Promise<boolean> => {
      // Get fresh headers for each request
      const headers = await getTwitchHeaders()

      const body = {
        type: eventType,
        version: '1',
        condition: {
          client_id,
        },
        transport: {
          method: 'conduit',
          conduit_id,
        },
      }

      try {
        const subscribeReq = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (subscribeReq.status === 409) {
          logger.info(`Subscription already exists for ${eventType}`)
          return true
        }

        if (subscribeReq.status === 401) {
          // Try once more with a forced token refresh
          logger.warn(`Auth failed for ${eventType}, trying with fresh token`)
          const freshHeaders = await getTwitchHeaders(undefined, true)

          const retryReq = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'POST',
            headers: {
              ...freshHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          })

          if (retryReq.status === 409) {
            logger.info(`Retry successful: Subscription already exists for ${eventType}`)
            return true
          }

          if (retryReq.status !== 202) {
            const errorText = await retryReq.text()
            logger.error(
              `Failed to subscribe after token refresh: ${retryReq.status} ${errorText}`,
              {
                type: eventType,
              },
            )
            return false
          }

          logger.info(`Successfully subscribed to ${eventType} after token refresh`)
          return true
        }

        if (subscribeReq.status !== 202) {
          const errorText = await subscribeReq.text()
          logger.error(`Failed to subscribe ${subscribeReq.status} ${errorText}`, {
            type: eventType,
          })
          return false
        }

        return true
      } catch (error) {
        logger.error(`Error subscribing to ${eventType}`, {
          error: error instanceof Error ? error.message : String(error),
        })
        return false
      }
    })
  }

  // Subscribe to both revoke and grant events
  const revokeResult = await subscribeToAuthEvent('user.authorization.revoke')
  const grantResult = await subscribeToAuthEvent('user.authorization.grant')

  return revokeResult && grantResult
}
