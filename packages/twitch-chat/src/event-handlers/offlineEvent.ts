import supabase from '../db/supabase.js'
import { logger } from '@dotabod/shared-utils'
import { onlineEvents } from './events.js'

interface TwitchOfflineEvent {
  broadcaster_user_id: string
  broadcaster_user_login: string
  broadcaster_user_name: string
}

export function offlineEvent({ payload: { event } }: { payload: { event: TwitchOfflineEvent } }) {
  logger.info(`${event.broadcaster_user_id} just went offline`)

  // check onlineEvents to see if we have an online event for this user within the last 5 seconds
  // if we do, then we can safely assume that the offline event is a false positive
  setTimeout(() => {
    if (onlineEvents.has(event.broadcaster_user_id)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const onlineEventDate = onlineEvents.get(event.broadcaster_user_id)
      const now = new Date()
      const diff = now.getTime() - (onlineEventDate?.getTime() ?? now.getTime())
      if (diff < 10000) {
        logger.info('ignoring offline event for', { twitchId: event.broadcaster_user_id })
        return
      }

      onlineEvents.delete(event.broadcaster_user_id)
    }

    async function handler() {
      const { data: user } = await supabase
        .from('accounts')
        .select('userId')
        .eq('provider', 'twitch')
        .eq('providerAccountId', event.broadcaster_user_id)
        .single()

      if (!user || !user.userId) {
        logger.info('[TWITCHEVENTS] user not found', {
          twitchId: event.broadcaster_user_id,
        })
        return
      }

      await supabase
        .from('users')
        .update({
          stream_online: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.userId)
        .then(() => {
          logger.info('updated online event', { twitchId: event.broadcaster_user_id })
        })
    }

    void handler()
  }, 10000)
}
