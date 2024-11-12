import type { EventSubUserAuthorizationRevokeEvent } from '@twurple/eventsub-base'
import { stopUserSubscriptions } from '../../SubscribeEvents'
import supabase from '../../db/supabase'
import { logger } from './logger.js'

async function disableChannel(broadcasterId: string) {
  const { data: user } = await supabase
    .from('accounts')
    .select('userId')
    .eq('provider', 'twitch')
    .eq('providerAccountId', broadcasterId)
    .single()

  if (!user) {
    logger.info('twitch-events Failed to find user', { twitchId: broadcasterId })
    return
  }

  const { data: settings } = await supabase
    .from('settings')
    .select('key, value')
    .eq('userId', user?.userId)

  if (!settings) {
    logger.info('twitch-events Failed to find settings', { twitchId: broadcasterId })
    return
  }

  if (settings.find((s) => s.key === 'commandDisable' && s.value === true)) {
    logger.info('twitch-events User already disabled', { twitchId: broadcasterId })
    return
  }

  logger.info('twitch-events Disabling user', { twitchId: broadcasterId })
  await supabase.from('settings').upsert(
    {
      userId: user.userId,
      key: 'commandDisable',
      value: true,
    },
    {
      onConflict: 'userId, key',
    },
  )
}

export async function revokeEvent(data: EventSubUserAuthorizationRevokeEvent) {
  logger.info(`${data.userId} just revoked`)

  try {
    stopUserSubscriptions(data.userId)
  } catch (e) {
    logger.info('Failed to delete subscriptions', { error: e, twitchId: data.userId })
  }

  await supabase
    .from('accounts')
    .update({
      requires_refresh: true,
    })
    .eq('provider', 'twitch')
    .eq('providerAccountId', data.userId)

  await disableChannel(data.userId)
}
