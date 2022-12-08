import Long from 'long'

import { getHeroNameById } from '../dota/lib/heroes.js'
import Mongo from './mongo.js'

import Dota from './index.js'

const mongo = Mongo.getInstance()
const dota = Dota.getInstance()

interface CardType {
  rank_tier: number
  leaderboard_rank: number
}

interface Medal {
  name: string
}

export default async function medal(steam32Id: number): Promise<string> {
  const db = await mongo.db
  const channelQuery = { accounts: [steam32Id] }
  let lobbyId: Long = Long.fromNumber(0)
  try {
    lobbyId = (await Dota.findGame(channelQuery)).lobby_id
  } catch (err) {
    lobbyId = Long.fromNumber(0)
  }
  const cards = await dota.getCards(channelQuery.accounts, lobbyId)
  const bestCard: CardType = cards.reduce(
    (best: CardType, card?: CardType) => {
      if (!card) return best
      if (card.rank_tier > best.rank_tier) return card
      if (card.rank_tier === best.rank_tier) {
        if (best.leaderboard_rank === 0) return card
        if (card.leaderboard_rank > 0 && card.leaderboard_rank < best.leaderboard_rank) return card
      }
      return best
    },
    { rank_tier: -10, leaderboard_rank: 0 },
  )
  const medalQuery = (await db
    .collection('medals')
    .findOne({ rank_tier: bestCard.rank_tier })) as Medal | null
  if (bestCard.leaderboard_rank) return `#${bestCard.leaderboard_rank}`
  if (medalQuery) return medalQuery.name
  return 'Unknown'
}

export async function gameMedals(steam32Id: number): Promise<string> {
  const db = await mongo.db
  const channelQuery = { accounts: [steam32Id] }
  const game = await Dota.findGame(channelQuery, true)
  const cards = await dota.getCards(
    game.players.map((player: { account_id: number }) => player.account_id),
    game.lobby_id,
  )
  const medalQuery = await db
    .collection('medals')
    .find({ rank_tier: { $in: cards.map((card) => card.rank_tier) } })
    .toArray()
  const medals: string[] = []
  for (let i = 0; i < cards.length; i += 1) {
    const currentMedal = medalQuery.find(
      (temporaryMedal) => temporaryMedal.rank_tier === cards[i].rank_tier,
    )
    if (!currentMedal) medals[i] = 'Unknown'
    else {
      medals[i] = currentMedal.name
      if (cards[i].leaderboard_rank > 0) medals[i] = `#${cards[i].leaderboard_rank}`
    }
  }
  const result: { heroName: string; medal: string }[] = []
  game.players.forEach((player: { hero_id: number; account_id: number }, i: number) => {
    result.push({ heroName: getHeroNameById(player.hero_id, i), medal: medals[i] })
  })
  return result.map((m) => `${m.heroName}: ${m.medal}`).join(' · ')
}
