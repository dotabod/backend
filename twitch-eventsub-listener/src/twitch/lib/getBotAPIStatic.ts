import { ApiClient } from '@twurple/api'
import { ClientCredentialsAuthProvider } from '@twurple/auth'

export const getBotAPIStatic = function () {
  const authProvider = new ClientCredentialsAuthProvider(
    process.env.TWITCH_CLIENT_ID ?? '',
    process.env.TWITCH_CLIENT_SECRET ?? '',
  )
  const api = new ApiClient({ authProvider })
  console.log('[TWITCH] Retrieved twitch dotabod api')

  return api
}
