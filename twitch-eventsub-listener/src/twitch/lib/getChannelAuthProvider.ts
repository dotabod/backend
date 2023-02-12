import { RefreshingAuthProvider } from '@twurple/auth'

import { hasTokens } from './hasTokens.js'
import { prisma } from '../../db/prisma.js'

export const getChannelAuthProvider = async function (twitchId: string) {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }

  const twitchTokens = await prisma.account.findFirst({
    select: {
      refresh_token: true,
      access_token: true,
      expires_in: true,
      scope: true,
      obtainment_timestamp: true,
    },
    where: {
      provider: 'twitch',
      providerAccountId: twitchId,
    },
  })

  if (!twitchTokens?.access_token || !twitchTokens.refresh_token) {
    console.log('[TWITCHSETUP] Missing twitch tokens', twitchId)
    return false
  }

  console.log('[TWITCHSETUP] Retrieved twitch access tokens', twitchId)

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      onRefresh: (newTokenData) => {
        console.log('[TWITCHSETUP] Refreshing twitch tokens', { twitchId })

        prisma.account
          .update({
            where: {
              providerAccountId: twitchId,
            },
            data: {
              scope: newTokenData.scope.join(' '),
              access_token: newTokenData.accessToken,
              refresh_token: newTokenData.refreshToken ?? twitchTokens.refresh_token,
              expires_at: newTokenData.obtainmentTimestamp + (newTokenData.expiresIn ?? 0),
              expires_in: newTokenData.expiresIn,
              obtainment_timestamp: new Date(newTokenData.obtainmentTimestamp),
            },
          })
          .then(() => {
            console.log('[TWITCHSETUP] Updated twitch tokens', { twitchId })
          })
          .catch((e) => {
            console.error('[TWITCHSETUP] Failed to update twitch tokens', {
              twitchId,
              error: e,
            })
          })
      },
    },
    {
      scope: twitchTokens.scope?.split(' ') ?? [],
      expiresIn: twitchTokens.expires_in ?? 0,
      obtainmentTimestamp: twitchTokens.obtainment_timestamp?.getTime() ?? 0,
      accessToken: twitchTokens.access_token,
      refreshToken: twitchTokens.refresh_token,
    },
  )

  return authProvider
}
