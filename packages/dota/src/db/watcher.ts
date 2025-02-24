import { t } from 'i18next'

import { clearCacheForUser } from '../dota/clearCacheForUser.js'
import { server } from '../dota/index.js'
import findUser from '../dota/lib/connectedStreamers.js'
import { didTellUser, gsiHandlers, invalidTokens } from '../dota/lib/consts.js'
import { getRankDetail } from '../dota/lib/ranks.js'
import { DBSettings } from '../settings.js'
import { chatClient } from '../twitch/chatClient.js'
import { updateTwurpleTokenForTwitchId } from '../twitch/lib/getTwitchAPI'
import { toggleDotabod } from '../twitch/toggleDotabod.js'
import { logger } from '../utils/logger.js'
import { isSubscriptionActive } from '../utils/subscription.js'
import getDBUser from './getDBUser.js'
import type { Tables } from './supabase-types.js'
import supabase from './supabase.js'

class SetupSupabase {
  channel: any // ReturnType<typeof supabase.channel>
  IS_DEV: boolean

  constructor() {
    this.IS_DEV = process.env.DOTABOD_ENV !== 'production'
    this.channel = supabase.channel(`${this.IS_DEV ? 'dev-' : ''}dota`)

    logger.info('Starting watcher for', {
      dev: this.IS_DEV,
    })
  }

  toggleHandler = async (userId: string, enable: boolean) => {
    const client = await getDBUser({ token: userId })
    if (!client) return

    toggleDotabod(userId, enable, client.name, client.locale)
  }

  init() {
    this.channel
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'users' },
        async (payload: { old: Tables<'users'> }) => {
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
        { event: 'INSERT', schema: 'public', table: 'subscriptions' },
        async (payload: { new: Tables<'subscriptions'> }) => {
          const newObj = payload.new
          const client = findUser(newObj.userId)

          if (!client) return

          if (isSubscriptionActive({ status: newObj.status })) {
            client.subscription = {
              id: newObj.id,
              tier: newObj.tier,
              status: newObj.status,
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'subscriptions' },
        async (payload: { new: Tables<'subscriptions'>; old: Tables<'subscriptions'> }) => {
          const newObj = payload.new
          const client = findUser(newObj.userId)

          if (!client) return

          const isNewActive = isSubscriptionActive({ status: newObj.status })

          if (isNewActive) {
            // Update with new details
            client.subscription = {
              id: newObj.id,
              tier: newObj.tier,
              status: newObj.status,
            }
            return
          }

          if (!isNewActive && client.subscription?.id === newObj.id) {
            client.subscription = undefined
            return
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'subscriptions' },
        async (payload: { old: Tables<'subscriptions'> }) => {
          const oldObj = payload.old
          const client = findUser(oldObj.userId)
          if (client && client.subscription?.id === oldObj.id) {
            client.subscription = undefined
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'accounts' },
        async (payload: { new: Tables<'accounts'>; old: Tables<'accounts'> }) => {
          // watch the accounts table for requires_refresh to change from true to false
          // if it does, add the user to twurple authprovider again via addUser()
          const newObj = payload.new
          const oldObj = payload.old

          if (newObj.requires_refresh === true && oldObj.requires_refresh === false) {
            invalidTokens.add(newObj.userId)
            const client = findUser(newObj.userId)
            await clearCacheForUser(client)
            return
          }

          if (
            newObj.scope !== oldObj.scope ||
            (newObj.requires_refresh === false && oldObj.requires_refresh === true) ||
            newObj.access_token !== oldObj.access_token
          ) {
            const client = findUser(newObj.userId)
            if (client?.Account) {
              client.Account.scope = newObj.scope
              client.Account.access_token = newObj.access_token
              client.Account.refresh_token = newObj.refresh_token
              client.Account.expires_at = newObj.expires_at
              client.Account.expires_in = newObj.expires_in
              client.Account.obtainment_timestamp = new Date(newObj.obtainment_timestamp ?? '')
              updateTwurpleTokenForTwitchId(newObj.providerAccountId)
            }
          }

          // The frontend will set it to false when they relogin
          // Which allows us to update the authProvider object
          if (newObj.requires_refresh === false && oldObj.requires_refresh === true) {
            invalidTokens.delete(newObj.userId)
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
        async (payload: any) => {
          const newObj: Tables<'users'> = payload.new
          const oldObj: Tables<'users'> = payload.old
          const client = findUser(newObj.id)
          if (!client) return

          client.name = newObj.name
          client.locale = newObj.locale
          client.beta_tester = newObj.beta_tester
          client.stream_online = newObj.stream_online

          // They go offline
          if (!newObj.stream_online && oldObj.stream_online) {
            return
          }

          // They come online
          if (client.stream_online && !oldObj.stream_online) {
            const ONE_DAY_IN_MS = 86_400_000 // 1 day in ms
            const dayAgo = new Date(Date.now() - ONE_DAY_IN_MS).toISOString()

            const hasNewestScopes = client.Account?.scope?.includes('channel:bot')
            const requiresRefresh = client.Account?.requires_refresh
            if ((!hasNewestScopes || requiresRefresh) && !didTellUser.has(client.name)) {
              didTellUser.add(client.name)

              const { data, error } = await supabase
                .from('bets')
                .select('created_at')
                .eq('userId', client.token)
                .gte('created_at', dayAgo)
                .range(0, 0)

              if (data?.length && !error) {
                logger.info('[WATCHER USER] Sending refresh token messsage', {
                  name: client.name,
                  twitchId: client.Account?.providerAccountId,
                  token: client.token,
                })
                chatClient.say(
                  client.name,
                  t('refreshToken', {
                    lng: client.locale,
                    channel: client.name,
                  }),
                )
              }
            }
            const connectedUser = gsiHandlers.get(client.token)
            if (connectedUser) {
              connectedUser.enable()
            }
          }

          if (typeof newObj.stream_start_date === 'string') {
            client.stream_start_date = new Date(newObj.stream_start_date)
          } else {
            client.stream_start_date = newObj.stream_start_date
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
              const deets = await getRankDetail(newObj.mmr, client.steam32Id)
              server.io.to(client.token).emit('update-medal', deets)
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
              toggleDotabod(newObj.userId, !!newObj.value, client.name, client.locale)
            }
          }

          if (!client) return

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

          if (payload.eventType === 'DELETE') {
            logger.info('[WATCHER STEAM] Deleting steam account for', {
              name: client.name,
            })

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

          logger.info('[WATCHER STEAM] Updating steam accounts for', {
            name: client.name,
          })

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
