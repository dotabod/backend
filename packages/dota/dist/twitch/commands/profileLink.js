import { t } from 'i18next';
import CustomError from '../../utils/customError.js';
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js';
export async function profileLink({ command, args, packet, locale }) {
    const currentMatchId = packet?.map?.matchid;
    if (!currentMatchId) {
        throw new CustomError(t('notPlaying', { emote: 'PauseChamp', lng: locale }));
    }
    if (!Number(currentMatchId)) {
        throw new CustomError(t('gameNotFound', { lng: locale }));
    }
    const playerData = await findAccountFromCmd(packet, args, locale, command);
    if (!playerData?.hero) {
        throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }));
    }
    return playerData;
}
//# sourceMappingURL=profileLink.js.map