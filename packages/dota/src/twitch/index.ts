import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import {
  EventSubChannelPollBeginEvent,
  EventSubChannelPollEndEvent,
  EventSubChannelPollProgressEvent,
  EventSubChannelPredictionBeginEvent,
  EventSubChannelPredictionEndEvent,
  EventSubChannelPredictionLockEvent,
  EventSubChannelPredictionProgressEvent,
} from '@twurple/eventsub-base'
import { t } from 'i18next'

import getDBUser from '../db/get-db-user'
import findUser, { getTokenFromTwitchId } from '../dota/lib/connected-streamers'
import { plebMode } from '../dota/lib/consts'
import { getDotabodRankProfile, getRankTitle } from '../dota/lib/ranks'
import { server } from '../dota/server'
import { DBSettings, getValueOrDefault } from '../settings'
import { twitchChat } from '../steam/ws'
import type { SocketClient } from '../types'
import { chatClient } from './chat-client'
import { checkAltAccount } from './check-alt-account'
import { commandHandler } from './command-catalog.js'

// Map to track the last time a rank warning message was sent to a channel
const lastRankWarningTimestamps: Record<string, number> = {}
// 30 seconds
const RANK_WARNING_COOLDOWN_MS = 30_000

let disableAltAccountCheck = true

logger.info("Starting 'twitch' package")

twitchChat.on('connect', () => {
  logger.info('We alive on dotabod chat server!')
})

twitchChat.on('disconnect', (reason, details) => {
  logger.warn('Disconnected from dotabod chat server', { details, reason })
})

const getUserRankTier = async function getUserRankTier(
  twitchUsername: string
): Promise<number | null> {
  try {
    const profile = await getDotabodRankProfile(twitchUsername)
    return profile?.rank_tier ?? 0
  } catch (error) {
    logger.warn('[TWITCH] Could not look up chatter rank', { error, twitchUsername })
    return null
  }
}

const enforceRankRequirement = async function enforceRankRequirement({
  channel,
  channelId,
  client,
  messageId,
  user,
  userId,
}: {
  channel: string
  channelId: string
  client: SocketClient
  messageId: string
  user: string
  userId: string
}): Promise<boolean> {
  const rankOnlySettings = getValueOrDefault(
    DBSettings.rankOnly,
    client.settings,
    client.subscription
  )
  if (!rankOnlySettings.enabled) {
    return false
  }

  const userRankTier = await getUserRankTier(user)
  if (userRankTier === null || userRankTier >= rankOnlySettings.minimumRankTier) {
    return false
  }

  const requiredRank =
    rankOnlySettings.minimumRank || getRankTitle(rankOnlySettings.minimumRankTier)
  try {
    const botId = process.env.TWITCH_BOT_PROVIDERID
    if (botId === undefined || botId.length === 0) {
      throw new Error('TWITCH_BOT_PROVIDERID is required for rank-only moderation')
    }
    const api = await getTwitchAPI(botId)
    await api.asUser(botId, async (ctx) => {
      await ctx.moderation.banUser(channelId, {
        duration: 30,
        reason: t('rankOnlyMode', {
          lng: client.locale || 'en',
          name: user,
          requiredRank,
          url: 'dotabod.com/verify',
        }),
        user: userId,
      })
    })
  } catch (error) {
    logger.error('[TWITCH] Failed to delete message or timeout user', {
      channel,
      error,
      messageId,
      user,
    })
  }

  const now = Date.now()
  const lastWarningTime = lastRankWarningTimestamps[channel] || 0

  if (now - lastWarningTime > RANK_WARNING_COOLDOWN_MS) {
    const userRank = getRankTitle(userRankTier)

    chatClient.say(
      channel,
      t('rankOnlyMode', {
        lng: client.locale || 'en',
        name: user,
        requiredRank,
        url: 'dotabod.com/verify',
        userRank: userRank || 'Uncalibrated',
      })
    )

    lastRankWarningTimestamps[channel] = now
  }
  return true
}

const lastMissingUserMessageTimestamps: Record<string, number> = {}

