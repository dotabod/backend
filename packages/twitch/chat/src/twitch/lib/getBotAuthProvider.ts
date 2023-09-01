import { getAuthProvider } from './getAuthProvider.js'
import { getBotTokens } from './getBotTokens.js'

export const getBotAuthProvider = async function () {
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
    const botTokens = await getBotTokens()

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
    console.log('[PREDICT] Retrieved bot twitch provider, must have been the first user', {
      twitchId,
    })
  }

  return authProvider
}
