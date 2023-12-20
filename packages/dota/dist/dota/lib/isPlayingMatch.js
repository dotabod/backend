import { isDev } from './consts.js';
import { isArcade } from './isArcade.js';
import { isSpectator } from './isSpectator.js';
// team2 = watching replay or live match
// customgamename = playing arcade or hero demo
export function isPlayingMatch(gsi) {
    if (!gsi)
        return false;
    if (gsi?.player?.activity !== 'playing')
        return false;
    if (isDev && isArcade(gsi))
        return true;
    return !isSpectator(gsi) && !isArcade(gsi);
}
//# sourceMappingURL=isPlayingMatch.js.map