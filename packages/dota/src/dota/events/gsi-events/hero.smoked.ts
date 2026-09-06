import { t } from 'i18next'

import { redisClient } from '../../../db/redis-instance'
import getHero from '../../lib/get-hero'
import type { HeroNames } from '../../lib/get-hero'
import { isPlayingMatch } from '../../lib/is-playing-match'
import { say } from '../../say'
import eventHandler from '../event-handler'

eventHandler.registerEvent('hero:smoked', {
  handler: async (dotaClient, isSmoked: boolean) => {
    if (!dotaClient.client.stream_online) {
      return
    }
    if (!isPlayingMatch(dotaClient.client.gsi)) {
      return
    }

    if (isSmoked) {
      const playingHero = (await redisClient.client.get(
        `${dotaClient.getToken()}:playingHero`
      )) as HeroNames | null

      const heroName =
        getHero(playingHero ?? dotaClient.client.gsi?.hero?.name)?.localized_name ?? 'We'

      say(
        dotaClient.client,
        t('chatters.smoked', { emote: 'Shush', heroName, lng: dotaClient.client.locale }),
        { chattersKey: 'smoke' }
      )
    }
  },
})
