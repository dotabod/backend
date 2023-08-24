import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { GSIHandler, say } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

// todo: make sure streamer has gold to buy tp?
eventHandler.registerEvent(`items:teleport0:name`, {
  handler: (dotaClient: GSIHandler, itemName: 'item_tpscroll' | 'empty') => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const secondsToWait = 30

    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      noTp: { enabled: chatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    if (!chattersEnabled || !chatterEnabled) {
      return
    }

    function resetTimer() {
      clearTimeout(dotaClient.noTpChatter.timeout)
      dotaClient.noTpChatter.timeout = undefined
      dotaClient.noTpChatter.lastRemindedDate = undefined
    }

    const hasTp = itemName !== 'empty'
    const deadge = dotaClient.client.gsi?.hero?.alive === false

    if (hasTp) {
      // they got a tp within 30s so no scolding
      if (dotaClient.noTpChatter.timeout) {
        return resetTimer()
      }

      // they got a tp after 30s so tell how long its been
      if (dotaClient.noTpChatter.lastRemindedDate) {
        const timeSinceLastReminder =
          (Date.now() - dotaClient.noTpChatter.lastRemindedDate.getTime()) / 1000
        const seconds = Math.round(timeSinceLastReminder) + secondsToWait

        if (deadge) {
          say(
            dotaClient.client,
            t('chatters.tpFromDeath', {
              emote: 'Okayeg 👍',
              seconds,
              channel: `@${dotaClient.client.name}`,
              lng: dotaClient.client.locale,
            }),
          )
          return resetTimer()
        }

        say(
          dotaClient.client,
          t('chatters.tpFound', {
            emote: 'Okayeg 👍',
            seconds,
            channel: `@${dotaClient.client.name}`,
            lng: dotaClient.client.locale,
          }),
        )

        return resetTimer()
      }
    }

    if (!hasTp && !dotaClient.noTpChatter.timeout && !dotaClient.noTpChatter.lastRemindedDate) {
      dotaClient.noTpChatter.timeout = setTimeout(() => {
        dotaClient.noTpChatter.lastRemindedDate = new Date()
        dotaClient.noTpChatter.timeout = undefined

        say(
          dotaClient.client,
          t('chatters.noTp', {
            channel: `@${dotaClient.client.name}`,
            lng: dotaClient.client.locale,
            emote: 'HECANT',
          }),
        )
      }, 1000 * secondsToWait)
    }
  },
})
