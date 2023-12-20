import { t } from 'i18next';
import { redisClient } from '../../GSIHandler.js';
import getHero from '../../lib/getHero.js';
import { isPlayingMatch } from '../../lib/isPlayingMatch.js';
import { say } from '../../say.js';
import eventHandler from '../EventHandler.js';
eventHandler.registerEvent(`player:kill_streak`, {
    handler: async (dotaClient, streak) => {
        if (!isPlayingMatch(dotaClient.client.gsi))
            return;
        if (!dotaClient.client.stream_online)
            return;
        const playingHero = (await redisClient.client.get(`${dotaClient.getToken()}:playingHero`));
        const heroName = getHero(playingHero ?? dotaClient.client.gsi?.hero?.name)?.localized_name ?? 'We';
        const previousStreak = Number(dotaClient.client.gsi?.previously?.player?.kill_streak);
        const lostStreak = previousStreak >= 3 && !streak;
        if (lostStreak) {
            clearTimeout(dotaClient.killstreakTimeout);
            say(dotaClient.client, t('killstreak.lost', {
                emote: 'BibleThump',
                count: previousStreak,
                heroName,
                lng: dotaClient.client.locale,
            }), { chattersKey: 'killstreak' });
            return;
        }
        if (streak <= 3)
            return;
        clearTimeout(dotaClient.killstreakTimeout);
        dotaClient.killstreakTimeout = setTimeout(() => {
            say(dotaClient.client, t('killstreak.won', {
                emote: 'POGGIES',
                count: streak,
                heroName,
                lng: dotaClient.client.locale,
            }), { chattersKey: 'killstreak' });
        }, 15000);
    },
});
//# sourceMappingURL=player.killstreak.js.map