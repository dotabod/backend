import { t } from 'i18next'

import { getSpectatorPlayers } from '../../dota/lib/getSpectatorPlayers.js'
import { isSpectator } from '../../dota/lib/isSpectator.js'
import { Packet, Player } from '../../types.js'
import CustomError from '../../utils/customError.js'
import { getPlayerFromArgs } from './getPlayerFromArgs.js'

export function findSpectatorIdx(packet: Packet | undefined, heroOrAccountId: number | undefined) {
  const teams = ['team2', 'team3']

  for (const team of teams) {
    // @ts-expect-error we can iterate by team2 and team3
    const players: Player[] = Object.values(packet?.player?.[team] ?? {})
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

        // @ts-expect-error we can iterate by team2 and team3
        return { playerIdx, playerN: Object.keys(packet?.player?.[team])[i], teamN: team }
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
  let accountIdFromArgs = isNaN(Number(packet?.player?.accountid))
    ? undefined
    : Number(packet?.player?.accountid)

  let playerIdx: number | undefined

  if (args.length && !isSpectator(packet)) {
    const data = await getPlayerFromArgs({ args, packet, locale, command })
    accountIdFromArgs = data?.player?.accountid
    playerIdx = data?.playerIdx

    if (!data?.player?.heroid) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
    }

    // the missing data (items) gets filled out from delayedGames data
    return {
      ourHero: false,
      playerIdx,
      accountIdFromArgs,
      player: { accountid: accountIdFromArgs },
      hero: { id: data?.player?.heroid },
    }
  }

  if (isSpectator(packet)) {
    if (args.length) {
      const data = await getPlayerFromArgs({ args, packet, locale, command })
      accountIdFromArgs = data?.player?.accountid
    }

    const spectatorPlayers = getSpectatorPlayers(packet)
    const selectedPlayer = spectatorPlayers.find((a) => !!a.selected)
    accountIdFromArgs = accountIdFromArgs ?? selectedPlayer?.accountid

    const { playerIdx, playerN, teamN } = findSpectatorIdx(packet, accountIdFromArgs) ?? {}

    // @ts-expect-error we can iterate by team2 and team3
    const player = packet?.player?.[teamN]?.[playerN]
    // @ts-expect-error we can iterate by team2 and team3
    const items = packet?.items?.[teamN]?.[playerN]
    // @ts-expect-error we can iterate by team2 and team3
    const hero = packet?.hero?.[teamN]?.[playerN]

    return { ourHero: false, playerIdx, accountIdFromArgs, player, items, hero }
  }

  if (!packet?.hero?.id) {
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
