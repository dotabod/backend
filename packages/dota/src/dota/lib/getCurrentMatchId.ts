import type { SocketClient } from '../../types'
import { isPlayingMatch } from './isPlayingMatch'

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
  const packet = client.gsi
  const matchId = packet?.map?.matchid

  if (!matchId || !Number(matchId) || !isGsiFresh(client, now)) return undefined
  if (!isPlayingMatch(packet)) return undefined
  if (!activeMatchStates.has(packet.map?.game_state ?? '')) return undefined
  if (packet.map?.win_team && packet.map.win_team !== 'none') return undefined

  return matchId
}

export function isGsiFresh(
  client: Pick<SocketClient, 'gsi' | 'gsiUpdatedAt'>,
  now = Date.now(),
): boolean {
  return !!client.gsi && !!client.gsiUpdatedAt && now - client.gsiUpdatedAt <= GSI_STALE_AFTER_MS
}
