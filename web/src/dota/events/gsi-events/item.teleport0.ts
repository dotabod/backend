import { t } from 'i18next'
import { GSIHandler } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`items:teleport0:name`, {
  handler: (dotaClient: GSIHandler, itemName: 'item_tpscroll' | 'empty') => {
    if (!dotaClient.client.beta_tester) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    if (dotaClient.noTpTimeout && itemName !== 'empty') {
      clearTimeout(dotaClient.noTpTimeout)
      dotaClient.noTpTimeout = undefined
      return
    }

    // make sure streamer has gold to buy tp
    if (itemName === 'empty') {
      dotaClient.noTpTimeout = setTimeout(() => {
        dotaClient.say(
          t('chatters.noTp', {
            channel: `@${dotaClient.client.name}`,
            lng: dotaClient.client.locale,
          }),
        )
      }, 1000 * 30)
    }
  },
})
