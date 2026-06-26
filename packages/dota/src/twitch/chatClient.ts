import { findUserByName } from '../dota/lib/connectedStreamers'
import { DBSettings, getValueOrDefault } from '../settings'
import { twitchChat } from '../steam/ws'
import { suggestionContext } from './lib/suggestionContext'

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
  say: (
    channel: string,
    text: string,
    reply_parent_message_id?: string,
    bypassDisableCheck = false,
  ): void => {
    const user = findUserByName(channel.toLowerCase().replace('#', ''))
    const hasNewestScopes = user?.Account?.scope?.includes('channel:bot')

    if (hasNewestScopes && user?.Account?.providerAccountId) {
      if (!bypassDisableCheck) {
        const isDisabled = getValueOrDefault(
          DBSettings.commandDisable,
          user.settings,
          user.subscription,
        )
        if (isDisabled) return
      }

      // Consume a pending command-suggestion suffix from the active command
      // context (set by CommandHandler.handleMessage). Appended to the first
      // outgoing message so we don't send a separate "Also try !x" line.
      const ctx = suggestionContext.getStore()
      let finalText = text
      if (ctx?.suffix) {
        finalText = `${text} · ${ctx.suffix}`
        ctx.suffix = null
      }

      twitchChat.emit('say', user?.Account?.providerAccountId, finalText, reply_parent_message_id)
    }
  },
  // Like `say`, but drops any pending command-suggestion suffix first. For
  // "nothing to show" replies (e.g. the auto-clipping-disabled note) where a
  // trailing "Also try !x" would point viewers at an equally-dataless sibling.
  sayWithoutSuggestion: (channel: string, text: string, reply_parent_message_id?: string): void => {
    const ctx = suggestionContext.getStore()
    if (ctx) ctx.suffix = null
    chatClient.say(channel, text, reply_parent_message_id)
  },
  whisper: (channel: string, text: string | undefined) => {
    whisperQueue.push({ channel, text: text || 'Empty whisper message, monka' })
    void processQueue()
  },
}
