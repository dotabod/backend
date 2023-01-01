import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import eventHandler from '../EventHandler.js'
import { GSIHandler } from '../GSIHandler.js'
import { server } from '../index.js'
import { isPlayingMatch } from '../lib/isPlayingMatch.js'

eventHandler.registerEvent(`map:paused`, {
  handler: (dotaClient: GSIHandler, isPaused: boolean) => {
    if (!dotaClient.client.stream_online) return

    if (!isPlayingMatch(dotaClient.client.gsi)) return
    const chatterEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)

    // Necessary to let the frontend know, so we can pause any rosh / aegis / etc timers
    server.io.to(dotaClient.getToken()).emit('paused', isPaused)

    const chatters = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)
    if (isPaused && chatterEnabled && chatters.pause.enabled) {
      dotaClient.say(t('chatters.pause', { lng: dotaClient.client.locale }))
    }
  },
})
