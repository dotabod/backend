import { getSpectatorPlayers } from '../../get-spectator-players'
import { isSpectator } from '../../is-spectator'
import { RosterResolver } from './roster-resolver'
import type { RawRoster, ResolverContext } from './roster-resolver'

// Fires only when the streamer is in observer/spectator GSI and the spectator parse yields a
// non-empty roster. Fast path — purely synchronous read of the live GSI packet.
export class GsiSpectatorResolver extends RosterResolver {
  readonly name = 'gsi-spectator' as const

  resolve = async ({ gsi }: ResolverContext): Promise<RawRoster | null> => {
    if (!gsi || !isSpectator(gsi)) {
      return await Promise.resolve(null)
    }
    const players = getSpectatorPlayers(gsi)
    if (!Array.isArray(players) || players.length === 0) {
      return await Promise.resolve(null)
    }
    return await Promise.resolve({ matchPlayers: players, source: this.name })
  }
}
