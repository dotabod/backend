import { twitchChat } from '.'
import { findUserByName } from '../dota/lib/connectedStreamers'
import { isDev } from '../dota/lib/consts.js'
import { getTwitchHeaders } from './lib/getTwitchHeaders'

// Constants
const prefix = isDev ? '[DEV] ' : ''
const headers = await getTwitchHeaders()

// Chat client object
export const chatClient = {
  join: (channel: string) => {
    twitchChat.emit('join', channel)
  },
  part: (channel: string) => {
    twitchChat.emit('part', channel)
  },
  say: async (channel: string, text: string) => {
    // New API is in beta, so only dev enabled for now
    if (isDev) {
      const user = findUserByName(channel.toLowerCase().replace('#', ''))
      const hasNewestScopes = user?.Account?.scope?.includes('channel:bot')

      if (hasNewestScopes) {
        const newPrefix = prefix ? `${prefix}[NEW-API] ` : prefix
        void fetch('https://api.twitch.tv/helix/chat/messages', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            broadcaster_id: user?.Account?.providerAccountId,
            sender_id: process.env.TWITCH_BOT_PROVIDERID,
            message: `${newPrefix}${text}`,
          }),
        })
        return
      }
    }

    twitchChat.emit('say', channel, `${prefix}${text}`)
  },
  whisper: (channel: string, text: string | undefined) => {
    const MAX_WHISPER_LENGTH = 10000
    if (!text) {
      return twitchChat.emit('whisper', channel, 'Empty whisper message, monka')
    }
    const chunks = text.match(new RegExp(`.{1,${MAX_WHISPER_LENGTH}}`, 'g')) || []
    chunks.forEach((chunk) => {
      twitchChat.emit('whisper', channel, `${prefix}${chunk}`)
    })
  },
}
