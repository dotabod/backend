import { User } from '../../prisma/generated/postgresclient/index.js'
import { chatClient } from '../index.js'
import supabase from './supabase.js'

const channel = supabase.channel('twitch-changes')

channel
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    const oldUser = payload.old as User
    const newUser = payload.new as User
    if (!oldUser.displayName && newUser.displayName) {
      console.log('[SUPABASE] New user to send bot to: ', newUser.name)
      try {
        void chatClient.join(newUser.name)
      } catch (e) {
        console.error('[SUPABASE] Error joining channel: ', e)
      }
    }
  })
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE] Ready to receive database changes!')
    }
  })
