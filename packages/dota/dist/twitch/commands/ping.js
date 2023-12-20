import { t } from 'i18next';
import { chatClient } from '../chatClient.js';
import commandHandler from '../lib/CommandHandler.js';
commandHandler.registerCommand('ping', {
    handler: (message, args) => {
        chatClient.say(message.channel.name, t('ping', { emote: 'EZ Clap', lng: message.channel.client.locale }));
    },
});
//# sourceMappingURL=ping.js.map