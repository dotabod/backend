import { getAuthProvider } from './getAuthProvider.js'
import { getTwitchTokens } from './getTwitchTokens.js'

export const getBotAuthProvider = async () => {
  const authProvider = getAuthProvider()
  const twitchId = process.env.TWITCH_BOT_PROVIDERID
  if (!twitchId || twitchId === '') {
    throw new Error('Missing bot provider id (TWITCH_BOT_PROVIDERID)')
  }

  // User has not been added to the twurple provider yet
  // getCurrentScopesForUser will throw if the user does not exist
  try {
    authProvider.getCurrentScopesForUser(twitchId)
  } catch (e) {
    const botTokens = await getTwitchTokens()

    if (!botTokens?.access_token || !botTokens.refresh_token) {
      throw new Error('Missing bot tokens')
    }

    const tokenData = {
      scope: botTokens.scope?.split(' ') ?? [],
      expiresIn: botTokens.expires_in ?? 0,
      obtainmentTimestamp: new Date(botTokens.obtainment_timestamp || '')?.getTime(),
      accessToken: botTokens.access_token,
      refreshToken: botTokens.refresh_token,
    }

    authProvider.addUser(twitchId, tokenData, ['chat'])
    console.log('[PREDICT] Retrieved bot twitch provider', {
      twitchId,
    })
  }

  return authProvider
}
