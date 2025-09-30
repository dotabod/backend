import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { chatClient } from './chatClient.js'

// Maps for alt account detection
const altAccountCache: Record<string, boolean> = {}
const lastAltAccountMessageTimestamps: Record<string, number> = {}
const ALT_ACCOUNT_COOLDOWN_MS = 300000 // 5 minutes

const speak = true

// Function to check for alt accounts with caching and cooldown
export async function checkAltAccount(
  channel: string,
  chattersUsername: string,
  twitchChannelId: string,
  userInfo: { userId: string },
  messageId: string,
  client: any,
) {
  // If already cached as not an alt account, skip
  if (altAccountCache[chattersUsername] === false) return

  // If cached as alt account, check cooldown before sending message
  if (altAccountCache[chattersUsername] === true) {
    const now = Date.now()
    const lastTime = lastAltAccountMessageTimestamps[chattersUsername] || 0
    if (now - lastTime < ALT_ACCOUNT_COOLDOWN_MS) return

    if (speak) {
      chatClient.say(
        channel,
        t('altAccount', {
          emote: 'hesRight',
          emote2: 'PepeMods',
          name: chattersUsername,
          lng: client.locale || 'en',
        }),
        messageId,
      )
    }
    lastAltAccountMessageTimestamps[chattersUsername] = now
    return
  }

  // Not cached, perform the check
  try {
    const api = await getTwitchAPI(twitchChannelId)
    const userData = await api.users.getUserByName(chattersUsername)
    if (!userData) {
      altAccountCache[chattersUsername] = false
      return
    }

    const accountCreationDate = userData.creationDate
    const {
      data: [follow],
    } = await api.channels.getChannelFollowers(twitchChannelId, userInfo.userId)
    if (!follow) {
      altAccountCache[chattersUsername] = false
      return
    }

    const followageDate = follow.followDate
    const timeDifference = accountCreationDate.getTime() - followageDate.getTime()
    const daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24))
    const isAlt = daysDifference >= 0 && daysDifference < 10

    altAccountCache[chattersUsername] = isAlt

    if (isAlt) {
      const now = Date.now()
      const lastTime = lastAltAccountMessageTimestamps[chattersUsername] || 0
      if (now - lastTime >= ALT_ACCOUNT_COOLDOWN_MS) {
        if (speak) {
          chatClient.say(
            channel,
            t('altAccount', {
              emote: 'hesRight',
              emote2: 'PepeMods',
              name: chattersUsername,
              lng: client.locale || 'en',
            }),
            messageId,
          )
        }
        lastAltAccountMessageTimestamps[chattersUsername] = now
      }
    }
  } catch (e) {
    logger.error('Error checking alt account', { error: e, channel, user: chattersUsername })
    altAccountCache[chattersUsername] = false // Don't retry on error
  }
}

//await checkAltAccount('masondota2', 'loco42001', '40754777', { userId: '899787215' }, 'message', {
//  locale: 'en',
//})
