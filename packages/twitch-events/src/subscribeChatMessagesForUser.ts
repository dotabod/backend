import { checkBotStatus, logger } from '@dotabod/shared-utils'
import { getTwitchHeaders } from '@dotabod/shared-utils'
import type { TwitchEventTypes } from './TwitchEventTypes.js'
import { eventSubMap } from './chatSubIds.js'
import type { TwitchEventSubResponse } from './interfaces.js'
import { revokeEvent } from './twitch/lib/revokeEvent.js'
import { rateLimiter } from './utils/rateLimiterCore.js'

// Constants
const headers = await getTwitchHeaders()

const botUserId = process.env.TWITCH_BOT_PROVIDERID
if (!botUserId) {
  throw new Error('Bot user id not found')
}

export async function genericSubscribe(
  conduit_id: string,
  broadcaster_user_id: string,
  type: keyof TwitchEventTypes,
) {
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

  return rateLimiter.schedule(async () => {
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

    if (subscribeReq.status !== 202) {
      const responseText = await subscribeReq.text()
      logger.error(`Failed to subscribe ${subscribeReq.status} ${responseText}`, {
        type,
      })

      // Only trigger revocation for auth-related errors (401, 403)
      // NOT for bad requests (400) which are usually configuration issues
      if (subscribeReq.status === 401 || subscribeReq.status === 403) {
        // These status codes indicate authentication/authorization issues
        const responseData = responseText.length ? JSON.parse(responseText) : {}

        // Double check that this is truly an authorization issue
        if (
          responseData.message?.includes('authorization') ||
          responseData.message?.includes('access') ||
          responseData.message?.includes('permission') ||
          responseData.message?.includes('scope')
        ) {
          logger.info(`Authorization issue detected, revoking user ${broadcaster_user_id}`, {
            status: subscribeReq.status,
            message: responseData.message,
          })
          await revokeEvent({ providerAccountId: broadcaster_user_id })
        }
      } else if (subscribeReq.status === 400) {
        // Log configuration errors differently to make them more visible
        logger.error('Subscription configuration error', {
          status: subscribeReq.status,
          response: responseText,
          broadcaster_user_id,
          type,
          conduit_id,
        })
      }

      return false
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
  })
}
export async function subscribeToAuthGrantOrRevoke(conduit_id: string, client_id: string) {
  const subscribeToAuthEvent = async (
    eventType: 'user.authorization.revoke' | 'user.authorization.grant',
  ) => {
    return rateLimiter.schedule(async () => {
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

      if (subscribeReq.status !== 202) {
        logger.error(`Failed to subscribe ${subscribeReq.status} ${await subscribeReq.text()}`, {
          type: eventType,
        })
        return false
      }

      return true
    })
  }

  // Subscribe to both revoke and grant events
  const revokeResult = await subscribeToAuthEvent('user.authorization.revoke')
  const grantResult = await subscribeToAuthEvent('user.authorization.grant')

  return revokeResult && grantResult
}
