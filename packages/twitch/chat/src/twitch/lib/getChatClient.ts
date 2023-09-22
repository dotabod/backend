import { ChatClient } from '@twurple/chat'

import { getBotAuthProvider } from './getBotAuthProvider.js'
import { getChannels } from './getChannels.js'

export async function getChatClient() {
  const chatClient = new ChatClient({
    isAlwaysMod: true,
    botLevel: process.env.NODE_ENV === 'production' ? 'verified' : undefined,
    authProvider: await getBotAuthProvider(),
    channels: getChannels,
    webSocket: true,
  })

  await chatClient.connect()
  console.log('[TWITCHSETUP] Connected to chat client')

  return chatClient
}
