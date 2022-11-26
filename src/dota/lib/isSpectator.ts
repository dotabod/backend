import { GSIClient } from '../GSIClient'

export function isSpectator(client: GSIClient) {
  return (
    client.gamestate?.player?.team_name === 'spectator' ||
    'team2' in (client.gamestate?.player ?? {})
  )
}
