import { countryCodeEmoji } from 'country-code-emoji'
import { t } from 'i18next'

import { prisma } from '../db/prisma.js'
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
  image?: string
  country_code: string
}

export interface Player {
  accountid: number
  heroid: number
}

export async function notablePlayers({
  locale,
  twitchChannelId,
  currentMatchId,
  players,
  enableFlags,
  steam32Id,
}: {
  locale: string
  twitchChannelId: string
  currentMatchId?: string
  players?: { heroid: number; accountid: number }[]
  enableFlags?: boolean
  steam32Id: number | null
}) {
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

  // get the list of users in the Dotabod postgresql database according to steam id
  const dotabodPlayers = await prisma.user.findMany({
    select: {
      image: true,
      displayName: true,
      SteamAccount: {
        take: 1,
        select: {
          steam32Id: true,
        },
      },
    },
    where: {
      SteamAccount: {
        some: {
          steam32Id: {
            in: matchPlayers.map((m) => m.accountid),
          },
        },
      },
    },
  })

  // Description text
  const avg = await calculateAvg({
    locale: locale,
    currentMatchId: currentMatchId,
    players: players,
  })

  const regularPlayers: NotablePlayer[] = []
  const proPlayers: NotablePlayer[] = []
  matchPlayers.forEach((player: Player, i: number) => {
    const np = nps.find((np) => np.account_id === player.accountid)
    const props = {
      account_id: player.accountid,
      heroId: player.heroid,
      position: i,
      heroName: getHeroNameById(player.heroid, i),
      name: np?.name ?? `Player ${i + 1}`,
      country_code: np?.country_code ?? '',
      isMe: steam32Id === player.accountid,
    }

    if (np) proPlayers.push(props)
    else regularPlayers.push(props)
  })

  const allPlayers = [...proPlayers, ...regularPlayers]

  // Connect all players to dotabod users
  allPlayers.forEach((player) => {
    const user = dotabodPlayers.find((user) => user.SteamAccount[0].steam32Id === player.account_id)
    if (user) {
      player.name = user.displayName ?? player.name
      player.image = user.image ?? undefined
    }
  })

  const modeText = typeof mode?.name === 'string' ? `${mode.name} [${avg} avg]: ` : `[${avg} avg]: `
  const proPlayersString = proPlayers
    .map((m) => {
      const country: string =
        enableFlags && m.country_code ? `${countryCodeEmoji(m.country_code)} ` : ''
      return `${country}${m.name} (${m.heroName})`
    })
    .join(' · ')

  return {
    description: `${modeText}${proPlayersString || t('noNotable', { lng: locale })}`,
    playerList: proPlayers,
  }
}
