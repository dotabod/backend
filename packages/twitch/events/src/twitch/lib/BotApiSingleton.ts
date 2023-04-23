import { ApiClient } from '@twurple/api'
import { AppTokenAuthProvider } from '@twurple/auth'

class BotAPI {
  static instance: ApiClient | null = null

  static getInstance() {
    if (!BotAPI.instance) {
      const authProvider = new AppTokenAuthProvider(
        process.env.TWITCH_CLIENT_ID ?? '',
        process.env.TWITCH_CLIENT_SECRET ?? '',
      )
      const api = new ApiClient({ authProvider })
      console.log('[TWITCH] Retrieved twitch dotabod api')
      BotAPI.instance = api
    }
    return BotAPI.instance
  }
}

export default BotAPI
