import { logger } from '../../../utils/logger.js';
import { isPlayingMatch } from '../../lib/isPlayingMatch.js';
import eventHandler from '../EventHandler.js';
// This wont get triggered if they click disconnect and dont wait for the ancient to go to 0
eventHandler.registerEvent(`map:win_team`, {
    handler: async (dotaClient, winningTeam) => {
        if (!isPlayingMatch(dotaClient.client.gsi))
            return;
        logger.info('Map win team', {
            channel: dotaClient.client.name,
            winningTeam,
        });
        await dotaClient.closeBets(winningTeam);
    },
});
//# sourceMappingURL=map.win_team.js.map