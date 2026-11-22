import { commandDisable } from '@dotabod/shared-utils'
import { z } from 'zod'

import { redisClient } from '../../db/redis-instance.js'

const ACTIVE_ACCOUNT_TTL_SECONDS = 60
const activeSteamAccountsSchema = z.array(z.string())

const activeSteamAccountsKey = (token: string): string => `token:${token}:activeSteam32Ids`

export const recordActiveSteamAccount = async function recordActiveSteamAccount(
  token: string,
  steam32Id: number
): Promise<string[]> {
  const key = activeSteamAccountsKey(token)
  const stored = await redisClient.client.get(key)
  const activeSteamIds =
    stored === null || stored.length === 0
      ? []
      : activeSteamAccountsSchema.parse(JSON.parse(stored))
  const accountId = steam32Id.toString()

  if (!activeSteamIds.includes(accountId)) {
    activeSteamIds.push(accountId)
    await redisClient.client.setEx(key, ACTIVE_ACCOUNT_TTL_SECONDS, JSON.stringify(activeSteamIds))
  }
  return activeSteamIds
}

export const clearAccountSharing = async function clearAccountSharing(
  token: string
): Promise<void> {
  await redisClient.client.del(activeSteamAccountsKey(token))
  // The audit rows for chat permissions and token revocation have separate recovery paths.
  await commandDisable.enable(token, { reason: 'ACCOUNT_SHARING' })
}
