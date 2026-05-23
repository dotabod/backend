import { DBSettings, getValueOrDefault } from '../../settings'
import MongoDBSingleton from '../../steam/MongoDBSingleton'
import { steamSocket } from '../../steam/ws'
import type { Cards, DelayedGames, HeroesStatus, Players, SocketClient } from '../../types'
import { is8500Plus } from '../../utils/index'
import { getAccountsFromMatch } from './getAccountsFromMatch'
import { getHeroNameOrColor, heroColors } from './heroes'
import { isArcade } from './isArcade'
import { isPlayingMatch } from './isPlayingMatch'
import { isSpectator } from './isSpectator'

// Phase A primitive class — one cached entry point per match for roster/Mongo/cards lookups.
// Wraps existing helpers without changing their behaviour; the only transforms it applies are
// (1) normalizing the `accountid: 0` sentinel to `null`, and (2) centralizing the tier-aware
// hero-name suppression rule. Callers continue composing higher-level views themselves.
// Does NOT touch the spectate-friend chain — see memory `keep-spectate-friend-path`.

export type RosterSource =
  | 'gsi-spectator'
  | 'sourcetv'
  | 'vision-heroes'
  | 'vision-draft'
  | 'gsi-self'
  | 'none'

export type MatchStage = 'roster-draft' | 'hero-draft' | 'in-progress' | 'unknown'

export type Coverage = 'all' | 'partial' | 'none'

export interface RosterCompleteness {
  accountIds: Coverage
  heroIds: Coverage
  teamAssignment: Coverage
  playerNames: Coverage
  ranks: Coverage
}

export interface RosterPlayer {
  slot: number | null
  accountId: number | null
  heroId: number | null
  team: 'radiant' | 'dire' | null
  playerName: string | null
  rank: number | null
}

export interface ResolvedRoster {
  players: RosterPlayer[]
  source: RosterSource
  stage: MatchStage
  completeness: RosterCompleteness
  heroesStatus?: HeroesStatus
  hasAllAccountIds: boolean
  hasAllHeroes: boolean
}

export class MatchDataService {
  constructor(
    private readonly client: SocketClient,
    private readonly overrideMatchId?: string,
  ) {}

  // --- Synchronous state (no I/O) ---

