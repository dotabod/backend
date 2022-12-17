import { Packet } from '../../types.js'
import { isArcade } from './isArcade.js'
import { isSpectator } from './isSpectator.js'

// team2 = watching replay or live match
// customgamename = playing arcade or hero demo
export function isPlayingMatch(gsi?: Packet) {
  if (!gsi) return false
  return !isSpectator(gsi) && !isArcade(gsi)
}
