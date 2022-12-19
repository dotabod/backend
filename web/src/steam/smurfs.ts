import { delayedGames } from '../../prisma/generated/mongoclient/index.js'
import { getAccountsFromMatch } from '../dota/lib/getAccountsFromMatch.js'
import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Mongo from './mongo.js'

import Dota from './index.js'

const dota = Dota.getInstance()
const mongo = Mongo.getInstance()

export async function smurfs(
  currentMatchId?: string,
  players?: { heroid: number; accountid: number }[],
): Promise<string> {
  const db = await mongo.db

  if (!currentMatchId) throw new CustomError('Not in a match PauseChamp')

  // const steam32id = 1234
  // const steamserverid = (await server.dota.getUserSteamServer(steam32id)) as string | undefined
  // const responseTest = steamserverid && (await server.dota.getDelayedMatchData(steamserverid))

  const response =
    !players?.length &&
    (await db.collection('delayedGames').findOne({ 'match.match_id': currentMatchId }))

  if (!response && !players?.length) {
    throw new CustomError('Waiting for current match data PauseChamp')
  }

  const { matchPlayers, accountIds } = getAccountsFromMatch(
    response as unknown as delayedGames,
    players,
  )

  const cards = await dota.getCards(accountIds)

  const result: { heroName: string; lifetime_games?: number }[] = []
  matchPlayers.forEach((player: { heroid: number; accountid: number }, i: number) => {
    result.push({
      heroName: getHeroNameById(player.heroid, i),
      lifetime_games: cards[i]?.lifetime_games,
    })
  })
  const results = result
    .sort((a, b) => (a.lifetime_games ?? 0) - (b.lifetime_games ?? 0))
    .map((m) =>
      typeof m.lifetime_games === 'number'
        ? `${m.heroName}: ${m.lifetime_games.toLocaleString()}`
        : undefined,
    )
    .filter(Boolean)
    .join(' · ')
  return `Lifetime games: ${results || 'Unknown'}`
}
