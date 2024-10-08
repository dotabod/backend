import { twitchChat } from '.'
import { findUserByName } from '../dota/lib/connectedStreamers'
import { isDev } from '../dota/lib/consts.js'
import { getTwitchHeaders } from './lib/getTwitchHeaders'

// Constants
const prefix = isDev ? '[DEV] ' : ''
const headers = await getTwitchHeaders()

// Rate limiting constants
const MAX_WHISPERS_PER_SECOND = 3
const MAX_WHISPERS_PER_MINUTE = 100

// Rate limiting counters and queue
let whispersInLastSecond = 0
let whispersInLastMinute = 0
const whisperQueue: { channel: string; text: string }[] = []

const processQueue = () => {
  if (whisperQueue.length === 0) return

  if (
    whispersInLastSecond < MAX_WHISPERS_PER_SECOND &&
    whispersInLastMinute < MAX_WHISPERS_PER_MINUTE
  ) {
    const { channel, text } = whisperQueue.shift()!
    sendWhisper(channel, text)
  }

  setTimeout(processQueue, 1000 / MAX_WHISPERS_PER_SECOND)
}

const sendWhisper = (channel: string, text: string) => {
  const MAX_WHISPER_LENGTH = 10000
  const chunks = text.match(new RegExp(`.{1,${MAX_WHISPER_LENGTH}}`, 'g')) || []
  chunks.forEach((chunk) => {
    twitchChat.emit('whisper', channel, `${prefix}${chunk}`)
  })

  whispersInLastSecond++
  whispersInLastMinute++

  setTimeout(() => whispersInLastSecond--, 1000)
  setTimeout(() => whispersInLastMinute--, 60000)
}

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
    whisperQueue.push({ channel, text: text || 'Empty whisper message, monka' })
    processQueue()
  },
}
