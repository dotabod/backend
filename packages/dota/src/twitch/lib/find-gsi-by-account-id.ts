import { t } from 'i18next'

import { getSpectatorPlayers } from '../../dota/lib/get-spectator-players'
import { isSpectator } from '../../dota/lib/is-spectator'
import type { Hero, Items, Packet, Player, SocketClient } from '../../types'
import CustomError from '../../utils/custom-error'
import { getPlayerFromArgs } from './get-player-from-args'

const spectatorLocations = [
  { playerIdx: 0, playerN: 'player0', teamN: 'team2' },
  { playerIdx: 1, playerN: 'player1', teamN: 'team2' },
  { playerIdx: 2, playerN: 'player2', teamN: 'team2' },
  { playerIdx: 3, playerN: 'player3', teamN: 'team2' },
  { playerIdx: 4, playerN: 'player4', teamN: 'team2' },
  { playerIdx: 5, playerN: 'player5', teamN: 'team3' },
  { playerIdx: 6, playerN: 'player6', teamN: 'team3' },
  { playerIdx: 7, playerN: 'player7', teamN: 'team3' },
  { playerIdx: 8, playerN: 'player8', teamN: 'team3' },
  { playerIdx: 9, playerN: 'player9', teamN: 'team3' },
] as const

type SpectatorLocation = (typeof spectatorLocations)[number]
type RadiantLocation = Extract<SpectatorLocation, { teamN: 'team2' }>
type DireLocation = Extract<SpectatorLocation, { teamN: 'team3' }>

interface SpectatorData {
  hero?: Hero
  items?: Items
  player?: Player
}

type LookupHero = Hero | { id: number | undefined }
type LookupPlayer = Player | { accountid: number | undefined }

export interface AccountLookupResult {
  accountIdFromArgs: number | undefined
  hero: LookupHero | undefined
  items?: Items
  ourHero: boolean
  player: LookupPlayer | undefined
  playerIdx?: number
}

const getRadiantData = function getRadiantData(
  packet: Packet | undefined,
  location: RadiantLocation
): SpectatorData {
  const heroes = packet?.hero?.team2
  const items = packet?.items?.team2
  const players = packet?.player?.team2
  return {
    hero: heroes?.[location.playerN],
    items: items?.[location.playerN],
    player: players?.[location.playerN],
  }
}

const getDireData = function getDireData(
  packet: Packet | undefined,
  location: DireLocation
): SpectatorData {
  const heroes = packet?.hero?.team3
  const items = packet?.items?.team3
  const players = packet?.player?.team3
  return {
    hero: heroes?.[location.playerN],
    items: items?.[location.playerN],
    player: players?.[location.playerN],
  }
}

const getPlayerAtLocation = function getPlayerAtLocation(
  packet: Packet | undefined,
  location: SpectatorLocation
): Player | undefined {
  if (location.teamN === 'team2') {
    return packet?.player?.team2?.[location.playerN]
  }
  return packet?.player?.team3?.[location.playerN]
}

const getSpectatorData = function getSpectatorData(
  packet: Packet | undefined,
  location: SpectatorLocation | null
): SpectatorData {
  if (location === null) {
    return {}
  }
  if (location.teamN === 'team2') {
    return getRadiantData(packet, location)
  }
  return getDireData(packet, location)
}

export const findSpectatorIdx = function findSpectatorIdx(
  packet: Packet | undefined,
  heroOrAccountId: number | undefined
): SpectatorLocation | null {
  for (const location of spectatorLocations) {
    const player = getPlayerAtLocation(packet, location)
    if (Number(player?.accountid) === heroOrAccountId) {
      return location
    }
  }

  return null
}

const findPlayerArgument = async function findPlayerArgument({
  args,
  client,
  command,
  locale,
}: {
  args: string[]
  client: SocketClient | undefined
  command: string
  locale: string
}): Promise<AccountLookupResult> {
  const { player, playerIdx } = await getPlayerFromArgs({ args, client, command, locale })
  const accountIdFromArgs = player?.accountid
  const heroId = player?.heroid
  const missingAccount = accountIdFromArgs === 0 || Number.isNaN(accountIdFromArgs)
  const missingHero =
    heroId === null || heroId === undefined || heroId === 0 || Number.isNaN(heroId)
  if (missingAccount && missingHero) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
  }

  return {
    accountIdFromArgs,
    hero: { id: heroId },
    ourHero: false,
    player: { accountid: accountIdFromArgs },
    playerIdx,
  }
}

const findSpectatorAccount = async function findSpectatorAccount({
  accountIdFromPacket,
  args,
  client,
  command,
  locale,
  packet,
}: {
  accountIdFromPacket: number | undefined
  args: string[]
  client: SocketClient | undefined
  command: string
  locale: string
  packet: Packet | undefined
}): Promise<AccountLookupResult> {
  let accountIdFromArgs = accountIdFromPacket
  if (args.length > 0) {
    const { player } = await getPlayerFromArgs({ args, client, command, locale })
    accountIdFromArgs = player?.accountid
  }

  const spectatorPlayers = getSpectatorPlayers(packet)
  const selectedPlayer = spectatorPlayers.find((player) => player.selected)
  const firstValidHero = spectatorPlayers.find((player) => (player.heroid ?? 0) > 0)
  accountIdFromArgs ??= selectedPlayer?.accountid ?? firstValidHero?.accountid

  const location = findSpectatorIdx(packet, accountIdFromArgs)
  const { hero, items, player } = getSpectatorData(packet, location)
  return {
    accountIdFromArgs,
    hero,
    items,
    ourHero: false,
    player,
    playerIdx: location?.playerIdx,
  }
}

export const findAccountFromCmd = async function findAccountFromCmd(
  client: SocketClient | undefined,
  args: string[],
  locale: string,
  command: string
): Promise<AccountLookupResult> {
  const packet = client?.gsi
  const packetAccountId = Number(packet?.player?.accountid)
  const accountIdFromPacket = Number.isNaN(packetAccountId) ? undefined : packetAccountId
  const spectator = isSpectator(packet)

  if (args.length > 0 && !spectator) {
    return await findPlayerArgument({ args, client, command, locale })
  }

  if (spectator) {
    return await findSpectatorAccount({
      accountIdFromPacket,
      args,
      client,
      command,
      locale,
      packet,
    })
  }

  // Don't gate on accountIdFromArgs — packet.hero can be a valid flat hero
  // even during brief windows (draft transitions, etc.) where player.accountid
  // hasn't been populated yet. Callers run their own isValidHero check.
  return {
    accountIdFromArgs: accountIdFromPacket,
    hero: packet?.hero,
    items: packet?.items,
    ourHero: true,
    player: packet?.player,
  }
}
