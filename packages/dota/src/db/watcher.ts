import { Account, Setting, SteamAccount, User } from '@dotabod/prisma/dist/psql/index.js'
import { DBSettings, getValueOrDefault } from '@dotabod/settings'

import { server } from '../dota/index.js'
import findUser from '../dota/lib/connectedStreamers.js'
import { gsiHandlers } from '../dota/lib/consts.js'
import { getRankDetail } from '../dota/lib/ranks.js'
import { tellChatNewMMR } from '../dota/lib/updateMmr.js'
import { getAuthProvider } from '../twitch/lib/getAuthProvider.js'
import { toggleDotabod } from '../twitch/toggleDotabod.js'
import { logger } from '../utils/logger.js'
import getDBUser from './getDBUser.js'
import supabase from './supabase.js'

class SetupSupabase {
  channel: any
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

  toggleHandler = async (userId: string, enable: boolean) => {
    const client = await getDBUser(userId)
    if (!client) return
    if (this.IS_DEV && !this.DEV_CHANNELS.includes(client.name)) return
    if (!this.IS_DEV && this.DEV_CHANNELS.includes(client.name)) return

    toggleDotabod(userId, enable, client.name, client.locale)
  }

  init() {
    this.channel
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'users' },
        (payload: any) => {
          if (this.IS_DEV && !this.DEV_CHANNELS.includes(payload.old.name)) return
          if (!this.IS_DEV && this.DEV_CHANNELS.includes(payload.old.name)) return

          logger.info('Removing user', payload)

          const oldObj = payload.old as User
          const client = findUser(oldObj.id)
          if (client) {
            logger.info('[WATCHER USER] Deleting user', { name: client.name })
            gsiHandlers.get(client.token)?.disable()
            gsiHandlers.delete(client.token)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'accounts' },
        (payload: any) => {
          // watch the accounts table for requires_refresh to change from true to false
          // if it does, add the user to twurple authprovider again via addUser()
          if (this.IS_DEV && !this.DEV_CHANNELIDS.includes(payload.new?.providerAccountId)) return
          if (!this.IS_DEV && this.DEV_CHANNELIDS.includes(payload.new?.providerAccountId)) return

          const newObj = payload.new as Account
          const oldObj = payload.old as Account

          // The frontend will set it to false when they relogin
          // Which allows us to update the authProvider object
          if (newObj.requires_refresh === false && oldObj.requires_refresh === true) {
            logger.info('[WATCHER ACCOUNT] Refreshing account', {
              twitchId: newObj.providerAccountId,
            })
            const tokenData = {
              scope: newObj.scope?.split(' ') ?? [],
              expiresIn: newObj.expires_in ?? 0,
              obtainmentTimestamp: newObj.obtainment_timestamp?.getTime() ?? 0,
              accessToken: newObj.access_token,
              refreshToken: newObj.refresh_token,
            }
            const authProvider = getAuthProvider()
            authProvider.addUser(newObj.providerAccountId, tokenData)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload: any) => {
          if (this.IS_DEV && !this.DEV_CHANNELS.includes(payload.new.name)) return
          if (!this.IS_DEV && this.DEV_CHANNELS.includes(payload.new.name)) return

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
            logger.info('[WATCHER MMR] Sending mmr to socket', {
              name: client.name,
              mmr: newObj.mmr,
            })
            tellChatNewMMR({
              streamDelay: getValueOrDefault(DBSettings.streamDelay, client.settings),
              locale: client.locale,
              token: client.token,
              mmr: newObj.mmr,
              oldMmr: oldObj.mmr,
            })

            void handler()
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload: any) => {
          const newObj = payload.new as Setting
          const client = findUser(newObj.userId)

          if (newObj.key === DBSettings.commandDisable) {
            if (!client) {
              // in case they ban dotabod and we reboot server,
              // we'll never have the client cached, so we have to lookup the user again
              void this.toggleHandler(newObj.userId, !!newObj.value)
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
        (payload: any) => {
          const newObj = payload.new as SteamAccount
          const oldObj = payload.old as SteamAccount
          const client = findUser(newObj.userId || oldObj.userId)

          // Just here to update local memory
          if (!client) return

          if (this.IS_DEV && !this.DEV_CHANNELS.includes(client.name)) return
          if (!this.IS_DEV && this.DEV_CHANNELS.includes(client.name)) return

          if (payload.eventType === 'DELETE') {
            logger.info('[WATCHER STEAM] Deleting steam account for', { name: client.name })

            if (Array.isArray(oldObj.connectedUserIds)) {
              for (const connectedToken of oldObj.connectedUserIds) {
                const connectedUser = gsiHandlers.get(connectedToken)
                if (connectedUser) {
                  connectedUser.client.multiAccount = undefined
                }
              }
            }

            const oldSteamIdx = client.SteamAccount.findIndex(
              (s) => s.steam32Id === oldObj.steam32Id,
            )
            client.SteamAccount.splice(oldSteamIdx, 1)
            if (client.steam32Id === oldObj.steam32Id) {
              client.mmr = 0
              client.steam32Id = null
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
                logger.info('[WATCHER STEAM] Error getting rank detail', { e })
              })
          }
        },
      )
      .subscribe((status: string, err: any) => {
        console.log('[SUPABASE] Subscription status on dota:', { status, err })
      })
  }
}

export default SetupSupabase
