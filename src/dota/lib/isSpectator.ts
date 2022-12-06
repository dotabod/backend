import { GSIClient } from '../GSIClient.js'

export function isSpectator(client: GSIClient) {
  return (
    client.gamestate?.player?.team_name === 'spectator' ||
    'team2' in (client.gamestate?.player ?? {})
  )
}
