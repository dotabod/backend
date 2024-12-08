import type { EventSubStreamOnlineEvent } from '@twurple/eventsub-base'
import supabase from '../db/supabase.js'
import { logger } from '../logger.js'
import { onlineEvents } from './events.js'

export function onlineEvent(data: EventSubStreamOnlineEvent) {
  logger.info(`${data.broadcasterId} just went online`)
  onlineEvents.set(data.broadcasterId, new Date())

  async function handler() {
    const { data: user } = await supabase
      .from('accounts')
      .select('userId')
      .eq('provider', 'twitch')
      .eq('providerAccountId', data.broadcasterId)
      .single()

    if (user?.userId) {
      await supabase
        .from('users')
        .update({
          stream_online: true,
          stream_start_date: data.startDate.toISOString(),
        })
        .eq('id', user.userId)

      logger.info('updated online event', { twitchId: data.broadcasterId })
    }
  }

  void handler()
}
