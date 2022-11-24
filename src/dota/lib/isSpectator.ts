import { GSIClient } from '../server'

// spectator = watching a friend live
// team2 = watching replay or live match
// customgamename = playing arcade or hero demo

export function isSpectator(client: GSIClient) {
  // undefined means the client is disconnected from a game
  // so we want to run our obs stuff to unblock anything
  const isArcade =
    client.gamestate?.map?.customgamename !== '' &&
    client.gamestate?.map?.customgamename !== undefined
  if (
    client.gamestate?.player?.team_name === 'spectator' ||
    isArcade ||
    'team2' in (client.gamestate?.player || {})
  ) {
    return true
  }

  return false
}
