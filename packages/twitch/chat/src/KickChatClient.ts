import { Kient } from 'kient'
import totp from 'totp-generator'

import ChatPlatformClient from './ChatPlatformClient.js'
import { getChannels } from './twitch/lib/getChannels.js'

import { MessageCallback } from './index.js'

/**
 * Kick chat client implementation.
 */
export default class KickChatClient extends ChatPlatformClient {
  client: Kient | null = null

  /**
   * Connect to Kick chat.
   */
  async connect() {
    if (!process.env.KICK_EMAIL || !process.env.KICK_PASSWORD || !process.env.KICK_2FA_SECRET) {
      throw new Error('No Kick credentials found')
    }

    try {
      this.client = await Kient.create()

      await this.client.api.authentication.login({
        email: process.env.KICK_EMAIL,
        otc: totp(process.env.KICK_2FA_SECRET),
        password: process.env.KICK_PASSWORD,
      })

      console.log('[KICK] Connected to chat client')
    } catch (e) {
      console.log('[KICK] Could not connect to chat client', e)
    }

    try {
      const channels = await getChannels('kick')
      await Promise.all(channels.map((channel) => this.join(channel)))
    } catch (e) {
      console.log('[KICK] Could not join channels', e)
    }
  }

  /**
   * Send a message to a Kick channel.
   * This might need adjustment based on Kick API capabilities.
   * @param {string} channelId - The channel ID to send the message to.
   * @param {string} message - The message to send.
   */
  async say(channelId: string, message: string) {
    await this.client?.api.chat.sendMessage(channelId, message)
  }

  /**
   * Join a Kick channel.
   * This might be redundant or need adjustment based on Kick API capabilities.
   * @param {string} channel - The channel to join.
   */
  async join(channelSlug: string) {
    try {
      const channel = await this.client?.api.channel.getChannel(channelSlug)
      if (channel?.chatroom?.id) {
        await this.client?.ws.chatroom.listen(channel.chatroom.id)
      }
    } catch (e: any) {
      console.log('[KICK]', e, 'couldnt join kick channel', channelSlug)
    }
  }

  /**
   * Leave a Kick channel.
   * This might be redundant or need adjustment based on Kick API capabilities.
   * @param {string} channel - The channel to leave.
   */
  async part(channel: string) {
    await this.client?.ws.chatroom.disconnect(channel)
  }

  /**
   * Handle incoming messages from Kick.
   * @param {function} callback - The callback function to handle messages.
   */
  onMessage(callback: (msg: MessageCallback) => void) {
    this.client?.on('onMessage', (msg) => {
      const isMod = msg.chatterIs('moderator')
      const isSubscriber = msg.chatterIs('subscriber')
      const isBroadcaster = msg.chatterIs('broadcaster')

      console.log(msg)

      callback({
        provider: 'kick',
        channel: `kick:${msg.chatroom_id.toString()}`,
        user: msg.sender.username,
        text: msg.content,
        channelId: `kick:${msg.chatroom_id.toString()}`,
        userInfo: { isMod, isBroadcaster, isSubscriber },
        messageId: msg.id,
      })
    })
  }

  isKickChannel(channel: string) {
    return channel.includes('kick:')
  }

  cleanKickChannel(channel: string) {
    return channel.split(':')[1] || channel
  }
}
