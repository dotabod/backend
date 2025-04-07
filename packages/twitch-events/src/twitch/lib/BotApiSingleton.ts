import { logger } from '@dotabod/shared-utils'
import { ApiClient } from '@twurple/api'
import { AppTokenAuthProvider } from '@twurple/auth'

let instance: ApiClient | null = null

export function getBotInstance() {
  if (!instance) {
    logger.info('[TWITCH] Retrieving twitch dotabod api')
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
    logger.info('[TWITCH] Retrieved twitch dotabod api')
    instance = api
  }
  return instance
}
