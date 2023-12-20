import { DBSettings } from '@dotabod/settings';
import { t } from 'i18next';
import RedisClient from '../../db/RedisClient.js';
import { generateAegisMessage, } from '../../dota/events/gsi-events/event.aegis_picked_up.js';
import { generateRoshanMessage } from '../../dota/events/gsi-events/event.roshan_killed.js';
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js';
import { chatClient } from '../chatClient.js';
import commandHandler from '../lib/CommandHandler.js';
commandHandler.registerCommand('roshan', {
    onlyOnline: true,
    aliases: ['rosh', 'aegis'],
    dbkey: DBSettings.commandRosh,
    handler: async (message, args) => {
        const { channel: { name: channel, client }, } = message;
        if (!isPlayingMatch(client.gsi)) {
            chatClient.say(channel, t('notPlaying', { emote: 'PauseChamp', lng: client.locale }));
            return;
        }
        if (!client.gsi?.hero?.name) {
            chatClient.say(channel, t('noHero', { lng: client.locale }));
            return;
        }
        const redisClient = RedisClient.getInstance();
        const roshJson = (await redisClient.client.json.get(`${client.token}:roshan`));
        const aegisRes = (await redisClient.client.json.get(`${client.token}:aegis`));
        if (!roshJson?.minS && !roshJson?.maxS) {
            chatClient.say(channel, t('roshanAlive', { emote: 'Happi', lng: client.locale }));
            return;
        }
        const msgs = [generateRoshanMessage(roshJson, client.locale)];
        if (aegisRes) {
            msgs.push(generateAegisMessage(aegisRes, client.locale));
        }
        chatClient.say(channel, msgs.join(' · '));
    },
});
//# sourceMappingURL=roshan.js.map