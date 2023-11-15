// path/filename: src/chat/TwitchChatClient.js

import { ChatClient } from '@twurple/chat'

import ChatPlatformClient from './ChatPlatformClient.js'
import { disableChannel } from './db/disableChannel.js'
import { getBotAuthProvider } from './twitch/lib/getBotAuthProvider.js'
import { getChannels } from './twitch/lib/getChannels.js'

import { MessageCallback } from './index'

/**
 * Twitch chat client implementation.
 */
export default class TwitchChatClient extends ChatPlatformClient {
  client: ChatClient | null

  cantJoinReasons = ['msg_banned', 'msg_banned_phone_number_alias', 'msg_channel_suspended']

  constructor() {
    super()
    this.client = null
  }

  /**
   * Connect to Twitch chat.
   */
  async connect() {
    this.client = new ChatClient({
      isAlwaysMod: true,
      botLevel: process.env.NODE_ENV === 'production' ? 'verified' : undefined,
      authProvider: await getBotAuthProvider(),
      channels: getChannels,
      webSocket: true,
    })

    await this.client.connect()
    this.setupEventHandlers()
    console.log('[TWITCH] Connected to chat client')
  }

  /**
   * Send a message to a Twitch channel.
   * @param {string} channel - The channel to send the message to.
   * @param {string} message - The message to send.
   */
  async say(channel: string, message: string) {
    await this.client?.say(channel, message)
  }

  /**
   * Join a Twitch channel.
   * @param {string} channel - The channel to join.
   */
  async join(channel: string) {
    try {
      await this.client?.join(channel)
    } catch (e: any) {
      if (this.cantJoinReasons.includes(e.toString())) {
        await disableChannel(channel)
      }
    }
  }

  /**
   * Leave a Twitch channel.
   * @param {string} channel - The channel to leave.
   */
  part(channel: string) {
    this.client?.part(channel)
  }

  setupEventHandlers() {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.client?.onJoinFailure(async (channel, reason) => {
      if (this.cantJoinReasons.includes(reason)) {
        await disableChannel(channel)
      }

      console.log('Failed to join channel', channel, reason)
    })
  }

  /**
   * Handle incoming messages from Twitch.
   * @param {function} callback - The callback function to handle messages.
   */
  onMessage(callback: (msg: MessageCallback) => void) {
    this.client?.onMessage((channel, user, text, msg) => {
      const {
        channelId,
        userInfo: { isMod, isBroadcaster, isSubscriber },
        id: messageId,
      } = msg

      // Forward the message to the Dota node app
      callback({
        provider: 'twitch',
        channel,
        user,
        text,
        channelId,
        userInfo: { isMod, isBroadcaster, isSubscriber },
        messageId,
      })
    })
  }
}
