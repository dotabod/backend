import { RefreshingAuthProvider } from '@twurple/auth'

import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { hasTokens } from './hasTokens.js'

export const getAuthProvider = function () {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }

  const authProvider = new RefreshingAuthProvider({
    clientId: process.env.TWITCH_CLIENT_ID ?? '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
    onRefresh: (twitchId, newTokenData) => {
      logger.info('[TWITCHSETUP] Refreshing twitch tokens', { twitchId })

      prisma.account
        .update({
          where: {
            providerAccountId: twitchId,
          },
          data: {
            scope: newTokenData.scope.join(' '),
            access_token: newTokenData.accessToken,
            refresh_token: newTokenData.refreshToken ?? '',
            expires_at: Math.floor(
              new Date(newTokenData.obtainmentTimestamp).getTime() / 1000 +
                (newTokenData.expiresIn ?? 0),
            ),
            expires_in: newTokenData.expiresIn ?? 0,
            obtainment_timestamp: new Date(newTokenData.obtainmentTimestamp),
          },
        })
        .then(() => {
          logger.info('[TWITCHSETUP] Updated bot tokens', { twitchId })
        })
        .catch((e) => {
          console.error('[TWITCHSETUP] Failed to update bot tokens', {
            twitchId,
            error: e,
          })
        })
    },
  })

  return authProvider
}

// const twitchTokens = findUser(token)

// if (!twitchTokens?.Account?.access_token || !twitchTokens.Account.refresh_token) {
//   logger.info('[TWITCHSETUP] Missing twitch tokens', { userId: token })
//   return {}
// }

// const tokens = {
//   scope: twitchTokens.Account.scope?.split(' ') ?? [],
//   expiresIn: twitchTokens.Account.expires_in ?? 0,
//   obtainmentTimestamp: twitchTokens.Account.obtainment_timestamp?.getTime() ?? 0,
//   accessToken: twitchTokens.Account.access_token,
//   refreshToken: twitchTokens.Account.refresh_token,
// }
