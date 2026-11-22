import { supabase } from '@dotabod/shared-utils'
import { z } from 'zod'

import { DBSettings, getValueOrDefault } from '../../../settings'
import { requestSteam } from '../../../steam/request'
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

/**
 * Construct one instance per query so the match packet and memoized lookups stay in sync.
 */
export class MatchDataService {
  private readonly chain: ResolverChain
  private readonly client: SocketClient
  private readonly gsi: SocketClient['gsi']
  private readonly visionResolver: VisionResolver

  constructor(
    client: SocketClient,
    opts?: { visionFetcher?: VisionFetcher; chain?: ResolverChain }
  ) {
    this.client = client
    this.gsi = client.gsi
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

  get matchId(): string | undefined {
    const id = this.gsi?.map?.matchid
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
    return isSpectator(this.gsi)
  }

  get isArcade(): boolean {
    return isArcade(this.gsi)
  }

  get isPlayingMatch(): boolean {
    return isPlayingMatch(this.gsi)
  }

  get hasWinTeam(): boolean {
    const wt = this.gsi?.map?.win_team
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

  // Return a count only to avoid identifying other streamers across chats.
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

    const accountIds = await this.getAccountIds()
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
    const ctx: ResolverContext = { gsi: this.gsi, matchId: this.matchId }
    const raw = await this.chain.resolve(ctx)
    if (!raw) {
      return normalize({
        gsi: ctx.gsi,
        matchPlayers: [],
        source: 'none',
      })
    }
    const backfilled = await this.backfillNamesFromVision(raw, ctx)
    return normalize({
      gsi: ctx.gsi,
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
    const accountIds = await this.getAccountIds()
    if (!accountIds.length) {
      return []
    }
    return await requestSteam('getCards', [accountIds, false], cardsSchema, 10_000)
  }
}

// Re-exported for tests + ergonomic consumer imports.
export type { ResolvedRoster, RosterPlayer } from './types'