  get matchId(): string | undefined {
    const id = this.overrideMatchId ?? this.client.gsi?.map?.matchid
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

  private rosterPromise?: Promise<ResolvedRoster>
  resolveRoster(): Promise<ResolvedRoster> {
    this.rosterPromise ??= this.fetchRoster()
    return this.rosterPromise
  }

  private docPromise?: Promise<DelayedGames | null>
  getDelayedGameDoc(): Promise<DelayedGames | null> {
    this.docPromise ??= this.fetchDelayedGameDoc()
    return this.docPromise
  }

  private cardsPromise?: Promise<Cards[]>
  getCards(): Promise<Cards[]> {
    this.cardsPromise ??= this.fetchCards()
    return this.cardsPromise
  }

  // --- Per-slot lookup primitives ---

  async findPlayerBySlot(slot: number): Promise<RosterPlayer | null> {
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

  // --- Tier-aware hero-name resolution ---
  // Mirrors `resolveTranslatedHeroName` (`events/gsi-events/translationMessageFormat.ts`):
  // - If the slot is in the roster, return its hero name (or color fallback when heroId is unknown).
  // - If it isn't AND the streamer is 8500+, return `name: null` — the slot might be reshuffled
  //   (memory `gsi-event-player-id`), so guessing a color from it is unreliable.
  // - If it isn't AND the streamer is sub-8500, the color-from-slot is safe.
  async resolveHeroNameForSlot(opts: {
    eventPlayerId: number
  }): Promise<{ name: string | null; resolvedFromRoster: boolean }> {
    const slot = opts.eventPlayerId
    const player = await this.findPlayerBySlot(slot)
    if (player) {
      return {
        name: getHeroNameOrColor(player.heroId ?? 0, slot),
        resolvedFromRoster: true,
      }
    }
    if (this.isHighMmr) {
      return { name: null, resolvedFromRoster: false }
    }
    if (slot >= 0 && slot < heroColors.length) {
      return { name: heroColors[slot] ?? null, resolvedFromRoster: false }
    }
    return { name: null, resolvedFromRoster: false }
  }

  // --- Internals ---

  private async fetchRoster(): Promise<ResolvedRoster> {
    if (!this.matchId) return emptyRoster()
    const { matchPlayers, heroesStatus } = await getAccountsFromMatch({
      gsi: this.client.gsi,
      searchMatchId: this.overrideMatchId,
    })
    return this.buildRoster(matchPlayers, heroesStatus)
  }

  private buildRoster(matchPlayers: Players, heroesStatus?: HeroesStatus): ResolvedRoster {
    const source = this.inferSource(matchPlayers, heroesStatus)

    const players: RosterPlayer[] = matchPlayers.map((p) => ({
      slot: typeof p.playerid === 'number' ? p.playerid : null,
      accountId: p.accountid && p.accountid > 0 ? p.accountid : null,
      heroId: typeof p.heroid === 'number' && p.heroid > 0 ? p.heroid : null,
      team: null,
      playerName: p.player_name ?? null,
      rank: p.rank ?? null,
    }))

    // Team is only safely derivable from spectator GSI today, where slot 0-4 came from team2
    // (radiant) and 5-9 from team3 (dire). Other sources collapse team info; leaving as null
    // until a richer extraction is wired through getAccountsFromMatch.
    if (source === 'gsi-spectator') {
      for (const p of players) {
        if (p.slot !== null) p.team = p.slot < 5 ? 'radiant' : 'dire'
      }
    }

    const completeness: RosterCompleteness = {
      accountIds: coverage(players, (p) => p.accountId !== null),
      heroIds: coverage(players, (p) => p.heroId !== null),
      teamAssignment: coverage(players, (p) => p.team !== null),
      playerNames: coverage(players, (p) => p.playerName !== null),
      ranks: coverage(players, (p) => p.rank !== null),
    }

    const stage = this.inferStage(source, completeness, heroesStatus)

    return {
      players,
      source,
      stage,
      completeness,
      heroesStatus,
      hasAllAccountIds: completeness.accountIds === 'all',
      hasAllHeroes: completeness.heroIds === 'all',
    }
  }

  private inferSource(matchPlayers: Players, heroesStatus?: HeroesStatus): RosterSource {
    if (matchPlayers.length === 0) return 'none'
    if (heroesStatus) return 'vision-draft'
    if (this.isSpectator) return 'gsi-spectator'
    if (matchPlayers.length === 1) return 'gsi-self'
    // Vision-heroes signature: no accountids except (optionally) the streamer's own.
    const selfAccountId = Number(this.client.gsi?.player?.accountid)
    const others = matchPlayers.filter((p) => p.accountid !== selfAccountId)
    if (others.length > 0 && others.every((p) => p.accountid === 0)) return 'vision-heroes'
    return 'sourcetv'
  }

  private inferStage(
    source: RosterSource,
    completeness: RosterCompleteness,
    heroesStatus?: HeroesStatus,
  ): MatchStage {
    if (source === 'none') return 'unknown'
    if (heroesStatus) return 'roster-draft'
    if (completeness.heroIds === 'all') return 'in-progress'
    return 'hero-draft'
  }

  private async fetchDelayedGameDoc(): Promise<DelayedGames | null> {
    const matchId = this.matchId
    if (!matchId) return null
    const mongo = MongoDBSingleton
    const db = await mongo.connect()
    try {
      return await db
        .collection<DelayedGames>('delayedGames')
        .findOne({ 'match.match_id': matchId })
    } finally {
      await mongo.close()
    }
  }

  private async fetchCards(): Promise<Cards[]> {
    const roster = await this.resolveRoster()
    const accountIds = roster.players
      .map((p) => p.accountId)
      .filter((id): id is number => id !== null)
    if (!accountIds.length) return []
    return new Promise<Cards[]>((resolve) => {
      const timeout = setTimeout(() => resolve([]), 10_000)
      steamSocket.emit('getCards', accountIds, false, (err: unknown, cards: Cards[]) => {
        clearTimeout(timeout)
        resolve(err || !cards ? [] : cards)
      })
    })
  }
}

function emptyRoster(): ResolvedRoster {
  return {
    players: [],
    source: 'none',
    stage: 'unknown',
    completeness: {
      accountIds: 'none',
      heroIds: 'none',
      teamAssignment: 'none',
      playerNames: 'none',
      ranks: 'none',
    },
    hasAllAccountIds: false,
    hasAllHeroes: false,
  }
}

// Coverage is denominated against the canonical 10-slot roster, NOT the array length, so
// 'all' always means "all 10 slots have this dimension". A 1-player gsi-self roster is therefore
// 'partial', not 'all', even though 1/1 of its entries is filled.
const ROSTER_SLOTS = 10
function coverage(players: RosterPlayer[], pred: (p: RosterPlayer) => boolean): Coverage {
  const matches = players.filter(pred).length
  if (matches === 0) return 'none'
  if (matches >= ROSTER_SLOTS && players.length >= ROSTER_SLOTS) return 'all'
  return 'partial'
}
