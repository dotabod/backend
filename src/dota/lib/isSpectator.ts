import { Packet } from '../../types.js'

export function isSpectator(gsi: Packet) {
  return gsi.player?.team_name === 'spectator' || 'team2' in (gsi.player ?? {})
}
