import { chatClient } from '../index.js'
import supabase from './supabase.js'

const channel = supabase.channel('db-changes')

// When a user updates MMR from dashboard and they have client open
channel
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    console.log('[SUPABASE]', 'New user to send bot to: ', payload.new.name)
    chatClient
      .join(payload.new.name)
      .then(() => {
        console.log('[SUPABASE]', 'Joined channel', payload.new.name)
      })
      .catch((e) => {
        console.error('[SUPABASE]', 'Error joining channel', e)
      })
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE]', 'Ready to receive database changes!')
    }
  })
