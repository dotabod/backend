import { io } from 'socket.io-client'

import { isDev } from '../dota/lib/consts.js'

// Our docker chat forwarder instance
export const twitchChat = io('ws://twitch-chat:5005')

export const chatClient = {
  join: (channel: string) => {
    twitchChat.emit('join', channel)
  },
  part: (channel: string) => {
    twitchChat.emit('part', channel)
  },
  say: (channel: string, text: string) => {
    if (isDev) console.log({ channel, text })
    twitchChat.emit('say', channel, text)
  },
}
