import { SteamAccount, User } from '@prisma/client'

import { server } from '../dota'
import findUser from '../dota/lib/connectedStreamers'
import { chatClient } from '../twitch/commands/index'
import supabase from './supabase'

const channel = supabase.channel('db-changes')
if (process.env.NODE_ENV === 'production') {
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'users' },
    (payload) => {
      console.log('[SUPABASE]', 'New user to send bot to: ', payload.new.name)
      chatClient.join(payload.new.name).catch((e) => {
        console.error('[SUPABASE]', 'Error joining channel', e)
      })
    },
  )
}

// When a user updates MMR from dashboard and they have client open
channel
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
    const newObj = payload.new as User
    const oldObj = payload.old as User
    const client = findUser(newObj.id)
    if (client && client.mmr !== newObj.mmr && oldObj.mmr !== newObj.mmr) {
      client.mmr = newObj.mmr
      const currentSteam = client.SteamAccount.findIndex((s) => s.steam32Id === client.steam32Id)
      if (currentSteam >= 0) {
        client.SteamAccount[currentSteam].mmr = Number(newObj.mmr)
      }
      if (client.sockets.length) {
        console.log('[MMR] Sending mmr to socket')
        void chatClient.say(client.name, `Updated MMR to ${client.mmr}`)

        server.io
          .to(client.sockets)
          .emit('update-medal', { mmr: client.mmr, steam32Id: client.steam32Id })
      }

      console.log('Updated cached mmr for', newObj.name, newObj.mmr)
    }
  })
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'steam_accounts' },
    (payload) => {
      const newObj = payload.new as SteamAccount
      const client = findUser(newObj.userId)

      // Just here to update local memory
      if (!client) return

      const currentSteam = client.SteamAccount.findIndex((s) => s.steam32Id === newObj.steam32Id)
      if (currentSteam >= 0) {
        // update from dashboard
        if (client.SteamAccount[currentSteam].mmr !== newObj.mmr) {
          client.SteamAccount[currentSteam].mmr = newObj.mmr

          if (client.steam32Id === newObj.steam32Id) {
            void chatClient.say(client.name, `Updated MMR to ${newObj.mmr}`)

            client.mmr = newObj.mmr
            server.io
              .to(client.sockets)
              .emit('update-medal', { mmr: newObj.mmr, steam32Id: client.steam32Id })
          }

          return
        }
      }

      // TODO: Supabase only sends the ID of the row, not steam32id
      // Would only need this for freeing up memory i guess; not important
      // if (payload.eventType === 'DELETE') {
      //   // delete steam account
      //   console.log(payload)
      //   client.SteamAccount.splice(currentSteam, 1)
      //   return
      // }
      return
    },
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE]', 'Ready to receive database changes!')
    }
  })
