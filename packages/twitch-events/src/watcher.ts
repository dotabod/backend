import { botStatus, logger, supabase } from '@dotabod/shared-utils'
import type { Tables } from '@dotabod/shared-utils'

import { handleNewUser } from './handle-new-user'
import { stopUserSubscriptions } from './twitch/lib/revoke-event'

const IS_DEV = process.env.DOTABOD_ENV !== 'production'
const RECONNECT_DELAY_MS = 5000
const RECONNECT_STATUSES = new Set(['CHANNEL_ERROR', 'CLOSED', 'TIMED_OUT'])

type AccountRow = Tables<'accounts'>
type UserRow = Tables<'users'>

export interface WatcherDependencies {
  executeHandler: (operation: Promise<void>) => void
}

const defaultDependencies: WatcherDependencies = {
  executeHandler: (operation) => {
    void operation
  },
}

const hasText = function hasText(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.length > 0
}

const handleAccountInsert = async function handleAccountInsert(payload: {
  new: AccountRow
}): Promise<void> {
  const account = payload.new
  if (account.provider !== 'twitch') {
    return
  }

  logger.info('[WATCHER] INSERT accounts → onboarding new user', {
    providerAccountId: account.providerAccountId,
  })
  try {
    await handleNewUser(account.providerAccountId)
  } catch (error) {
    logger.error('[WATCHER] INSERT handleNewUser failed', {
      error,
      providerAccountId: account.providerAccountId,
    })
  }
}

const handleAccountUpdate = async function handleAccountUpdate(payload: {
  new: AccountRow
  old: Partial<AccountRow>
}): Promise<void> {
  const account = payload.new
  if (
    account.provider !== 'twitch' ||
    payload.old.requires_refresh !== true ||
    account.requires_refresh !== false
  ) {
    return
  }

  if (account.providerAccountId === process.env.TWITCH_BOT_PROVIDERID) {
    logger.info('[WATCHER] Bot no longer banned, clearing status')
    botStatus.isBanned = false
  }
  logger.info('[WATCHER] Refresh token cleared, re-subscribing events', {
    providerAccountId: account.providerAccountId,
  })
  try {
    await handleNewUser(account.providerAccountId)
  } catch (error) {
    logger.error('[WATCHER] UPDATE handleNewUser failed', {
      error,
      providerAccountId: account.providerAccountId,
    })
  }
}

const handleAccountDelete = async function handleAccountDelete(payload: {
  old: Partial<AccountRow>
}): Promise<void> {
  const account = payload.old
  const { providerAccountId } = account
  if (account.provider !== 'twitch' || !hasText(providerAccountId)) {
    return
  }

  logger.info('[WATCHER] Account deleted, stopping subscriptions', { providerAccountId })
  try {
    await stopUserSubscriptions(providerAccountId)
  } catch (error) {
    logger.error('[WATCHER] DELETE stopUserSubscriptions failed', {
      error,
      providerAccountId,
    })
  }
}

