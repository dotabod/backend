import { chatSubIds } from '../../chatSubIds.js'
import supabase from '../../db/supabase'
import { getTwitchHeaders } from '../../getTwitchHeaders'
import { userSubscriptions } from '../../initUserSubscriptions'
import { logger } from './logger.js'

// Constants
const headers = await getTwitchHeaders()

// Function to stop subscriptions for a user
const stopUserSubscriptions = (providerAccountId: string) => {
  const subscriptions = userSubscriptions[providerAccountId]
  if (subscriptions) {
    subscriptions.forEach((subscription) => subscription.stop())
    delete userSubscriptions[providerAccountId]
    logger.info(
      `[TWITCHEVENTS] Unsubscribed from events for providerAccountId: ${providerAccountId}`,
    )
  } else {
    logger.info(
      `[TWITCHEVENTS] stopUserSubscriptions No subscriptions found for providerAccountId: ${providerAccountId}`,
    )
  }

  // get the sub id from the subscription
  const subId = chatSubIds[providerAccountId].id
  if (subId) {
    // do a DELETE request to the chat subscription
    fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subId}`, {
      method: 'DELETE',
      headers,
    })
      .then(() => {
        delete chatSubIds[providerAccountId]
      })
      .catch((e) => {
        logger.info('[TWITCHEVENTS] could not delete subscription', { e, id: subId })
      })
  }
}

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

export async function revokeEvent({ providerAccountId }: { providerAccountId: string }) {
  logger.info(`${providerAccountId} just revoked`)

  try {
    stopUserSubscriptions(providerAccountId)
  } catch (e) {
    logger.info('Failed to delete subscriptions', { error: e, twitchId: providerAccountId })
  }

  await supabase
    .from('accounts')
    .update({
      requires_refresh: true,
    })
    .eq('provider', 'twitch')
    .eq('providerAccountId', providerAccountId)

  await disableChannel(providerAccountId)
}
