import type { Tables } from '@dotabod/shared-utils'
import { getAuthProvider, getTwitchAPI, logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { clearCacheForUser } from '../dota/clear-cache-for-user'
import findUser from '../dota/lib/connected-streamers'
import { gsiHandlers, invalidTokens, twitchIdToToken, twitchNameToToken } from '../dota/lib/consts'
import { getRankDetail } from '../dota/lib/ranks'
import { server } from '../dota/server'
import { SETUP_SIGNAL_KEYS } from '../dota/setup-signal-keys'
import { DBSettings } from '../settings'
import { twitchChat } from '../steam/ws'
import { chatClient } from '../twitch/chat-client'
import { toggleDotabod } from '../twitch/toggle-dotabod'
import { isSubscriptionActive } from '../types/subscription'
import getDBUser from './get-db-user'
import { handleUserOnlineMessages } from './handle-scheduled-messages'
import { handleStreamStatusTransition } from './handle-stream-status-transition'

const setupSignalKeys = new Set<string>(Object.values(SETUP_SIGNAL_KEYS))

const isNonEmptyString = function isNonEmptyString(
  value: string | null | undefined
): value is string {
  return value !== null && value !== undefined && value.length > 0
}

class SetupSupabase {
  channel: ReturnType<typeof supabase.channel>
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
    if (!client) {
      return
    }

    toggleDotabod(userId, enable, client.name, client.locale)
  }

  clearSteamUsers = async (userIds: Iterable<string>) => {
    for (const userId of new Set(userIds)) {
      if (!userId) {
        continue
      }

      const client = findUser(userId)
      const accountIds = new Set<string>()
      if (isNonEmptyString(client?.Account?.providerAccountId)) {
        accountIds.add(client.Account.providerAccountId)
      }
      for (const [accountId, token] of twitchIdToToken) {
        if (token === userId) {
          accountIds.add(accountId)
        }
      }

      if (client) {
        await clearCacheForUser(client)
      }

      invalidTokens.delete(userId)
      for (const accountId of accountIds) {
        twitchIdToToken.delete(accountId)
        invalidTokens.delete(accountId)
      }
      for (const [name, token] of twitchNameToToken) {
        if (token === userId) {
          twitchNameToToken.delete(name)
        }
      }
    }
  }

  init() {
    this.channel
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'users' },
        async (payload: { old: Partial<Tables<'users'>> }) => {
          logger.info('Removing user', payload)

          const oldObj = payload.old
          const client = findUser(oldObj.id ?? '')
          if (client) {
            logger.info('[WATCHER USER] Deleting user', { name: client.name })
            const accountId = client.Account?.providerAccountId
            await clearCacheForUser(client)
            // User row is gone — allow a future re-onboarding under the same
            // id to bypass the negative cache.
            invalidTokens.delete(client.token)
            if (isNonEmptyString(accountId)) {
              invalidTokens.delete(accountId)
            }
            return
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'subscriptions' },
        (payload: { new: Tables<'subscriptions'> }) => {
          const newObj = payload.new
          const client = findUser(newObj.userId)

          if (!client) {
            return
          }

          if (isSubscriptionActive(newObj)) {
            client.subscription = {
              id: newObj.id,
              isGift: newObj.isGift,
              status: newObj.status,
              tier: newObj.tier,
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'subscriptions' },
        async (payload: {
          new: Tables<'subscriptions'>
          old: Partial<Tables<'subscriptions'>>
        }) => {
          const newObj = payload.new
          const client = findUser(newObj.userId)

          if (!client) {
            return
          }

          const isNewActive = isSubscriptionActive(newObj)
          if (isNewActive) {
            // Update with new details
            client.subscription = {
              id: newObj.id,
              isGift: newObj.isGift,
              status: newObj.status,
              tier: newObj.tier,
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
                isGift: activeSubscription.data.isGift,
                status: activeSubscription.data.status,
                tier: activeSubscription.data.tier,
              }
            } else {
              // No other active subscriptions found
              client.subscription = undefined
            }
            return
          }
        }
      )
      // Needs `ALTER TABLE subscriptions REPLICA IDENTITY FULL;` to receive full object on DELETE
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'subscriptions' },
        async (payload: { old: Partial<Tables<'subscriptions'>> }) => {
          const oldObj = payload.old
          if (!isNonEmptyString(oldObj.userId) || !isNonEmptyString(oldObj.id)) {
            return
          }
          const client = findUser(oldObj.userId)

          if (!client) {
            return
          }

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
                isGift: activeSubscription.data.isGift,
                status: activeSubscription.data.status,
                tier: activeSubscription.data.tier,
              }
            } else {
              // No other active subscriptions found
              client.subscription = undefined
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'accounts' },
        async (payload: { new: Tables<'accounts'>; old: Partial<Tables<'accounts'>> }) => {
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
            if (newObj.providerAccountId) {
              invalidTokens.add(newObj.providerAccountId)
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
              getTwitchAPI(twitchId).catch((error) => {
                logger.error('[TWITCHAPI] Error updating twurple token', {
                  error,
                  twitchId,
                })
              })
            }
          }

          // The frontend will set it to false when they relogin
          // Which allows us to update the authProvider object
          if (newObj.requires_refresh === false && oldObj.requires_refresh === true) {
            invalidTokens.delete(newObj.userId)
            if (newObj.providerAccountId) {
              invalidTokens.delete(newObj.providerAccountId)
            }
            logger.info('[WATCHER ACCOUNT] Refreshing account', {
              twitchId: newObj.providerAccountId,
            })

            const client = findUser(newObj.userId)
            if (client) {
              await clearCacheForUser(client)
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        async (payload: { new: Tables<'users'>; old: Partial<Tables<'users'>> }) => {
          const newObj: Tables<'users'> = payload.new
          const oldObj = payload.old

          // Live ban: banned_at transitioned null → set. Invalidate cached
          // tokens for both keyspaces (user.id and providerAccountId) and
          // drop the in-memory GSIHandler so the next GSI POST hits
          // getDBUser's banned-check and is rejected.
          if (!isNonEmptyString(oldObj.banned_at) && isNonEmptyString(newObj.banned_at)) {
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
            if (isNonEmptyString(accountId)) {
              invalidTokens.add(accountId)
            }
            return
          }

          // Unban: banned_at transitioned set → null. Drop the negative-cache
          // entries so the next GSI POST / chat message can resolve normally.
          // clearCacheForUser already ran on ban; the user just needs to be
          // allowed through again.
          if (isNonEmptyString(oldObj.banned_at) && !isNonEmptyString(newObj.banned_at)) {
            invalidTokens.delete(newObj.id)
            // We may not have a live client (it was cleared on ban). Look up
            // the providerAccountId so both keyspaces are cleared.
            const client = findUser(newObj.id)
            const accountId = client?.Account?.providerAccountId
            if (isNonEmptyString(accountId)) {
              invalidTokens.delete(accountId)
            }
            logger.info('[WATCHER USER] Unbanning user', { userId: newObj.id })
            return
          }

          const client = findUser(newObj.id)
          if (!client) {
            return
          }

          client.name = newObj.name
          client.locale = newObj.locale
          client.beta_tester = newObj.beta_tester
          client.stream_online = newObj.stream_online
          if (typeof newObj.stream_start_date === 'string') {
            client.stream_start_date = new Date(newObj.stream_start_date)
          } else {
            client.stream_start_date = newObj.stream_start_date
          }

          const connectedUser = gsiHandlers.get(client.token)

          const streamStatusTransition = handleStreamStatusTransition({
            client,
            connectedUser,
            io: server.io,
            logger,
            oldStreamOnline: oldObj.stream_online ?? false,
          })

          if (streamStatusTransition.wentOffline) {
            return
          }

          if (streamStatusTransition.cameOnline) {
            // Handle any pending scheduled messages for this user
            await handleUserOnlineMessages(client.token, client.name)
            connectedUser?.emitWLUpdate()
          }

          // dont overwrite with 0 because we use this variable to track currently logged in mmr
          if (newObj.mmr !== 0 && client.mmr !== newObj.mmr && oldObj.mmr !== newObj.mmr) {
            client.mmr = newObj.mmr

            if (!client.stream_online) {
              return
            }
            logger.info('[WATCHER MMR] Sending mmr to socket', {
              mmr: newObj.mmr,
              name: client.name,
            })
            try {
              const deets = await getRankDetail(newObj.mmr, client.steam32Id)
              server.io.to(client.token).emit('update-medal', deets)
            } catch (error) {
              logger.error('Error in watcher postgres update', { error })
            }
          }
        }
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
            // Use maybeSingle to handle potential null result gracefully
            .maybeSingle()

          if (subError || !subscriptionData) {
            logger.error('Error fetching subscription or subscription not found for gift', {
              error: subError,
              giftId: newObj.id,
              subscriptionId: newObj.subscriptionId,
            })
            return
          }

          const client = findUser(subscriptionData.userId)

          // Only proceed if the client is found and currently considered online
          if (client === null || client.stream_online !== true) {
            logger.info('Gift notification skipped: Client not found or not online', {
              found: client !== null,
              online: client?.stream_online,
              userId: subscriptionData.userId,
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
              const { giftType } = newObj

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
            } else if (giftQuantityRaw !== null && giftQuantityRaw !== undefined) {
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
                  lng: client.locale,
                  senderName: newObj.senderName,
                })
              : t('giftSubAnonymous', {
                  lng: client.locale,
                })

            // Prepare optional details parts
            const detailsParts: string[] = []
            if (durationString) {
              detailsParts.push(durationString)
            }
            if (isNonEmptyString(newObj.giftMessage)) {
              // Ensure message is trimmed and quoted
              const trimmedMessage = String(newObj.giftMessage).trim()
              if (trimmedMessage.length > 0) {
                detailsParts.push(`"${trimmedMessage}"`)
              }
            }

            // Combine base message and details with proper spacing
            let fullMessage = baseMessage
            if (detailsParts.length > 0) {
              fullMessage += ` ${detailsParts.join(' ')}`
            }

            // Send notification message to chat
            // Add logging
            logger.info(`Sending gift notification: ${fullMessage}`)
            chatClient.say(client.name, fullMessage)
          } catch (error) {
            logger.error('Error constructing or sending gift notification to chat', {
              error,
              giftId: newObj.id,
              userId: client.token,
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload: { new: Partial<Tables<'settings'>> }) => {
          const newObj = payload.new
          if (!isNonEmptyString(newObj.userId) || !isNonEmptyString(newObj.key)) {
            return
          }
          if (setupSignalKeys.has(newObj.key)) {
            return
          }
          const client = findUser(newObj.userId)

          if (newObj.key === DBSettings.commandDisable) {
            const enabled = Boolean(newObj.value)
            // Notify twitch-chat package to clear disable cache when user is manually re-enabled
            if (newObj.value === false) {
              twitchChat.emit('clear-disable-cache', { userId: newObj.userId })
            }

            if (client) {
              toggleDotabod(newObj.userId, enabled, client.name, client.locale)
            } else {
              // in case they ban dotabod and we reboot server,
              // we'll never have the client cached, so we have to lookup the user again
              try {
                void this.toggleHandler(newObj.userId, enabled)
              } catch (error) {
                logger.error('Error in toggleHandler', { error })
              }
            }
          }

          if (!client) {
            return
          }

          // replace the new setting with the one we have saved in cache
          logger.debug('[WATCHER SETTING] Updating setting for', {
            name: client.name,
            newObj,
          })
          const setting = client.settings.find((s) => s.key === newObj.key)

          if (setting) {
            setting.value = newObj.value
          } else {
            client.settings.push({ key: newObj.key, value: newObj.value })
          }

          if (newObj.key === DBSettings.wlStatsDays || newObj.key === DBSettings.wlStatsStartDate) {
            gsiHandlers.get(client.token)?.emitWLUpdate()
          }

          // Sending this one even when offline, because they might be testing locally
          logger.debug('[WATCHER SETTING] Sending new setting value to socket', {
            key: newObj.key,
            name: client.name,
            value: newObj.value,
          })
          server.io.to(client.token).emit('refresh-settings', newObj.key)
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'win_loss_adjustments' },
        (payload: { new: Tables<'win_loss_adjustments'> }) => {
          const client = findUser(payload.new.user_id)
          if (!client) {
            return
          }

          gsiHandlers.get(client.token)?.emitWLUpdate(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'steam_accounts' },
        async (payload: {
          new: Partial<Tables<'steam_accounts'>>
          old: Partial<Tables<'steam_accounts'>>
          eventType: string
        }) => {
          const newObj = payload.new
          const oldObj = payload.old

          if (payload.eventType === 'DELETE') {
            logger.info('[WATCHER STEAM] Deleting steam account for', {
              userId: oldObj.userId,
            })

            await this.clearSteamUsers([
              oldObj.userId ?? '',
              ...(Array.isArray(oldObj.connectedUserIds) ? oldObj.connectedUserIds : []),
            ])

            return
          }

          if (
            !isNonEmptyString(newObj.userId) ||
            newObj.leaderboard_rank === undefined ||
            newObj.mmr === undefined ||
            newObj.name === undefined ||
            newObj.steam32Id === undefined
          ) {
            return
          }

          if (payload.eventType === 'UPDATE') {
            const oldConnectedUserIds = new Set(oldObj.connectedUserIds ?? [])
            const newConnectedUserIds = new Set(newObj.connectedUserIds ?? [])
            const affectedUserIds = new Set<string>()

            for (const userId of oldConnectedUserIds) {
              if (!newConnectedUserIds.has(userId)) {
                affectedUserIds.add(userId)
              }
            }

            if (oldObj.userId !== newObj.userId) {
              if (isNonEmptyString(oldObj.userId)) {
                affectedUserIds.add(oldObj.userId)
              }
              affectedUserIds.add(newObj.userId)
            }

            if (affectedUserIds.size > 0) {
              await this.clearSteamUsers(affectedUserIds)
            }
          }

          const client = findUser(newObj.userId)

          // Just here to update local memory
          if (!client) {
            return
          }

          logger.debug('[WATCHER STEAM] Updating steam accounts for', {
            name: client.name,
          })

          const currentSteamIdx = client.SteamAccount.findIndex(
            (s) => s.steam32Id === newObj.steam32Id
          )
          if (currentSteamIdx === -1) {
            client.SteamAccount.push({
              leaderboard_rank: newObj.leaderboard_rank,
              mmr: newObj.mmr,
              name: newObj.name,
              steam32Id: newObj.steam32Id,
            })
          } else {
            client.SteamAccount[currentSteamIdx].name = newObj.name
            client.SteamAccount[currentSteamIdx].mmr = newObj.mmr
            client.SteamAccount[currentSteamIdx].leaderboard_rank = newObj.leaderboard_rank
          }

          // Push an mmr update to overlay since it's the steam account rn
          if (client.steam32Id === newObj.steam32Id) {
            client.mmr = newObj.mmr

            if (!client.stream_online) {
              return
            }

            getRankDetail(newObj.mmr, newObj.steam32Id)
              .then((deets) => {
                server.io.to(client.token).emit('update-medal', deets)
              })
              .catch((error) => {
                logger.info('[WATCHER STEAM] Error getting rank detail', { error })
              })
          }
        }
      )
      .subscribe((status: string, err?: Error) => {
        logger.info('[SUPABASE] Subscription status on dota:', { err, status })
      })
  }
}

export default SetupSupabase
