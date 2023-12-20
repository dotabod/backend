import { getPlayers } from '../../dota/lib/getPlayers.js';
import { getRankDetail, rankTierToMmr } from './ranks.js';
export async function calculateAvg({ locale, currentMatchId, players }) {
    const { cards } = await getPlayers({ locale, currentMatchId, players });
    const mmrs = [];
    const leaderranks = [];
    cards.forEach((card) => {
        mmrs.push(rankTierToMmr(card.rank_tier));
        leaderranks.push(card.leaderboard_rank);
    });
    // Get average of all numbers in mmrs array
    const avg = Math.round(mmrs.filter(Boolean).reduce((a, b) => a + b, 0) / mmrs.filter(Boolean).length);
    const avgLeader = Math.round(leaderranks.filter(Boolean).reduce((a, b) => a + b, 0) / leaderranks.filter(Boolean).length);
    const rank = await getRankDetail(avg);
    if (!rank && !avgLeader)
        return `Immortal`;
    if (!rank)
        return `${avg || `#${avgLeader}`}`;
    if ('standing' in rank || avgLeader) {
        return `Immortal`;
    }
    return `${avg} · ${rank.myRank.title}`;
}
//# sourceMappingURL=calculateAvg.js.map