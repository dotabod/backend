import { EventSubStreamOnlineEvent } from '@twurple/eventsub-base'

import supabase from '../../db/supabase.js'
import { onlineEvents } from '../events/events.js'

export async function onlineEvent(data: EventSubStreamOnlineEvent) {
  console.log(`${data.broadcasterId} just went online`)
  onlineEvents.set(data.broadcasterId, new Date())

  await supabase
    .from('users')
    .update({
      stream_online: true,
      stream_start_date: data.startDate,
    })
    .eq('accounts.providerAccountId', data.broadcasterId)
  console.log('updated online event', data.broadcasterId)
}
