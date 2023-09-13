import { t } from 'i18next'

import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`map:paused`, {
  handler: (dotaClient: GSIHandler, isPaused: boolean) => {
    if (!dotaClient.client.stream_online) return

    if (!isPlayingMatch(dotaClient.client.gsi)) return

    // Necessary to let the frontend know, so we can pause any rosh / aegis / etc timers
    server.io.to(dotaClient.getToken()).emit('paused', isPaused)

    if (isPaused) {
      say(
        dotaClient.client,
        t('chatters.pause', { emote: 'PauseChamp', lng: dotaClient.client.locale }),
        { chattersKey: 'pause' },
      )
    }
  },
})
