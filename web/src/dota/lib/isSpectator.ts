import { Packet } from '../../types.js'

export function isSpectator(gsi?: Packet) {
  if (!gsi) return false
  return gsi.player?.team_name === 'spectator' || 'team2' in (gsi.player ?? {})
}
