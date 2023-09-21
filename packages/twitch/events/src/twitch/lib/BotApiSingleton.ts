import { ApiClient } from '@twurple/api'
import { AppTokenAuthProvider } from '@twurple/auth'

let instance: ApiClient | null = null

function getInstance() {
  if (!instance) {
    console.log('[TWITCH] Retrieving twitch dotabod api')
    const authProvider = new AppTokenAuthProvider(
      process.env.TWITCH_CLIENT_ID ?? '',
      process.env.TWITCH_CLIENT_SECRET ?? '',
    )
    const api = new ApiClient({
      authProvider,
      // logger: {
      //   minLevel: 'trace',
      // },
    })
    console.log('[TWITCH] Retrieved twitch dotabod api')
    instance = api
  }
  return instance
}

export default {
  getInstance,
}
