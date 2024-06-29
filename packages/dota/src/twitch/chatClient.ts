import { io } from 'socket.io-client'

import { isDev } from '../dota/lib/consts.js'

// Our docker chat forwarder instance
export const twitchChat = io(`ws://${process.env.HOST_TWITCH_CHAT}:5005`)
const prefix = isDev ? '[DEV] ' : ''

export const chatClient = {
  join: (channel: string) => {
    twitchChat.emit('join', channel)
  },
  part: (channel: string) => {
    twitchChat.emit('part', channel)
  },
  say: (channel: string, text: string) => {
    if (isDev) console.log({ channel, text })
    twitchChat.emit('say', channel, `${prefix}${text}`)
  },
  whisper: (channel: string, text: string) => {
    twitchChat.emit('whisper', channel, `${prefix}${text}`)
  },
}
