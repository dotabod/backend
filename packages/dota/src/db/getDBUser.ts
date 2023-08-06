import { GSIHandler } from '../dota/GSIHandler.js'
import findUser, { findUserByTwitchId } from '../dota/lib/connectedStreamers.js'
import { gsiHandlers, invalidTokens, lookingupToken, twitchIdToToken } from '../dota/lib/consts.js'
import { SocketClient } from '../types.js'
import { logger } from '../utils/logger.js'
import { prisma } from './prisma.js'

function deleteLookupToken(lookupToken: string) {
  lookingupToken.delete(lookupToken)
}

export default async function getDBUser({
  token,
  twitchId,
  ip,
}: { token?: string; twitchId?: string; ip?: string } = {}): Promise<
  SocketClient | null | undefined
> {
  const lookupToken = token ?? twitchId ?? ''

  if (invalidTokens.has(lookupToken)) return null

  const client = findUser(token) ?? findUserByTwitchId(twitchId)
  if (client) {
    deleteLookupToken(lookupToken)
    return client
  }

  if (lookingupToken.has(lookupToken)) return null

  logger.info('[GSI] Haven’t cached user token yet, checking db', { ip, token: lookupToken })
  lookingupToken.set(lookupToken, true)

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
        logger.info('Invalid token', { token: lookupToken })
        invalidTokens.add(lookupToken)
        deleteLookupToken(lookupToken)
        return null
      }

      const client = findUser(user.id)
      if (client) {
        deleteLookupToken(lookupToken)
        return client
      }

      const userInfo = {
        ...user,
        mmr: user.mmr || user.SteamAccount[0]?.mmr || 0,
        steam32Id: user.steam32Id || user.SteamAccount[0]?.steam32Id || 0,
        token: user.id,
      }

      const gsiHandler = gsiHandlers.get(userInfo.id) || new GSIHandler(userInfo)

      if (gsiHandler instanceof GSIHandler) {
        if (userInfo.stream_online) {
          logger.info('[GSI] Connecting new client', { token: userInfo.id, name: userInfo.name })
        }

        gsiHandlers.set(userInfo.id, gsiHandler)
        twitchIdToToken.set(userInfo.Account!.providerAccountId, userInfo.id)
        deleteLookupToken(lookupToken)
      }

      return userInfo as SocketClient
    })
    .catch((e: any) => {
      logger.error('[USER] Error checking auth', { token: lookupToken, e })
      invalidTokens.add(lookupToken)
      deleteLookupToken(lookupToken)

      return null
    })
}
