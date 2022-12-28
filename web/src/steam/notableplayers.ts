// @ts-expect-error ???
import { countryCodeEmoji } from 'country-code-emoji'

import { delayedGames } from '../../prisma/generated/mongoclient/index.js'
import { getAccountsFromMatch } from '../dota/lib/getAccountsFromMatch.js'
import { getPlayers } from '../dota/lib/getPlayers.js'
import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Mongo from './mongo.js'

const mongo = await Mongo.connect()

type nps = {
  account_id: number
  heroName: string
  name: string
  country_code: string
}[]

export interface Player {
  accountid: number
  heroid: number
}

export async function notablePlayers(
  twitchChannelId: string,
  currentMatchId?: string,
  players?: { heroid: number; accountid: number }[],
): Promise<string> {
  const { matchPlayers, accountIds, gameMode } = await getPlayers(currentMatchId, players)

  const mode = gameMode
    ? await mongo
        .collection('gameModes')
        .findOne({ id: gameMode }, { projection: { _id: 0, name: 1 } })
    : { name: null }

  const nps = await mongo
    .collection('notablePlayers')
    .find(
      {
        account_id: {
          $in: accountIds,
        },
        channel: {
          $in: [twitchChannelId, null],
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

  const notFoundNp: nps = []
  const result: nps = []
  matchPlayers.forEach((player: Player, i: number) => {
    const np = nps.find((np) => np.account_id === player.accountid)
    if (np) {
      result.push({
        account_id: player.accountid,
        heroName: getHeroNameById(player.heroid, i),
        name: np.name,
        country_code: np.country_code,
      })
    } else {
      notFoundNp.push({
        account_id: player.accountid,
        heroName: getHeroNameById(player.heroid, i),
        name: `Player ${i + 1}`,
        country_code: '',
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
