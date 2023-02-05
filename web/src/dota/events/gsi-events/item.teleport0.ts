import { t } from 'i18next'

import { GSIHandler } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'
import { DBSettings, getValueOrDefault } from '../../../db/settings.js'

eventHandler.registerEvent(`items:teleport0:name`, {
  handler: (dotaClient: GSIHandler, itemName: 'item_tpscroll' | 'empty') => {
    if (!dotaClient.client.beta_tester) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      noTp: { enabled: chatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    if (!chattersEnabled || !chatterEnabled) {
      return
    }

    // we found a tp scroll
    if (itemName !== 'empty') {
      if (dotaClient.noTpChatter.lastRemindedDate) {
        dotaClient.say(
          t('chatters.tpFound', {
            seconds: Math.round(
              (new Date().getTime() - dotaClient.noTpChatter.lastRemindedDate.getTime()) / 1000,
            ),
            channel: `@${dotaClient.client.name}`,
            lng: dotaClient.client.locale,
          }),
          { beta: true },
        )

        dotaClient.noTpChatter.lastRemindedDate = undefined
        return
      }

      if (dotaClient.noTpChatter.timeout) {
        clearTimeout(dotaClient.noTpChatter.timeout)
        dotaClient.noTpChatter.timeout = undefined
        return
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
          }),
          { beta: true },
        )
      }, 1000 * 30)
    }
  },
})
