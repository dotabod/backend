import { supabase } from '@dotabod/shared-utils'
import { z } from 'zod'

import { DBSettings, getValueOrDefault } from '../../../settings'
import { steamSocket } from '../../../steam/ws'
import type { Cards, DelayedGames, HeroesStatus, SocketClient } from '../../../types'
import { is8500Plus } from '../../../utils/index'
import { getHeroNameOrColor, heroColors } from '../heroes'
import { isArcade } from '../is-arcade'
import { isPlayingMatch } from '../is-playing-match'
import { isSpectator } from '../is-spectator'
import { fetchDelayedGameDoc } from './internal/mongo-doc'
import { normalize } from './internal/normalize'
import {
  GsiSelfResolver,
  GsiSpectatorResolver,
  ResolverChain,
  SourceTvResolver,
  VisionResolver,
} from './resolvers'
import type { RawRoster, ResolverContext, VisionFetcher } from './resolvers'
import type { ResolvedRoster, RosterPlayer } from './types'

const cardsSchema = z.array(
  z.object({
    account_id: z.number(),
    createdAt: z.coerce.date(),
    leaderboard_rank: z.number(),
    lifetime_games: z.number().default(0),
    rank_tier: z.number(),
  })
)

// One cached entry point per match for roster/Mongo/cards lookups. Dispatch is polymorphic —
// `ResolverChain` runs each `RosterResolver` in priority order and the first to claim wins. There
// is NO post-hoc shape inference; each resolver self-tags with its source.
//
// Source of truth: every consumer that asks "what's in this match?" should go through this class
// and ONLY this class. Does NOT touch the spectate-friend chain — see memory
// `keep-spectate-friend-path`.
//
// **One instance = one query.** A rejection clears the relevant memoization slot so a transient
// I/O failure doesn't poison the instance; but `client.gsi` is captured by reference, so don't
// reuse an instance across distinct GSI ticks. Construct anew per query.

/**
 * Service for resolving and querying match data (roster, Mongo doc, Steam cards) for a single
 * GSI tick / request. Dispatches resolver chain (gsi-spectator → sourcetv → vision → gsi-self)
 * and memoizes I/O for the lifetime of the instance.
 *
 * **Contract: construct a fresh instance per query.** Do not cache across distinct GSI ticks —
 * `client.gsi` is captured by reference and memoized values will go stale.
 *
 * Do:
 * ```ts
 * const mds = new MatchDataService(client)
 * const roster = await mds.resolveRoster()
 * const mmr = await mds.getAverageMmr() // dedupes Mongo I/O with resolveRoster()
 * ```
 *
 * Don't:
 * ```ts
 * // Reusing across ticks leaks stale state.
 * class Handler { private mds = new MatchDataService(this.client) }
 * ```
 */
export class MatchDataService {
  private readonly chain: ResolverChain
  private readonly client: SocketClient
  private readonly visionResolver: VisionResolver

  constructor(
    client: SocketClient,
    opts?: { visionFetcher?: VisionFetcher; chain?: ResolverChain }
  ) {
    // Default chain in priority order. Tests can inject a custom chain (or a custom Vision
    // fetcher) without touching `mock.module`.
    // SourceTvResolver shares the class's memoized Mongo fetch — passing the bound
    // `getDelayedGameDoc` means resolver lookups + `mds.getDelayedGameDoc()` + `getAverageMmr()`
    // etc. all dedupe to one Mongo I/O per instance lifetime. The fetcher's `matchId` arg is
    // ignored here because the class already knows its own; a unit-test stub WILL use the arg.
    // `visionResolver` is kept as its own field (not just buried in the chain) so `fetchRoster`
    // can reuse it for the name-backfill pass below without constructing a second instance.
    this.client = client
    this.visionResolver = new VisionResolver(opts?.visionFetcher)
    this.chain =
      opts?.chain ??
      new ResolverChain([
        new GsiSpectatorResolver(),
        new SourceTvResolver(async () => await this.getDelayedGameDoc()),
        this.visionResolver,
        new GsiSelfResolver(),
      ])
  }

  // --- Synchronous state (no I/O) ---

  get matchId(): string | undefined {
    const id = this.client.gsi?.map?.matchid
    return id === undefined || id.length === 0 || id === '0' ? undefined : id
  }

  get hasSteam32Id(): boolean {
    return this.client.steam32Id !== null && this.client.steam32Id !== 0
  }

  get isStreamOnline(): boolean {
    return this.client.stream_online
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
    return wt !== undefined && wt.length > 0 && wt !== 'none'
  }

