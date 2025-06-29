import { findUserByName } from '../dota/lib/connectedStreamers.js'
import { DBSettings, getValueOrDefault } from '../settings.js'
import { twitchChat } from '../steam/ws.js'

// Rate limiting constants
const MAX_WHISPERS_PER_SECOND = 3
const MAX_WHISPERS_PER_MINUTE = 100

// Rate limiting counters and queue
let whispersInLastSecond = 0
let whispersInLastMinute = 0
const whisperQueue: { channel: string; text: string }[] = []
let processingQueue = false

const processQueue = async () => {
  if (processingQueue || whisperQueue.length === 0) return
  processingQueue = true

  while (whisperQueue.length > 0) {
    if (
      whispersInLastSecond < MAX_WHISPERS_PER_SECOND &&
      whispersInLastMinute < MAX_WHISPERS_PER_MINUTE
    ) {
      const { channel, text } = whisperQueue.shift()!
      sendWhisper(channel, text)

      // Wait for rate limit period before processing next message
      await new Promise((resolve) => setTimeout(resolve, 1000 / MAX_WHISPERS_PER_SECOND))
    } else {
      // Wait until we're under the rate limit again
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  processingQueue = false
}

const sendWhisper = (channel: string, text: string) => {
  const MAX_WHISPER_LENGTH = 10000
  const chunks = text.match(new RegExp(`.{1,${MAX_WHISPER_LENGTH}}`, 'g')) || []

  chunks.forEach((chunk) => {
    twitchChat.emit('whisper', channel, chunk)
  })

  whispersInLastSecond++
  whispersInLastMinute++

  setTimeout(() => whispersInLastSecond--, 1000)
  setTimeout(() => whispersInLastMinute--, 60000)
}

// Chat client object
export const chatClient = {
  say: async (
    channel: string,
    text: string,
    reply_parent_message_id?: string,
    bypassDisableCheck = false,
  ) => {
    const user = findUserByName(channel.toLowerCase().replace('#', ''))
    const hasNewestScopes = user?.Account?.scope?.includes('channel:bot')

    if (hasNewestScopes && user?.Account?.providerAccountId) {
      // Check if account is disabled before emitting chat message (unless bypassed)
      if (!bypassDisableCheck) {
        const isDisabled = getValueOrDefault(
          DBSettings.commandDisable,
          user.settings,
          user.subscription,
        )
        if (isDisabled) return
      }

      twitchChat.emit('say', user?.Account?.providerAccountId, text, reply_parent_message_id)
    }
  },
  whisper: (channel: string, text: string | undefined) => {
    whisperQueue.push({ channel, text: text || 'Empty whisper message, monka' })
    processQueue()
  },
}
