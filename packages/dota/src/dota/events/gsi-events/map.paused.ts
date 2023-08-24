import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { GSIHandler, say } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`map:paused`, {
  handler: (dotaClient: GSIHandler, isPaused: boolean) => {
    if (!dotaClient.client.stream_online) return

    if (!isPlayingMatch(dotaClient.client.gsi)) return
    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      pause: { enabled: chatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    // Necessary to let the frontend know, so we can pause any rosh / aegis / etc timers
    server.io.to(dotaClient.getToken()).emit('paused', isPaused)

    if (isPaused && chattersEnabled && chatterEnabled) {
      say(
        dotaClient.client,
        t('chatters.pause', { emote: 'PauseChamp', lng: dotaClient.client.locale }),
      )
    }
  },
})
