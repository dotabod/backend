import { ApiClient } from '@twurple/api'
import chatClient, { authProvider } from './chatClient.js'

await chatClient.connect()
chatClient.onMessage((channel, user, text) => {
  if (!text.startsWith('!dotabod')) return
  const args = text.slice(1).split(' ')

  switch (args[1]) {
    case 'addsteam':
      break
    default:
      console.log('Unrecognized command', args)
      break
  }
})

// TODO: Create predictions using API
const api = new ApiClient({ authProvider })
