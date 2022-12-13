import { Setting, SteamAccount, User } from '@prisma/client'

import { server } from '../dota/index.js'
import findUser from '../dota/lib/connectedStreamers.js'
import { getRankDetail } from '../dota/lib/ranks.js'
import { tellChatNewMMR } from '../dota/lib/updateMmr.js'
import { chatClient } from '../twitch/commands/index.js'
import RedisClient from './redis.js'
import supabase from './supabase.js'

const channel = supabase.channel('db-changes')

const { client: redis } = RedisClient.getInstance()

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
      if (newObj.mmr !== 0 && client && client.mmr !== newObj.mmr && oldObj.mmr !== newObj.mmr) {
        // dont overwrite with 0 because we use this variable to track currently logged in mmr
        console.log('[WATCHER MMR] Sending mmr to socket', client.name)
        void tellChatNewMMR(client.name, newObj.mmr)
        void redis.json.set(`users:${client.token}`, '$.mmr', newObj.mmr)

        const deets = await getRankDetail(newObj.mmr, client.steam32Id)
        server.io.to(client.token).emit('update-medal', deets)
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

        void redis.json.set(`users:${client.token}`, '$.settings', client.settings)
        server.io.to(client.token).emit('refresh-settings')
      }
    }

    void handler()
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'steam_accounts' }, (payload) => {
    async function handler() {
      const newObj = payload.new as SteamAccount
      const client = await findUser(newObj.userId)

      // Just here to update local memory
      if (!client) return

      console.log('[WATCHER STEAM] Updating steam accounts for', client.name)
      const currentSteam = client.SteamAccount.findIndex((s) => s.steam32Id === newObj.steam32Id)
      if (currentSteam === -1) {
        client.SteamAccount.push({
          name: newObj.name,
          mmr: newObj.mmr,
          steam32Id: newObj.steam32Id,
        })
      } else {
        client.SteamAccount[currentSteam].name = newObj.name
        client.SteamAccount[currentSteam].mmr = newObj.mmr
      }

      void redis.json.set(`users:${client.token}`, '$.SteamAccount', client.SteamAccount)

      // Push an mmr update to overlay since it's the steam account rn
      if (client.steam32Id === newObj.steam32Id) {
        void tellChatNewMMR(client.name, newObj.mmr)
        void redis.json.set(`users:${client.token}`, '$.mmr', newObj.mmr)
        const deets = await getRankDetail(newObj.mmr, newObj.steam32Id)
        server.io.to(client.token).emit('update-medal', deets)
      }
    }

    void handler()
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE]', 'Ready to receive database changes!')
    }
  })
