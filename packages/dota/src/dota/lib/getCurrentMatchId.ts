import type { SocketClient } from '../../types'
import { isPlayingMatch } from './isPlayingMatch'
import { isArcade } from './isArcade'
import { isSpectator } from './isSpectator'

// GSI configs heartbeat every 30 seconds. Two missed heartbeats plus jitter means the snapshot
// is no longer trustworthy enough to answer current-game chat commands.
export const GSI_STALE_AFTER_MS = 75_000

const activeMatchStates = new Set([
  'DOTA_GAMERULES_STATE_PLAYER_DRAFT',
  'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD',
  'DOTA_GAMERULES_STATE_HERO_SELECTION',
  'DOTA_GAMERULES_STATE_STRATEGY_TIME',
  'DOTA_GAMERULES_STATE_PRE_GAME',
  'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
])

export function getCurrentMatchId(
  client: Pick<SocketClient, 'gsi' | 'gsiUpdatedAt'>,
  now = Date.now(),
): string | undefined {
  const matchId = getFreshActiveMatchId(client, now)
  if (!matchId || !isPlayingMatch(client.gsi)) return undefined

  return matchId
}

// Roster commands can read the full team2/team3 payload that Dota exposes while spectating.
// Keep the same freshness/end-state protections as player commands without rejecting that
// intentional spectator source before MatchDataService gets a chance to resolve it.
export function getCurrentRosterMatchId(
  client: Pick<SocketClient, 'gsi' | 'gsiUpdatedAt'>,
  now = Date.now(),
): string | undefined {
  const matchId = getFreshActiveMatchId(client, now)
  if (!matchId || (!isPlayingMatch(client.gsi) && !isSpectator(client.gsi))) return undefined

  return matchId
}

// Hero-information commands can use fresh GSI in a played match, spectator feed, or custom
// game. Unlike roster/match-id commands, Hero Demo is valid here even though Valve reports
// matchid 0: the packet still contains the selected hero needed by !hero/!aghs/!shard/!innate.
export function hasCurrentGameContext(
  client: Pick<SocketClient, 'gsi' | 'gsiUpdatedAt'>,
  now = Date.now(),
): boolean {
  if (!hasFreshActiveGameState(client, now)) return false

  return isPlayingMatch(client.gsi) || isSpectator(client.gsi) || isArcade(client.gsi)
}

export function isCurrentCustomGame(
  client: Pick<SocketClient, 'gsi' | 'gsiUpdatedAt'>,
  now = Date.now(),
): boolean {
  return hasFreshActiveGameState(client, now) && isArcade(client.gsi)
}

function getFreshActiveMatchId(
  client: Pick<SocketClient, 'gsi' | 'gsiUpdatedAt'>,
  now: number,
): string | undefined {
  const packet = client.gsi
  const matchId = packet?.map?.matchid

  if (!matchId || !Number(matchId) || !hasFreshActiveGameState(client, now)) return undefined

  return matchId
}

function hasFreshActiveGameState(
  client: Pick<SocketClient, 'gsi' | 'gsiUpdatedAt'>,
  now: number,
): boolean {
  const packet = client.gsi

  if (!packet || !isGsiFresh(client, now)) return false
  if (!activeMatchStates.has(packet.map?.game_state ?? '')) return false
  if (packet.map?.win_team && packet.map.win_team !== 'none') return false

  return true
}

export function isGsiFresh(
  client: Pick<SocketClient, 'gsi' | 'gsiUpdatedAt'>,
  now = Date.now(),
): boolean {
  return !!client.gsi && !!client.gsiUpdatedAt && now - client.gsiUpdatedAt <= GSI_STALE_AFTER_MS
}
