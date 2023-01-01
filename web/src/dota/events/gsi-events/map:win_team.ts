import { GSIHandler } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

// This wont get triggered if they click disconnect and dont wait for the ancient to go to 0
eventHandler.registerEvent(`map:win_team`, {
  handler: (dotaClient: GSIHandler, winningTeam: 'radiant' | 'dire') => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    dotaClient.closeBets(winningTeam)
  },
})
