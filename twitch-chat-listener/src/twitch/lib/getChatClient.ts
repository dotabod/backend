import { ChatClient } from '@twurple/chat'

import { getBotAuthProvider } from './getBotAuthProvider.js'
import { getChannels } from './getChannels.js'

export async function getChatClient() {
  const chatClient = new ChatClient({
    isAlwaysMod: true,
    authProvider: await getBotAuthProvider(),
    channels: getChannels,
    webSocket: true,
  })

  await chatClient.connect()
  console.log('[TWITCHSETUP] Connected to chat client', chatClient.isConnected)

  return chatClient
}
