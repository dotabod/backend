import { Setting, SteamAccount, User } from '../../prisma/generated/postgresclient/index.js'
import { server } from '../dota/index.js'
import findUser, { deleteUser } from '../dota/lib/connectedStreamers.js'
import { getRankDetail } from '../dota/lib/ranks.js'
import { tellChatNewMMR } from '../dota/lib/updateMmr.js'
import { toggleDotabod } from '../twitch/commands/toggle.js'
import { DBSettings } from './settings.js'
import supabase from './supabase.js'

const channel = supabase.channel('db-changes')

channel
  .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'users' }, (payload) => {
    console.log(payload, 'REMOVE')

    const oldObj = payload.old as User
    const client = findUser(oldObj.id)
    if (client) {
      console.log('[WATCHER USER] Deleting user', client.name)
      deleteUser(client.token)
    }
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
    async function handler() {
      const newObj = payload.new as User
      const oldObj = payload.old as User
      const client = findUser(newObj.id)
      // dont overwrite with 0 because we use this variable to track currently logged in mmr
      if (newObj.mmr !== 0 && client && client.mmr !== newObj.mmr && oldObj.mmr !== newObj.mmr) {
        console.log('[WATCHER MMR] Sending mmr to socket', client.name)
        tellChatNewMMR(client.token, newObj.mmr, oldObj.mmr)
        client.mmr = newObj.mmr

        const deets = await getRankDetail(newObj.mmr, client.steam32Id)
        server.io.to(client.token).emit('update-medal', deets)
      }
    }

    void handler()
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
    const newObj = payload.new as Setting
    const client = findUser(newObj.userId)

    // replace the new setting with the one we have saved in cache
    if (client) {
      console.log('[WATCHER SETTING] Updating setting for', client.name, newObj.key)
      const setting = client.settings.find((s) => s.key === newObj.key)

      if (setting) {
        setting.value = newObj.value
      } else {
        client.settings.push({ key: newObj.key, value: newObj.value })
      }

      if (newObj.key === DBSettings.commandDisable) {
        void toggleDotabod(client.token, !!newObj.value, client.name)
      }

      console.log('[WATCHER SETTING] Sending new setting value to socket', client.name)
      server.io.to(client.token).emit('refresh-settings')
    }
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'steam_accounts' }, (payload) => {
    const newObj = payload.new as SteamAccount
    const oldObj = payload.old as SteamAccount
    const client = findUser(newObj.userId || oldObj.userId)

    // Just here to update local memory
    if (!client) return

    if (payload.eventType === 'DELETE') {
      console.log('[WATCHER STEAM] Deleting steam account for', client.name)
      const oldSteamIdx = client.SteamAccount.findIndex((s) => s.steam32Id === oldObj.steam32Id)
      client.SteamAccount.splice(oldSteamIdx, 1)
      if (client.steam32Id === oldObj.steam32Id) {
        client.steam32Id = null
      }
      return
    }

    console.log('[WATCHER STEAM] Updating steam accounts for', client.name)

    const currentSteamIdx = client.SteamAccount.findIndex((s) => s.steam32Id === newObj.steam32Id)
    if (currentSteamIdx === -1) {
      client.SteamAccount.push({
        name: newObj.name,
        mmr: newObj.mmr,
        steam32Id: newObj.steam32Id,
      })
    } else {
      client.SteamAccount[currentSteamIdx].name = newObj.name
      client.SteamAccount[currentSteamIdx].mmr = newObj.mmr
    }

    // Push an mmr update to overlay since it's the steam account rn
    if (client.steam32Id === newObj.steam32Id) {
      client.mmr = newObj.mmr
      tellChatNewMMR(client.token, newObj.mmr, oldObj.mmr)
      getRankDetail(newObj.mmr, newObj.steam32Id)
        .then((deets) => {
          server.io.to(client.token).emit('update-medal', deets)
        })
        .catch((e) => {
          console.log('[WATCHER STEAM] Error getting rank detail', e)
        })
    }
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE]', 'Ready to receive database changes!')
    }
  })
