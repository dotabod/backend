import { OAuth2Client } from 'google-auth-library'
import { google, youtube_v3 } from 'googleapis'

import { getChannels } from './twitch/lib/getChannels.js'

export default class YouTubeChatClient {
  client: youtube_v3.Youtube | null = null
  auth: OAuth2Client | null = null

  constructor() {
    this.auth = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI,
    )
    this.client = google.youtube({ version: 'v3', auth: this.auth })
  }

  /**
   * Connect to YouTube using OAuth2.
   */
  connect() {
    // TODO: use db to retrieve tokens
    if (!process.env.YOUTUBE_ACCESS_TOKEN || !process.env.YOUTUBE_REFRESH_TOKEN) {
      throw new Error('No YouTube credentials found')
    }

    this.auth?.setCredentials({
      access_token: process.env.YOUTUBE_ACCESS_TOKEN,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
    })

    // Additional logic to refresh token or handle authentication flow can be added here
    console.log('[YOUTUBE] Connected to YouTube API')
  }

  async say(liveChatId: string, message: string) {
    if (!this.client) {
      throw new Error('YouTube client not initialized')
    }

    try {
      await this.client.liveChatMessages.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            liveChatId: liveChatId,
            type: 'textMessageEvent',
            textMessageDetails: {
              messageText: message,
            },
          },
        },
      })

      console.log(`[YOUTUBE] Sent message to chat: ${liveChatId}`)
    } catch (e) {
      console.error('[YOUTUBE] Error sending message:', e)
    }
  }

  async join(liveChatId: string, callback: (msg: any) => void) {
    console.log(`[YOUTUBE] Joined chat: ${liveChatId}`)
    await this.pollMessages(liveChatId, callback)
  }

  private async pollMessages(liveChatId: string, callback: (msg: any) => void) {
    try {
      const response = await this.client?.liveChatMessages.list({
        liveChatId: liveChatId,
        part: ['snippet', 'authorDetails'],
        maxResults: 50, // Adjust as needed
      })

      response?.data.items?.forEach((item) => {
        console.log(item)
        callback(item)
      })

      // Set next polling interval based on response details
      setTimeout(
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => await this.pollMessages(liveChatId, callback),
        response?.data.pollingIntervalMillis || 10000,
      )
    } catch (e) {
      console.error('[YOUTUBE] Error in message polling:', e)
      // Handle error and possibly adjust polling strategy
    }
  }

  async onMessage(callback: (msg: any) => void) {
    try {
      const channels = await getChannels('youtube')
      await Promise.all(channels.map((channel) => this.join(channel, callback)))
    } catch (e) {
      console.log('[YOUTUBE] Could not join channels', e)
    }
  }
}
