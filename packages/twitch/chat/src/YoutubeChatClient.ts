import { OAuth2Client } from 'google-auth-library'
import { google, youtube_v3 } from 'googleapis'

import supabase from './db/supabase.js'
import fetchLiveChatId from './fetchYouTubeData.js'
import { getChannels } from './twitch/lib/getChannels.js'

import { MessageCallback } from './index.js'

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
  async connect() {
    const dotabodChatter = await supabase
      .from('accounts')
      .select('access_token,refresh_token,provider')
      .match({ providerAccountId: '110967312833250495548', provider: 'google' })
      .single()

    if (!dotabodChatter?.data) {
      throw new Error('No YouTube credentials found')
    }

    this.auth?.setCredentials({
      access_token: dotabodChatter?.data.access_token,
      refresh_token: dotabodChatter?.data.refresh_token,
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

  private async join(liveChatId: string, callback: (msg: MessageCallback) => void) {
    try {
      const response = await this.client?.liveChatMessages.list({
        liveChatId: liveChatId,
        part: ['snippet', 'authorDetails'],
        maxResults: 50, // Adjust as needed
      })

      response?.data.items?.forEach((item) => {
        const msg = {
          channel: `youtube:${liveChatId}`,
          user: item.authorDetails?.displayName || '',
          text: item.snippet?.displayMessage || '',
          channelId: `youtube:${liveChatId}` || '',
          userInfo: {
            isMod: item.authorDetails?.isChatModerator || false,
            isBroadcaster: item.authorDetails?.isChatOwner || false,
            isSubscriber: item.authorDetails?.isChatSponsor || false,
          },
          messageId: item.id || '',
          provider: 'youtube' as const,
        }
        callback(msg)
      })

      // Set next polling interval based on response details
      setTimeout(
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => await this.join(liveChatId, callback),
        response?.data.pollingIntervalMillis || 10000,
      )
    } catch (e) {
      console.error('[YOUTUBE] Error in message polling:', e)
      // Handle error and possibly adjust polling strategy
    }
  }

  async onMessage(callback: (msg: MessageCallback) => void) {
    try {
      const liveChatIdPromises: Promise<string | null | undefined>[] = []
      const channels = await getChannels('youtube')
      channels.forEach((user) => {
        const provider = Array.isArray(user.accounts)
          ? user.accounts.find((p) => p.provider === 'google')
          : user.accounts.provider === 'google'
            ? user.accounts
            : null
        if (provider)
          liveChatIdPromises.push(fetchLiveChatId(provider?.access_token, provider?.refresh_token))
      })
      const liveChatIds = await Promise.all(liveChatIdPromises)
      await Promise.all(
        liveChatIds.map((liveChatId) => {
          if (liveChatId) {
            console.log('[YOUTUBE] Joining channel', liveChatId)
            return this.join(liveChatId, callback)
          }
          return false
        }),
      )
    } catch (e) {
      console.log('[YOUTUBE] Could not join channels', e)
    }
  }
}
