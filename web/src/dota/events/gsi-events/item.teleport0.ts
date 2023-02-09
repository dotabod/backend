import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { GSIHandler } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`items:teleport0:name`, {
  handler: (dotaClient: GSIHandler, itemName: 'item_tpscroll' | 'empty') => {
    if (!dotaClient.client.beta_tester) return
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

    // we found a tp scroll
    if (itemName !== 'empty') {
      if (dotaClient.noTpChatter.timeout) {
        return resetTimer()
      }

      if (dotaClient.noTpChatter.lastRemindedDate) {
        const timeSinceLastReminder =
          (Date.now() - dotaClient.noTpChatter.lastRemindedDate.getTime()) / 1000
        const seconds = Math.round(timeSinceLastReminder) + secondsToWait

        if (dotaClient.client.gsi?.hero?.alive === false) {
          dotaClient.say(
            t('chatters.tpFromDeath', {
              emote: 'SuskaygeAgreeGe',
              seconds,
              channel: `@${dotaClient.client.name}`,
              lng: dotaClient.client.locale,
            }),
            { beta: true },
          )
          return resetTimer()
        }

        dotaClient.say(
          t('chatters.tpFound', {
            emote: 'SuskaygeAgreeGe',
            seconds,
            channel: `@${dotaClient.client.name}`,
            lng: dotaClient.client.locale,
          }),
          { beta: true },
        )

        return resetTimer()
      }
    }

    // make sure streamer has gold to buy tp
    if (itemName === 'empty') {
      dotaClient.noTpChatter.timeout = setTimeout(() => {
        dotaClient.noTpChatter.lastRemindedDate = new Date()

        dotaClient.say(
          t('chatters.noTp', {
            channel: `@${dotaClient.client.name}`,
            lng: dotaClient.client.locale,
            emote: 'HECANT',
          }),
          { beta: true },
        )
      }, 1000 * secondsToWait)
    }
  },
})