  get autoClippingEnabled(): boolean {
    return !getValueOrDefault(
      DBSettings.disableAutoClipping,
      this.client.settings,
      this.client.subscription
    )
  }

  get visionEligible(): boolean {
    return this.isHighMmr && this.autoClippingEnabled
  }

  // --- Memoized async base primitives ---
  // Caches the resolved value for the lifetime of THIS instance. Rejections clear the slot.

  private rosterPromise: Promise<ResolvedRoster> | null = null
  async resolveRoster(): Promise<ResolvedRoster> {
    if (!this.rosterPromise) {
      const rosterPromise = this.fetchRoster()
      this.rosterPromise = rosterPromise
      try {
        return await rosterPromise
      } catch (error) {
        if (this.rosterPromise === rosterPromise) {
          this.rosterPromise = null
        }
        throw error
      }
    }
    return await this.rosterPromise
  }

  private docPromise: Promise<DelayedGames | null> | null = null
  async getDelayedGameDoc(): Promise<DelayedGames | null> {
    if (!this.docPromise) {
      const { matchId } = this
      const docPromise =
        matchId === undefined ? Promise.resolve(null) : fetchDelayedGameDoc(matchId)
      this.docPromise = docPromise
      try {
        return await docPromise
      } catch (error) {
        if (this.docPromise === docPromise) {
          this.docPromise = null
        }
        throw error
      }
    }
    return await this.docPromise
  }

  private cardsPromise: Promise<Cards[]> | null = null
  async getCards(): Promise<Cards[]> {
    if (!this.cardsPromise) {
      const cardsPromise = this.fetchCards()
      this.cardsPromise = cardsPromise
      try {
        return await cardsPromise
      } catch (error) {
        if (this.cardsPromise === cardsPromise) {
          this.cardsPromise = null
        }
        throw error
      }
    }
    return await this.cardsPromise
  }

  // --- Typed accessors over the delayedGames doc (memoized via getDelayedGameDoc) ---

  async getAverageMmr(): Promise<number | null> {
    const doc = await this.getDelayedGameDoc()
    const averageMmr = doc?.average_mmr
    return averageMmr !== undefined && Number.isFinite(averageMmr) ? averageMmr : null
  }

  async getGameMode(): Promise<number | null> {
    const doc = await this.getDelayedGameDoc()
    const gameMode = doc?.match?.game_mode
    return gameMode !== undefined && Number.isFinite(gameMode) ? gameMode : null
  }

  async getLobbyType(): Promise<number | null> {
    const doc = await this.getDelayedGameDoc()
    const lobbyType = doc?.match?.lobby_type
    return lobbyType !== undefined && Number.isFinite(lobbyType) ? lobbyType : null
  }

  async getSpectatorCount(): Promise<number | null> {
    const doc = await this.getDelayedGameDoc()
    const spectatorCount = doc?.spectators
    return spectatorCount !== undefined && Number.isFinite(spectatorCount) ? spectatorCount : null
  }

  // --- Roster projections ---

  async getAccountIds(): Promise<number[]> {
    const roster = await this.resolveRoster()
    return [
      ...new Set(
        roster.players.map((p) => p.accountId).filter((id): id is number => id !== null && id > 0)
      ),
    ]
  }

  async getHeroesStatus(): Promise<HeroesStatus | undefined> {
    const roster = await this.resolveRoster()
    return roster.heroesStatus
  }

  // --- Per-slot lookup primitives ---

  async findPlayerBySlot(slot: number): Promise<RosterPlayer | null> {
    if (!Number.isFinite(slot)) {
      return null
    }
    const roster = await this.resolveRoster()
    return roster.players.find((p) => p.slot === slot) ?? null
  }

  async findPlayerByHeroId(heroId: number): Promise<RosterPlayer | null> {
    if (!heroId) {
      return null
    }
    const roster = await this.resolveRoster()
    return roster.players.find((p) => p.heroId === heroId) ?? null
  }

  async findPlayerByAccountId(accountId: number): Promise<RosterPlayer | null> {
    if (!accountId) {
      return null
    }
    const roster = await this.resolveRoster()
    return roster.players.find((p) => p.accountId === accountId) ?? null
  }

  async getSelf(): Promise<RosterPlayer | null> {
    if (this.client.steam32Id === null || this.client.steam32Id === 0) {
      return null
    }
    return await this.findPlayerByAccountId(this.client.steam32Id)
  }

  async getFocusedSpectatorPlayer(): Promise<RosterPlayer | null> {
    const roster = await this.resolveRoster()
    return roster.players.find((p) => p.selected === true) ?? null
  }

