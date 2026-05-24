import { moderateText } from '@dotabod/profanity-filter'
import { countryCodeEmoji } from 'country-code-emoji'
import { t } from 'i18next'
import { calculateAvg } from '../dota/lib/calculateAvg'
import { getPlayers } from '../dota/lib/getPlayers'
import { getHeroNameOrColor } from '../dota/lib/heroes'
import type { RosterPlayer } from '../dota/lib/matchData'
import type { HeroesStatus, NotablePlayer, SocketClient } from '../types'
import MongoDBSingleton from './MongoDBSingleton'

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
  heroesStatus,
}: {
  client?: SocketClient
  locale: string
  twitchChannelId: string
  currentMatchId?: string
  players?: RosterPlayer[]
  enableFlags?: boolean
  steam32Id: number | null
  heroesStatus?: HeroesStatus
}) {
  // Draft-only path: the players passed in are OCR'd draft names with no ranks
  // or hero data, so skip getPlayers (which would fire a needless Steam getCards
  // lookup) and use them directly.
  const { matchPlayers, accountIds, gameMode } = heroesStatus
    ? {
        matchPlayers: players ?? [],
        accountIds: (players ?? []).map((p) => p.accountId ?? 0),
        gameMode: undefined,
      }
    : await getPlayers({
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

    // Draft-only players have accountid 0, which can never match a stored
    // record, so skip the lookup entirely when there are no real account ids.
    const hasRealAccounts = accountIds.some((id) => id !== 0)
    const nps = hasRealAccounts
      ? await db
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
      : []

    // Description text. When only draft player names are available (no heroes
    // yet) there are no ranks to average, so skip the avg lookup entirely.
    const avg = heroesStatus
      ? null
      : await calculateAvg({
          locale: locale,
          currentMatchId: currentMatchId,
          players: players,
        })

    const proPlayers: NotablePlayer[] = []

    // Using for..of loop instead of forEach to properly handle await
    for (const [i, player] of matchPlayers.entries()) {
      const np = nps.find((np) => np.account_id === player.accountId)
      const isCurrentPlayer = player.accountId === steam32Id

      // Determine hero name based on available data
      let heroName = '?'
      if (
        isCurrentPlayer &&
        client &&
        client.gsi?.hero?.id !== undefined &&
        client.gsi?.hero?.id > -1
      ) {
        heroName = getHeroNameOrColor(client.gsi.hero.id, i)
      } else if (player.slot !== null) {
        heroName = getHeroNameOrColor(player.heroId ?? 0, i)
      }

      const playerData = {
        account_id: player.accountId ?? 0,
        heroId: player.heroId ?? 0,
        position: i,
        heroName:
          heroName === '?'
            ? matchPlayers?.[i]?.heroId && (matchPlayers?.[i]?.heroId ?? 0) > 0
              ? getHeroNameOrColor(matchPlayers[i].heroId ?? 0, i)
              : '?'
            : heroName,
        name:
          (await moderateText(np?.name ?? matchPlayers[i].playerName ?? `Player ${i + 1}`)) ??
          `Player ${i + 1}`,
        country_code: np?.country_code ?? '',
        isMe: isCurrentPlayer,
      }

      // Show a player when they're a tracked pro (np), when a name was detected,
      // or when this is a vision-detected hero (accountId null from the Vision
      // API, which never provides account ids so np can never match). The
      // vision path is the high-MMR roster view, so a confidently-detected hero
      // must not vanish just because its name OCR came back empty.
      const isVisionHero = player.accountId === null && (player.heroId ?? 0) > 0
      if (np || matchPlayers[i].playerName || isVisionHero) proPlayers.push(playerData)
    }

    let modeText: string
    if (heroesStatus) {
      const noteKey =
        heroesStatus === 'failed' ? 'notablePlayersNoHeroes' : 'notablePlayersWaitingHeroes'
      modeText = `[${t(noteKey, { lng: locale })}]: `
    } else {
      modeText = typeof mode?.name === 'string' ? `${mode.name} [${avg} avg]: ` : `[${avg} avg]: `
    }
    const proPlayersString = proPlayers
      .map((m) => {
        const country: string =
          enableFlags && m.country_code ? `${countryCodeEmoji(m.country_code)} ` : ''
        // Draft-only: heroes unknown, show names without the "(Hero)" suffix.
        return heroesStatus ? `${country}${m.name}` : `${country}${m.name} (${m.heroName})`
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
