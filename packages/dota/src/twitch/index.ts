import './commandLoader.js'

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
import { io as socketIo } from 'socket.io-client'
import getDBUser from '../db/getDBUser.js'
import findUser, { getTokenFromTwitchId } from '../dota/lib/connectedStreamers.js'
import { plebMode } from '../dota/lib/consts.js'
import { getOpenDotaProfile, getRankTitle } from '../dota/lib/ranks.js'
import { server } from '../dota/server.js'
import { DBSettings, getValueOrDefault } from '../settings.js'
import { twitchChat } from '../steam/ws.js'
import { chatClient } from './chatClient.js'
import { checkAltAccount } from './checkAltAccount.js'
import commandHandler from './lib/CommandHandler.js'

// Map to track the last time a rank warning message was sent to a channel
const lastRankWarningTimestamps: Record<string, number> = {}
const RANK_WARNING_COOLDOWN_MS = 30000 // 30 seconds

logger.info("Starting 'twitch' package")

twitchChat.on('connect', () => {
  logger.info('We alive on dotabod chat server!')
})

twitchChat.on('disconnect', (reason, details) => {
  logger.warn('Disconnected from dotabod chat server', { reason, details })
})

// Function to check if a user meets the rank requirement
async function getUserRankTier(twitchUsername: string): Promise<number> {
  try {
    const profile = await getOpenDotaProfile(twitchUsername)
    return profile?.rank_tier || 0
  } catch (_error) {
    return 0
  }
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
    },
  ) => {
    if (!channelId) {
      logger.error('No channelId', { channel, user, text })
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
      const RATE_LIMIT_MS = 10000
      const shouldSendMessage = now - lastMessageTime > RATE_LIMIT_MS

      if (shouldSendMessage && text.startsWith('!')) {
        logger.info('[TWITCH] Missing user', { channelId, channel, user, reason })
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

    // Looks up the chatter's followage date, and their Twitch account creation date, and if its within 10 days of each other, sends a message replying to them
    const shouldCheckAltAccount = `${channelId}` === '40754777' // Only check this for now
    if (shouldCheckAltAccount) {
      await checkAltAccount(channel, user, channelId, userInfo, messageId, client)
    }

    // Check if rankOnly mode is enabled
    const rankOnlySettings = getValueOrDefault(
      DBSettings.rankOnly,
      client.settings,
      client.subscription,
    )

    // If rankOnly is enabled and the user isn't staff, check their rank
    if (rankOnlySettings.enabled && !isStaff) {
      // Check the user's rank
      const userRankTier = await getUserRankTier(user)

      // If they don't meet the rank requirement, delete the message
      if (userRankTier < rankOnlySettings.minimumRankTier) {
        try {
          const api = await getTwitchAPI(process.env.TWITCH_BOT_PROVIDERID!)

          // Do this as the bot which should be a moderator in the channel
          await api.asUser(process.env.TWITCH_BOT_PROVIDERID!, async (ctx) => {
            const requiredRank =
              rankOnlySettings.minimumRank || getRankTitle(rankOnlySettings.minimumRankTier)
            await ctx.moderation.banUser(channelId, {
              user: userInfo.userId,
              duration: 30,
              reason: t('rankOnlyMode', {
                url: 'dotabod.com/verify',
                name: user,
                requiredRank,
                lng: client.locale || 'en',
              }),
            })
          })
        } catch (e) {
          logger.error('[TWITCH] Failed to delete message or timeout user', {
            error: e,
            channel,
            user,
            messageId,
          })
        }

        // Send a warning message, but with rate limiting PER CHANNEL
        const now = Date.now()
        const lastWarningTime = lastRankWarningTimestamps[channel] || 0

        if (now - lastWarningTime > RANK_WARNING_COOLDOWN_MS) {
          const requiredRank =
            rankOnlySettings.minimumRank || getRankTitle(rankOnlySettings.minimumRankTier)
          const userRank = getRankTitle(userRankTier)

          chatClient.say(
            channel,
            t('rankOnlyMode', {
              url: 'dotabod.com/verify',
              name: user,
              requiredRank,
              userRank: userRank || 'Uncalibrated',
              lng: client.locale || 'en',
            }),
          )

          lastRankWarningTimestamps[channel] = now
        }

        return
      }
    }

    // Letting one pleb in
    if (
      plebMode.has(channelId) &&
      !(userInfo.isMod || userInfo.isBroadcaster || userInfo.isSubscriber)
    ) {
      plebMode.delete(channelId)
      const api = await getTwitchAPI(process.env.TWITCH_BOT_PROVIDERID!)
      await api.asUser(process.env.TWITCH_BOT_PROVIDERID!, async (ctx) => {
        await ctx.chat.updateSettings(channelId, {
          emoteOnlyModeEnabled: false,
          subscriberOnlyModeEnabled: true,
        })
      })
      chatClient.say(
        channel,
        t('pleb', { emote: 'EZ Clap', context: 'off', name: user, lng: 'en' }),
      )
      return
    }

    if (!text.startsWith('!')) return

    const isBotDisabled = getValueOrDefault(
      DBSettings.commandDisable,
      client.settings,
      client.subscription,
    )
    const toggleCommand = commandHandler.commands.get('toggle')
    if (
      isBotDisabled &&
      !toggleCommand?.aliases?.includes(text.replace('!', '').split(' ')[0]) &&
      text.split(' ')[0] !== '!toggle'
    ) {
      logger.info('Bot is disabled', { channel, user, text })
      return
    }

    // Handle the incoming message using the command handler
    // to address v7 twurple removing #, but my db having # for command stats
    // add a hashtag to the beginning of the channel name if its not there already
    const channelName = channel.startsWith('#') ? channel : `#${channel}`
    await commandHandler.handleMessage({
      channel: { name: channelName, id: channelId, client, settings: client.settings },
      user: {
        messageId: messageId,
        name: user,
        userId: userInfo.userId,
        permission: userInfo.isBroadcaster ? 3 : userInfo.isMod ? 2 : userInfo.isSubscriber ? 1 : 0,
      },
      content: text,
    })
  },
)

const events = {
  subscribeToChannelPredictionBeginEvents: EventSubChannelPredictionBeginEvent,
  subscribeToChannelPredictionProgressEvents: EventSubChannelPredictionProgressEvent,
  subscribeToChannelPredictionLockEvents: EventSubChannelPredictionLockEvent,
  subscribeToChannelPredictionEndEvents: EventSubChannelPredictionEndEvent,
  subscribeToChannelPollBeginEvents: EventSubChannelPollBeginEvent,
  subscribeToChannelPollProgressEvents: EventSubChannelPollProgressEvent,
  subscribeToChannelPollEndEvents: EventSubChannelPollEndEvent,
}

twitchChat.on('event', (eventName: keyof typeof events, broadcasterId: string, data: any) => {
  // Can start doing something with the events

  const token = getTokenFromTwitchId(broadcasterId)
  if (!token) return

  const client = findUser(token)
  if (!client) return

  const isEnabled = getValueOrDefault(DBSettings.livePolls, client.settings, client.subscription)
  if (!isEnabled) return

  server.io.to(token).emit('channelPollOrBet', data, eventName)
})

export const twitchEvent = socketIo(`ws://${process.env.HOST_TWITCH_EVENTS}:5015`)
twitchEvent.on('connect', () => {
  logger.info('We alive on dotabod twitch events server!')
})
