import { t } from 'i18next'

import { getHeroById, getHeroByName, heroColors } from '../../dota/lib/heroes'
import { MatchDataService } from '../../dota/lib/matchData'
import type { RosterPlayer } from '../../dota/lib/matchData'
import type { Packet, Players, SocketClient } from '../../types'
import CustomError from '../../utils/custom-error'

const requirePlayerArgument = function requirePlayerArgument({
  args,
  command,
  heroIdsInMatch,
  heroList,
  locale,
}: {
  args: string[]
  command: string
  heroIdsInMatch: (number | undefined)[]
  heroList: string
  locale: string
}): void {
  if (args.length > 0) {
    return
  }
  if (heroIdsInMatch.filter(Boolean).length > 1) {
    throw new CustomError(t('invalidHero', { command, heroList, lng: locale }))
  }
  throw new CustomError(
    t('invalidColorNew', { colorList: heroColors.join(' · '), command, lng: locale })
  )
}

const resolvePlayerIndex = function resolvePlayerIndex({
  firstArg,
  hero,
  packet,
  players,
}: {
  firstArg: string
  hero: ReturnType<typeof getHeroByName>
  packet: Packet | undefined
  players: RosterPlayer[]
}): number {
  const heroColorIndex = heroColors.findIndex((heroColor) => heroColor.toLowerCase() === firstArg)
  const slotRequest = Number(firstArg)
  if (slotRequest >= 1 && slotRequest <= 10) {
    return slotRequest - 1
  }
  if (heroColorIndex !== -1) {
    return heroColorIndex
  }
  if (packet?.hero?.id === hero?.id) {
    return players.findIndex((player) => player.heroId === hero?.id)
  }
  return hero ? players.findIndex((player) => player.heroId === hero.id) : -1
}

const toLegacyPlayer = function toLegacyPlayer(
  player: RosterPlayer | undefined
): Players[number] | undefined {
  if (player === undefined) {
    return undefined
  }
  const legacyPlayer: Players[number] = {
    accountid: player.accountId ?? 0,
    heroid: player.heroId ?? undefined,
    playerid: player.slot,
  }
  if (player.rank !== null) {
    legacyPlayer.rank = player.rank
  }
  if (player.playerName !== null) {
    legacyPlayer.player_name = player.playerName
  }
  return legacyPlayer
}

export const getPlayerFromArgs = async function getPlayerFromArgs({
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
  let players: RosterPlayer[] = []
  if (client) {
    const { players: resolvedPlayers } = await new MatchDataService(client).resolveRoster()
    players = resolvedPlayers
  }
  const heroIdsInMatch = players.map((player) => player.heroId ?? undefined)
  const heroList = heroIdsInMatch
    .map((heroId) => getHeroById(heroId))
    .map((hero) => hero?.localized_name)
    .join(' · ')

  requirePlayerArgument({ args, command, heroIdsInMatch, heroList, locale })

  const firstArg = args[0].toLowerCase().trim()
  const hero = getHeroByName(args.join('').toLowerCase().trim(), heroIdsInMatch)
  const playerIdx = resolvePlayerIndex({ firstArg, hero, packet, players })

  // Translate the matched RosterPlayer back to the GSI-style snake_case shape the 15+ callers
  // (hero, dotabuff, opendota, profile, stats, items, aghs, d2pt, gpm, innate, shard, xpm, apm)
  // expect via `player.accountid` / `player.heroid`. This is the one boundary point where the
  // internal RosterPlayer shape meets external GSI-shaped data.
  const matched = players[playerIdx ?? -1]
  const matchedLegacy = toLegacyPlayer(matched)
  const defaultPlayer = {
    accountid: Number(packet?.player?.accountid),
    heroid: hero?.id,
    playerid: null,
  }
  const hasMoreDataForCurrentHero = packet?.hero?.id === hero?.id
  const moreData = hasMoreDataForCurrentHero ? { ...packet?.player, ...packet?.hero } : {}
  return {
    player: {
      ...moreData,
      ...defaultPlayer,
      ...matchedLegacy,
    },
    playerIdx,
  }
}
