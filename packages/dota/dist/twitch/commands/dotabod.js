import { t } from 'i18next';
import { chatClient } from '../chatClient.js';
import commandHandler from '../lib/CommandHandler.js';
commandHandler.registerCommand('dotabod', {
    handler: (message, args) => {
        const { channel: { name: channel, client }, } = message;
        chatClient.say(channel, t('dotabod', { url: 'dotabod.com', author: '@techleed', lng: client.locale }));
    },
});
//# sourceMappingURL=dotabod.js.map