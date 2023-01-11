import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { findItem } from '../../lib/findItem.js'
import getHero from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`hero:alive`, {
  handler: (dotaClient: GSIHandler, alive: boolean) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    // Case one, we had aegis, and we die with it. Triggers on an aegis death
    if (!alive && dotaClient.aegisPickedUp?.playerId === dotaClient.playingHeroSlot) {
      dotaClient.aegisPickedUp = undefined
      server.io.to(dotaClient.getToken()).emit('aegis-picked-up', {})
      return
    }

  },
})
