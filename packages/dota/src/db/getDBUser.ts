import { GSIHandler } from '../dota/GSIHandler.js'
import findUser, { findUserByTwitchId } from '../dota/lib/connectedStreamers.js'
import {
  gsiHandlers,
  invalidTokens,
  isDev,
  lookingupToken,
  twitchIdToToken,
} from '../dota/lib/consts.js'
import { SocketClient } from '../types.js'
import { logger } from '../utils/logger.js'
import supabase from './supabase.js'

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

  if (!isDev && invalidTokens.has(lookupToken)) return null

  let client = findUser(token) ?? findUserByTwitchId(twitchId)
  if (client) {
    deleteLookupToken(lookupToken)
    return client
  }

  if (lookingupToken.has(lookupToken)) return null

  logger.info('[GSI] Haven’t cached user token yet, checking db', { ip, token: lookupToken })
  lookingupToken.set(lookupToken, true)

  // Fetch user by `twitchId` and `token`
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select(
      `
    id,
    name,
    mmr,
    steam32Id,
    stream_online,
    stream_start_date,
    beta_tester,
    locale,
    Account:accounts (
      refresh_token,
      scope,
      expires_at,
      expires_in,
      obtainment_timestamp,
      access_token,
      providerAccountId
    ),
    SteamAccount:steam_accounts (
      mmr,
      connectedUserIds,
      steam32Id,
      name,
      leaderboard_rank
    ),
    settings (
      key,
      value
    )
  `,
    )
    .eq(twitchId ? 'Account.providerAccountId' : 'id', twitchId ?? token ?? '')

  // Handle errors
  if (userError) {
    logger.error('[USER] Error checking auth', { token: lookupToken, error: userError })
    invalidTokens.add(lookupToken)
    deleteLookupToken(lookupToken)
    return null
  }

  const [user] = userData ?? []

  if (!user.id) {
    logger.info('Invalid token', { token: lookupToken })
    invalidTokens.add(lookupToken)
    deleteLookupToken(lookupToken)
    return null
  }

  client = findUser(user.id)
  if (client) {
    deleteLookupToken(lookupToken)
    return client
  }

  const Account = user.Account.shift()
  if (!Account) return null

  const userInfo = {
    ...user,
    mmr: user.mmr || user.SteamAccount[0]?.mmr || 0,
    steam32Id: user.steam32Id || user.SteamAccount[0]?.steam32Id || 0,
    token: user.id,
    stream_start_date: user.stream_start_date ? new Date(user.stream_start_date) : null,
    Account: {
      ...Account,
      obtainment_timestamp: Account.obtainment_timestamp
        ? new Date(Account.obtainment_timestamp)
        : null,
    },
  }

  const gsiHandler = gsiHandlers.get(userInfo.id) || new GSIHandler(userInfo)

  if (gsiHandler instanceof GSIHandler) {
    if (userInfo.stream_online) {
      logger.info('[GSI] Connecting new client', { token: userInfo.id, name: userInfo.name })
    }

    gsiHandlers.set(userInfo.id, gsiHandler)
    twitchIdToToken.set(Account.providerAccountId, userInfo.id)
  }

  deleteLookupToken(lookupToken)

  return userInfo as SocketClient
}