twitchChat.on(
  'msg',
  async (
    channel: string,
    user: string,
    text: string,
    {
      channelId,
      userInfo,
      messageId,
    }: {
      channelId: string
      userInfo: {
        isMod: boolean
        isBroadcaster: boolean
        isSubscriber: boolean
        userId: string
      }
      messageId: string
    }
  ) => {
    if (!channelId) {
      logger.error('No channelId', { channel, text, user })
      return
    }

    // Skip rank check for mods and broadcasters
    const isStaff = userInfo.isMod || userInfo.isBroadcaster

    // So we can get the users settings cuz some commands are disabled
    // This runs every command, but its cached so no hit on db
    const { result: client, reason } = await getDBUser({ twitchId: channelId })
    if (!client) {
      const now = Date.now()
      const lastMessageTime = lastMissingUserMessageTimestamps[channel] || 0
      const RATE_LIMIT_MS = 10_000
      const shouldSendMessage = now - lastMessageTime > RATE_LIMIT_MS

      if (shouldSendMessage && text.startsWith('!')) {
        logger.info('[TWITCH] Missing user', { channel, channelId, reason, user })
        chatClient.say(channel, t('missingUser', { lng: 'en' }))
        lastMissingUserMessageTimestamps[channel] = now
        return
      }
      // logger.error('No client', { channel, user, text, reason, channelId })
      return
    }

    if (lastMissingUserMessageTimestamps[channel]) {
      delete lastMissingUserMessageTimestamps[channel]
    }

    if (text === '!altcheck' && (userInfo.userId === '32474777' || isStaff)) {
      disableAltAccountCheck = !disableAltAccountCheck
      return
    }

    // Looks up the chatter's followage date, and their Twitch account creation date, and if its within 10 days of each other, sends a message replying to them
    // Only check this for now
    const shouldCheckAltAccount = !disableAltAccountCheck && channelId === '40754777'
    if (shouldCheckAltAccount) {
      await checkAltAccount(channel, user, channelId, userInfo, messageId, client)
    }

    if (
      !isStaff &&
      (await enforceRankRequirement({
        channel,
        channelId,
        client,
        messageId,
        user,
        userId: userInfo.userId,
      }))
    ) {
      return
    }

    // Letting one pleb in
    if (
      plebMode.has(channelId) &&
      !(userInfo.isMod || userInfo.isBroadcaster || userInfo.isSubscriber)
    ) {
      plebMode.delete(channelId)
      const api = await getTwitchAPI(process.env.TWITCH_BOT_PROVIDERID)
      await api.asUser(process.env.TWITCH_BOT_PROVIDERID!, async (ctx) => {
        await ctx.chat.updateSettings(channelId, {
          emoteOnlyModeEnabled: false,
          subscriberOnlyModeEnabled: true,
        })
      })
      chatClient.say(
        channel,
        t('pleb', { context: 'off', emote: 'EZ Clap', lng: 'en', name: user })
      )
      return
    }

    if (!text.startsWith('!')) {
      return
    }

    // to address v7 twurple removing #, but my db having # for command stats
    // add a hashtag to the beginning of the channel name if its not there already
    const channelName = channel.startsWith('#') ? channel : `#${channel}`
    await commandHandler.handleMessage({
      channel: { client, id: channelId, name: channelName, settings: client.settings },
      content: text,
      user: {
        messageId,
        name: user,
        permission: userInfo.isBroadcaster ? 3 : userInfo.isMod ? 2 : userInfo.isSubscriber ? 1 : 0,
        userId: userInfo.userId,
      },
    })
  }
)

const events = {
  subscribeToChannelPollBeginEvents: EventSubChannelPollBeginEvent,
  subscribeToChannelPollEndEvents: EventSubChannelPollEndEvent,
  subscribeToChannelPollProgressEvents: EventSubChannelPollProgressEvent,
  subscribeToChannelPredictionBeginEvents: EventSubChannelPredictionBeginEvent,
  subscribeToChannelPredictionEndEvents: EventSubChannelPredictionEndEvent,
  subscribeToChannelPredictionLockEvents: EventSubChannelPredictionLockEvent,
  subscribeToChannelPredictionProgressEvents: EventSubChannelPredictionProgressEvent,
}

twitchChat.on('event', (eventName: keyof typeof events, broadcasterId: string, data: unknown) => {
  // Can start doing something with the events

  const token = getTokenFromTwitchId(broadcasterId)
  if (token === null || token.length === 0) {
    return
  }

  const client = findUser(token)
  if (!client) {
    return
  }

  const isEnabled = getValueOrDefault(DBSettings.livePolls, client.settings, client.subscription)
  if (!isEnabled) {
    return
  }

  server.io.to(token).emit('channelPollOrBet', data, eventName)
})
