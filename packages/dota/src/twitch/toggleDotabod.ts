import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { gsiHandlers } from '../dota/lib/consts'
import { chatClient } from './chatClient'
import { twitchEvent } from './index'

// Deduplication cache to prevent duplicate toggle messages
const toggleMessageCache = new Map<string, { timestamp: number; disabled: boolean }>()
const TOGGLE_MESSAGE_COOLDOWN = 5000 // 5 seconds

export function toggleDotabod(token: string, isBotDisabled: boolean, channel: string, lng = 'en') {
  // Check if we recently sent a toggle message for this user to prevent duplicates
  const cacheKey = `${token}:${channel}`
  const cached = toggleMessageCache.get(cacheKey)
  const now = Date.now()

  if (
    cached &&
    now - cached.timestamp < TOGGLE_MESSAGE_COOLDOWN &&
    cached.disabled === isBotDisabled
  ) {
    logger.info('[TOGGLE] Skipping duplicate toggle message', { channel, isBotDisabled, token })
    return
  }

  const gsiHandler = gsiHandlers.get(token)
  const hasHandler = gsiHandlers.has(token)

  if (!hasHandler) {
    logger.info('[GSI] Could not find client', { channel, token })
    return
  }

  if (isBotDisabled) {
    logger.info('[GSI] Disabling client', { channel, token })
    gsiHandler?.disable()
  } else {
    logger.info('[GSI] Enabling client', { channel, token })
    twitchEvent.emit('enable', gsiHandler?.getChannelId())
    gsiHandler?.enable()
  }

  // Update cache before sending message
  toggleMessageCache.set(cacheKey, { disabled: isBotDisabled, timestamp: now })

  chatClient.say(
    channel,
    t('toggle', { context: isBotDisabled ? 'disabled' : 'enabled', lng }),
    undefined,
    true
  )
}
