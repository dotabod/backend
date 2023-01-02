import { Player } from '../../../types.js'
import { logger } from '../../../utils/logger.js'
import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

// TODO: check kill list value
eventHandler.registerEvent(`player:kill_list`, {
  handler: (dotaClient: GSIHandler, kill_list: Player['kill_list']) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    /// victimid_n, n = hero slot id, player id: x, x = count of kills
    // killlist { victimid_6: 1, victimid_7: 2 }
    console.log({ kill_list }, 'added')
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
