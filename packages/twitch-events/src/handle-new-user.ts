import { setTimeout as delay } from 'node:timers/promises'

import { logger, supabase } from '@dotabod/shared-utils'
import type { Database } from '@dotabod/shared-utils'

import { initUserSubscriptions } from './init-user-subscriptions'
import { getBotInstance } from './twitch/lib/bot-api-singleton'

const botApi = getBotInstance()
type UserUpdate = Database['public']['Tables']['users']['Update']

const REPLICA_LAG_RETRY_MS = 1000

export interface HandleNewUserDependencies {
  waitForRetry: (delayMs: number) => Promise<void>
}

const defaultDependencies: HandleNewUserDependencies = {
  waitForRetry: delay,
}

const findUserIdByProviderAccount = async function findUserIdByProviderAccount(
  providerAccountId: string,
  waitForRetry: HandleNewUserDependencies['waitForRetry'],
  attempt = 0
): Promise<string | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('userId')
    .eq('providerAccountId', providerAccountId)
    .eq('provider', 'twitch')
    .single()
  if (data?.userId !== undefined && data.userId.length > 0) {
    return data.userId
  }

  if (attempt === 0) {
    await waitForRetry(REPLICA_LAG_RETRY_MS)
    return await findUserIdByProviderAccount(providerAccountId, waitForRetry, 1)
  }
  if (error !== null) {
    throw error
  }
  return null
}

const isBannedUser = async function isBannedUser(
  providerAccountId: string,
  userId: string
): Promise<boolean> {
  const { data: banRow, error: banError } = await supabase
    .from('users')
    .select('banned_at')
    .eq('id', userId)
    .single()
  if (banError !== null) {
    logger.error('[TWITCHEVENTS] handleNewUser: ban check failed', {
      error: banError,
      providerAccountId,
      userId,
    })
    return false
  }
  if (
    banRow?.banned_at === null ||
    banRow?.banned_at === undefined ||
    banRow.banned_at.length === 0
  ) {
    return false
  }

  logger.info('[TWITCHEVENTS] handleNewUser: skipping banned user', {
    providerAccountId,
    userId,
  })
  return true
}

const fetchUserUpdate = async function fetchUserUpdate(
  providerAccountId: string
): Promise<UserUpdate> {
  const stream = await botApi.streams.getStreamByUserId(providerAccountId)
  const streamer = await botApi.users.getUserById(providerAccountId)
  const userUpdate: UserUpdate = {}
  if (streamer?.displayName !== undefined && streamer.displayName.length > 0) {
    userUpdate.displayName = streamer.displayName
  }
  if (streamer?.name !== undefined && streamer.name.length > 0) {
    userUpdate.name = streamer.name
  }
  if (stream?.startDate !== undefined) {
    userUpdate.stream_online = true
    userUpdate.stream_start_date = stream.startDate.toISOString()
  }
  return userUpdate
}

const updateUserProfile = async function updateUserProfile(
  providerAccountId: string,
  waitForRetry: HandleNewUserDependencies['waitForRetry']
): Promise<boolean> {
  const userId = await findUserIdByProviderAccount(providerAccountId, waitForRetry)
  if (userId !== null && (await isBannedUser(providerAccountId, userId))) {
    return true
  }

  const userUpdate = await fetchUserUpdate(providerAccountId)
  if (userId === null) {
    logger.error('[TWITCHEVENTS] handleNewUser: no accounts row after retry', {
      providerAccountId,
    })
    return false
  }

  await supabase.from('users').update(userUpdate).eq('id', userId)
  return false
}

export const handleNewUser = async function handleNewUser(
  providerAccountId: string,
  resubscribeEvents = true,
  dependencies: HandleNewUserDependencies = defaultDependencies
): Promise<void> {
  logger.info("[TWITCHEVENTS] New user, let's get their info", { providerAccountId })

  if (providerAccountId.length === 0) {
    logger.warn('[TWITCHEVENTS] handleNewUser called without providerAccountId')
    return
  }

  let banShortCircuit = false
  try {
    banShortCircuit = await updateUserProfile(providerAccountId, dependencies.waitForRetry)
  } catch (error) {
    logger.error('[TWITCHEVENTS] handleNewUser: profile update failed', {
      error,
      providerAccountId,
    })
  }

  if (banShortCircuit) {
    return
  }

  if (resubscribeEvents) {
    const ok = await initUserSubscriptions(providerAccountId)
    if (!ok) {
      throw new Error(
        `[TWITCHEVENTS] initUserSubscriptions: critical subscription failed for ${providerAccountId}`
      )
    }
  }
}
