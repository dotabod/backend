import { t } from 'i18next';
import { chatClient } from '../chatClient.js';
import commandHandler from '../lib/CommandHandler.js';
commandHandler.registerCommand('match', {
    aliases: ['matchid'],
    onlyOnline: true,
    handler: (message, args) => {
        const { channel: { name: channel, client }, } = message;
        const matchId = client.gsi?.map?.matchid;
        if (!matchId) {
            chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }));
            return;
        }
        chatClient.say(channel, t('matchId', { lng: message.channel.client.locale, matchId }));
    },
});
//# sourceMappingURL=match.js.map