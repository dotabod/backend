import { countryCodeEmoji } from 'country-code-emoji'
import { t } from 'i18next'
import { calculateAvg } from '../dota/lib/calculateAvg.js'
import { getPlayers } from '../dota/lib/getPlayers.js'
import { getHeroNameOrColor } from '../dota/lib/heroes.js'
import type { Players, SocketClient } from '../types'
import type { NotablePlayer } from '../types.js'
import MongoDBSingleton from './MongoDBSingleton.js'
import { moderateText } from '@dotabod/profanity-filter'

export interface Player {
  accountid: number
  heroid: number
}

export interface NotablePlayers {
  account_id: number
  name: string
  country_code: string
}

export async function notablePlayers({
  client,
  locale,
  twitchChannelId,
  currentMatchId,
  players,
  enableFlags,
  steam32Id,
}: {
  client?: SocketClient
  locale: string
  twitchChannelId: string
  currentMatchId?: string
  players?: Players
  enableFlags?: boolean
  steam32Id: number | null
}) {
  const { matchPlayers, accountIds, gameMode } = await getPlayers({
    locale,
    currentMatchId,
    players,
  })

  const mongo = MongoDBSingleton
  const db = await mongo.connect()

  try {
    const mode = gameMode
      ? await db
          .collection('gameModes')
          .findOne({ id: gameMode }, { projection: { _id: 0, name: 1 } })
      : { name: null }

    const nps = await db
      .collection<NotablePlayers>('notablePlayers')
      .find(
        {
          account_id: {
            $in: accountIds,
          },
          channel: {
            $in: [null, twitchChannelId],
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

    // Description text
    const avg = await calculateAvg({
      locale: locale,
      currentMatchId: currentMatchId,
      players: players,
    })

    const proPlayers: NotablePlayer[] = []

    // Using for..of loop instead of forEach to properly handle await
    for (const [i, player] of matchPlayers.entries()) {
      const np = nps.find((np) => np.account_id === player.accountid)
      const isCurrentPlayer = player.accountid === steam32Id

      // Determine hero name based on available data
      let heroName = '?'
      if (
        isCurrentPlayer &&
        client &&
        client.gsi?.hero?.id !== undefined &&
        client.gsi?.hero?.id > -1
      ) {
        heroName = getHeroNameOrColor(client.gsi.hero.id, i)
      } else if (player.playerid !== null) {
        heroName = getHeroNameOrColor(player.heroid ?? 0, i)
      }

      const playerData = {
        account_id: player.accountid,
        heroId: player.heroid ?? 0,
        position: i,
        heroName:
          heroName === '?'
            ? matchPlayers?.[i]?.heroid && matchPlayers?.[i]?.heroid > 0
              ? getHeroNameOrColor(matchPlayers[i].heroid, i)
              : '?'
            : heroName,
        name: await moderateText(np?.name ?? matchPlayers[i].player_name ?? `Player ${i + 1}`),
        country_code: np?.country_code ?? '',
        isMe: isCurrentPlayer,
      }

      // Only add to proPlayers if this is a notable player
      if (np || matchPlayers[i].player_name) proPlayers.push(playerData)
    }

    const modeText =
      typeof mode?.name === 'string' ? `${mode.name} [${avg} avg]: ` : `[${avg} avg]: `
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
  } finally {
    await mongo.close()
  }
}
