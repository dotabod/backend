import { RosterResolver } from './roster-resolver'
import type { RawRoster, ResolverContext } from './roster-resolver'

// Final fallback in the live chain — surfaces just the streamer's own hero/account from GSI when
// no other source claimed the roster. Returns null if GSI has nothing meaningful (so `none`
// surfaces at the chain level).
export class GsiSelfResolver extends RosterResolver {
  readonly name = 'gsi-self' as const

  async resolve({ gsi }: ResolverContext): Promise<RawRoster | null> {
    if (!gsi) {
      return null
    }
    const heroid = gsi.hero?.id
    const accountid = Number(gsi.player?.accountid)
    const validHero = typeof heroid === 'number' && Number.isFinite(heroid) && heroid > 0
    const validAcct = Number.isFinite(accountid) && accountid > 0
    if (!validHero && !validAcct) {
      return null
    }
    return {
      matchPlayers: [
        {
          accountid: validAcct ? accountid : 0,
          heroid: validHero ? heroid : undefined,
          playerid: null,
        },
      ],
      source: 'gsi-self',
    }
  }
}
