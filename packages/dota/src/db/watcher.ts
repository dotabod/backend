import { t } from 'i18next'

import { clearCacheForUser } from '../dota/clearCacheForUser.js'
import { server } from '../dota/index.js'
import findUser from '../dota/lib/connectedStreamers.js'
import { gsiHandlers } from '../dota/lib/consts.js'
import { getRankDetail } from '../dota/lib/ranks.js'
import { DBSettings, getValueOrDefault } from '../settings.js'
import { chatClient } from '../twitch/chatClient.js'
import { toggleDotabod } from '../twitch/toggleDotabod.js'
import { logger } from '../utils/logger.js'
import getDBUser from './getDBUser.js'
import supabase from './supabase.js'
import { Tables } from './supabase-types.js'

class SetupSupabase {
  channel: any // ReturnType<typeof supabase.channel>
  IS_DEV: boolean
  DEV_CHANNELS: string[]
  DEV_CHANNELIDS: string[]

  constructor() {
    this.IS_DEV = process.env.NODE_ENV !== 'production'
    this.DEV_CHANNELS = process.env.DEV_CHANNELS?.split(',') ?? []
    this.DEV_CHANNELIDS = process.env.DEV_CHANNELIDS?.split(',') ?? []
    this.channel = supabase.channel(`${this.IS_DEV ? 'dev-' : ''}dota`)

    logger.info('Starting watcher for', { dev: this.IS_DEV, channels: this.DEV_CHANNELS })
  }

  shouldHandleDevChannel(name: string) {
    return this.IS_DEV ? this.DEV_CHANNELS.includes(name) : !this.DEV_CHANNELS.includes(name)
  }

  shouldHandleDevChannelId(id: string) {
    return this.IS_DEV ? this.DEV_CHANNELIDS.includes(id) : !this.DEV_CHANNELIDS.includes(id)
  }

  toggleHandler = async (userId: string, enable: boolean) => {
    const client = await getDBUser({ token: userId })
    if (!client || !this.shouldHandleDevChannel(client.name)) return

    toggleDotabod(userId, enable, client.name, client.locale)
  }

