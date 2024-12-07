import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ApiClient } from '@twurple/api'
import { use } from 'i18next'
import FsBackend, { type FsBackendOptions } from 'i18next-fs-backend'
import { Server } from 'socket.io'
import { getTwitchHeaders, initializeSocket } from './chatClientv2.js'
import { twitchEvent } from './events.ts.js'
import { getBotAuthProvider } from './twitch/lib/getBotAuthProvider.js'

/**
 * Response structure from Twitch chat message API
 * @property data Array of message results
 */
interface TwitchChatResponse {
  data: Array<{
    /** Unique identifier for the sent message */
    message_id: string
    /** Whether the message was successfully sent */
    is_sent: boolean
    /** Details about why a message was dropped, if applicable */
    drop_reason?: {
      /** Error code for the dropped message */
      code: string
      /** Human readable explanation for why the message was dropped */
      message: string
    }
  }>
}

// Constants
const headers = await getTwitchHeaders()

await use(FsBackend).init<FsBackendOptions>({
  initImmediate: false,
  lng: 'en',
  fallbackLng: 'en',
  preload: readdirSync(join('./locales')).filter((fileName: string) => {
    const joinedPath = join(join('./locales'), fileName)
    return lstatSync(joinedPath).isDirectory()
  }),
  defaultNS: 'translation',
  backend: {
    loadPath: join('./locales/{{lng}}/{{ns}}.json'),
  },
})

console.log('Loaded i18n for chat')

// chat v2
await initializeSocket()

const io = new Server(5005)

// Replace the let declaration with a Map to track connections
const connectedSockets = new Map<string, boolean>()

io.on('connection', (socket) => {
  console.log('Found a connection!')
  try {
    void socket.join('twitch-chat-messages')
    // Track this specific socket
    connectedSockets.set(socket.id, true)
  } catch (e) {
    console.log('Could not join twitch-chat-messages socket')
    return
  }

  socket.on('reconnect', () => {
    console.log('Reconnecting to the server')
    connectedSockets.set(socket.id, true)
  })

  socket.on('reconnect_failed', () => {
    console.log('Reconnect failed')
    connectedSockets.delete(socket.id)
  })

  socket.on('reconnect_error', (error) => {
    console.log('Reconnect error', error)
    connectedSockets.delete(socket.id)
  })

  socket.on('disconnect', (reason, details) => {
    console.log(
      'We lost the server! Respond to all messages with "server offline"',
      reason,
      details,
    )
    connectedSockets.delete(socket.id)
  })

  socket.on('say', async (providerAccountId: string, text: string) => {
    if (!providerAccountId) return
    const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        broadcaster_id: providerAccountId,
        sender_id: process.env.TWITCH_BOT_PROVIDERID,
        message: text || "I'm sorry, I can't do that",
      }),
    })

    const data = (await response.json()) as TwitchChatResponse
    if (!response.ok) {
      console.error('Failed to send chat message:', data)
      return
    }

    const result = data.data?.[0]
    if (!result?.is_sent && result?.drop_reason) {
      if (
        [
          'chat_user_banned',
          'msg_banned',
          'msg_banned_phone_number_alias',
          'msg_channel_suspended',
        ].includes(result?.drop_reason?.code) ||
        result?.drop_reason?.code.includes('banned')
      ) {
        console.error('Message was dropped:', result.drop_reason.message)
        // Unsubscribe all events from this user
        twitchEvent.emit('revoke', providerAccountId)
      }
    }
  })

  socket.on('whisper', async (channel: string, text: string) => {
    try {
      if (!process.env.TWITCH_BOT_PROVIDERID) throw new Error('TWITCH_BOT_PROVIDERID not set')

      const authProvider = await getBotAuthProvider()
      const api = new ApiClient({ authProvider })
      await api.whispers.sendWhisper(process.env.TWITCH_BOT_PROVIDERID, channel, text)
    } catch (e) {
      console.error('could not whisper', e)
    }
  })
})

// Export a function to check if any sockets are connected
export function hasDotabodSocket(): boolean {
  return connectedSockets.size > 0
}

export { io }
