import { countryCodeEmoji } from 'country-code-emoji';
import { t } from 'i18next';
import { calculateAvg } from '../dota/lib/calculateAvg.js';
import { getPlayers } from '../dota/lib/getPlayers.js';
import { getHeroNameOrColor } from '../dota/lib/heroes.js';
import MongoDBSingleton from './MongoDBSingleton.js';
export async function notablePlayers({ locale, twitchChannelId, currentMatchId, players, enableFlags, steam32Id, }) {
    const { matchPlayers, accountIds, gameMode } = await getPlayers({
        locale,
        currentMatchId,
        players,
    });
    const mongo = MongoDBSingleton;
    const db = await mongo.connect();
    try {
        const mode = gameMode
            ? await db
                .collection('gameModes')
                .findOne({ id: gameMode }, { projection: { _id: 0, name: 1 } })
            : { name: null };
        const nps = await db
            .collection('notablePlayers')
            .find({
            account_id: {
                $in: accountIds,
            },
            channel: {
                $in: [null, twitchChannelId],
            },
        }, {
            projection: {
                _id: 0,
                account_id: 1,
                name: 1,
                country_code: 1,
            },
        })
            .toArray();
        // Description text
        const avg = await calculateAvg({
            locale: locale,
            currentMatchId: currentMatchId,
            players: players,
        });
        const proPlayers = [];
        matchPlayers.forEach((player, i) => {
            const np = nps.find((np) => np.account_id === player.accountid);
            const props = {
                account_id: player.accountid,
                heroId: player.heroid,
                position: i,
                heroName: getHeroNameOrColor(player.heroid, i),
                name: np?.name ?? `Player ${i + 1}`,
                country_code: np?.country_code ?? '',
                isMe: steam32Id === player.accountid,
            };
            if (np)
                proPlayers.push(props);
        });
        const modeText = typeof mode?.name === 'string' ? `${mode.name} [${avg} avg]: ` : `[${avg} avg]: `;
        const proPlayersString = proPlayers
            .map((m) => {
            const country = enableFlags && m.country_code ? `${countryCodeEmoji(m.country_code)} ` : '';
            return `${country}${m.name} (${m.heroName})`;
        })
            .join(' · ');
        return {
            description: `${modeText}${proPlayersString || t('noNotable', { lng: locale })}`,
            playerList: proPlayers,
        };
    }
    finally {
        await mongo.close();
    }
}
//# sourceMappingURL=notableplayers.js.map