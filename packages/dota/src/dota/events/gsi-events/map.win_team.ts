import { logger } from '@dotabod/shared-utils'

import { isPlayingMatch } from '../../lib/isPlayingMatch'
import eventHandler from '../EventHandler'

// This won’t get triggered if they click disconnect and don’t wait for the ancient to reach 0
eventHandler.registerEvent('map:win_team', {
  handler: async (dotaClient, winningTeam: 'radiant' | 'dire') => {
    if (!isPlayingMatch(dotaClient.client.gsi)) {
      return
    }

    logger.info('Map win team', {
      activity: dotaClient.client.gsi?.player?.activity,
      channel: dotaClient.client.name,
      winningTeam,
    })

    await dotaClient.closeBets(winningTeam)
  },
})
