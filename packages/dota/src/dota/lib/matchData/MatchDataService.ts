import { supabase } from '@dotabod/shared-utils'
import { DBSettings, getValueOrDefault } from '../../../settings'
import { steamSocket } from '../../../steam/ws'
import type { Cards, DelayedGames, SocketClient } from '../../../types'
import { is8500Plus } from '../../../utils/index'
import { getHeroNameOrColor, heroColors } from '../heroes'
import { isArcade } from '../isArcade'
import { isPlayingMatch } from '../isPlayingMatch'
import { isSpectator } from '../isSpectator'
import { fetchDelayedGameDoc } from './internal/mongoDoc'
import { normalize } from './internal/normalize'
import {
  GsiSelfResolver,
  GsiSpectatorResolver,
  ResolverChain,
  SourceTvResolver,
  type VisionFetcher,
  VisionResolver,
} from './resolvers'
import type { ResolvedRoster, RosterPlayer } from './types'

// One cached entry point per match for roster/Mongo/cards lookups. Dispatch is now polymorphic —
// `ResolverChain` runs each `RosterResolver` in priority order and the first to claim wins. There
// is NO post-hoc shape inference; each resolver self-tags with its source.
//
// Source of truth: every consumer that asks "what's in this match?" should go through this class
// and ONLY this class. The legacy `getAccountsFromMatch` helper survives only for the Phase B
// migration window. Does NOT touch the spectate-friend chain — see memory
// `keep-spectate-friend-path`.
//
// **One instance = one query.** A rejection clears the relevant memoization slot so a transient
// I/O failure doesn't poison the instance; but `client.gsi` is captured by reference, so don't
// reuse an instance across distinct GSI ticks. Construct anew per query.

export class MatchDataService {
  private readonly chain: ResolverChain

  constructor(
    private readonly client: SocketClient,
    opts?: { visionFetcher?: VisionFetcher; chain?: ResolverChain },
  ) {
    // Default chain in priority order. Tests can inject a custom chain (or a custom Vision
    // fetcher) without touching `mock.module`.
    // SourceTvResolver shares the class's memoized Mongo fetch — passing the bound
    // `getDelayedGameDoc` means resolver lookups + `mds.getDelayedGameDoc()` + `getAverageMmr()`
    // etc. all dedupe to one Mongo I/O per instance lifetime. The fetcher's `matchId` arg is
    // ignored here because the class already knows its own; a unit-test stub WILL use the arg.
    this.chain =
      opts?.chain ??
      new ResolverChain([
        new GsiSpectatorResolver(),
        new SourceTvResolver((_matchId) => this.getDelayedGameDoc()),
        new VisionResolver(opts?.visionFetcher),
        new GsiSelfResolver(),
      ])
  }

  // --- Synchronous state (no I/O) ---

  get matchId(): string | undefined {
    const id = this.client.gsi?.map?.matchid
    return !id || id === '0' ? undefined : id
  }

  get hasSteam32Id(): boolean {
    return !!this.client.steam32Id
  }

  get isStreamOnline(): boolean {
    return !!this.client.stream_online
  }

  get isHighMmr(): boolean {
    return is8500Plus(this.client)
  }

  get isSpectator(): boolean {
    return isSpectator(this.client.gsi)
  }

  get isArcade(): boolean {
    return isArcade(this.client.gsi)
  }

  get isPlayingMatch(): boolean {
    return isPlayingMatch(this.client.gsi)
  }

  get hasWinTeam(): boolean {
    const wt = this.client.gsi?.map?.win_team
    return !!wt && wt !== 'none'
  }

  get autoClippingEnabled(): boolean {
    return !getValueOrDefault(
      DBSettings.disableAutoClipping,
      this.client.settings,
      this.client.subscription,
    )
  }

  get visionEligible(): boolean {
    return this.isHighMmr && this.autoClippingEnabled
  }

  // --- Memoized async base primitives ---
  // Caches the resolved value for the lifetime of THIS instance. Rejections clear the slot.

  private rosterPromise?: Promise<ResolvedRoster>
  resolveRoster(): Promise<ResolvedRoster> {
    if (!this.rosterPromise) {
      const p = this.fetchRoster()
      this.rosterPromise = p
      p.catch(() => {
        if (this.rosterPromise === p) this.rosterPromise = undefined
      })
    }
    return this.rosterPromise
  }

  private docPromise?: Promise<DelayedGames | null>
  getDelayedGameDoc(): Promise<DelayedGames | null> {
    if (!this.docPromise) {
      const matchId = this.matchId
      const p = matchId ? fetchDelayedGameDoc(matchId) : Promise.resolve(null)
      this.docPromise = p
      p.catch(() => {
        if (this.docPromise === p) this.docPromise = undefined
      })
    }
    return this.docPromise
  }

  private cardsPromise?: Promise<Cards[]>
  getCards(): Promise<Cards[]> {
    if (!this.cardsPromise) {
      const p = this.fetchCards()
      this.cardsPromise = p
      p.catch(() => {
        if (this.cardsPromise === p) this.cardsPromise = undefined
      })
    }
    return this.cardsPromise
  }

  // --- Typed accessors over the delayedGames doc (memoized via getDelayedGameDoc) ---