const handleBanTransition = async function handleBanTransition(
  newUser: UserRow,
  oldUser: Partial<UserRow>
): Promise<boolean> {
  if (hasText(oldUser.banned_at) || !hasText(newUser.banned_at)) {
    return false
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('providerAccountId')
    .eq('userId', newUser.id)
    .eq('provider', 'twitch')
    .single()
  if (accountError !== null) {
    logger.error('[WATCHER] ban: provider lookup failed', {
      error: accountError,
      userId: newUser.id,
    })
    return true
  }
  if (!hasText(account?.providerAccountId)) {
    logger.warn('[WATCHER] ban: no twitch account row for user', { userId: newUser.id })
    return true
  }

  const { providerAccountId } = account
  logger.info('[WATCHER] User banned, stopping subscriptions', {
    providerAccountId,
    userId: newUser.id,
  })
  try {
    await stopUserSubscriptions(providerAccountId)
  } catch (error) {
    logger.error('[WATCHER] ban: stopUserSubscriptions failed', {
      error,
      providerAccountId,
      userId: newUser.id,
    })
  }
  return true
}

const handleUserRename = async function handleUserRename(
  newUser: UserRow,
  oldUser: Partial<UserRow>
): Promise<void> {
  if (oldUser.name === newUser.name && oldUser.displayName === newUser.displayName) {
    return
  }

  logger.info('[WATCHER] User renamed', {
    newDisplayName: newUser.displayName,
    newName: newUser.name,
    oldDisplayName: oldUser.displayName,
    oldName: oldUser.name,
    userId: newUser.id,
  })
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('providerAccountId')
    .eq('userId', newUser.id)
    .eq('provider', 'twitch')
    .single()
  if (accountError !== null) {
    logger.error('[WATCHER] DB error during user rename lookup', {
      error: accountError,
      userId: newUser.id,
    })
    return
  }
  if (!hasText(account?.providerAccountId)) {
    logger.warn('[WATCHER] User renamed but no twitch account row found', {
      userId: newUser.id,
    })
    return
  }

  if (!hasText(oldUser.displayName)) {
    logger.warn('[WATCHER] UPDATE users with legacy empty displayName (frontend not deployed?)', {
      userId: newUser.id,
    })
  }
  try {
    await handleNewUser(account.providerAccountId, false)
  } catch (error) {
    logger.error('[WATCHER] UPDATE users handleNewUser failed', {
      error,
      providerAccountId: account.providerAccountId,
    })
  }
}

const handleUserUpdate = async function handleUserUpdate(payload: {
  new: UserRow
  old: Partial<UserRow>
}): Promise<void> {
  if (await handleBanTransition(payload.new, payload.old)) {
    return
  }
  await handleUserRename(payload.new, payload.old)
}

const executeHandler = async function executeHandler(
  operation: Promise<void>,
  handlerName: string
): Promise<void> {
  try {
    await operation
  } catch (error) {
    logger.error('[WATCHER] Realtime handler failed', { error, handlerName })
  }
}

export const setupAccountWatcher = function setupAccountWatcher(
  dependencies: WatcherDependencies = defaultDependencies
): void {
  const channelName = `${IS_DEV ? 'dev-' : ''}twitch-events`
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let activeChannel: ReturnType<typeof supabase.channel> | null = null

  const connection = {
    scheduleReconnect(status: string, error?: Error): void {
      if (reconnectTimer !== null) {
        return
      }

      reconnectTimer = setTimeout(() => {
        connection.subscribe()
      }, RECONNECT_DELAY_MS)
      const deadChannel = activeChannel
      activeChannel = null
      logger.warn('[WATCHER] Realtime channel down, scheduling reconnect', {
        delayMs: RECONNECT_DELAY_MS,
        err: error?.message,
        status,
      })
      if (deadChannel !== null) {
        void supabase.removeChannel(deadChannel)
      }
    },
    subscribe(): void {
      reconnectTimer = null
      let channel: ReturnType<typeof supabase.channel>
      try {
        channel = supabase.channel(channelName)
        activeChannel = channel
      } catch (error) {
        logger.error('[WATCHER] supabase.channel() threw — scheduling reconnect', {
          channelName,
          err: error instanceof Error ? error.message : String(error),
        })
        activeChannel = null
        connection.scheduleReconnect(
          'CHANNEL_CREATION_THREW',
          error instanceof Error ? error : undefined
        )
        return
      }

      logger.info('[WATCHER] Starting accounts/users watcher', { channelName })
      try {
        channel
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'accounts' },
            (payload: { new: AccountRow }) => {
              dependencies.executeHandler(
                executeHandler(handleAccountInsert(payload), 'INSERT:accounts')
              )
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'accounts' },
            (payload: { new: AccountRow; old: Partial<AccountRow> }) => {
              dependencies.executeHandler(
                executeHandler(handleAccountUpdate(payload), 'UPDATE:accounts')
              )
            }
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'accounts' },
            (payload: { old: Partial<AccountRow> }) => {
              dependencies.executeHandler(
                executeHandler(handleAccountDelete(payload), 'DELETE:accounts')
              )
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'users' },
            (payload: { new: UserRow; old: Partial<UserRow> }) => {
              dependencies.executeHandler(executeHandler(handleUserUpdate(payload), 'UPDATE:users'))
            }
          )
          .subscribe((status: string, error?: Error) => {
            if (status === 'SUBSCRIBED') {
              logger.info('[WATCHER] Subscribed to Realtime channel', { channelName })
              return
            }
            if (RECONNECT_STATUSES.has(status)) {
              connection.scheduleReconnect(status, error)
            }
          })
      } catch (error) {
        logger.error('[WATCHER] channel.on/.subscribe threw — scheduling reconnect', {
          channelName,
          err: error instanceof Error ? error.message : String(error),
        })
        connection.scheduleReconnect(
          'CHANNEL_SETUP_THREW',
          error instanceof Error ? error : undefined
        )
      }
    },
  }

  connection.subscribe()
}
