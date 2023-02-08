import { ChatClient } from '@twurple/chat'

import { getAuthProvider } from './getAuthProvider.js'
import { getChannels } from './getChannels.js'

export async function getChatClient() {
  const chatClient = new ChatClient({
    isAlwaysMod: true,
    authProvider: getAuthProvider(),
    channels: getChannels,
  })

  await chatClient.connect()
  console.log('[TWITCHSETUP] Connected to chat client', chatClient.isConnected)

  return chatClient
}
