import { EventSubStreamOfflineEvent } from '@twurple/eventsub-base'

import supabase from '../../db/supabase.js'
import { onlineEvents } from '../events/events.js'

export function offlineEvent(e: EventSubStreamOfflineEvent) {
  console.log(`${e.broadcasterId} just went offline`)

  // check onlineEvents to see if we have an online event for this user within the last 5 seconds
  // if we do, then we can safely assume that the offline event is a false positive
  setTimeout(() => {
    if (onlineEvents.has(e.broadcasterId)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const onlineEventDate = onlineEvents.get(e.broadcasterId)!
      const now = new Date()
      const diff = now.getTime() - onlineEventDate.getTime()
      if (diff < 10000) {
        console.log('ignoring offline event for', e.broadcasterId)
        return
      }

      onlineEvents.delete(e.broadcasterId)
    }

    void supabase
      .from('users')
      .update({
        stream_online: false,
      })
      .eq('accounts.providerAccountId', e.broadcasterId)
      .then(() => {
        console.log('updated online event', e.broadcasterId)
      })
  }, 10000)
}
