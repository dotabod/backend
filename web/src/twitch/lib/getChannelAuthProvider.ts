import { RefreshingAuthProvider } from '@twurple/auth'

import { prisma } from '../../db/prisma.js'
import findUser from '../../dota/lib/connectedStreamers.js'
import { logger } from '../../utils/logger.js'
import { hasTokens } from './hasTokens.js'

export const getChannelAuthProvider = function (token: string) {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }

  const twitchTokens = findUser(token)

  if (!twitchTokens?.Account?.access_token || !twitchTokens.Account.refresh_token) {
    logger.info('[TWITCHSETUP] Missing twitch tokens', { userId: token })
    return {}
  }

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      onRefresh: (newTokenData) => {
        logger.info('[TWITCHSETUP] Refreshing twitch tokens', { userId: token })

        prisma.account
          .update({
            where: {
              userId: token,
            },
            data: {
              scope: newTokenData.scope.join(' '),
              access_token: newTokenData.accessToken,
              refresh_token: newTokenData.refreshToken ?? twitchTokens.Account?.refresh_token,
              expires_at: newTokenData.obtainmentTimestamp + (newTokenData.expiresIn ?? 0),
              expires_in: newTokenData.expiresIn,
              obtainment_timestamp: new Date(newTokenData.obtainmentTimestamp),
            },
          })
          .then(() => {
            logger.info('[TWITCHSETUP] Updated twitch tokens', { userId: token })
          })
          .catch((e) => {
            logger.error('[TWITCHSETUP] Failed to update twitch tokens', {
              userId: token,
              error: e,
            })
          })
      },
    },
    {
      scope: twitchTokens.Account.scope?.split(' ') ?? [],
      expiresIn: twitchTokens.Account.expires_in ?? 0,
      obtainmentTimestamp: twitchTokens.Account.obtainment_timestamp?.getTime() ?? 0,
      accessToken: twitchTokens.Account.access_token,
      refreshToken: twitchTokens.Account.refresh_token,
    },
  )

  return { providerAccountId: twitchTokens.Account.providerAccountId, authProvider }
}
