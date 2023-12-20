import { DBSettings, getValueOrDefault } from '@dotabod/settings';
import { t } from 'i18next';
import { chatClient } from '../twitch/chatClient.js';
import { getStreamDelay } from './GSIHandler.js';
export function say(client, message, { delay = true, key, chattersKey, beta = false, } = {}) {
    if (beta && !client.beta_tester)
        return;
    // global
    const chattersEnabled = getValueOrDefault(DBSettings.chatter, client.settings);
    if (!chattersEnabled)
        return;
    // specific 1
    const chatter = key && getValueOrDefault(key, client.settings);
    if (key && !chatter)
        return;
    // specific 2
    const chatterSpecific = getValueOrDefault(DBSettings.chatters, client.settings);
    if (chattersKey && !chatterSpecific[chattersKey].enabled)
        return;
    const msg = beta ? `${message} ${t('betaFeature', { lng: client.locale })}` : message;
    if (!delay) {
        chatClient.say(client.name, msg);
        return;
    }
    setTimeout(() => {
        client.name && chatClient.say(client.name, msg);
    }, getStreamDelay(client.settings));
}
//# sourceMappingURL=say.js.map