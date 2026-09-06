import { t } from 'i18next'

import { getSpectatorPlayers } from '../../dota/lib/get-spectator-players'
import { isSpectator } from '../../dota/lib/is-spectator'
import type { Hero, Items, Packet, Player, SocketClient } from '../../types'
import CustomError from '../../utils/custom-error'
import { getPlayerFromArgs } from './get-player-from-args'

export const findSpectatorIdx = function findSpectatorIdx(
  packet: Packet | undefined,
  heroOrAccountId: number | undefined
) {
  const teams = ['team2', 'team3'] as const

  for (const team of teams) {
    const teamPlayers = packet?.player?.[team]
    const players: Player[] = Object.values(teamPlayers ?? {})
    if (!players) {
      continue
    }

    for (let i = 0; i < players.length; i += 1) {
      const player = players[i]
      if (Number(player.accountid) === heroOrAccountId) {
        let playerIdx: number
        if (team === 'team2') {
          playerIdx = i
        } else {
          playerIdx = i + 5
        }

        return { playerIdx, playerN: Object.keys(teamPlayers ?? {})[i], teamN: team }
      }
    }
  }

  return null
}

export const findAccountFromCmd = async function findAccountFromCmd(
  client: SocketClient | undefined,
  args: string[],
  locale: string,
  command: string
) {
  const packet = client?.gsi
  let accountIdFromArgs = Number.isNaN(Number(packet?.player?.accountid))
    ? undefined
    : Number(packet?.player?.accountid)

  let playerIdx: number | undefined

  if (args.length && !isSpectator(packet)) {
    const data = await getPlayerFromArgs({ args, client, command, locale })
    accountIdFromArgs = Number(data?.player?.accountid)
    playerIdx = data?.playerIdx

    if (!accountIdFromArgs && !data?.player?.heroid) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
    }

    // the missing data (items) gets filled out from delayedGames data
    return {
      accountIdFromArgs,
      hero: { id: data?.player?.heroid },
      ourHero: false,
      player: { accountid: accountIdFromArgs },
      playerIdx,
    }
  }

  if (isSpectator(packet)) {
    if (args.length) {
      const data = await getPlayerFromArgs({ args, client, command, locale })
      accountIdFromArgs = Number(data?.player?.accountid)
    }

    const spectatorPlayers = getSpectatorPlayers(packet)
    const selectedPlayer = spectatorPlayers.find((a) => 'selected' in a && !!a.selected)
    // Fall back to the first player with a real hero id when no broadcast unit
    // is selected, so callers like !items get usable data instead of an
    // undefined hero. Heroes still in pick (-1) skip the fallback.
    const firstValidHero = spectatorPlayers.find((p) => Number(p.heroid) > 0)
    accountIdFromArgs = accountIdFromArgs ?? selectedPlayer?.accountid ?? firstValidHero?.accountid

    const { playerIdx, playerN, teamN } = findSpectatorIdx(packet, accountIdFromArgs) ?? {}

    // @ts-expect-error we can iterate by team2 and team3
    const player = packet?.player?.[teamN]?.[playerN] as Player
    // @ts-expect-error we can iterate by team2 and team3
    const items = packet?.items?.[teamN]?.[playerN] as Items
    // @ts-expect-error we can iterate by team2 and team3
    const hero = packet?.hero?.[teamN]?.[playerN] as Hero

    return { accountIdFromArgs, hero, items, ourHero: false, player, playerIdx }
  }

  // Don't gate on accountIdFromArgs — packet.hero can be a valid flat hero
  // even during brief windows (draft transitions, etc.) where player.accountid
  // hasn't been populated yet. Callers run their own isValidHero check.
  return {
    accountIdFromArgs,
    hero: packet?.hero,
    items: packet?.items,
    ourHero: true,
    player: packet?.player,
    playerIdx,
  }
}
