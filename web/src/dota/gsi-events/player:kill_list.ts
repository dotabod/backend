import { Player } from '../../types.js'
import { logger } from '../../utils/logger.js'
import eventHandler from '../events/EventHandler.js'
import { GSIHandler } from '../GSIHandler.js'
import { server } from '../index.js'
import { isPlayingMatch } from '../lib/isPlayingMatch.js'

// TODO: check kill list value
eventHandler.registerEvent(`player:kill_list`, {
  handler: (dotaClient: GSIHandler, kill_list: Player['kill_list']) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (typeof dotaClient.aegisPickedUp?.playerId !== 'number') return

    // Remove aegis icon from the player we just killed
    // TODO: are kills registered if its an aegis kill? my guess is no
    if (Object.values(kill_list).includes(dotaClient.aegisPickedUp.playerId)) {
      dotaClient.aegisPickedUp = undefined
      server.io.to(dotaClient.getToken()).emit('aegis-picked-up', {})
    }

    logger.info('we killed someone', { kill_list })
  },
})
