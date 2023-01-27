import { Setting, SteamAccount, User } from '../../prisma/generated/postgresclient/index.js'
import { server } from '../dota/index.js'
import findUser from '../dota/lib/connectedStreamers.js'
import { gsiHandlers } from '../dota/lib/consts.js'
import { getRankDetail } from '../dota/lib/ranks.js'
import { tellChatNewMMR } from '../dota/lib/updateMmr.js'
import { toggleDotabod } from '../twitch/commands/toggle.js'
import { logger } from '../utils/logger.js'
import { DBSettings, getValueOrDefault } from './settings.js'
import supabase from './supabase.js'

const channel = supabase.channel('db-changes')

const IS_DEV = process.env.NODE_ENV !== 'production'
const DEV_CHANNELS = process.env.DEV_CHANNELS?.split(',') ?? []

channel
  .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'users' }, (payload) => {
    if (IS_DEV && !DEV_CHANNELS.includes(payload.old.name)) return
    if (!IS_DEV && DEV_CHANNELS.includes(payload.old.name)) return

    logger.info('Removing user', payload)

    const oldObj = payload.old as User
    const client = findUser(oldObj.id)
    if (client) {
      logger.info('[WATCHER USER] Deleting user', { name: client.name })
      gsiHandlers.get(client.token)?.disable()
      gsiHandlers.delete(client.token)
    }
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
    if (IS_DEV && !DEV_CHANNELS.includes(payload.new.name)) return
    if (!IS_DEV && DEV_CHANNELS.includes(payload.new.name)) return

    const newObj = payload.new as User
    const oldObj = payload.old as User
    const client = findUser(newObj.id)
    if (!client) return

    client.name = newObj.name
    client.locale = newObj.locale
    client.beta_tester = newObj.beta_tester
    client.stream_online = newObj.stream_online
    if (typeof newObj.stream_start_date === 'string') {
      client.stream_start_date = new Date(newObj.stream_start_date)
    } else {
      client.stream_start_date = newObj.stream_start_date
    }

    if (typeof newObj.stream_start_date === 'string') {
      client.stream_start_date = new Date(newObj.stream_start_date)
    } else {
      client.stream_start_date = newObj.stream_start_date
    }

    async function handler() {
      if (!client) return

      const deets = await getRankDetail(newObj.mmr, client.steam32Id)
      server.io.to(client.token).emit('update-medal', deets)
    }

    // dont overwrite with 0 because we use this variable to track currently logged in mmr
    if (newObj.mmr !== 0 && client.mmr !== newObj.mmr && oldObj.mmr !== newObj.mmr) {
      client.mmr = newObj.mmr

      if (!client.stream_online) return
      logger.info('[WATCHER MMR] Sending mmr to socket', { name: client.name })
      tellChatNewMMR({
        streamDelay: getValueOrDefault(DBSettings.streamDelay, client.settings),
        locale: client.locale,
        token: client.token,
        mmr: newObj.mmr,
        oldMmr: oldObj.mmr,
      })

      void handler()
    }
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
    const newObj = payload.new as Setting
    const client = findUser(newObj.userId)
    if (!client) return

    if (IS_DEV && !DEV_CHANNELS.includes(client.name)) return
    if (!IS_DEV && DEV_CHANNELS.includes(client.name)) return

    // replace the new setting with the one we have saved in cache
    logger.info('[WATCHER SETTING] Updating setting for', {
      name: client.name,
      key: newObj.key,
      value: newObj.value,
    })
    const setting = client.settings.find((s) => s.key === newObj.key)

    if (setting) {
      setting.value = newObj.value
    } else {
      client.settings.push({ key: newObj.key, value: newObj.value })
    }

    if (newObj.key === DBSettings.commandDisable) {
      void toggleDotabod(client.token, !!newObj.value, client.name, client.locale)
    }

    // Sending this one even when offline, cause they might be testing locally
    logger.info('[WATCHER SETTING] Sending new setting value to socket', {
      name: client.name,
      key: newObj.key,
      value: newObj.value,
    })
    server.io.to(client.token).emit('refresh-settings', newObj.key)
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'steam_accounts' }, (payload) => {
    const newObj = payload.new as SteamAccount
    const oldObj = payload.old as SteamAccount
    const client = findUser(newObj.userId || oldObj.userId)

    // Just here to update local memory
    if (!client) return

    if (IS_DEV && !DEV_CHANNELS.includes(client.name)) return
    if (!IS_DEV && DEV_CHANNELS.includes(client.name)) return

    if (payload.eventType === 'DELETE') {
      logger.info('[WATCHER STEAM] Deleting steam account for', { name: client.name })
      const oldSteamIdx = client.SteamAccount.findIndex((s) => s.steam32Id === oldObj.steam32Id)
      client.SteamAccount.splice(oldSteamIdx, 1)
      if (client.steam32Id === oldObj.steam32Id) {
        client.steam32Id = null
      }
      return
    }

    logger.info('[WATCHER STEAM] Updating steam accounts for', { name: client.name })

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

      if (!client.stream_online) return
      tellChatNewMMR({
        locale: client.locale,
        token: client.token,
        streamDelay: getValueOrDefault(DBSettings.streamDelay, client.settings),
        mmr: newObj.mmr,
        oldMmr: oldObj.mmr,
      })
      getRankDetail(newObj.mmr, newObj.steam32Id)
        .then((deets) => {
          server.io.to(client.token).emit('update-medal', deets)
        })
        .catch((e) => {
          logger.info('[WATCHER STEAM] Error getting rank detail', e)
        })
    }
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      logger.info('[SUPABASE] Ready to receive database changes!')
    }
  })
