import type { Packet } from '../../types'
import { isDev } from './consts'
import { isArcade } from './isArcade'
import { isSpectator } from './isSpectator'

// team2 = watching replay or live match
// customgamename = playing arcade or hero demo

export function isPlayingMatch(gsi?: Packet, requiresPlaying = true) {
  if (!gsi) return false
  if (requiresPlaying && gsi?.player?.activity !== 'playing') return false

  if (isDev && isArcade(gsi)) return true

  return !isSpectator(gsi) && !isArcade(gsi)
}
