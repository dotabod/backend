import { Setting, SteamAccount, User } from '@prisma/client'

import { server } from '../dota/index.js'
import findUser from '../dota/lib/connectedStreamers.js'
import { getRankDetail } from '../dota/lib/ranks.js'
import { chatClient } from '../twitch/commands/index.js'
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
      .then((res) => {
        console.log('[SUPABASE]', 'Joined channel', payload.new.name)
      })
      .catch((e) => {
        console.error('[SUPABASE]', 'Error joining channel', e)
      })
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
    async function handler() {
      const newObj = payload.new as User
      const oldObj = payload.old as User
      const client = await findUser(newObj.id)
      if (client && client.mmr !== newObj.mmr && oldObj.mmr !== newObj.mmr) {
        // dont overwrite with 0 because we use this variable to track currently logged in mmr
        if (newObj.mmr !== 0) {
          client.mmr = newObj.mmr
          console.log('[WATCHER] Updated cached mmr for', newObj.name, newObj.mmr)
        }
        if (client.sockets.length) {
          if (newObj.mmr !== 0) {
            console.log('[WATCHER MMR] Sending mmr to socket', client.name)
            void chatClient.say(client.name, `Updated MMR to ${client.mmr}`)

            getRankDetail(client.mmr, client.steam32Id)
              .then((deets) => {
                if (client.sockets.length) {
                  server.io.to(client.sockets).emit('update-medal', deets)
                }
              })
              .catch((e) => {
                console.error('[WATCHER MMR] Error getting rank detail', e)
              })
          }
        }
      }
    }

    void handler()
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
    async function handler() {
      const newObj = payload.new as Setting
      const client = await findUser(newObj.userId)

      // replace the new setting with the one we have saved in cache
      if (client) {
        console.log('[WATCHER SETTING] Updating setting for', client.name, newObj.key)
        const setting = client.settings.find((s) => s.key === newObj.key)

        if (setting) {
          setting.value = newObj.value
        } else {
          client.settings.push({ key: newObj.key, value: newObj.value })
        }

        if (client.sockets.length) {
          console.log('[WATCHER SETTING] Sending new setting value to socket', client.name)
          server.io.to(client.sockets).emit('refresh-settings')
        }
      }
    }

    void handler()
  })
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'steam_accounts' },
    (payload) => {
      async function handler() {
        const newObj = payload.new as SteamAccount

        const client = await findUser(newObj.userId)
        // Just here to update local memory
        if (!client) return

        console.log('[WATCHER MMR] Updating setting for', client.name)

        const currentSteam = client.SteamAccount.findIndex((s) => s.steam32Id === newObj.steam32Id)
        if (currentSteam >= 0) {
          // update from dashboard
          if (client.SteamAccount[currentSteam].name !== newObj.name) {
            client.SteamAccount[currentSteam].name = newObj.name
          }
          if (client.SteamAccount[currentSteam].mmr !== newObj.mmr) {
            client.SteamAccount[currentSteam].mmr = newObj.mmr

            if (client.steam32Id === newObj.steam32Id) {
              client.mmr = newObj.mmr
              getRankDetail(newObj.mmr, client.steam32Id)
                .then((deets) => {
                  if (client.sockets.length) {
                    server.io.to(client.sockets).emit('update-medal', deets)
                  }
                })
                .catch((e) => {
                  console.error('[WATCHER MMR] postgres_changes Error getting rank detail', e)
                })
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
      }

      void handler()
    },
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE]', 'Ready to receive database changes!')
    }
  })
