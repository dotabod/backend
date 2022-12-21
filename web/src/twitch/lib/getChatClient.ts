import { ChatClient } from '@twurple/chat'

import { getAuthProvider } from './getAuthProvider.js'

export async function getChatClient() {
  const chatClient = new ChatClient({
    isAlwaysMod: true,
    authProvider: getAuthProvider(),
  })

  await chatClient.connect() // TODO: <-- check if needed
  console.log('[TWITCHSETUP]', 'Connected to chat client', chatClient.isConnected)

  return chatClient
}
