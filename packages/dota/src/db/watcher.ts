import { getAuthProvider, getTwitchAPI } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { clearCacheForUser } from '../dota/clearCacheForUser.js'
import { server } from '../dota/server.js'
import findUser from '../dota/lib/connectedStreamers.js'
import { gsiHandlers, invalidTokens } from '../dota/lib/consts.js'
import { getRankDetail } from '../dota/lib/ranks.js'
import { DBSettings } from '../settings.js'
import { chatClient } from '../twitch/chatClient'
import { toggleDotabod } from '../twitch/toggleDotabod.js'
import { logger } from '@dotabod/shared-utils'
import { isSubscriptionActive } from '../types/subscription.js'
import getDBUser from './getDBUser.js'
import { handleUserOnlineMessages } from './handleScheduledMessages'
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

          if (isSubscriptionActive(newObj)) {
            client.subscription = {
              id: newObj.id,
              tier: newObj.tier,
              status: newObj.status,
              isGift: newObj.isGift,
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

          const isNewActive = isSubscriptionActive(newObj)
          if (isNewActive) {
            // Update with new details
            client.subscription = {
              id: newObj.id,
              tier: newObj.tier,
              status: newObj.status,
              isGift: newObj.isGift,
            }
            return
          }

          // If current active but new is inactive
          const isCurrentActive = isSubscriptionActive(client.subscription)
          if (isCurrentActive && !isNewActive && client.subscription?.id !== newObj.id) {
            return
          }

          // If this subscription became inactive and it was the active one
          if (!isNewActive && client.subscription?.id === newObj.id) {
            // Check if user has any other active subscriptions
            const activeSubscription = await supabase
              .from('subscriptions')
              .select('*')
              .eq('userId', newObj.userId)
              .neq('isGift', true)
              .in('status', ['ACTIVE', 'TRIALING'])
              .order('transactionType', { ascending: false })
              .limit(1)
              .single()

            if (activeSubscription.data) {
              // Set the other active subscription
              client.subscription = {
                id: activeSubscription.data.id,
                tier: activeSubscription.data.tier,
                status: activeSubscription.data.status,
                isGift: activeSubscription.data.isGift,
              }
            } else {
              // No other active subscriptions found
              client.subscription = undefined
            }
            return
          }
        },
      )
      // Needs `ALTER TABLE subscriptions REPLICA IDENTITY FULL;` to receive full object on DELETE
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'subscriptions' },
        async (payload: { old: Tables<'subscriptions'> }) => {
          const oldObj = payload.old
          const client = findUser(oldObj.userId)

          if (!client) return

          if (client.subscription?.id === oldObj.id) {
            // Check if user has any other active subscriptions
            const activeSubscription = await supabase
              .from('subscriptions')
              .select('*')
              .eq('userId', oldObj.userId)
              .neq('id', oldObj.id)
              .neq('isGift', true)
              .in('status', ['ACTIVE', 'TRIALING'])
              .order('transactionType', { ascending: false })
              .limit(1)
              .single()

            if (activeSubscription.data) {
              // Set the other active subscription
              client.subscription = {
                id: activeSubscription.data.id,
                tier: activeSubscription.data.tier,
                status: activeSubscription.data.status,
                isGift: activeSubscription.data.isGift,
              }
            } else {
              // No other active subscriptions found
              client.subscription = undefined
            }
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
            if (client) {
              await clearCacheForUser(client)
            }
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
              const twitchId = newObj.providerAccountId
              const authProvider = getAuthProvider()
              authProvider.removeUser(twitchId)
              getTwitchAPI(twitchId).catch((e) => {
                logger.error('[TWITCHAPI] Error updating twurple token', { twitchId, e })
              })
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
            if (client) {
              await clearCacheForUser(client)
            }
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
            server.io.to(client.token).emit('refresh-settings', 'mutate')
            return
          }

          // They come online
          if (client.stream_online && !oldObj.stream_online) {
            const connectedUser = gsiHandlers.get(client.token)
            if (connectedUser) {
              connectedUser.enable()

              server.io.to(client.token).emit('refresh-settings', 'mutate')
            }

            // Handle any pending scheduled messages for this user
            await handleUserOnlineMessages(client.token, client.name)
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
        { event: 'INSERT', schema: 'public', table: 'gift_subscriptions' },
        async (payload: { new: Tables<'gift_subscriptions'> }) => {
          const newObj = payload.new
          const userId = await supabase
            .from('subscriptions')
            .select('userId')
            .eq('id', newObj.subscriptionId)
            .eq('isGift', true)
            .single()

          if (!userId) return
          const client = findUser(userId.data?.userId)

          if (!client || !client.stream_online) return

          try {
            // Send notification message to chat
            chatClient.say(
              client.name,
              newObj.senderName
                ? t('giftSub', {
                    senderName: newObj.senderName,
                    lng: client.locale,
                  }) + (newObj.giftMessage ? ` "${newObj.giftMessage}"` : '')
                : t('giftSubAnonymous', {
                    lng: client.locale,
                  }) + (newObj.giftMessage ? ` "${newObj.giftMessage}"` : ''),
            )
          } catch (e) {
            logger.error('Error sending notification to chat', {
              error: e,
              userId: client.token,
            })
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

            // Store the steam32Id before clearing cache
            const deletedSteam32Id = oldObj.steam32Id

            // A delete will reset their status in memory so they can reconnect anything
            await clearCacheForUser(client)

            // We try deleting those users so they can attempt a new connection
            if (Array.isArray(oldObj.connectedUserIds)) {
              for (const connectedToken of oldObj.connectedUserIds) {
                const connectedClient = gsiHandlers.get(connectedToken)?.client

                // If client exists, clear its cache
                if (connectedClient) {
                  // Explicitly clear multiAccount if it matches the deleted account
                  if (connectedClient.multiAccount === deletedSteam32Id) {
                    connectedClient.multiAccount = undefined
                  }
                  await clearCacheForUser(connectedClient)
                }
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
