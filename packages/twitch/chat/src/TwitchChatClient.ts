// path/filename: src/chat/TwitchChatClient.js

import { ChatClient } from '@twurple/chat'

import ChatPlatformClient from './ChatPlatformClient'
import { getBotAuthProvider } from './twitch/lib/getBotAuthProvider'
import { getChannels } from './twitch/lib/getChannels'

/**
 * Twitch chat client implementation.
 */
export default class TwitchChatClient extends ChatPlatformClient {
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
    console.log('[TWITCH] Connected to chat client')
  }

  /**
   * Send a message to a Twitch channel.
   * @param {string} channel - The channel to send the message to.
   * @param {string} message - The message to send.
   */
  async say(channel, message) {
    await this.client.say(channel, message)
  }

  /**
   * Join a Twitch channel.
   * @param {string} channel - The channel to join.
   */
  async join(channel) {
    await this.client.join(channel)
  }

  /**
   * Leave a Twitch channel.
   * @param {string} channel - The channel to leave.
   */
  async part(channel) {
    await this.client.part(channel)
  }

  /**
   * Handle incoming messages from Twitch.
   * @param {function} callback - The callback function to handle messages.
   */
  onMessage(callback) {
    this.client.on('message', callback)
  }
}
