import { DBSettings } from '@dotabod/settings';
import { t } from 'i18next';
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js';
import { gameMedals } from '../../steam/medals.js';
import { chatClient } from '../chatClient.js';
import commandHandler from '../lib/CommandHandler.js';
commandHandler.registerCommand('gm', {
    aliases: ['medals', 'ranks'],
    onlyOnline: true,
    dbkey: DBSettings.commandGM,
    handler: async (message, args) => {
        const { channel: { client }, } = message;
        if (!message.channel.client.steam32Id) {
            chatClient.say(message.channel.name, message.channel.client.multiAccount
                ? t('multiAccount', {
                    lng: message.channel.client.locale,
                    url: 'dotabod.com/dashboard/features',
                })
                : t('unknownSteam', { lng: message.channel.client.locale }));
            return;
        }
        const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi });
        gameMedals(client.locale, message.channel.client.gsi?.map?.matchid, matchPlayers)
            .then((desc) => {
            chatClient.say(message.channel.name, desc);
        })
            .catch((e) => {
            chatClient.say(message.channel.name, e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }));
        });
    },
});
//# sourceMappingURL=gm.js.map