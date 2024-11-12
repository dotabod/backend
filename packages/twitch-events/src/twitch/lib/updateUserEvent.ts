import type { EventSubUserUpdateEvent } from '@twurple/eventsub-base'

import supabase from '../../db/supabase.js'
import { logger } from './logger.js'

export function updateUserEvent(e: EventSubUserUpdateEvent) {
  logger.info(`${e.userId} updateUserEvent`)

  async function handler() {
    try {
      const streamer = await e.getUser()

      const data = {
        name: e.userName,
        displayName: e.userDisplayName,
        email: e.userEmail,
        image: streamer.profilePictureUrl,
      }

      // remove falsy values from data (like displayName: undefined)
      const filteredData = Object.fromEntries(
        Object.entries(data).filter(([key, value]) => Boolean(value)),
      )

      const { data: user } = await supabase
        .from('accounts')
        .select('userId')
        .eq('providerAccountId', e.userId)
        .eq('provider', 'twitch')
        .single()

      if (!user || !user.userId) {
        logger.info('[TWITCHEVENTS] user not found', { twitchId: e.userId })
        return
      }

      await supabase
        .from('users')
        .update(filteredData as typeof data)
        .eq('id', user.userId)
    } catch (err) {
      console.error(err, 'updateUserEvent error', e.userId)
    }
  }

  void handler()
}
