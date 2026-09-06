import { checkBotStatus, getTwitchHeaders, logger } from '@dotabod/shared-utils'
import { z } from 'zod'

import { eventSubMap } from './chat-sub-ids'
import { EVENT_SUB_STATUSES } from './interfaces'
import type { TwitchEventTypes } from './twitch-event-types'
import { revokeEvent } from './twitch/lib/revoke-event'
import { rateLimiter } from './utils/rate-limiter-core'

const EVENTSUB_SUBSCRIPTIONS_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'
const AUTHORIZATION_ERROR_TERMS = ['authorization', 'access', 'permission', 'scope'] as const
const botUserId = process.env.TWITCH_BOT_PROVIDERID
if (botUserId === undefined || botUserId.length === 0) {
  throw new Error('Bot user id not found')
}

const twitchErrorSchema = z.object({ message: z.string() })
const subscriptionResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      status: z.enum(EVENT_SUB_STATUSES),
    })
  ),
})

const getTwitchErrorMessage = function getTwitchErrorMessage(
  responseText: string,
  fallback: string
): string {
  if (responseText.length === 0) {
    return fallback
  }

  try {
    const parsed: unknown = JSON.parse(responseText)
    const result = twitchErrorSchema.safeParse(parsed)
    return result.success ? result.data.message : fallback
  } catch {
    return fallback
  }
}

export const genericSubscribe = async function genericSubscribe(
  conduitId: string,
  broadcasterId: string,
  type: keyof TwitchEventTypes,
  forceRefreshToken = false
): Promise<boolean> {
  if (type === 'channel.chat.message') {
    const isBanned = await checkBotStatus()
    if (isBanned) {
      return true
    }
  }

  if (conduitId.length === 0) {
    logger.error('Missing conduit_id in genericSubscribe', {
      broadcaster_user_id: broadcasterId,
      conduit_id: conduitId,
      type,
    })
    return false
  }

  return await rateLimiter.schedule(async (): Promise<boolean> => {
    const headers = await getTwitchHeaders(undefined, forceRefreshToken)

    const baseBody = {
      transport: {
        conduit_id: conduitId,
        method: 'conduit',
      },
      version: '1',
    }
    const body = {
      ...baseBody,
      condition: (() => {
        if (type === 'user.update') {
          return { user_id: broadcasterId }
        }
        if (type === 'channel.chat.message') {
          return {
            broadcaster_user_id: broadcasterId,
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
          return { broadcaster_user_id: broadcasterId }
        }
        return {
          broadcaster_user_id: broadcasterId,
          user_id: botUserId,
        }
      })(),
      type,
    }

    try {
      const subscribeReq = await fetch(EVENTSUB_SUBSCRIPTIONS_URL, {
        body: JSON.stringify(body),
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      rateLimiter.updateLimits(subscribeReq.headers)

      if (subscribeReq.status === 429) {
        logger.warn('Rate limit hit, will retry automatically', { type })
        throw new Error('Rate limit hit')
      }

      if (subscribeReq.status === 409) {
        logger.info(`Subscription already exists for ${type}`, { type })
        return true
      }

      if (subscribeReq.status === 401) {
        const responseText = await subscribeReq.text()
        const errorMessage = getTwitchErrorMessage(responseText, 'Unauthorized')

        logger.error(`Authentication error: ${subscribeReq.status} ${errorMessage}`, {
          broadcaster_user_id: broadcasterId,
          type,
        })

        if (!forceRefreshToken) {
          logger.info('Retrying subscription with fresh token', {
            broadcaster_user_id: broadcasterId,
            type,
          })
          return await genericSubscribe(conduitId, broadcasterId, type, true)
        }

        logger.error('Token refresh failed, revoking user', {
          broadcaster_user_id: broadcasterId,
          type,
        })
        revokeEvent({ providerAccountId: broadcasterId })
        throw new Error(`Authentication failed after token refresh: ${errorMessage}`)
      }

      if (subscribeReq.status !== 202) {
        const responseText = await subscribeReq.text()
        const errorMessage = getTwitchErrorMessage(responseText, 'Unknown error')

        logger.error(`Failed to subscribe ${subscribeReq.status} ${responseText}`, {
          broadcaster_user_id: broadcasterId,
          error: errorMessage,
          type,
        })

        if (
          subscribeReq.status === 403 &&
          AUTHORIZATION_ERROR_TERMS.some((term) => errorMessage.includes(term))
        ) {
          logger.info(`Authorization issue detected, revoking user ${broadcasterId}`, {
            message: errorMessage,
            status: subscribeReq.status,
          })
          revokeEvent({ providerAccountId: broadcasterId })
        }

        if (subscribeReq.status === 400) {
          logger.error('Subscription configuration error', {
            broadcaster_user_id: broadcasterId,
            conduit_id: conduitId,
            response: responseText,
            status: subscribeReq.status,
            type,
          })
        }

        throw new Error(`Subscription failed with status ${subscribeReq.status}: ${errorMessage}`)
      }

      const { data } = subscriptionResponseSchema.parse(await subscribeReq.json())
      const [subscription] = data
      if (subscription === undefined) {
        throw new Error('Twitch returned no subscription after a successful request')
      }

      if (
        broadcasterId === '__proto__' ||
        broadcasterId === 'constructor' ||
        broadcasterId === 'prototype'
      ) {
        logger.error(`Invalid broadcaster_user_id: ${broadcasterId}`, { type })
        return false
      }

      const subscriptions = eventSubMap.get(broadcasterId) ?? {}
      subscriptions[type] = {
        id: subscription.id,
        status: subscription.status,
      }
      eventSubMap.set(broadcasterId, subscriptions)
      return true
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Unknown error: ${String(error)}`, { cause: error })
    }
  })
}

export const subscribeToAuthGrantOrRevoke = async function subscribeToAuthGrantOrRevoke(
  conduitId: string,
  clientId: string
): Promise<boolean> {
  const subscribeToAuthEvent = async function subscribeToAuthEvent(
    eventType: 'user.authorization.revoke' | 'user.authorization.grant'
  ): Promise<boolean> {
    return await rateLimiter.schedule(async (): Promise<boolean> => {
      const headers = await getTwitchHeaders()

      const body = {
        condition: {
          client_id: clientId,
        },
        transport: {
          conduit_id: conduitId,
          method: 'conduit',
        },
        type: eventType,
        version: '1',
      }

      try {
        const subscribeReq = await fetch(EVENTSUB_SUBSCRIPTIONS_URL, {
          body: JSON.stringify(body),
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        })

        if (subscribeReq.status === 409) {
          logger.info(`Subscription already exists for ${eventType}`)
          return true
        }

        if (subscribeReq.status === 401) {
          logger.warn(`Auth failed for ${eventType}, trying with fresh token`)
          const freshHeaders = await getTwitchHeaders(undefined, true)

          const retryReq = await fetch(EVENTSUB_SUBSCRIPTIONS_URL, {
            body: JSON.stringify(body),
            headers: {
              ...freshHeaders,
              'Content-Type': 'application/json',
            },
            method: 'POST',
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
              }
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

  const revokeResult = await subscribeToAuthEvent('user.authorization.revoke')
  const grantResult = await subscribeToAuthEvent('user.authorization.grant')

  return revokeResult && grantResult
}
