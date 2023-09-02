import { EventSubStreamOnlineEvent } from '@twurple/eventsub-base'

import supabase from '../../db/supabase.js'
import { onlineEvents } from '../events/events.js'

export async function onlineEvent(data: EventSubStreamOnlineEvent) {
  console.log(`${data.broadcasterId} just went online`)
  onlineEvents.set(data.broadcasterId, new Date())

  const { data: user } = await supabase
    .from('accounts')
    .select('userId')
    .eq('providerAccountId', data.broadcasterId)
    .single()

  if (!user || !user.userId) {
    console.log('[TWITCHEVENTS] user not found', { twitchId: data.broadcasterId })
    return
  }

  await supabase
    .from('users')
    .update({
      stream_online: true,
      stream_start_date: data.startDate.toISOString(),
    })
    .eq('id', user.userId)

  console.log('updated online event', data.broadcasterId)
}
