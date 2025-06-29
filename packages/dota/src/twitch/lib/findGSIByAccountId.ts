import { t } from 'i18next'

import { getSpectatorPlayers } from '../../dota/lib/getSpectatorPlayers.js'
import { isSpectator } from '../../dota/lib/isSpectator.js'
import type { Hero, Items, Packet, Player } from '../../types.js'
import CustomError from '../../utils/customError.js'
import { getPlayerFromArgs } from './getPlayerFromArgs.js'

export function findSpectatorIdx(packet: Packet | undefined, heroOrAccountId: number | undefined) {
  const teams = ['team2', 'team3'] as const

  for (const team of teams) {
    const teamPlayers = packet?.player?.[team]
    const players: Player[] = Object.values(teamPlayers ?? {})
    if (!players) continue

    for (let i = 0; i < players.length; i++) {
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

export async function findAccountFromCmd(
  packet: Packet | undefined,
  args: string[],
  locale: string,
  command: string,
) {
  let accountIdFromArgs = Number.isNaN(Number(packet?.player?.accountid))
    ? undefined
    : Number(packet?.player?.accountid)

  let playerIdx: number | undefined

  if (args.length && !isSpectator(packet)) {
    const data = await getPlayerFromArgs({ args, packet, locale, command })
    accountIdFromArgs = Number(data?.player?.accountid)
    playerIdx = data?.playerIdx

    if (!accountIdFromArgs && !data?.player?.heroid) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
    }

    // the missing data (items) gets filled out from delayedGames data
    return {
      ourHero: false,
      playerIdx,
      accountIdFromArgs,
      player: { accountid: accountIdFromArgs },
      hero: { id: data?.player?.heroid, facet: data?.player?.facet },
    }
  }

  if (isSpectator(packet)) {
    if (args.length) {
      const data = await getPlayerFromArgs({ args, packet, locale, command })
      accountIdFromArgs = Number(data?.player?.accountid)
    }

    const spectatorPlayers = getSpectatorPlayers(packet)
    const selectedPlayer = spectatorPlayers.find((a) => 'selected' in a && !!a.selected)
    accountIdFromArgs = accountIdFromArgs ?? selectedPlayer?.accountid

    const { playerIdx, playerN, teamN } = findSpectatorIdx(packet, accountIdFromArgs) ?? {}

    // @ts-expect-error we can iterate by team2 and team3
    const player = packet?.player?.[teamN]?.[playerN] as Player
    // @ts-expect-error we can iterate by team2 and team3
    const items = packet?.items?.[teamN]?.[playerN] as Items
    // @ts-expect-error we can iterate by team2 and team3
    const hero = packet?.hero?.[teamN]?.[playerN] as Hero

    return { ourHero: false, playerIdx, accountIdFromArgs, player, items, hero }
  }

  if (!accountIdFromArgs) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
  }

  return {
    ourHero: true,
    playerIdx,
    accountIdFromArgs,
    player: packet?.player,
    items: packet?.items,
    hero: packet?.hero,
  }
}
