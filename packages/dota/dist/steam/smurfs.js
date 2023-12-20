import { t } from 'i18next';
import { getPlayers } from '../dota/lib/getPlayers.js';
import { getHeroNameOrColor } from '../dota/lib/heroes.js';
export async function smurfs(locale, currentMatchId, players) {
    const { matchPlayers, cards } = await getPlayers({ locale, currentMatchId, players });
    const result = [];
    matchPlayers.forEach((player, i) => {
        result.push({
            heroName: getHeroNameOrColor(player.heroid, i),
            lifetime_games: cards[i]?.lifetime_games,
        });
    });
    const results = result
        .sort((a, b) => (a.lifetime_games ?? 0) - (b.lifetime_games ?? 0))
        .map((m) => typeof m.lifetime_games === 'number'
        ? `${m.heroName}: ${m.lifetime_games.toLocaleString()}`
        : undefined)
        .filter(Boolean)
        .join(' · ');
    return `${t('lifetime', { lng: locale })}: ${results || t('unknown', { lng: locale })}`;
}
//# sourceMappingURL=smurfs.js.map