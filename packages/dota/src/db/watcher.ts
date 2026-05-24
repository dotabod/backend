import type { Tables } from '@dotabod/shared-utils'
import { getAuthProvider, getTwitchAPI, logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { clearCacheForUser } from '../dota/clearCacheForUser'
import findUser from '../dota/lib/connectedStreamers'
import { gsiHandlers, invalidTokens } from '../dota/lib/consts'
import { getRankDetail } from '../dota/lib/ranks'
import { server } from '../dota/server'
import { DBSettings } from '../settings'
import { twitchChat } from '../steam/ws'
import { chatClient } from '../twitch/chatClient'
import { toggleDotabod } from '../twitch/toggleDotabod'
import { isSubscriptionActive } from '../types/subscription'
import getDBUser from './getDBUser'
import { handleUserOnlineMessages } from './handleScheduledMessages'
import { handleStreamStatusTransition } from './handleStreamStatusTransition'

class SetupSupabase {
  // supabase realtime `.on('postgres_changes')` overloads require RealtimePostgresChangesPayload
  // callbacks; typing this properly cascades into every handler, so it stays loose here.
  channel: any
  IS_DEV: boolean

  constructor() {
    this.IS_DEV = process.env.DOTABOD_ENV !== 'production'
    this.channel = supabase.channel(`${this.IS_DEV ? 'dev-' : ''}dota`)

    logger.info('Starting watcher for', {
      dev: this.IS_DEV,
    })
  }

  toggleHandler = async (userId: string, enable: boolean) => {
    const { result: client } = await getDBUser({ token: userId })
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
            const accountId = client.Account?.providerAccountId
            await clearCacheForUser(client)
            // User row is gone — allow a future re-onboarding under the same
            // id to bypass the negative cache.
            invalidTokens.delete(client.token)
            if (accountId) invalidTokens.delete(accountId)
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
            const client = findUser(newObj.userId)
            if (client) {
              await clearCacheForUser(client)
            }
            // Persist both keyspaces: getDBUser is called with either the user.id
            // (GSI path) or the providerAccountId (Twitch chat / tooltips path).
            // Add AFTER clearCacheForUser — see ban branch for rationale.
            invalidTokens.add(newObj.userId)
            if (newObj.providerAccountId) invalidTokens.add(newObj.providerAccountId)
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
                logger.error('[TWITCHAPI] Error updating twurple token', {
                  twitchId,
                  e,
                })
              })
            }
          }

          // The frontend will set it to false when they relogin
          // Which allows us to update the authProvider object
          if (newObj.requires_refresh === false && oldObj.requires_refresh === true) {
            invalidTokens.delete(newObj.userId)
            if (newObj.providerAccountId) invalidTokens.delete(newObj.providerAccountId)
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
        async (payload: { new: Tables<'users'>; old: Tables<'users'> }) => {
          const newObj: Tables<'users'> = payload.new
          const oldObj: Tables<'users'> = payload.old

          // Live ban: banned_at transitioned null → set. Invalidate cached
          // tokens for both keyspaces (user.id and providerAccountId) and
          // drop the in-memory GSIHandler so the next GSI POST hits
          // getDBUser's banned-check and is rejected.
          if (!oldObj.banned_at && newObj.banned_at) {
            const client = findUser(newObj.id)
            const accountId = client?.Account?.providerAccountId
            if (client) {
              logger.info('[WATCHER USER] Banning user', { name: client.name })
              await clearCacheForUser(client)
            }
            // Add AFTER clearCacheForUser so the token stays in the negative
            // cache. (Until clearCacheForUser stopped touching invalidTokens
            // these adds were silently undone.)
            invalidTokens.add(newObj.id)
            if (accountId) invalidTokens.add(accountId)
            return
          }

          // Unban: banned_at transitioned set → null. Drop the negative-cache
          // entries so the next GSI POST / chat message can resolve normally.
          // clearCacheForUser already ran on ban; the user just needs to be
          // allowed through again.
          if (oldObj.banned_at && !newObj.banned_at) {
            invalidTokens.delete(newObj.id)
            // We may not have a live client (it was cleared on ban). Look up
            // the providerAccountId so both keyspaces are cleared.
            const client = findUser(newObj.id)
            const accountId = client?.Account?.providerAccountId
            if (accountId) invalidTokens.delete(accountId)
            logger.info('[WATCHER USER] Unbanning user', { userId: newObj.id })
            return
          }

          const client = findUser(newObj.id)
          if (!client) return

          client.name = newObj.name
          client.locale = newObj.locale
          client.beta_tester = newObj.beta_tester
          client.stream_online = newObj.stream_online

          const streamStatusTransition = handleStreamStatusTransition({
            client,
            connectedUser: gsiHandlers.get(client.token),
            io: server.io,
            logger,
            oldStreamOnline: oldObj.stream_online,
          })

          if (streamStatusTransition.wentOffline) {
            return
          }

          if (streamStatusTransition.cameOnline) {
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
          // Fetch the subscription details to get the userId
          const { data: subscriptionData, error: subError } = await supabase
            .from('subscriptions')
            .select('userId')
            .eq('id', newObj.subscriptionId)
            .eq('isGift', true)
            .maybeSingle() // Use maybeSingle to handle potential null result gracefully

          if (subError || !subscriptionData) {
            logger.error('Error fetching subscription or subscription not found for gift', {
              giftId: newObj.id,
              subscriptionId: newObj.subscriptionId,
              error: subError,
            })
            return
          }

          const client = findUser(subscriptionData.userId)

          // Only proceed if the client is found and currently considered online
          if (!client?.stream_online) {
            logger.info('Gift notification skipped: Client not found or not online', {
              userId: subscriptionData.userId,
              found: !!client,
              online: client?.stream_online,
            })
            return
          }

          try {
            // Calculate duration string
            let durationString = ''
            const giftQuantityRaw = newObj.giftQuantity

            // Check if giftQuantityRaw is a valid number representation (string or number) and positive
            const giftQuantityNum = Number(giftQuantityRaw)
            const isValidQuantity = !Number.isNaN(giftQuantityNum) && giftQuantityNum > 0

            if (isValidQuantity) {
              const giftType = newObj.giftType

              if (giftType) {
                if (giftType === 'monthly') {
                  durationString =
                    giftQuantityNum === 1 ? '(1 month)' : `(${giftQuantityNum} months)`
                } else if (giftType === 'annual') {
                  durationString = giftQuantityNum === 1 ? '(1 year)' : `(${giftQuantityNum} years)`
                } else if (giftType === 'lifetime') {
                  durationString = '(Lifetime)'
                }
                // Add more gift types here if necessary
              } else {
                logger.warn('Gift type missing, cannot determine duration string', {
                  giftId: newObj.id,
                  giftQuantity: giftQuantityNum,
                })
              }
            } else if (giftQuantityRaw != null) {
              // Log only if it was provided but invalid
              logger.warn('Gift quantity is invalid or not positive', {
                giftId: newObj.id,
                giftQuantity: giftQuantityRaw,
              })
            }
            // If quantity is null/undefined, we just don't add a duration string silently.

            // Construct the base message using translation keys
            const baseMessage = newObj.senderName
              ? t('giftSub', {
                  senderName: newObj.senderName,
                  lng: client.locale,
                })
              : t('giftSubAnonymous', {
                  lng: client.locale,
                })

            // Prepare optional details parts
            const detailsParts: string[] = []
            if (durationString) {
              detailsParts.push(durationString)
            }
            if (newObj.giftMessage) {
              // Ensure message is trimmed and quoted
              const trimmedMessage = String(newObj.giftMessage).trim()
              if (trimmedMessage) {
                detailsParts.push(`"${trimmedMessage}"`)
              }
            }

            // Combine base message and details with proper spacing
            let fullMessage = baseMessage
            if (detailsParts.length > 0) {
              fullMessage += ` ${detailsParts.join(' ')}`
            }

            // Send notification message to chat
            logger.info(`Sending gift notification: ${fullMessage}`) // Add logging
            chatClient.say(client.name, fullMessage)
          } catch (e) {
            logger.error('Error constructing or sending gift notification to chat', {
              error: e,
              userId: client.token,
              giftId: newObj.id,
            })
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload: { new: Tables<'settings'> }) => {
          const newObj: Tables<'settings'> = payload.new
          const client = findUser(newObj.userId)

          if (newObj.key === DBSettings.commandDisable) {
            // Notify twitch-chat package to clear disable cache when user is manually re-enabled
            if (newObj.value === false) {
              twitchChat.emit('clear-disable-cache', { userId: newObj.userId })
            }

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
          logger.debug('[WATCHER SETTING] Sending new setting value to socket', {
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
        async (payload: {
          new: Tables<'steam_accounts'>
          old: Tables<'steam_accounts'>
          eventType: string
        }) => {
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
            const accountId = client.Account?.providerAccountId

            // A delete will reset their status in memory so they can reconnect anything
            await clearCacheForUser(client)
            // Allow re-onboarding after the steam unlink (clearCacheForUser no
            // longer touches invalidTokens, so the negative-cache entry must
            // be dropped explicitly).
            invalidTokens.delete(client.token)
            if (accountId) invalidTokens.delete(accountId)

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
                  const connectedAccountId = connectedClient.Account?.providerAccountId
                  await clearCacheForUser(connectedClient)
                  invalidTokens.delete(connectedClient.token)
                  if (connectedAccountId) invalidTokens.delete(connectedAccountId)
                }
              }
            }

            return
          }

          logger.debug('[WATCHER STEAM] Updating steam accounts for', {
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
      .subscribe((status: string, err?: Error) => {
        logger.info('[SUPABASE] Subscription status on dota:', { status, err })
      })
  }
}

export default SetupSupabase
