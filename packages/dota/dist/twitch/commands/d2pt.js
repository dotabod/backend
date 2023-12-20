import { DBSettings } from '@dotabod/settings';
import { t } from 'i18next';
import { getHeroNameOrColor } from '../../dota/lib/heroes.js';
import { chatClient } from '../chatClient.js';
import commandHandler from '../lib/CommandHandler.js';
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js';
commandHandler.registerCommand('d2pt', {
    aliases: ['dota2pt', 'build', 'builds', 'getbuild'],
    onlyOnline: true,
    dbkey: DBSettings.commandBuilds,
    handler: async (message, args, command) => {
        const { channel: { name: channel, client }, } = message;
        try {
            const { hero, playerIdx } = await findAccountFromCmd(client.gsi, args, client.locale, command);
            const heroName = getHeroNameOrColor(hero?.id ?? 0, playerIdx);
            chatClient.say(channel, t('dota2pt', {
                heroName,
                url: `dota2protracker.com/hero/${encodeURI(heroName).replace(/'/g, '%27')}`,
                lng: message.channel.client.locale,
            }));
        }
        catch (e) {
            chatClient.say(message.channel.name, e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }));
        }
    },
});
//# sourceMappingURL=d2pt.js.map