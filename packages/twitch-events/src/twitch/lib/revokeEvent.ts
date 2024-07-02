import type { EventSubUserAuthorizationRevokeEvent } from '@twurple/eventsub-base'
import { stopUserSubscriptions } from '../../SubscribeEvents'
import supabase from '../../db/supabase'

async function disableChannel(broadcasterId: string) {
  const { data: user } = await supabase
    .from('accounts')
    .select('userId')
    .eq('providerAccountId', broadcasterId)
    .single()

  if (!user) {
    console.log('twitch-events Failed to find user', broadcasterId)
    return
  }

  const { data: settings } = await supabase
    .from('settings')
    .select('key, value')
    .eq('userId', user?.userId)

  if (!settings) {
    console.log('twitch-events Failed to find settings', broadcasterId)
    return
  }

  if (settings.find((s) => s.key === 'commandDisable' && s.value === true)) {
    console.log('twitch-events User already disabled', broadcasterId)
    return
  }

  console.log('twitch-events Disabling user', broadcasterId)
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
  console.log(`${data.userId} just revoked`)

  try {
    stopUserSubscriptions(data.userId)
  } catch (e) {
    console.log('Failed to delete subscriptions', e, data.userId)
  }

  await supabase
    .from('accounts')
    .update({
      requires_refresh: true,
    })
    .eq('providerAccountId', data.userId)

  await disableChannel(data.userId)
}
