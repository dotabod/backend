import { countryCodeEmoji } from 'country-code-emoji'
import { t } from 'i18next'

import { calculateAvg } from '../dota/lib/calculateAvg.js'
import { getPlayers } from '../dota/lib/getPlayers.js'
import { getHeroNameById } from '../dota/lib/heroes.js'
import Mongo from './mongo.js'

const mongo = await Mongo.connect()

interface NotablePlayer {
  heroId: number
  account_id: number
  position: number
  heroName: string
  name: string
  country_code: string
}

export interface Player {
  accountid: number
  heroid: number
}

export async function notablePlayers(
  locale: string,
  twitchChannelId: string,
  currentMatchId?: string,
  players?: { heroid: number; accountid: number }[],
): Promise<{ playerList: NotablePlayer[]; description: string }> {
  const { matchPlayers, accountIds, gameMode } = await getPlayers(locale, currentMatchId, players)

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

  const notFoundNp: NotablePlayer[] = []
  const result: NotablePlayer[] = []
  matchPlayers.forEach((player: Player, i: number) => {
    const np = nps.find((np) => np.account_id === player.accountid)
    if (np) {
      result.push({
        account_id: player.accountid,
        heroId: player.heroid,
        position: i,
        heroName: getHeroNameById(player.heroid, i),
        name: np.name,
        country_code: np.country_code,
      })
    } else {
      notFoundNp.push({
        account_id: player.accountid,
        heroId: player.heroid,
        position: i,
        heroName: getHeroNameById(player.heroid, i),
        name: `Player ${i + 1}`,
        country_code: '',
      })
    }
  })

  const allPlayers = result
    .map((m) => {
      const country: string = m.country_code ? `${countryCodeEmoji(m.country_code)} ` : ''
      return `${country}${m.name} (${m.heroName})`
    })
    .join(' · ')

  const avg = await calculateAvg({
    locale: locale,
    currentMatchId: currentMatchId,
    players: players,
  })

  const modeText = typeof mode?.name === 'string' ? `${mode.name} [${avg} avg]: ` : `[${avg} avg]: `

  return {
    description: `${modeText}${allPlayers || t('noNotable', { lng: locale })}`,
    playerList: result,
  }
}
