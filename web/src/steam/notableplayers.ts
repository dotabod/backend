// @ts-expect-error ???
import { countryCodeEmoji } from 'country-code-emoji'

import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Mongo from './mongo.js'

const mongo = Mongo.getInstance()

export interface Player {
  accountid: number
  heroid: number
}

export async function notablePlayers(
  matchId?: string,
  players?: { heroid?: number; accountid?: number }[],
): Promise<string> {
  const db = await mongo.db

  if (!matchId) throw new CustomError("Game wasn't found")
  const response =
    !players?.length && (await db.collection('delayedGames').findOne({ 'match.match_id': matchId }))
  if (!response && !players?.length) throw new CustomError("Game wasn't found")

  const matchPlayers = players?.length
    ? players
    : response
    ? [
        ...response.teams[0].players.map((a: any) => ({
          heroid: a.heroid,
          accountid: a.accountid,
        })),
        ...response.teams[1].players.map((a: any) => ({
          heroid: a.heroid,
          accountid: a.accountid,
        })),
      ]
    : []

  const mode = response
    ? await db
        .collection('gameModes')
        .findOne({ id: response.match.game_mode }, { projection: { _id: 0, name: 1 } })
    : { name: null }

  const nps = await db
    .collection('notablePlayers')
    .find(
      {
        account_id: {
          $in: matchPlayers.map((player: Player) => Number(player.accountid)),
        },
      },
      {
        projection: {
          _id: 0,
          account_id: 1,
          name: 1,
          country_code: 1,
        },
      },
    )
    .toArray()

  const result: { heroName: string; name: string; country_code: string }[] = []
  matchPlayers.forEach((player: Player, i: number) => {
    const np = nps.find((np) => np.account_id === player.accountid)
    if (np) {
      result.push({
        heroName: getHeroNameById(player.heroid, i),
        name: np.name,
        country_code: np.country_code,
      })
    }
  })

  const playerList = result
    .map((m) => {
      const country: string = m.country_code ? `${countryCodeEmoji(m.country_code) as string} ` : ''
      return `${country}${m.name} (${m.heroName})`
    })
    .join(' · ')

  const modeText = typeof mode?.name === 'string' ? `${mode.name}: ` : ''
  return `${modeText}${playerList || 'No notable players'}`
}
