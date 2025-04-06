import supabase from '../db/supabase.js'
import { logger } from '@dotabod/shared-utils'
import { onlineEvents } from './events.js'

interface TwitchOnlineEvent {
  id: string
  broadcaster_user_id: string
  broadcaster_user_login: string
  broadcaster_user_name: string
  type: string
  started_at: string
}
export function onlineEvent(data: { payload: { event: TwitchOnlineEvent } }) {
  try {
    const {
      payload: { event },
    } = data
    logger.info(`${event.broadcaster_user_id} just went online`)
    onlineEvents.set(event.broadcaster_user_id, new Date())
  } catch (error) {
    logger.error('Error in onlineEvent initial processing', {
      error: error instanceof Error ? error.message : String(error),
      eventData: JSON.stringify(data),
    })
  }

  async function handler() {
    try {
      const { data: user, error: userError } = await supabase
        .from('accounts')
        .select('userId')
        .eq('provider', 'twitch')
        .eq('providerAccountId', data?.payload?.event.broadcaster_user_id)
        .single()

      if (userError) {
        logger.error('Failed to fetch user account', {
          error: userError.message,
          twitchId: data?.payload?.event.broadcaster_user_id,
        })
        return
      }

      if (user?.userId) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            stream_online: true,
            stream_start_date: data?.payload?.event.started_at,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.userId)

        if (updateError) {
          logger.error('Failed to update user online status', {
            error: updateError.message,
            userId: user.userId,
            twitchId: data?.payload?.event.broadcaster_user_id,
          })
          return
        }

        logger.info('updated online event', { twitchId: data?.payload?.event.broadcaster_user_id })
      } else {
        logger.warn('No user found for Twitch account', {
          twitchId: data?.payload?.event.broadcaster_user_id,
        })
      }
    } catch (error) {
      logger.error('Unexpected error in online event handler', {
        error: error instanceof Error ? error.message : String(error),
        twitchId: data,
      })
    }
  }

  void handler()
}
