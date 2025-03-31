import { eventSubMap } from './chatSubIds.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import type { TwitchEventSubResponse } from './interfaces.js'
import { logger } from './twitch/lib/logger.js'
import { rateLimiter } from './utils/rateLimiter.js'
import { revokeEvent } from './twitch/lib/revokeEvent'
import type { TwitchEventTypes } from './TwitchEventTypes.js'
import { checkBotStatus } from './botBanStatus.js'

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
      logger.error(`Failed to subscribe ${subscribeReq.status} ${await subscribeReq.text()}`, {
        type,
      })
      await revokeEvent({ providerAccountId: broadcaster_user_id })
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

export async function subscribeToAuthRevoke(conduit_id: string, client_id: string) {
  return rateLimiter.schedule(async () => {
    const body = {
      type: 'user.authorization.revoke' as const,
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
      logger.info('Subscription already exists for user.authorization.revoke')
      return true
    }

    if (subscribeReq.status !== 202) {
      logger.error(`Failed to subscribe ${subscribeReq.status} ${await subscribeReq.text()}`, {
        type: 'user.authorization.revoke',
      })
      return false
    }

    return true
  })
}
