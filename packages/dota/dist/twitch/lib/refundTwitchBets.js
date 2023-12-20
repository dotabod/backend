import { logger } from '../../utils/logger.js';
import { getTwitchAPI } from './getTwitchAPI.js';
export const refundTwitchBet = async (twitchId) => {
    const api = getTwitchAPI(twitchId);
    await api.predictions
        .getPredictions(twitchId, {
        limit: 1,
    })
        .then(({ data: predictions }) => {
        if (!Array.isArray(predictions) || !predictions.length) {
            logger.info('[PREDICT] No predictions found', { twitchId, predictions });
            return;
        }
        return api.predictions.cancelPrediction(twitchId || '', predictions[0].id);
    })
        .catch((e) => {
        logger.error('[PREDICT] Error refunding twitch bet', { twitchId, e });
    });
};
//# sourceMappingURL=refundTwitchBets.js.map