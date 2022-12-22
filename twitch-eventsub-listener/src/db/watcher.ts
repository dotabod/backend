import supabase from './supabase.js'

const channel = supabase.channel('db-changes')

// When a user updates MMR from dashboard and they have client open
channel
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    console.log('[TWITCH EVENTS]', 'New user to send bot to: ', payload.new.name)
    listener.subscribeToStreamOnlineEvents(userId, e => {
      console.log(`${e.broadcasterDisplayName} just went live!`);
    });
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[TWITCH EVENTS]', 'Ready to receive database changes!')
    }
  })
