import { DBSettings, defaultSettings, getValueOrDefault } from '@dotabod/settings';
import { t } from 'i18next';
import supabase from '../../db/supabase.js';
import { getTokenFromTwitchId } from '../../dota/lib/connectedStreamers.js';
import { say } from '../../dota/say.js';
import { logger } from '../../utils/logger.js';
import { getTwitchAPI } from './getTwitchAPI.js';
// Disable the bet in settings for this user
export async function disableBetsForTwitchId(twitchId) {
    const token = getTokenFromTwitchId(twitchId);
    if (!token)
        return;
    await supabase.from('settings').upsert({
        userId: token,
        key: DBSettings.bets,
        value: false,
    }, {
        onConflict: 'userId, key',
    });
}
export const openTwitchBet = async ({ heroName, client, }) => {
    const { settings, locale } = client;
    const twitchId = client.Account?.providerAccountId ?? '';
    const api = getTwitchAPI(twitchId);
    const betsInfo = getValueOrDefault(DBSettings.betsInfo, settings);
    logger.info('[PREDICT] [BETS] Opening twitch bet', { twitchId, heroName });
    const isTitleDefault = betsInfo.title === defaultSettings.betsInfo.title;
    const title = isTitleDefault
        ? t('predictions.title', { lng: locale, heroName })
        : betsInfo.title.replace('[heroname]', heroName ?? '');
    const isYesDefault = betsInfo.yes === defaultSettings.betsInfo.yes;
    const yes = isYesDefault ? t('predictions.yes', { lng: locale }) : betsInfo.yes;
    const isNoDefault = betsInfo.no === defaultSettings.betsInfo.no;
    const no = isNoDefault ? t('predictions.no', { lng: locale }) : betsInfo.no;
    const isValidDuration = betsInfo.duration >= 30 && betsInfo.duration <= 1800;
    const autoLockAfter = isValidDuration ? betsInfo.duration : 240; // 4 min default
    await api.predictions
        .createPrediction(twitchId || '', {
        title: title.substring(0, 45),
        outcomes: [yes.substring(0, 25), no.substring(0, 25)],
        autoLockAfter,
    })
        .catch(async (e) => {
        try {
            if (JSON.parse(e?.body)?.message?.includes('channel points not enabled')) {
                await disableBetsForTwitchId(twitchId);
                logger.info('[PREDICT] [BETS] Channel points not enabled for', {
                    twitchId,
                });
            }
            // "message\": \"Invalid refresh token\"\n}" means they have to logout and login
            else if (JSON.parse(e?.body)?.message?.includes('refresh token')) {
                say(client, t('bets.error', {
                    channel: `@${client.name}`,
                    lng: client.locale,
                }), {
                    delay: false,
                });
                logger.error('[TWITCHSETUP] Failed to refresh twitch tokens in gsi handler', {
                    twitchId,
                });
                await supabase
                    .from('accounts')
                    .update({
                    requires_refresh: true,
                })
                    .eq('providerAccountId', twitchId)
                    .eq('provider', 'twitch');
            }
        }
        catch (e) {
            // just means couldn't json parse the message for the two cases above
        }
        throw e;
    });
};
//# sourceMappingURL=openTwitchBet.js.map