  // --- "Other Dotabod streamers in this match" count (matches table + roster supplement) ---

  async getStreamersInMatchCount(opts: { excludeUserId: string }): Promise<number> {
    const userIds = new Set<string>()
    const { matchId } = this

    if (matchId !== undefined) {
      const { data } = await supabase.from('matches').select('userId').eq('matchId', matchId)
      for (const row of data ?? []) {
        if (row.userId) {
          userIds.add(row.userId)
        }
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
        if (row.userId) {
          userIds.add(row.userId)
        }
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
    if (!Number.isFinite(slot)) {
      return { name: null, resolvedFromRoster: false }
    }
    const player = await this.findPlayerBySlot(slot)
    if (player) {
      if (player.heroId === null) {
        if (this.isHighMmr) {
          return { name: null, resolvedFromRoster: true }
        }
        if (slot >= 0 && slot < heroColors.length) {
          return { name: heroColors[slot], resolvedFromRoster: true }
        }
        return { name: null, resolvedFromRoster: true }
      }
      return { name: getHeroNameOrColor(player.heroId, slot), resolvedFromRoster: true }
    }
    if (this.isHighMmr) {
      return { name: null, resolvedFromRoster: false }
    }
    if (slot >= 0 && slot < heroColors.length) {
      return { name: heroColors[slot], resolvedFromRoster: false }
    }
    return { name: null, resolvedFromRoster: false }
  }

  // --- Internals ---

  private async fetchRoster(): Promise<ResolvedRoster> {
    const ctx: ResolverContext = { gsi: this.client.gsi, matchId: this.matchId }
    const raw = await this.chain.resolve(ctx)
    if (!raw) {
      return normalize({
        gsi: this.client.gsi,
        matchPlayers: [],
        source: 'none',
      })
    }
    const backfilled = await this.backfillNamesFromVision(raw, ctx)
    return normalize({
      gsi: this.client.gsi,
      heroesStatus: backfilled.heroesStatus,
      matchPlayers: backfilled.matchPlayers,
      source: backfilled.source,
    })
  }

  // SourceTV's account_id + hero_id pairs are authoritative and must never be decorated with OCR
  // identity. Consumers such as !np resolve those account IDs through curated notable-player data
  // and Steam Player Summaries. Spectator GSI can still use Vision as a last-resort name backfill
  // because it already has stable hero/slot identity from the observing client.
  private async backfillNamesFromVision(raw: RawRoster, ctx: ResolverContext): Promise<RawRoster> {
    if (
      raw.source === 'sourcetv' ||
      raw.source === 'vision-heroes' ||
      raw.source === 'vision-draft'
    ) {
      return raw
    }
    const hasMissingName = raw.matchPlayers.some(
      (p) =>
        p.heroid !== undefined &&
        p.heroid > 0 &&
        !(p.player_name !== undefined && p.player_name.length > 0)
    )
    if (!hasMissingName) {
      return raw
    }

    const vision = await this.visionResolver.resolve(ctx)
    if (!vision || vision.source !== 'vision-heroes') {
      return raw
    }

    const nameByHeroId = new Map<number, string>()
    for (const p of vision.matchPlayers) {
      if (
        p.heroid !== undefined &&
        p.heroid > 0 &&
        p.player_name !== undefined &&
        p.player_name.length > 0
      ) {
        nameByHeroId.set(p.heroid, p.player_name)
      }
    }
    if (nameByHeroId.size === 0) {
      return raw
    }

    return {
      ...raw,
      matchPlayers: raw.matchPlayers.map((p) => {
        if (p.player_name !== undefined && p.player_name.length > 0) {
          return p
        }
        if (p.heroid === undefined || p.heroid <= 0) {
          return p
        }
        const name = nameByHeroId.get(p.heroid)
        return name === undefined || name.length === 0 ? p : { ...p, player_name: name }
      }),
    }
  }

  private async fetchCards(): Promise<Cards[]> {
    const roster = await this.resolveRoster()
    const accountIds = [
      ...new Set(
        roster.players.map((p) => p.accountId).filter((id): id is number => id !== null && id > 0)
      ),
    ]
    if (!accountIds.length) {
      return []
    }
    const response: unknown = await steamSocket
      .timeout(10_000)
      .emitWithAck('getCards', accountIds, false)
    return cardsSchema.parse(response)
  }
}

// Re-exported for tests + ergonomic consumer imports.
export type { ResolvedRoster, RosterPlayer } from './types'
