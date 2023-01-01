import { logger } from '../../../utils/logger.js'
import { GSIHandler } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

// TODO: check if we can use token:player:deaths for doing passiveDeath events
eventHandler.registerEvent(`player:deaths`, {
  handler: (dotaClient: GSIHandler, deaths: number) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!deaths) return

    logger.info('have we died +1? does not trigger on aegis or wraith ult?', { deaths })
  },
})
