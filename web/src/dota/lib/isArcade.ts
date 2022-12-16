import { GSIClient } from '../GSIClient.js'

export function isArcade(client: GSIClient) {
  return (
    client.gamestate?.map?.customgamename !== '' &&
    client.gamestate?.map?.customgamename !== undefined
  )
}
