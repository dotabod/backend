import { getAuthProvider } from './getAuthProvider.js'
import { getBotTokens } from './getBotTokens.js'

export const getBotAuthProvider = async function () {
  const authProvider = getAuthProvider()
  const twitchId = process.env.TWITCH_BOT_PROVIDERID
  if (!twitchId || twitchId === '') {
    throw new Error('Missing bot provider id (TWITCH_BOT_PROVIDERID)')
  }

  if (authProvider.getIntentsForUser(twitchId).length === 0) {
    const botTokens = await getBotTokens()

    if (!botTokens?.access_token || !botTokens.refresh_token) {
      throw new Error('Missing bot tokens')
    }

    const tokenData = {
      scope: botTokens.scope?.split(' ') ?? [],
      expiresIn: botTokens.expires_in ?? 0,
      obtainmentTimestamp: botTokens.obtainment_timestamp?.getTime() ?? 0,
      accessToken: botTokens.access_token,
      refreshToken: botTokens.refresh_token,
    }

    authProvider.addUser(twitchId, tokenData)
  }

  return authProvider
}
