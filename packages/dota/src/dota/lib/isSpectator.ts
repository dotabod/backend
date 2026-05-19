import type { Packet } from '../../types'

export function isSpectator(gsi?: Packet) {
  if (!gsi) return false
  return gsi.player?.team_name === 'spectator' || 'team2' in (gsi.player ?? {})
}
