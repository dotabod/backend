import { t } from 'i18next'

import { GSIHandler, redisClient } from '../../GSIHandler.js'
import getHero, { HeroNames } from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`hero:smoked`, {
  handler: async (dotaClient: GSIHandler, isSmoked: boolean) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    if (isSmoked) {
      const playingHero = (await redisClient.client.get(
        `${dotaClient.getToken()}:playingHero`,
      )) as HeroNames | null

      const heroName =
        getHero(playingHero ?? dotaClient.client.gsi?.hero?.name)?.localized_name ?? 'We'

      say(
        dotaClient.client,
        t('chatters.smoked', { emote: 'Shush', heroName, lng: dotaClient.client.locale }),
        { chattersKey: 'smoke' },
      )
    }
  },
})
