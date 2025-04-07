import { botStatus, logger } from '@dotabod/shared-utils'
import { getTwitchHeaders } from '@dotabod/shared-utils'
import { eventSubMap } from '../../chatSubIds.js'
import supabase from '../../db/supabase.js'

// Constants
const headers = await getTwitchHeaders()

export const deleteSubscription = async (id: string) => {
  await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${id}`, {
    method: 'DELETE',
    headers,
  })
}

// Function to stop subscriptions for a user
export const stopUserSubscriptions = async (providerAccountId: string) => {
  const subscriptions = eventSubMap[providerAccountId]
  if (!subscriptions) return

  // Delete each subscription and remove from map
  await Promise.all(
    Object.values(subscriptions).map(async (subscription) => {
      try {
        await deleteSubscription(subscription.id)
      } catch (error) {
        logger.info('[TWITCHEVENTS] could not delete subscription', {
          error,
          id: subscription.id,
        })
      }
    }),
  )

  delete eventSubMap[providerAccountId]
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

  // Delete all their current steam accounts
  // In the event that they are banned, they can now connect their old steam accounts
  // to a new Twitch account
  // TODO: This deleted their accounts when Dotabod got banned on Twitch instead of their channel being banned
  // await supabase.from('steam_accounts').delete().eq('userId', user.userId)

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
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'userId, key',
    },
  )
}

// Track pending revoke operations to debounce multiple calls
const pendingRevokes = new Map<string, NodeJS.Timeout>()

export async function revokeEvent({ providerAccountId }: { providerAccountId: string }) {
  if (providerAccountId === process.env.TWITCH_BOT_PROVIDERID) {
    logger.info('Bot was revoked by Twitch in events!')
    botStatus.isBanned = true
  }

  logger.info(`${providerAccountId} just revoked, debouncing for 10s`)

  // Clear any existing timeout for this user
  if (pendingRevokes.has(providerAccountId)) {
    clearTimeout(pendingRevokes.get(providerAccountId)!)
  }

  // Set a new timeout
  pendingRevokes.set(
    providerAccountId,
    setTimeout(async () => {
      logger.info(`${providerAccountId} revoke executing after debounce`)
      pendingRevokes.delete(providerAccountId)

      try {
        stopUserSubscriptions(providerAccountId)
      } catch (e) {
        logger.info('Failed to delete subscriptions', { error: e, twitchId: providerAccountId })
      }

      await supabase
        .from('accounts')
        .update({
          requires_refresh: true,
          updated_at: new Date().toISOString(),
        })
        .eq('provider', 'twitch')
        .eq('providerAccountId', providerAccountId)

      await disableChannel(providerAccountId)
    }, 3000),
  )
}
