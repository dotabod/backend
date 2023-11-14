// path/filename: src/chat/KickChatClient.js

import { Kient } from 'kient'

import ChatPlatformClient from './ChatPlatformClient'

import { MessageCallback } from '.'

/**
 * Kick chat client implementation.
 */
export default class KickChatClient extends ChatPlatformClient {
  client: Kient | null

  constructor() {
    super()
    this.client = null
  }

  /**
   * Connect to Kick chat.
   */
  async connect() {
    this.client = await Kient.create()
    await this.client.api.authentication.login({
      email: 'info@x.com', // Replace with actual credentials or configuration
      password: 'x', // Replace with actual credentials or configuration
    })

    console.log('[KICK] Connected to chat client')
  }

  /**
   * Send a message to a Kick channel.
   * This might need adjustment based on Kick API capabilities.
   * @param {string} channel - The channel to send the message to.
   * @param {string} message - The message to send.
   */
  async say(channel: string, message: string) {
    // Implementation depends on Kick API's capabilities
  }

  /**
   * Join a Kick channel.
   * This might be redundant or need adjustment based on Kick API capabilities.
   * @param {string} channel - The channel to join.
   */
  async join(channelSlug: string) {
    try {
      const channel = await this.client?.api.channel.getChannel(channelSlug)
      if (channel) await this.client?.ws.chatroom.listen(channel.chatroom.id)
    } catch (e: any) {
      console.log(e, 'couldnt join kick channel')
    }
  }

  /**
   * Leave a Kick channel.
   * This might be redundant or need adjustment based on Kick API capabilities.
   * @param {string} channel - The channel to leave.
   */
  async part(channel: string) {
    // Implementation depends on Kick API's capabilities
    // TODO
  }

  /**
   * Handle incoming messages from Kick.
   * @param {function} callback - The callback function to handle messages.
   */
  onMessage(callback: (msg: MessageCallback) => void) {
    this.client?.on('onMessage', (msg) => {
      const isMod = false // TODO
      const isSubscriber = false // TODO
      const isBroadcaster = false // TODO

      // Forward the message to the Dota node app
      callback({
        channel: msg.chatroom_id.toString(), // TODO username of channel
        user: msg.sender.username,
        text: msg.content,
        channelId: msg.chatroom_id.toString(),
        userInfo: { isMod, isBroadcaster, isSubscriber },
        messageId: msg.id,
      })
    })
  }
}
