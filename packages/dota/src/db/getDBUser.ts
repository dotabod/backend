import { GSIHandler } from '../dota/GSIHandler.js'
import findUser, { findUserByTwitchId } from '../dota/lib/connectedStreamers.js'
import {
  gsiHandlers,
  invalidTokens,
  lookingupToken,
  twitchIdToToken,
  twitchNameToToken,
} from '../dota/lib/consts.js'
import type { SocketClient } from '../types.js'
import { logger } from '../utils/logger.js'
import { isSubscriptionActive } from '../utils/subscription'
import supabase from './supabase.js'

export default async function getDBUser({
  token,
  twitchId: providerAccountId,
  ip,
}: { token?: string; twitchId?: string; ip?: string } = {}): Promise<
  SocketClient | null | undefined
> {
  const lookupToken = token ?? providerAccountId ?? ''

  if (invalidTokens.has(lookupToken)) return null

  let client = findUser(token) ?? findUserByTwitchId(providerAccountId)
  if (client) {
    lookingupToken.delete(lookupToken)
    return client
  }

  if (lookingupToken.has(lookupToken)) return null

  logger.info('[GSI] Haven’t cached user token yet, checking db', { ip, lookupToken })
  lookingupToken.set(lookupToken, true)

  if (!lookupToken) {
    logger.error('[USER] 1 Error checking auth', { token: lookupToken, error: 'No token' })
    invalidTokens.add(lookupToken)
    lookingupToken.delete(lookupToken)
    return null
  }

  let userId = token || null
  if (providerAccountId) {
    const { data, error } = await supabase
      .from('accounts')
      .select('userId')
      .eq('provider', 'twitch')
      .eq('providerAccountId', providerAccountId)
      .single()
    userId = data?.userId ?? null

    if (error) {
      logger.error('[USER] 2 Error checking auth', {
        lookupToken,
        providerAccountId,
        error,
      })
      invalidTokens.add(lookupToken)
      lookingupToken.delete(lookupToken)
      return null
    }
  }

  if (!userId) {
    logger.error('[USER] 2 Error checking auth', {
      lookupToken,
      providerAccountId,
      error: 'No token',
    })
    invalidTokens.add(lookupToken)
    lookingupToken.delete(lookupToken)
    return null
  }

  // Fetch user by `twitchId` and `token`
  const { data: user, error: userError } = await supabase
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
    subscriptions (
      id,
      tier,
      status,
      isGift
    ),
    Account:accounts (
      refresh_token,
      scope,
      expires_at,
      requires_refresh,
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
    .eq('id', userId)
    .single()

  // Handle errors
  if (userError) {
    logger.error('[USER] 3 Error checking auth', { token: lookupToken, error: userError })
    invalidTokens.add(lookupToken)
    lookingupToken.delete(lookupToken)
    return null
  }

  if (!user || !user.id) {
    logger.info('Invalid token', { token: lookupToken })
    invalidTokens.add(lookupToken)
    lookingupToken.delete(lookupToken)
    return null
  }

  // If they require a refresh, don't cache them
  const Account = Array.isArray(user?.Account) ? user.Account[0] : user.Account
  if (Account.requires_refresh) {
    logger.info('User requires refresh', { token: lookupToken })
    invalidTokens.add(lookupToken)
    lookingupToken.delete(lookupToken)
    return null
  }

  client = findUser(user.id)
  if (client) {
    lookingupToken.delete(lookupToken)
    return client
  }

  if (!Account) {
    logger.info('Invalid token missing Account??', { token: lookupToken })
    invalidTokens.add(lookupToken)
    lookingupToken.delete(lookupToken)
    return
  }
  let subscription = undefined
  if (Array.isArray(user.subscriptions) && user.subscriptions.length > 0) {
    const activeSubscription =
      user.subscriptions.find((sub) => isSubscriptionActive(sub)) || user.subscriptions[0]
    subscription = {
      ...activeSubscription,
    }
  }

  const userInfo = {
    ...user,
    mmr: user.mmr || user.SteamAccount[0]?.mmr || 0,
    steam32Id: user.steam32Id || user.SteamAccount[0]?.steam32Id || 0,
    token: user.id,
    stream_start_date: user.stream_start_date ? new Date(user.stream_start_date) : null,
    subscription,
    Account: {
      ...Account,
      requires_refresh: Account.requires_refresh ?? false,
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
  }

  twitchIdToToken.set(Account.providerAccountId, userInfo.id)
  twitchNameToToken.set(userInfo.name.toLowerCase(), userInfo.id)
  lookingupToken.delete(lookupToken)
  invalidTokens.delete(userInfo.id)

  return userInfo as SocketClient
}
