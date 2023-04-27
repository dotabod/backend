import { GSIHandler } from '../dota/GSIHandler.js'
import findUser, { findUserByTwitchId } from '../dota/lib/connectedStreamers.js'
import { gsiHandlers, invalidTokens, lookingupToken, twitchIdToToken } from '../dota/lib/consts.js'
import { SocketClient } from '../types.js'
import { logger } from '../utils/logger.js'
import { prisma } from './prisma.js'

export default async function getDBUser({
  token,
  twitchId,
  ip,
}: { token?: string; twitchId?: string; ip?: string } = {}): Promise<
  SocketClient | null | undefined
> {
  if (invalidTokens.has(token || twitchId)) return null

  const client = findUser(token) ?? findUserByTwitchId(twitchId)
  if (client) {
    lookingupToken.delete(token ?? twitchId ?? '')
    return client
  }

  if (lookingupToken.has(token ?? twitchId ?? '')) return null

  logger.info('[GSI] Havent cached user token yet, checking db', { ip, token: token ?? twitchId })
  lookingupToken.set(token ?? twitchId ?? '', true)

  return await prisma.user
    .findFirstOrThrow({
      select: {
        settings: {
          select: {
            key: true,
            value: true,
          },
        },
        Account: {
          select: {
            refresh_token: true,
            scope: true,
            expires_at: true,
            expires_in: true,
            obtainment_timestamp: true,
            access_token: true,
            providerAccountId: true,
          },
        },
        SteamAccount: {
          select: {
            mmr: true,
            connectedUserIds: true,
            steam32Id: true,
            name: true,
            leaderboard_rank: true,
          },
        },
        id: true,
        name: true,
        mmr: true,
        steam32Id: true,
        stream_online: true,
        stream_start_date: true,
        beta_tester: true,
        locale: true,
      },
      where: {
        Account: {
          providerAccountId: twitchId,
        },
        id: token,
      },
    })
    .then((user) => {
      if (!user.id) {
        logger.info('Invalid token', { token: token ?? twitchId })
        invalidTokens.add(token ?? twitchId)
        lookingupToken.delete(token ?? twitchId ?? '')
        return null
      }

      const client = findUser(user.id)
      if (client) {
        lookingupToken.delete(token ?? twitchId ?? '')
        return client
      }

      const theUser = {
        ...user,
        mmr: user.mmr || user.SteamAccount[0]?.mmr || 0,
        steam32Id: user.steam32Id || user.SteamAccount[0]?.steam32Id || 0,
        token: user.id,
      }

      if (!gsiHandlers.has(theUser.id)) {
        if (theUser.stream_online) {
          logger.info('[GSI] Connecting new client', { token: theUser.id, name: theUser.name })
        }

        const gsiHandler = new GSIHandler(theUser)
        gsiHandlers.set(theUser.id, gsiHandler)
        twitchIdToToken.set(theUser.Account!.providerAccountId, theUser.id)
        lookingupToken.delete(token ?? twitchId ?? '')
        return gsiHandler.client
      }

      return theUser as SocketClient
    })
    .catch((e: any) => {
      logger.error('[USER] Error checking auth', { token: token ?? twitchId, e })
      invalidTokens.add(token ?? twitchId)
      lookingupToken.delete(token ?? twitchId ?? '')

      return null
    })
}
