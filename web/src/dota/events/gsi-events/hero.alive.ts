import { GSIHandler } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`hero:alive`, {
  handler: (dotaClient: GSIHandler, alive: boolean) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    // Unused right now
  },
})