  async getAverageMmr(): Promise<number | null> {
    const doc = await this.getDelayedGameDoc()
    const v = doc?.average_mmr
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  async getGameMode(): Promise<number | null> {
    const doc = await this.getDelayedGameDoc()
    const v = doc?.match?.game_mode
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  async getLobbyType(): Promise<number | null> {
    const doc = await this.getDelayedGameDoc()
    const v = doc?.match?.lobby_type
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  async getSpectatorCount(): Promise<number | null> {
    const doc = await this.getDelayedGameDoc()
    const v = (doc as { spectators?: unknown } | null)?.spectators
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  // --- Per-slot lookup primitives ---

  async findPlayerBySlot(slot: number): Promise<RosterPlayer | null> {
    if (!Number.isFinite(slot)) return null
    const roster = await this.resolveRoster()
    return roster.players.find((p) => p.slot === slot) ?? null
  }

  async findPlayerByHeroId(heroId: number): Promise<RosterPlayer | null> {
    if (!heroId) return null
    const roster = await this.resolveRoster()
    return roster.players.find((p) => p.heroId === heroId) ?? null
  }

  async findPlayerByAccountId(accountId: number): Promise<RosterPlayer | null> {
    if (!accountId) return null
    const roster = await this.resolveRoster()
    return roster.players.find((p) => p.accountId === accountId) ?? null
  }

  async getSelf(): Promise<RosterPlayer | null> {
    if (!this.client.steam32Id) return null
    return this.findPlayerByAccountId(this.client.steam32Id)
  }

  async getFocusedSpectatorPlayer(): Promise<RosterPlayer | null> {
    const roster = await this.resolveRoster()
    return roster.players.find((p) => p.selected === true) ?? null
  }

  // --- "Other Dotabod streamers in this match" count (matches table + roster supplement) ---

  async getStreamersInMatchCount(opts: { excludeUserId: string }): Promise<number> {
    const userIds = new Set<string>()
    const matchId = this.matchId

    if (matchId) {
      const { data } = await supabase.from('matches').select('userId').eq('matchId', matchId)
      for (const row of data ?? []) {
        if (row.userId) userIds.add(row.userId)
      }
    }

    const roster = await this.resolveRoster()
    const accountIds = roster.players
      .map((p) => p.accountId)
      .filter((id): id is number => id !== null && id > 0)
    if (accountIds.length) {
      const { data } = await supabase
        .from('steam_accounts')
        .select('userId')
        .in('steam32Id', accountIds)
      for (const row of data ?? []) {
        if (row.userId) userIds.add(row.userId)
      }
    }

    userIds.delete(opts.excludeUserId)
    return userIds.size
  }

  // --- Tier-aware hero-name resolution ---

  async resolveHeroNameForSlot(opts: {
    eventPlayerId: number
  }): Promise<{ name: string | null; resolvedFromRoster: boolean }> {
    const slot = opts.eventPlayerId
    if (!Number.isFinite(slot)) return { name: null, resolvedFromRoster: false }
    const player = await this.findPlayerBySlot(slot)
    if (player) {
      if (player.heroId === null) {
        if (this.isHighMmr) return { name: null, resolvedFromRoster: true }
        if (slot >= 0 && slot < heroColors.length) {
          return { name: heroColors[slot], resolvedFromRoster: true }
        }
        return { name: null, resolvedFromRoster: true }
      }
      return { name: getHeroNameOrColor(player.heroId, slot), resolvedFromRoster: true }
    }
    if (this.isHighMmr) return { name: null, resolvedFromRoster: false }
    if (slot >= 0 && slot < heroColors.length) {
      return { name: heroColors[slot], resolvedFromRoster: false }
    }
    return { name: null, resolvedFromRoster: false }
  }

  // --- Internals ---

  private async fetchRoster(): Promise<ResolvedRoster> {
    const raw = await this.chain.resolve({ gsi: this.client.gsi, matchId: this.matchId })
    if (!raw) {
      return normalize({
        source: 'none',
        matchPlayers: [],
        heroesStatus: undefined,
        gsi: this.client.gsi,
      })
    }
    return normalize({
      source: raw.source,
      matchPlayers: raw.matchPlayers,
      heroesStatus: raw.heroesStatus,
      gsi: this.client.gsi,
    })
  }

  private async fetchCards(): Promise<Cards[]> {
    const roster = await this.resolveRoster()
    const accountIds = [
      ...new Set(
        roster.players.map((p) => p.accountId).filter((id): id is number => id !== null && id > 0),
      ),
    ]
    if (!accountIds.length) return []
    return new Promise<Cards[]>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('[MatchDataService] getCards socket timeout after 10s')),
        10_000,
      )
      steamSocket.emit('getCards', accountIds, false, (err: unknown, cards: Cards[]) => {
        clearTimeout(timeout)
        if (err) reject(err instanceof Error ? err : new Error(String(err)))
        else resolve(cards ?? [])
      })
    })
  }
}

// Re-exported for tests + ergonomic consumer imports.
export type {
  Coverage,
  MatchStage,
  ResolvedRoster,
  RosterCompleteness,
  RosterPlayer,
  RosterSource,
} from './types'
