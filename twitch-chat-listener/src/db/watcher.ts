import { User } from '../../prisma/generated/postgresclient/index.js'
import { chatClient } from '../index.js'
import supabase from './supabase.js'

const channel = supabase.channel('twitch-changes')

channel
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    const user = payload.new as User
    console.log('[SUPABASE] New user to send bot to: ', user.name)
    try {
      void chatClient.join(user.name)
    } catch (e) {
      console.error('[SUPABASE] Error joining channel: ', e)
    }
  })
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE] Ready to receive database changes!')
    }
  })
