import { t } from 'i18next'

import { getHeroById, getHeroByName, heroColors } from '../../dota/lib/heroes'
import { MatchDataService, type RosterPlayer } from '../../dota/lib/matchData'
import type { SocketClient } from '../../types'
import CustomError from '../../utils/customError'

export async function getPlayerFromArgs({
  args,
  locale,
  client,
  command,
}: {
  client?: SocketClient
  args: string[]
  locale: string
  command: string
}) {
  const packet = client?.gsi
  const players: RosterPlayer[] = client
    ? (await new MatchDataService(client).resolveRoster()).players
    : []
  const heroIdsInMatch = players.map((player) => player.heroId ?? undefined)
  const heroList = heroIdsInMatch
    .map((heroId) => getHeroById(heroId))
    .map((hero) => hero?.localized_name)
    .join(' · ')

  if (!args.length) {
    if (heroIdsInMatch.filter(Boolean).length > 1) {
      throw new CustomError(t('invalidHero', { command, heroList, lng: locale }))
    }

    throw new CustomError(
      t('invalidColorNew', { command, colorList: heroColors.join(' · '), lng: locale }),
    )
  }

  // herokey is 0-9
  let playerIdx: number | undefined

  const firstArg = args[0].toLowerCase().trim()
  const heroColorIndex = heroColors.findIndex((heroColor) => heroColor.toLowerCase() === firstArg)
  // hero name input or alias
  const hero = getHeroByName(args.join('').toLowerCase().trim(), heroIdsInMatch)

  // 1-10 input
  const slotRequest = Number(firstArg)
  if (slotRequest && slotRequest >= 1 && slotRequest <= 10) {
    playerIdx = slotRequest - 1
  } else if (heroColorIndex !== -1) {
    // color input
    playerIdx = heroColorIndex
  } else {
    if (packet?.hero?.id === hero?.id) {
      playerIdx = players.findIndex((player) => player.heroId === hero?.id)
    } else {
      playerIdx = hero ? players.findIndex((player) => player.heroId === hero.id) : -1
    }
  }

  // Translate the matched RosterPlayer back to the GSI-style snake_case shape the 15+ callers
  // (hero, dotabuff, opendota, profile, stats, items, aghs, d2pt, gpm, innate, shard, xpm, apm)
  // expect via `player.accountid` / `player.heroid`. This is the one boundary point where the
  // internal RosterPlayer shape meets external GSI-shaped data.
  const matched = players[playerIdx ?? -1]
  const matchedLegacy = matched
    ? {
        heroid: matched.heroId ?? undefined,
        accountid: matched.accountId ?? 0,
        playerid: matched.slot,
        ...(matched.rank !== null ? { rank: matched.rank } : {}),
        ...(matched.playerName !== null ? { player_name: matched.playerName } : {}),
      }
    : undefined
  const defaultPlayer = {
    heroid: hero?.id,
    accountid: Number(packet?.player?.accountid),
    playerid: null,
  }
  const hasMoreDataForCurrentHero = packet?.hero?.id === hero?.id
  const moreData = hasMoreDataForCurrentHero ? { ...packet?.player, ...packet?.hero } : {}
  return {
    playerIdx,
    player: {
      ...moreData,
      ...defaultPlayer,
      ...matchedLegacy,
    },
  }
}