  init() {
    if (process.env.NODE_ENV !== 'production') return
    this.channel
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'users' },
        async (payload: { old: Tables<'users'> }) => {
          if (this.IS_DEV && !this.DEV_CHANNELS.includes(payload.old.name)) return
          if (!this.IS_DEV && this.DEV_CHANNELS.includes(payload.old.name)) return

          logger.info('Removing user', payload)

          const oldObj = payload.old
          const client = findUser(oldObj.id)
          if (client) {
            logger.info('[WATCHER USER] Deleting user', { name: client.name })
            await clearCacheForUser(client)
            return
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'accounts' },
        async (payload: { new: Tables<'accounts'>; old: Tables<'accounts'> }) => {
          // watch the accounts table for requires_refresh to change from true to false
          // if it does, add the user to twurple authprovider again via addUser()
          if (this.IS_DEV && !this.DEV_CHANNELIDS.includes(payload.new?.providerAccountId)) return
          if (!this.IS_DEV && this.DEV_CHANNELIDS.includes(payload.new?.providerAccountId)) return

          const newObj = payload.new
          const oldObj = payload.old

          // The frontend will set it to false when they relogin
          // Which allows us to update the authProvider object
          if (newObj.requires_refresh === false && oldObj.requires_refresh === true) {
            logger.info('[WATCHER ACCOUNT] Refreshing account', {
              twitchId: newObj.providerAccountId,
            })

            const client = findUser(newObj.userId)
            await clearCacheForUser(client)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload: any) => {
          if (this.IS_DEV && !this.DEV_CHANNELS.includes(payload.new.name)) return
          if (!this.IS_DEV && this.DEV_CHANNELS.includes(payload.new.name)) return

          const newObj: Tables<'users'> = payload.new
          const oldObj: Tables<'users'> = payload.old
          const client = findUser(newObj.id)
          if (!client) return

          client.name = newObj.name
          client.locale = newObj.locale
          client.beta_tester = newObj.beta_tester
          client.stream_online = newObj.stream_online

          // They go offline
          if (!client.stream_online && oldObj.stream_online) {
            return
          }

          // They come online
          if (client.stream_online && !oldObj.stream_online) {
            const connectedUser = gsiHandlers.get(client.token)
            if (!connectedUser) return

            const betsEnabled = getValueOrDefault(DBSettings.bets, client.settings)
            if (connectedUser.client.Account?.requires_refresh && betsEnabled) {
              chatClient.say(
                connectedUser.client.name,
                t('refreshToken', {
                  lng: connectedUser.client.locale,
                  channel: connectedUser.client.name,
                }),
              )
            }
            connectedUser.enable()
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
            logger.info('[WATCHER MMR] Sending mmr to socket', {
              name: client.name,
              mmr: newObj.mmr,
            })
            try {
              void handler()
            } catch (e) {
              logger.error('Error in watcher postgres update', { e })
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload: any) => {
          const newObj: Tables<'settings'> = payload.new
          const client = findUser(newObj.userId)

          if (newObj.key === DBSettings.commandDisable) {
            if (!client) {
              // in case they ban dotabod and we reboot server,
              // we'll never have the client cached, so we have to lookup the user again
              try {
                void this.toggleHandler(newObj.userId, !!newObj.value)
              } catch (e) {
                logger.error('Error in toggleHandler', { e })
              }
            } else {
              if (this.IS_DEV && !this.DEV_CHANNELS.includes(client.name)) return
              if (!this.IS_DEV && this.DEV_CHANNELS.includes(client.name)) return
              toggleDotabod(newObj.userId, !!newObj.value, client.name, client.locale)
            }
          }

          if (!client) return

          if (this.IS_DEV && !this.DEV_CHANNELS.includes(client.name)) return
          if (!this.IS_DEV && this.DEV_CHANNELS.includes(client.name)) return

          // replace the new setting with the one we have saved in cache
          logger.info('[WATCHER SETTING] Updating setting for', {
            name: client.name,
            newObj,
          })
          const setting = client.settings.find((s) => s.key === newObj.key)

          if (setting) {
            setting.value = newObj.value
          } else {
            client.settings.push({ key: newObj.key, value: newObj.value })
          }

          // Sending this one even when offline, because they might be testing locally
          logger.info('[WATCHER SETTING] Sending new setting value to socket', {
            name: client.name,
            key: newObj.key,
            value: newObj.value,
          })
          server.io.to(client.token).emit('refresh-settings', newObj.key)
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'steam_accounts' },
        async (payload: any) => {
          const newObj: Tables<'steam_accounts'> = payload.new
          const oldObj: Tables<'steam_accounts'> = payload.old
          const client = findUser(newObj.userId || oldObj.userId)

          // Just here to update local memory
          if (!client) return

          if (this.IS_DEV && !this.DEV_CHANNELS.includes(client.name)) return
          if (!this.IS_DEV && this.DEV_CHANNELS.includes(client.name)) return

          if (payload.eventType === 'DELETE') {
            logger.info('[WATCHER STEAM] Deleting steam account for', { name: client.name })

            // A delete will reset their status in memory so they can reconnect anything
            await clearCacheForUser(client)

            // We try deleting those users so they can attempt a new connection
            if (Array.isArray(oldObj.connectedUserIds)) {
              for (const connectedToken of oldObj.connectedUserIds) {
                await clearCacheForUser(gsiHandlers.get(connectedToken)?.client)
              }
            }

            return
          }

          logger.info('[WATCHER STEAM] Updating steam accounts for', { name: client.name })

          const currentSteamIdx = client.SteamAccount.findIndex(
            (s) => s.steam32Id === newObj.steam32Id,
          )
          if (currentSteamIdx === -1) {
            client.SteamAccount.push({
              name: newObj.name,
              mmr: newObj.mmr,
              steam32Id: newObj.steam32Id,
              leaderboard_rank: newObj.leaderboard_rank,
            })
          } else {
            client.SteamAccount[currentSteamIdx].name = newObj.name
            client.SteamAccount[currentSteamIdx].mmr = newObj.mmr
            client.SteamAccount[currentSteamIdx].leaderboard_rank = newObj.leaderboard_rank
          }

          // Push an mmr update to overlay since it's the steam account rn
          if (client.steam32Id === newObj.steam32Id) {
            client.mmr = newObj.mmr

            if (!client.stream_online) return

            getRankDetail(newObj.mmr, newObj.steam32Id)
              .then((deets) => {
                server.io.to(client.token).emit('update-medal', deets)
              })
              .catch((e) => {
                logger.info('[WATCHER STEAM] Error getting rank detail', { e })
              })
          }
        },
      )
      .subscribe((status: string, err: any) => {
        logger.info('[SUPABASE] Subscription status on dota:', { status, err })
      })
  }
}

export default SetupSupabase
