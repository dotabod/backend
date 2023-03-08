import { User } from '@dotabod/prisma/dist/psql/index.js'

import supabase from './supabase.js'
import { chatClient } from '../index.js'

const IS_DEV = process.env.NODE_ENV !== 'production'
const DEV_CHANNELS = process.env.DEV_CHANNELS?.split(',') ?? []
const channel = supabase.channel(`${IS_DEV ? 'dev-' : ''}twitch-chat`)

channel
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
    const oldUser = payload.old as User
    const newUser = payload.new as User

    if (IS_DEV && !DEV_CHANNELS.includes(newUser.name)) return
    if (!IS_DEV && DEV_CHANNELS.includes(newUser.name)) return

    if (!oldUser.displayName && newUser.displayName) {
      console.log('[SUPABASE] New user to send bot to: ', newUser.name)
      try {
        chatClient
          .join(newUser.name)
          .then(() => {
            //
          })
          .catch((e) => {
            console.log('[New user] Failed to enable client inside promise', {
              channel,
              error: e,
            })
          })
      } catch (e) {
        console.error('[SUPABASE] Error joining channel: ', { e })
      }
    } else if (oldUser.name !== newUser.name) {
      console.log('[SUPABASE] User changed name: ', {
        oldName: oldUser.name,
        newName: newUser.name,
      })
      try {
        chatClient.part(oldUser.name)
        chatClient
          .join(newUser.name)
          .then(() => {
            //
          })
          .catch((e) => {
            console.log('[Name change] Failed to enable client inside promise', {
              channel,
              error: e,
            })
          })
      } catch (e) {
        console.error('[SUPABASE] Error joining channel: ', { e })
      }
    }
  })
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE] Ready to receive database changes!')
    }
  })
