import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { GSIHandler } from '../../GSIHandler.js'
import getHero from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`hero:smoked`, {
  handler: (dotaClient: GSIHandler, isSmoked: boolean) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    const chatterEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    if (!chatterEnabled) return

    const chatters = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    if (!chatters.smoke.enabled) return

    if (isSmoked) {
      const heroName =
        getHero(dotaClient.playingHero ?? dotaClient.client.gsi?.hero?.name)?.localized_name ?? 'We'

      dotaClient.say(
        t('chatters.smoked', { emote: 'Shush', heroName, lng: dotaClient.client.locale }),
      )
    }
  },
})
