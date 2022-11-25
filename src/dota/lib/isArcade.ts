import { GSIClient } from '../server'

export function isArcade(client: GSIClient) {
  return (
    client.gamestate?.map?.customgamename !== '' &&
    client.gamestate?.map?.customgamename !== undefined
  )
}
