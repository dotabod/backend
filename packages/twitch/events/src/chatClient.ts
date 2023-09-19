import { io } from 'socket.io-client'

export const twitchChat = io('ws://twitch-chat:5005')

export const chatClient = {
  join: (channel: string) => {
    twitchChat.emit('join', channel)
  },
  part: (channel: string) => {
    twitchChat.emit('part', channel)
  },
  say: (channel: string, text: string) => {
    twitchChat.emit('say', channel, text)
  },
}
