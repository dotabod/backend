import { GSIClient } from '../server'
import { isArcade } from './isArcade'
import { isSpectator } from './isSpectator'

// spectator = watching a friend live
// team2 = watching replay or live match
// customgamename = playing arcade or hero demo

export function isPlayingMatch(client: GSIClient) {
  return !isSpectator(client) && !isArcade(client)
}
