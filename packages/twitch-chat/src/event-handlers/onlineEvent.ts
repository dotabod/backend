import supabase from '../db/supabase.js'
import { logger } from '../logger.js'
import { onlineEvents } from './events.js'

interface TwitchOnlineEvent {
  id: string
  broadcaster_user_id: string
  broadcaster_user_login: string
  broadcaster_user_name: string
  type: string
  started_at: string
}

export function onlineEvent({ payload: { event } }: { payload: { event: TwitchOnlineEvent } }) {
  logger.info(`${event.broadcaster_user_id} just went online`)
  onlineEvents.set(event.broadcaster_user_id, new Date())

  async function handler() {
    const { data: user } = await supabase
      .from('accounts')
      .select('userId')
      .eq('provider', 'twitch')
      .eq('providerAccountId', event.broadcaster_user_id)
      .single()

    if (user?.userId) {
      await supabase
        .from('users')
        .update({
          stream_online: true,
          stream_start_date: event.started_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.userId)

      logger.info('updated online event', { twitchId: event.broadcaster_user_id })
    }
  }

  void handler()
}
