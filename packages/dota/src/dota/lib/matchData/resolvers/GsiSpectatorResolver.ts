import { getSpectatorPlayers } from '../../getSpectatorPlayers'
import { isSpectator } from '../../isSpectator'
import { type RawRoster, type ResolverContext, RosterResolver } from './RosterResolver'

// Fires only when the streamer is in observer/spectator GSI and the spectator parse yields a
// non-empty roster. Fast path — purely synchronous read of the live GSI packet.
export class GsiSpectatorResolver extends RosterResolver {
  readonly name = 'gsi-spectator' as const

  async resolve({ gsi }: ResolverContext): Promise<RawRoster | null> {
    if (!gsi || !isSpectator(gsi)) return null
    const players = getSpectatorPlayers(gsi)
    if (!Array.isArray(players) || players.length === 0) return null
    return { source: 'gsi-spectator', matchPlayers: players }
  }
}
