import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { Long } from 'mongodb'
import { z } from 'zod'

import { getWL, LOBBY_TYPE_RANKED, MULTIPLIER_PARTY, MULTIPLIER_SOLO } from '../db/get-wl'
import { redisClient } from '../db/redis-instance'
import { DBSettings, getValueOrDefault } from '../settings'
import { notablePlayers } from '../steam/notableplayers'
import { steamSocket } from '../steam/ws'
import { closeTwitchBet } from '../twitch/lib/close-twitch-bet'
import { isPredictionAlreadyActiveError, openTwitchBet } from '../twitch/lib/open-twitch-bet'
import { refundTwitchBet } from '../twitch/lib/refund-twitch-bets'
import { DotaGcTeam, EMatchOutcome } from '../types'
import type {
  BlockType,
  DotaEvent,
  MatchClosingDetailsResponse,
  MatchMinimalDetailsResponse,
  SocketClient,
} from '../types'
import { getRedisNumberValue, is8500Plus, steamID64toSteamID32 } from '../utils/index'
import { maybeSendRoshAegisEvent } from './events/gsi-events/maybe-send-rosh-aegis-event'
import { clearPlayingHeroSlotCache } from './events/gsi-events/newdata'
import { sendExtensionPubSubBroadcastMessageIfChanged } from './events/gsi-events/send-extension-pub-sub-broadcast-message-if-changed'
import { DataBroadcaster, sendInitialData } from './events/minimap/data-broadcaster'
import type { DataBroadcasterInterface } from './events/minimap/data-broadcaster-types'
import { minimapParser } from './events/minimap/parser'
import { getStreamDelay } from './get-stream-delay'
import { setGSIHandlerConstructor } from './gsi-handler-factory'
import type { GSIHandlerType } from './gsi-handler-types'
import {
  buildClosingScores,
  buildUnresolvedSnapshot,
  mergeInGameSnapshotTick,
} from './lib/build-unresolved-snapshot'
import type { InGameSnapshot } from './lib/build-unresolved-snapshot'
import { blockTypes, pickSates } from './lib/consts'
import { delayedQueue } from './lib/delayed-queue'
import getHero from './lib/get-hero'
import { cancelHeroSwap } from './lib/hero-swap-prediction.js'
import { getHeroById } from './lib/heroes'
import { isArcade } from './lib/is-arcade'
import { isSpectator } from './lib/is-spectator'
import { MatchDataService } from './lib/matchData'
import { getRankDetail } from './lib/ranks'
import {
  formatUnresolvedMatch,
  REMINDER_FLAG_TTL_S,
  reminderSentFlagKey,
} from './lib/unresolved-matches'
import type { UnresolvedMatch } from './lib/unresolved-matches'
import { updateMmr } from './lib/update-mmr'
import { NeutralItemTimer } from './neutral-item-timer'
import { say } from './say'
import { server } from './server'
import { getWinLossRoom } from './win-loss-socket'

// Delay before the "other streamers in match" announce, giving co-players' openBets time to insert
// their own `matches` rows (players load into a game at slightly different times).
const STREAMERS_ANNOUNCE_DELAY_MS = 90_000
const MULTI_ACCOUNT_REVALIDATION_COOLDOWN_MS = 30_000
type Team = 'radiant' | 'dire'
type ClosingMatch = MatchClosingDetailsResponse['matches'][number]

const pendingResolutionSchema = z.object({ matchId: z.string() })

interface PendingPrediction {
  matchId: string
  heroName: string
}

const parseTeam = function parseTeam(team: string | null | undefined): Team | null {
  return team === 'radiant' || team === 'dire' ? team : null
}

// Finally, we have a user and a GSI client
interface MMR {
  scores: {
    radiant_score: number | null
    dire_score: number | null
    kda: {
      kills: number | null
      deaths: number | null
      assists: number | null
    }
  }
  gameMode: number
  increase: boolean
  lobbyType: number
  matchId: string | number
  isParty?: boolean
  heroSlot?: number | null
  heroName?: string | null
  myTeam?: Team | null
}

export const emitMinimapBlockerStatus = function emitMinimapBlockerStatus(client: SocketClient) {
  if (!client.stream_online || !client.beta_tester || !client.gsi) {
    return
  }

  const enabled = getValueOrDefault(
    DBSettings['minimap-blocker'],
    client.settings,
    client.subscription
  )
  if (!enabled) {
    return
  }

  const parsedData = minimapParser.parse(client.gsi)
  sendInitialData(client.token)
  server.io.to(client.token).emit('STATUS', parsedData.status)
}

export const deleteRedisData = async function deleteRedisData(client: SocketClient) {
  const { steam32Id, token } = client
  const matchId = (await redisClient.client.get(`${token}:matchId`)) ?? client.gsi?.map?.matchid

  // Clear in-memory cache for playingHeroSlot
  clearPlayingHeroSlotCache(token)

  try {
    await redisClient.client
      .multi()
      .del(`${matchId}:${token}:lobbyType`)
      .del(`${matchId}:${token}:gameMode`)
      .del(`${matchId}:${token}:steamServerId`)
      .del(`${steam32Id}:medal`)
      .del(`${token}:aegis`)
      .del(`${token}:matchId`)
      .del(`${token}:heroRecords`)
      .del(`${token}:passiveMidas`)
      .del(`${token}:passiveTp`)
      .del(`${token}:playingHero`)
      .del(`${token}:playingHeroSlot`)
      .del(`${token}:playingTeam`)
      .del(`${token}:roshan`)
      .del(`${token}:treadtoggle`)
      .del(`${token}:pendingManualResolution`)
      .exec()
  } catch (error) {
    logger.error('err deleteRedisData', { error })
  }
}

// That means the user opened OBS and connected to Dota 2 GSI
class GSIHandler implements GSIHandlerType {
  client: SocketClient

  // Server could reboot and lose these in memory
  // But that's okay they will get reset based on current match state

  blockCache: BlockType | undefined
  events: DotaEvent[] = []
  bountyHeroNames: string[] = []
  noTpChatter: {
    taskId?: string
    lastRemindedDate?: Date
  } = {}
  bountyTaskId?: string
  killstreakTaskId?: string
  openTheBetTaskId?: string
  private pendingPrediction: PendingPrediction | null = null

  endingBets = false
  openingBets = false
  creatingSteamAccount = false
  checkingEarlyDCWinner = false
  multiAccountRevalidatedAt?: number
  treadsData = { manaAtLastToggle: 0, manaSaved: 0, treadToggles: 0 }
  disabled = false

  // Last fresh in-game stats, kept up to date on every GSI tick while the
  // streamer is actively playing. By the time an early DC fires, the live GSI
  // packet has usually shed these values (hero/player blocks empty, scores
  // back to 0), so we fall back to this cache for the unresolved-match
  // snapshot. Keyed by matchId so a new game can't reuse stale numbers.
  private lastInGameSnapshot: InGameSnapshot | null = null

  mapBlocker: DataBroadcasterInterface
  neutralItemTimer: NeutralItemTimer

  constructor(dotaClient: SocketClient) {
    this.client = dotaClient
    this.mapBlocker = new DataBroadcaster(this.client.token)
    this.neutralItemTimer = new NeutralItemTimer(this)

    const isBotDisabled = getValueOrDefault(
      DBSettings.commandDisable,
      this.client.settings,
      this.client.subscription
    )
    if (isBotDisabled) {
      this.disable()
      return
    }

    if (!this.client.stream_online && !this.disabled) {
      this.disable()
      return
    }

    if (this.client.stream_online && this.disabled) {
      this.enable()
    }

    this.emitBadgeUpdate()
    this.emitWLUpdate()
  }

  public enable() {
    this.disabled = false
  }

  public disable() {
    this.disabled = true
  }

  public getMmr() {
    return this.client.mmr
  }

  public getToken() {
    return this.client.token
  }

  public getSteam32() {
    return this.client.steam32Id
  }

  public getChannelId(): string {
    return this.client.Account?.providerAccountId ?? ''
  }

  public addSecondsToNow(seconds: number) {
    return new Date(Date.now() + seconds * 1000)
  }

  private resetPlayerData() {
    this.events = []
    this.treadsData = { manaAtLastToggle: 0, manaSaved: 0, treadToggles: 0 }
    this.creatingSteamAccount = false
    this.checkingEarlyDCWinner = false
    this.lastInGameSnapshot = null
  }

  private async suppressUnresolvedReminder(matchId: string | number) {
    if (!this.client.token) {
      return
    }
    try {
      await redisClient.client.setEx(
        reminderSentFlagKey(this.client.token, matchId.toString()),
        REMINDER_FLAG_TTL_S,
        '1'
      )
    } catch (error) {
      logger.error('[BETS] Error suppressing unresolved reminder', { error, matchId })
    }
  }

  private captureInGameSnapshot() {
    const matchId = this.client.gsi?.map?.matchid
    if (matchId === null || matchId === undefined || matchId.length === 0 || matchId === '0') {
      return
    }

    this.lastInGameSnapshot = mergeInGameSnapshotTick({
      gsi: this.client.gsi,
      matchId,
      prev: this.lastInGameSnapshot,
    })
  }

  private resetBetData() {
    // Bet stuff should be closed by endBets()
    // This should mean an entire match is over
    this.endingBets = false
    this.openingBets = false
  }

  private emitClientResetEvents() {
    server.io.to(this.client.token).emit('aegis-picked-up', {})
    server.io.to(this.client.token).emit('roshan-killed', {})
  }

  private clearAllTimeouts() {
    if (this.bountyTaskId !== undefined && this.bountyTaskId.length > 0) {
      delayedQueue.removeTask(this.bountyTaskId)
      this.bountyTaskId = undefined
    }

    if (this.killstreakTaskId !== undefined && this.killstreakTaskId.length > 0) {
      delayedQueue.removeTask(this.killstreakTaskId)
      this.killstreakTaskId = undefined
    }

    if (this.noTpChatter.taskId !== undefined && this.noTpChatter.taskId.length > 0) {
      delayedQueue.removeTask(this.noTpChatter.taskId)
      this.noTpChatter.taskId = undefined
    }

    // Cancel any pending openTheBet stream-delay task so a reset on the
    // current match doesn't fire openTwitchBet against stale captured args
    // (would open an orphan prediction the next match then can't supersede —
    // Twitch only allows one active prediction per channel).
    if (this.openTheBetTaskId !== undefined && this.openTheBetTaskId.length > 0) {
      delayedQueue.removeTask(this.openTheBetTaskId)
      this.openTheBetTaskId = undefined
    }
  }

  public async resetClientState() {
    cancelHeroSwap(this)
    this.pendingPrediction = null
    await deleteRedisData(this.client)
    this.blockCache = undefined
    this.mapBlocker.resetData()
    this.resetPlayerData()
    this.resetBetData()
    this.emitClientResetEvents()
    this.neutralItemTimer.reset()
    this.clearAllTimeouts()

    // Reset multiAccount property to ensure it's cleared when state is reset
    this.client.multiAccount = undefined
    this.multiAccountRevalidatedAt = undefined
  }

  emitWLUpdate(allowOffline = false) {
    if (!allowOffline && !this.client.stream_online) {
      return
    }

    const mmrEnabled = getValueOrDefault(
      DBSettings['mmr-tracker'],
      this.client.settings,
      this.client.subscription
    )
    getWL({
      channelId: this.getChannelId(),
      lng: this.client.locale,
      mmrEnabled,
      settings: this.client.settings,
      streamStartDate: this.client.stream_start_date,
      subscription: this.client.subscription,
      userId: this.client.token,
    })
      .then(({ record, statsDays, statsDaysTotal }) => {
        if (this.client.stream_online) {
          server.io.to(this.client.token).emit('update-wl', record, statsDays, statsDaysTotal)
        }
        const twitchId = this.getChannelId()
        if (twitchId) {
          server.io
            .to(getWinLossRoom(twitchId))
            .emit('update-wl', record, statsDays, statsDaysTotal)
        }
      })
      .catch(() => {
        // Stream not live
        // console.error('[MMR] emitWLUpdate Error getting WL', {e: e?.message || e})
      })
  }
  async emitNotablePlayers() {
    if (!this.client.stream_online) {
      return
    }

    const roster = await new MatchDataService(this.client).resolveRoster()

    const enableCountries = getValueOrDefault(
      DBSettings.notablePlayersOverlayFlagsCmd,
      this.client.settings,
      this.client.subscription
    )
    const notablePlayersEnabled = getValueOrDefault(
      DBSettings.notablePlayersOverlay,
      this.client.settings,
      this.client.subscription
    )
    if (!notablePlayersEnabled) {
      return
    }

    notablePlayers({
      currentMatchId: this.client.gsi?.map?.matchid,
      enableFlags: enableCountries,
      locale: this.client.locale,
      players: roster.players,
      rosterSource: roster.source,
      steam32Id: this.getSteam32(),
      twitchChannelId: this.getChannelId(),
    })
      .then((response) => {
        if (response.playerList.length) {
          server.io.to(this.client.token).emit('notable-players', response.playerList)

          delayedQueue.addTask(60 * 2000, () => {
            server.io.to(this.client.token).emit('notable-players', null)
          })
        }
      })
      .catch(() => {
        // stream not live
      })
  }

  async emitStreamersInMatch(matchId = this.client.gsi?.map?.matchid) {
    if (!this.client.stream_online) {
      return
    }
    const matchData = new MatchDataService(this.client)
    if (matchId === undefined || matchId !== matchData.matchId) {
      return
    }

    const announceEnabled = getValueOrDefault(
      DBSettings.streamersAnnounce,
      this.client.settings,
      this.client.subscription
    )
    if (!announceEnabled) {
      return
    }

    // Announce at most once per match (guards rejoins and any duplicate scheduling).
    const announcedKey = `${this.client.token}:streamersAnnounced`
    if ((await redisClient.client.get(announcedKey)) === matchId) {
      return
    }

    const count = await matchData.getStreamersInMatchCount({
      excludeUserId: this.client.token,
    })
    if (count <= 0 || this.client.gsi?.map?.matchid !== matchId) {
      return
    }

    await redisClient.client.set(announcedKey, matchId)
    say(this.client, t('streamersInMatchAnnounce', { count, lng: this.client.locale }), {
      key: DBSettings.streamersAnnounce,
    })
  }

  private async storeLeaderboardStanding() {
    const response = await getRankDetail(this.getMmr(), this.getSteam32(), { skipCache: true })
    const { steam32Id } = this.client
    if (steam32Id === null || steam32Id === 0 || response === null) {
      return
    }
    // A failed lookup keeps the stored standing instead of wiping it
    if (!('standing' in response) || response.lookupFailed === true) {
      return
    }
    await supabase
      .from('steam_accounts')
      .update({ leaderboard_rank: response.standing, updated_at: new Date().toISOString() })
      .eq('steam32Id', steam32Id)
  }

  emitBadgeUpdate() {
    getRankDetail(this.getMmr(), this.getSteam32())
      .then((deets) => {
        server.io.to(this.client.token).emit('update-medal', deets)
      })
      .catch((error) => {
        logger.error('[MMR] emitBadgeUpdate Error getting rank detail', {
          e: error instanceof Error ? error.message : error,
        })
      })
  }

  // Make sure user has a steam32Id saved in the database
  // This runs once per every match start
  // the user may have a steam account saved, but not this one for this match
  // so add to their list of steam accounts
  async updateSteam32Id() {
    const steamId = this.client.gsi?.player?.steamid
    if (
      this.creatingSteamAccount ||
      steamId === null ||
      steamId === undefined ||
      steamId.length === 0
    ) {
      return
    }

    // Set a flag to prevent concurrent calls
    this.creatingSteamAccount = true
    let steam32Id: number | null | undefined

    try {
      steam32Id = steamID64toSteamID32(steamId)
      if (steam32Id === null || steam32Id === undefined || steam32Id === 0) {
        this.creatingSteamAccount = false
        return
      }

      // User already has a steam32Id and its saved to the `steam_accounts` table
      const foundAct = this.client.SteamAccount.find((act) => act.steam32Id === steam32Id)
      if (foundAct) {
        // Logged into a new steam account on the same twitch channel
        Object.assign(this.client, {
          mmr: foundAct.mmr,
          multiAccount: undefined,
          steam32Id,
        })
        this.multiAccountRevalidatedAt = undefined
        this.emitBadgeUpdate()
        return
      }

      const isMultiAccount = this.client.multiAccount === steam32Id
      if (
        isMultiAccount &&
        this.multiAccountRevalidatedAt !== undefined &&
        Date.now() - this.multiAccountRevalidatedAt < MULTI_ACCOUNT_REVALIDATION_COOLDOWN_MS
      ) {
        return
      }

      // Continue to create this act in db
      // Default to the mmr from `users` table for this brand new steam account
      // this.getMmr() should return mmr from `user` table on new accounts without steam acts
      const mmr = this.client.SteamAccount.length ? 0 : this.getMmr()

      this.creatingSteamAccount = true
      const { data: res, error } = await supabase
        .from('steam_accounts')
        .select('id, userId, mmr, connectedUserIds')
        .eq('steam32Id', steam32Id)
        .maybeSingle()

      if (error) {
        if (isMultiAccount) {
          this.multiAccountRevalidatedAt = Date.now()
        }
        logger.error('Error in updateSteam32Id', { error, name: this.client.name })
        return
      }

      if (res?.id !== null && res?.id !== undefined && res.id.length > 0) {
        await this.handleExistingAccount(res, steam32Id)
      } else {
        const created = await this.createNewSteamAccount(mmr, steam32Id)
        if (!created) {
          this.client.multiAccount = steam32Id
          this.multiAccountRevalidatedAt = Date.now()
        }
      }

      this.creatingSteamAccount = false
    } catch (error) {
      if (steam32Id !== null && steam32Id !== undefined && steam32Id !== 0) {
        this.client.multiAccount = steam32Id
        this.multiAccountRevalidatedAt = Date.now()
      }
      logger.error('Error in updateSteam32Id', { error, name: this.client.name })
    } finally {
      // Ensure flag is reset even if an error occurs
      this.creatingSteamAccount = false
    }
  }

  async handleExistingAccount(
    res: {
      id: string
      userId: string
      mmr: number
      connectedUserIds: string[] | null
    },
    steam32Id: number
  ) {
    if (res.userId === this.client.token) {
      await supabase
        .from('users')
        .update({ mmr: 0, steam32Id: null, updated_at: new Date().toISOString() })
        .eq('id', this.client.token)

      Object.assign(this.client, { mmr: res.mmr, steam32Id })
      this.client.multiAccount = undefined
      this.multiAccountRevalidatedAt = undefined

      // Update local SteamAccount list if not present
      if (!this.client.SteamAccount.find((act) => act.steam32Id === steam32Id)) {
        this.client.SteamAccount.push({
          leaderboard_rank: null,
          mmr: res.mmr,
          name:
            this.client.gsi?.player?.name !== null &&
            this.client.gsi?.player?.name !== undefined &&
            this.client.gsi.player.name.length > 0
              ? this.client.gsi.player.name
              : null,
          steam32Id,
        })
      }
    } else {
      this.client.multiAccount = steam32Id
      this.multiAccountRevalidatedAt = Date.now()
      const uniqueUserIds = [...new Set([...(res?.connectedUserIds ?? []), this.client.token])]
      await supabase
        .from('steam_accounts')
        .update({
          connectedUserIds: uniqueUserIds,
          updated_at: new Date().toISOString(),
        })
        .eq('id', res.id)
    }
  }

  async createNewSteamAccount(mmr: number, steam32Id: number) {
    logger.info('[STEAM32ID] Adding steam32Id', { name: this.client.name })

    const playerName = this.client.gsi?.player?.name
    const name =
      playerName !== null && playerName !== undefined && playerName.length > 0 ? playerName : null
    const { error } = await supabase.from('steam_accounts').insert({
      mmr,
      name,
      steam32Id,
      userId: this.client.token,
    })

    if (error) {
      logger.error('Error creating steam account', { error, name: this.client.name, steam32Id })
      return false
    }

    await supabase
      .from('users')
      .update({ mmr: 0, steam32Id: null, updated_at: new Date().toISOString() })
      .eq('id', this.client.token)

    this.client.SteamAccount.push({
      leaderboard_rank: null,
      mmr,
      name,
      steam32Id,
    })

    Object.assign(this.client, { mmr, multiAccount: undefined, steam32Id })
    this.multiAccountRevalidatedAt = undefined
    this.emitBadgeUpdate()
    return true
  }

  async updateMMR({
    scores,
    myTeam,
    increase,
    gameMode,
    heroName,
    lobbyType,
    matchId,
    isParty,
    heroSlot,
  }: MMR) {
    const ranked = lobbyType === LOBBY_TYPE_RANKED

    const extraInfo = {
      increase,
      isParty,
      lobbyType,
      matchId,
      name: this.client.name,
      ranked,
      steam32Id: this.client.steam32Id,
    }

    logger.debug('[MMR Update] Begin updating mmr', extraInfo)

    // This also updates WL for the unranked matches
    await supabase
      .from('matches')
      .update({
        dire_score: scores.dire_score,
        game_mode: gameMode,
        hero_name: heroName,
        hero_slot: heroSlot,
        is_party: isParty,
        kda: scores.kda,
        lobby_type: lobbyType,
        myTeam: myTeam ?? '',
        radiant_score: scores.radiant_score,
        updated_at: new Date().toISOString(),
        won: increase,
      })
      .match({ matchId: `${matchId}`, userId: this.client.token })

    logger.debug('[DATABASE] Updated bet with winnings', extraInfo)
    this.emitWLUpdate()

    if (!ranked) {
      logger.info('[MMR] Not ranked game, wont update mmr', extraInfo)
      return
    }

    const mmrSize = isParty === true ? MULTIPLIER_PARTY : MULTIPLIER_SOLO
    const newMMR = this.getMmr() + (increase ? mmrSize : -mmrSize)
    if (this.client.steam32Id !== null && this.client.steam32Id !== 0) {
      const mmrEnabled = getValueOrDefault(
        DBSettings['mmr-tracker'],
        this.client.settings,
        this.client.subscription
      )
      if (mmrEnabled) {
        logger.debug('[MMR] Found steam32Id, updating mmr', extraInfo)
        await updateMmr({
          channel: this.client.name,
          currentMmr: this.getMmr(),
          newMmr: newMMR,
          steam32Id: this.client.steam32Id,
        })
      }
    } else {
      logger.info('[MMR] Did not find steam32Id, wont update mmr', extraInfo)
    }
  }

  public updatePendingPredictionHero(matchId: string, heroName: string): boolean {
    if (this.pendingPrediction?.matchId !== matchId) {
      return false
    }
    this.pendingPrediction.heroName = heroName
    return true
  }

  private async expireManualResolution(client: SocketClient, matchId: string, newMatchId: string) {
    const pendingResolution =
      (await redisClient.client.get(`${client.token}:pendingManualResolution`)) ?? ''
    if (pendingResolution.length === 0) {
      return
    }

    try {
      const { matchId: pendingMatchId } = pendingResolutionSchema.parse(
        JSON.parse(pendingResolution)
      )
      if (pendingMatchId !== matchId) {
        return
      }

      logger.info('[BETS] Expiring pending manual resolution - new match joined', {
        name: client.name,
        newMatchId,
        oldMatchId: matchId,
      })

      if (!getValueOrDefault(DBSettings.bets, client.settings, client.subscription)) {
        return
      }

      const { data } = await supabase
        .from('matches')
        .select('predictionId')
        .eq('matchId', matchId)
        .eq('userId', client.token)
        .is('won', null)
        .single()
      const predictionId = data?.predictionId ?? ''
      if (predictionId.length === 0) {
        return
      }
      await refundTwitchBet(this.getChannelId(), predictionId)

      if (
        client.stream_online &&
        getValueOrDefault(DBSettings.tellChatBets, client.settings, client.subscription)
      ) {
        say(
          client,
          t('bets.manualResolutionExpired', {
            emote: 'FeelsBadMan',
            lng: client.locale,
          })
        )
      }
    } catch (error) {
      logger.error('[BETS] Error handling pending manual resolution expiration', { error })
    }
  }

  async openBets(client: SocketClient) {
    const { gsi } = client
    const map = gsi?.map
    const player = gsi?.player
    if (this.openingBets || player?.activity !== 'playing' || map?.win_team !== 'none') {
      return
    }

    // GSI can clear or move to another match before the stream delay expires.
    const heroName = gsi?.hero?.name ?? ''
    const matchId = map.matchid ?? ''
    if (heroName.length === 0 || matchId.length === 0 || matchId === '0') {
      return
    }
    const myTeam = player.team_name
    const playingMatchId = await redisClient.client.get(`${client.token}:matchId`)
    if (this.openingBets) {
      return
    }

    if (playingMatchId !== null) {
      if (playingMatchId.length > 0 && playingMatchId !== matchId) {
        await this.expireManualResolution(client, playingMatchId, matchId)
        logger.info('[BETS] openBets resetClientState because stuck on old match id', {
          gsiMatchId: matchId,
          name: client.name,
          playingMatchId,
          steam32Id: client.steam32Id,
          steamFromGSI: player.steamid,
          token: client.token,
        })
        await this.resetClientState()
        return
      }
      if (Number(playingMatchId) >= 0) {
        return
      }
    }

    logger.info('[BETS] Begin opening bets', {
      hero: heroName,
      matchId,
      name: client.name,
      playingMatchId,
    })

    this.openingBets = true
    const pending = { heroName, matchId }
    this.pendingPrediction = pending
    await this.preparePrediction(client, pending, myTeam)
  }

  private async preparePrediction(
    client: SocketClient,
    pending: PendingPrediction,
    myTeam: string | null | undefined
  ): Promise<void> {
    const { heroName, matchId } = pending
    const { data: rows } = await supabase
      .from('matches')
      .select('matchId, myTeam, id')
      .eq('matchId', matchId)
      .eq('userId', client.token)
      .is('won', null)

    if (this.pendingPrediction !== pending) {
      return
    }

    const existing = rows?.[0]
    try {
      await redisClient.client.set(`${client.token}:matchId`, matchId)
      await redisClient.client.set(`${client.token}:playingTeam`, existing?.myTeam ?? myTeam ?? '')
      await redisClient.client.set(`${client.token}:playingHero`, pending.heroName)
    } catch (error) {
      logger.error('Error while saving data to Redis:', {
        client: client.name,
        error,
        matchId,
        token: client.token,
      })
    }

    if (this.pendingPrediction !== pending) {
      return
    }

    const existingId = existing?.id ?? ''
    if (existingId.length > 0) {
      logger.info('[BETS] Found a bet in the database', { id: existingId })
    } else if (!client.stream_online) {
      logger.info('[BETS] Not opening bets bc stream is offline for', { name: client.name })
    } else if (client.token) {
      this.openTheBetTaskId = delayedQueue.addTask(
        getStreamDelay(client.settings, client.subscription),
        async () => {
          await this.openPendingPrediction(pending, heroName, myTeam ?? '')
        }
      )
      return
    }

    this.pendingPrediction = null
    this.openingBets = false
  }

  private async openPendingPrediction(
    pending: PendingPrediction,
    originalHero: string,
    myTeam: string
  ): Promise<void> {
    if (this.pendingPrediction !== pending) {
      return
    }
    if (pending.heroName !== originalHero) {
      try {
        await redisClient.client.set(`${this.client.token}:playingHero`, pending.heroName)
      } catch (error) {
        logger.error('[BETS] Could not save swapped hero', { error, matchId: pending.matchId })
      }
    }
    if (this.pendingPrediction !== pending) {
      return
    }
    this.pendingPrediction = null
    await this.openTheBet(pending.matchId, pending.heroName, myTeam)
  }

  // An aborted open leaves no match row for settlement or a later hero swap.
  private async abortOpenBets() {
    this.openingBets = false
    try {
      await redisClient.client
        .multi()
        .del(`${this.client.token}:matchId`)
        .del(`${this.client.token}:playingTeam`)
        .del(`${this.client.token}:playingHero`)
        .exec()
    } catch (error) {
      logger.error('[BETS] Error clearing redis on openTheBet abort', { error })
    }
  }

  openTheBet = async (matchId: string, heroName: string, myTeam = '') => {
    const { client } = this

    // Task is now executing — clear the id so a subsequent reset doesn't try
    // to remove a task that already ran (or worse, remove a freshly-scheduled
    // openTheBet for the next match that has the same id slot).
    this.openTheBetTaskId = undefined

    // Defense in depth: the only call site (openBets) captures these from
    // validated GSI before queueing this callback. An empty matchId means
    // something bypassed that path — refuse to insert a `matches` row that
    // !unresolved would later render as "(Unknown, ...)" with no way to
    // !won/!lost it.
    if (!matchId || !heroName) {
      await this.abortOpenBets()
      return
    }

    // openBets only validates `heroName.length > 0`; getHero rejects unknown
    // strings (modded heroes, future Valve schema). Without this guard the
    // Twitch prediction title becomes "Will we win with " (the original bug)
    // and the matches row stores the unknown id verbatim — !unresolved
    // formatting can't render it either.
    const hero = getHero(heroName)
    if (!hero) {
      logger.error('[BETS] Captured heroName did not resolve via getHero', {
        channel: client.name,
        heroName,
        matchId,
      })
      await this.abortOpenBets()
      return
    }
    let betId: undefined | string
    let predictionAlreadyActive = false
    let predictionOpenFailed = false

    const betsEnabled = getValueOrDefault(DBSettings.bets, client.settings, client.subscription)

    try {
      if (betsEnabled) {
        const bet = await openTwitchBet({
          client,
          heroName: hero?.localized_name,
        })

        betId = bet?.id
      }
    } catch (error) {
      if (isPredictionAlreadyActiveError(error)) {
        predictionAlreadyActive = true
        logger.info('[BETS] Twitch prediction already active; tracking match only', {
          channel: client.name,
          matchId,
        })
      } else {
        predictionOpenFailed = true
        logger.error('[BETS] Error opening twitch bet', {
          channel: client.name,
          e: error instanceof Error ? error.message : error,
          matchId,
        })
      }
    }
    this.openingBets = false

    // matchId, heroName, and myTeam are snapshotted in openBets so the insert
    // is stable even if GSI cleared during the stream delay. hero_name can
    // still be overwritten later (closeBets/updateMmr writes the GC value at
    // match-end; hero.name.ts mid-game-swap handler also updates it).
    await supabase.from('matches').insert({
      hero_name: heroName,
      matchId,
      myTeam,
      predictionId: betId ?? null,
      steam32Id: client.steam32Id,
      userId: client.token,
    })

    if (getValueOrDefault(DBSettings.streamersAnnounce, client.settings, client.subscription)) {
      const announceMatchId = matchId
      delayedQueue.addTask(STREAMERS_ANNOUNCE_DELAY_MS, () => {
        void this.emitStreamersInMatch(announceMatchId)
      })
    }

    if (betsEnabled && !predictionAlreadyActive && !predictionOpenFailed) {
      say(client, t('bets.open', { emote: 'peepoGamble', lng: client.locale }), {
        delay: false,
        key: DBSettings.tellChatBets,
      })

      logger.info('[BETS] open bets', {
        event: 'open_bets',
        matchId,
        player_team: client.gsi?.player?.team_name,
        user: client.token,
      })
    }
  }

  async closeBets(winningTeam: Team | null = null, gcData?: MatchClosingDetailsResponse) {
    if (this.endingBets) {
      return
    }
    this.endingBets = true

    try {
      const match = gcData?.matches?.[0]
      const matchId = (await this.getClosingMatchId(match)) ?? ''
      if (this.openingBets || matchId.length === 0) {
        logger.debug('[BETS] Not closing bets', {
          endingBets: this.endingBets,
          name: this.client.name,
          openingBets: this.openingBets,
          playingMatchId: matchId,
        })
        if (matchId.length === 0) {
          await this.resetClientState()
        }
        return
      }

      const localWinner = this.resolveWinner(winningTeam, matchId)
      if (!localWinner) {
        void this.checkEarlyDCWinner(matchId)
        return
      }
      cancelHeroSwap(this, matchId)
      await this.settleMatch(matchId, localWinner, match)
    } catch (error) {
      logger.error('Error closing bets', { error, name: this.client.name })
    } finally {
      this.endingBets = false
    }
  }

  private async getClosingMatchId(match?: ClosingMatch): Promise<string | null> {
    const storedId = await redisClient.client.get(`${this.client.token}:matchId`)
    if (storedId !== null && storedId !== undefined) {
      return storedId
    }

    const gcMatchId = match?.match_id
    if (!gcMatchId) {
      return null
    }
    const id = new Long(gcMatchId.low, gcMatchId.high).toString()
    return Number(id) > 1 ? id : null
  }

  private async getClosingTeam(gcTeam?: DotaGcTeam): Promise<Team | null> {
    if (gcTeam !== undefined) {
      if (gcTeam === DotaGcTeam.DOTA_GC_TEAM_GOOD_GUYS) {
        return 'radiant'
      }
      return gcTeam === DotaGcTeam.DOTA_GC_TEAM_BAD_GUYS ? 'dire' : null
    }
    const { token } = this.client
    const storedTeam = await redisClient.client.get(`${token}:playingTeam`)
    return parseTeam(storedTeam) ?? parseTeam(this.client.gsi?.player?.team_name)
  }

  private async finishUnscoredMatch(matchId: string): Promise<void> {
    logger.info('This is likely a no stats recorded match', {
      matchId,
      name: this.client.name,
    })
    if (this.client.stream_online) {
      say(
        this.client,
        t('bets.notScored', {
          emote: 'D:',
          key: DBSettings.tellChatBets,
          lng: this.client.locale,
          matchId,
        })
      )
      const { data } = await supabase
        .from('matches')
        .select('predictionId')
        .eq('matchId', matchId)
        .eq('userId', this.client.token)
        .is('won', null)
        .single()
      const predictionId = data?.predictionId ?? ''
      if (predictionId.length > 0) {
        const refund = await refundTwitchBet(this.getChannelId(), predictionId)
        if (refund.status === 'refunded') {
          await supabase
            .from('matches')
            .update({ predictionId: null, updated_at: new Date().toISOString() })
            .eq('predictionId', refund.predictionId)
        }
      }
    }
    // An unscored match has no result for !won or !lost to resolve.
    await this.suppressUnresolvedReminder(matchId)
    await this.resetClientState()
  }

  // After an early DC, GSI may already be reporting the next match at 0-0.
  private isUnscoredMatch(matchId: string): boolean {
    const map = this.client.gsi?.map
    if (map?.matchid !== matchId) {
      return false
    }
    const direScore = map.dire_score ?? 0
    const radiantScore = map.radiant_score ?? 0
    return direScore === 0 && radiantScore === 0
  }

  private async settleMatch(matchId: string, winner: Team, match?: ClosingMatch): Promise<void> {
    const { token, name: channel, settings, subscription } = this.client
    const accountId = Number(this.client.gsi?.player?.accountid)
    const player = match?.players?.find(({ account_id }) => account_id === accountId)
    const myTeam = await this.getClosingTeam(player?.team_number)
    const scores = buildClosingScores({ gcMatch: match, gcPlayer: player, gsi: this.client.gsi })
    const won = myTeam === winner
    logger.info('[BETS] end bets won data', {
      channel,
      localWinner: winner,
      myTeam,
      playingMatchId: matchId,
      won,
    })
    if (myTeam === null) {
      logger.error('[BETS] trying to end bets but did not find localWinner or myTeam', {
        channel,
        matchId,
      })
      return
    }

    if (this.isUnscoredMatch(matchId)) {
      await this.finishUnscoredMatch(matchId)
      return
    }

    const heroSlot = player?.player_slot ?? (await getRedisNumberValue(`${token}:playingHeroSlot`))
    const heroName =
      getHeroById(player?.hero_id)?.key ?? (await redisClient.client.get(`${token}:playingHero`))
    const lobbyType = await getRedisNumberValue(`${matchId}:${token}:lobbyType`)
    const gameMode = await getRedisNumberValue(`${matchId}:${token}:gameMode`)
    await this.updateMMR({
      gameMode: gameMode ?? 22,
      heroName,
      heroSlot,
      increase: won,
      isParty: getValueOrDefault(DBSettings.onlyParty, settings),
      // Lobby type 0 means unranked and must survive this default.
      lobbyType: lobbyType ?? LOBBY_TYPE_RANKED,
      matchId,
      myTeam,
      scores,
    })
    await this.storeLeaderboardStanding()

    void this.announceTreadToggles(matchId)
    const betsEnabled = getValueOrDefault(DBSettings.bets, settings, subscription)
    const hasPrediction = betsEnabled && (await this.hasMatchPrediction(matchId))
    delayedQueue.addTask(getStreamDelay(settings, subscription), async () => {
      const message = won
        ? t('bets.won', { emote: 'Happi', lng: this.client.locale })
        : t('bets.lost', { emote: 'Happi', lng: this.client.locale })
      say(this.client, message, { chattersKey: 'matchOutcome', delay: false })
      try {
        if (hasPrediction) {
          await closeTwitchBet(
            won,
            this.getChannelId(),
            matchId,
            this.client.settings,
            this.client.subscription
          )
          logger.info('[BETS] end bets', {
            didWin: won,
            event: 'end_bets',
            matchId,
            name: this.client.name,
            player_team: myTeam,
            winning_team: winner,
          })
        }
      } catch (error) {
        logger.error('[BETS] Error closing twitch bet', {
          channel,
          e: error instanceof Error ? error.message : error,
          matchId,
        })
      } finally {
        try {
          await this.resetClientState()
        } catch (error) {
          logger.error('Error resetting client state', { error })
        }
      }
    })
  }

  private async announceTreadToggles(matchId: string): Promise<void> {
    try {
      const { token } = this.client
      const treads = await redisClient.getJson<typeof this.treadsData>(`${token}:treadtoggle`)
      if (treads && (treads.treadToggles ?? 0) > 0 && this.client.stream_online) {
        say(
          this.client,
          t('treadToggle', {
            count: treads.treadToggles,
            lng: this.client.locale,
            manaCount: treads.manaSaved,
            matchId,
          })
        )
      }
    } catch (error) {
      logger.error('[BETS] Could not announce tread toggles', { error, matchId })
    }
  }

  private async hasMatchPrediction(matchId: string): Promise<boolean> {
    const { name: channel, token } = this.client
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('predictionId')
        .eq('matchId', matchId)
        .eq('userId', token)
        .single()
      if (!error && (data?.predictionId ?? '').length > 0) {
        return true
      }
      logger.info('[BETS] Skipping Twitch closure because predictionId is unavailable', {
        channel,
        error: error?.message,
        matchId,
      })
    } catch (error) {
      logger.info('[BETS] Skipping Twitch closure because predictionId is unreadable', {
        channel,
        error: error instanceof Error ? error.message : error,
        matchId,
      })
    }
    return false
  }

  // map:win_team comes from the `previously` diff, and Dota drops that diff from the packet
  // after a timed-out POST. When the win_team flip lands there, the event never fires, but
  // the post-game packet still carries the winner for this match.
  private resolveWinner(winningTeam: Team | null, matchId: string): Team | null {
    const map = this.client.gsi?.map
    return winningTeam ?? (map?.matchid === matchId ? parseTeam(map.win_team ?? null) : null)
  }

  // Post-game still reports the match id, but the match is over, so the GC has to be asked
  private isBackInMatch(matchId: string | number): boolean {
    const map = this.client.gsi?.map
    return map?.matchid === matchId && map.game_state !== 'DOTA_GAMERULES_STATE_POST_GAME'
  }

  private async checkEarlyDCWinner(matchId: string | number) {
    // Prevent multiple concurrent early DC winner checks
    if (this.checkingEarlyDCWinner) {
      logger.info('[BETS] Already checking early DC winner, skipping duplicate call', {
        matchId,
        name: this.client.name,
      })
      return
    }

    this.checkingEarlyDCWinner = true

    // Check if the bet for this match is already closed in the database
    const { data: matchData, error } = await supabase
      .from('matches')
      .select('won')
      .is('won', null)
      .eq('matchId', matchId.toString())
      .eq('userId', this.client.token)
      .single()

    if (error !== null || matchData === null || matchData === undefined) {
      logger.info('[BETS] Match already closed or not found, skipping early DC winner check', {
        error: error?.message,
        matchId,
        name: this.client.name,
      })
      this.checkingEarlyDCWinner = false
      return
    }

    logger.info('[BETS] Streamer exited the match before it ended with a winner', {
      endingBets: this.endingBets,
      matchId,
      name: this.client.name,
      openingBets: this.openingBets,
    })

    const snapshotMatch = await this.saveUnresolvedSnapshot(matchId)

    if (is8500Plus(this.client)) {
      logger.info('[BETS] High MMR player detected, prompting for manual resolution', {
        matchId,
        mmr: this.getMmr(),
        name: this.client.name,
      })
      await this.requestManualResolution(matchId, snapshotMatch)
      this.checkingEarlyDCWinner = false
      return
    }

    const MAX_RETRIES = 5
    const RETRY_DELAY = 30_000
    let retryCount = 0

    const attemptFetchMatchData = async (): Promise<void> => {
      if (this.isBackInMatch(matchId)) {
        logger.info('[BETS] Streamer rejoined the match, skipping early DC winner check', {
          matchId,
          name: this.client.name,
        })
        this.checkingEarlyDCWinner = false
        return
      }

      const { data: matchNotEnded, error: lookupError } = await supabase
        .from('matches')
        .select('won')
        .is('won', null)
        .eq('matchId', matchId.toString())
        .eq('userId', this.client.token)
        .single()

      if (!matchNotEnded || lookupError !== null) {
        logger.info('[BETS] Match already ended, skipping early DC winner check', {
          matchId,
          name: this.client.name,
        })
        this.checkingEarlyDCWinner = false
        return
      }

      if (retryCount >= MAX_RETRIES) {
        if (this.client.stream_online) {
          logger.info(
            'Exceeded maximum retries for early DC match check, prompting for manual resolution',
            { matchId, name: this.client.name }
          )
          await this.requestManualResolution(matchId, snapshotMatch)
        }
        this.checkingEarlyDCWinner = false
        return
      }

      try {
        const getMatchDetailsPromise = new Promise<MatchMinimalDetailsResponse>(
          (resolve, reject) => {
            steamSocket.emit(
              'getMatchMinimalDetails',
              { match_id: Number(matchId) },
              (err: unknown, response: MatchMinimalDetailsResponse) => {
                if (err !== null && err !== undefined) {
                  reject(err)
                } else {
                  resolve(response)
                }
              }
            )
          }
        )

        const response = await getMatchDetailsPromise
        const outcome = response?.matches?.[0]?.match_outcome
        if (
          outcome === EMatchOutcome.k_EMatchOutcome_RadVictory ||
          outcome === EMatchOutcome.k_EMatchOutcome_DireVictory
        ) {
          logger.info('Successfully retrieved match result for early DC', {
            matchId,
            matchOutcome: outcome,
            name: this.client.name,
          })
          this.checkingEarlyDCWinner = false
          const winningTeam =
            outcome === EMatchOutcome.k_EMatchOutcome_RadVictory ? 'radiant' : 'dire'
          await this.closeBets(winningTeam, response)
          return
        }
        if (
          outcome !== undefined &&
          Number.isFinite(outcome) &&
          outcome > EMatchOutcome.k_EMatchOutcome_DireVictory
        ) {
          logger.info('Match not scored, skipping early DC winner check', {
            matchId,
            matchOutcome: outcome,
            name: this.client.name,
          })
          this.checkingEarlyDCWinner = false
          cancelHeroSwap(this, matchId.toString())
          await this.finishUnscoredMatch(matchId.toString())
          return
        }

        retryCount += 1
        logger.info('Invalid match data response, scheduling retry', {
          matchId,
          maxRetries: MAX_RETRIES,
          name: this.client.name,
          response,
          retryCount,
        })
      } catch (fetchError) {
        retryCount += 1
        logger.error('Error in early DC match check, scheduling retry', {
          error: fetchError,
          matchId,
          maxRetries: MAX_RETRIES,
          name: this.client.name,
          retryCount,
        })
      }
      setTimeout(() => {
        void attemptFetchMatchData()
      }, RETRY_DELAY)
    }

    try {
      await attemptFetchMatchData()
    } catch (matchCheckError) {
      logger.error('Uncaught error in checkEarlyDCWinner', {
        error: matchCheckError,
        matchId,
        name: this.client.name,
      })
      this.checkingEarlyDCWinner = false
    }
  }

  private async saveUnresolvedSnapshot(matchId: string | number): Promise<UnresolvedMatch> {
    // Persist a snapshot so unresolved-match messages can show hero / KDA /
    // score / length. The live packet that triggered the DC has usually shed
    // these values (hero/player empty, scores back to 0), so the merge prefers
    // the cached last-in-game snapshot for this match.
    const cached =
      this.lastInGameSnapshot?.matchId === matchId.toString() ? this.lastInGameSnapshot : null
    const snapshotMatch = buildUnresolvedSnapshot({
      cached,
      gsi: this.client.gsi,
      matchId: matchId.toString(),
      now: new Date(),
    })
    // Only write while still unresolved and only if no snapshot exists yet, so a
    // concurrent resolution can't be clobbered and re-entry can't reset updated_at
    // (the reminder's 10-minute anchor). hero_name is set at bet-open and again
    // on hero swap — only overwrite it when we actually have one.
    const kdaForDb = {
      assists: snapshotMatch.kda?.assists ?? null,
      deaths: snapshotMatch.kda?.deaths ?? null,
      duration: snapshotMatch.kda?.duration ?? null,
      kills: snapshotMatch.kda?.kills ?? null,
    }
    await supabase
      .from('matches')
      .update({
        ...(snapshotMatch.hero_name !== null &&
        snapshotMatch.hero_name !== undefined &&
        snapshotMatch.hero_name.length > 0
          ? { hero_name: snapshotMatch.hero_name }
          : {}),
        dire_score: snapshotMatch.dire_score,
        kda: kdaForDb,
        radiant_score: snapshotMatch.radiant_score,
        updated_at: snapshotMatch.updated_at,
      })
      .match({ matchId: matchId.toString(), userId: this.client.token })
      .is('won', null)
      .is('kda', null)
    return snapshotMatch
  }

  private async requestManualResolution(
    matchId: string | number,
    snapshot: UnresolvedMatch
  ): Promise<void> {
    const { token, locale, settings, subscription } = this.client
    await redisClient.client.set(
      `${token}:pendingManualResolution`,
      JSON.stringify({ matchId, timestamp: Date.now() })
    )
    if (
      this.client.stream_online &&
      getValueOrDefault(DBSettings.tellChatBets, settings, subscription)
    ) {
      say(
        this.client,
        t('bets.manualResolution', {
          details: formatUnresolvedMatch(snapshot),
          emote: 'PauseChamp',
          lng: locale,
          matchId,
        })
      )
    }
  }

  private emitBlockEvent({ blockType, state }: { state?: string; blockType: BlockType }) {
    if (this.blockCache === blockType) {
      return
    }

    this.blockCache = blockType

    // Check if client token exists before emitting
    if (!this.client?.token) {
      logger.warn('Cannot emit block event - client token is missing', {
        blockType,
        state,
      })
      return
    }

    server.io.to(this.client.token).emit('block', {
      matchId: this.client.gsi?.map?.matchid,
      state,
      team: this.client.gsi?.player?.team_name,
      type: blockType,
    })
  }

  /*
        // hero banned
        if hero.id === -1 && previously.hero.id > 0 && previously.hero.name === ''

        // picked, enemy cant see yet
        if hero.id > 0 && hero.name === ''

        // picked, enemy can see now
        if hero.id > 0 && hero.name && hero.name.length
    */
  async setupOBSBlockers(state?: string) {
    try {
      if (isSpectator(this.client.gsi) || isArcade(this.client.gsi)) {
        const blockType = isSpectator(this.client.gsi) ? 'spectator' : 'arcade'
        if (this.blockCache === blockType) {
          return
        }

        this.emitBadgeUpdate()
        this.emitWLUpdate()
        this.emitBlockEvent({ blockType, state })

        if (blockType === 'spectator') {
          await this.emitNotablePlayers()
        }
        return
      }

      // TODO: if the game is matchid 0 also dont show these? ie bot match. hero demo are type 'arcade'

      const heroName: string | undefined = this.client.gsi?.hero?.name
      const heroPicked = (this.client.gsi?.hero?.id ?? 0) > 0
      const heroLockedIn = heroName?.startsWith('npc_') === true
      const heroNotLockedIn = heroName === ''
      const pickingPhase = pickSates.includes(state ?? '')

      // Picked hero, but enemy can't see yet
      if (pickingPhase && heroPicked && heroNotLockedIn) {
        // invasive hero blocking overlay that hides all picked hero info
        this.emitBlockEvent({ blockType: 'strategy', state })
        return
      }

      // Picked hero, enemy can see it now
      if (pickingPhase && heroPicked && heroLockedIn) {
        // less invasive strategy that shows our hero but hides teammates
        this.emitBlockEvent({ blockType: 'strategy-2', state })
        return
      }

      // Check what needs to be blocked
      const matchingBlocker = blockTypes.find((blocker) => blocker.states.includes(state ?? ''))
      const hasValidBlocker = !!matchingBlocker
      const isMainScreenState = [
        'DOTA_GAMERULES_STATE_INIT',
        'DOTA_GAMERULES_STATE_POST_GAME',
      ].includes(state ?? '')

      // Refresh the unresolved-match cache on every GSI tick while playing —
      // not only on the state transition into 'playing'. Capturing once at
      // game-start leaves the cache frozen at 0/0/0, 0-0, ~0s, which is what
      // showed up in chat after early DCs.
      if (matchingBlocker?.type === 'playing') {
        this.captureInGameSnapshot()
      }

      const emittedBlockType =
        isMainScreenState && matchingBlocker?.type === 'empty' ? null : matchingBlocker?.type

      if (matchingBlocker !== undefined && this.blockCache !== emittedBlockType) {
        this.emitBlockEvent({ blockType: emittedBlockType ?? null, state })

        // POST_GAME and INIT are valid no-block states, but they are also the final reliable
        // signals for clients that leave before GSI sends a packet without map data. Start the
        // normal match resolution path here so Redis state cannot survive until the next match.
        if (isMainScreenState && matchingBlocker.type === 'empty') {
          const trackedMatchId = await redisClient.client.get(`${this.client.token}:matchId`)
          if (trackedMatchId !== null && trackedMatchId.length > 0) {
            await this.closeBets()
          }
        }

        if (matchingBlocker.type === 'playing') {
          emitMinimapBlockerStatus(this.client)
          this.emitBadgeUpdate()
          this.emitWLUpdate()

          try {
            await maybeSendRoshAegisEvent(this.client.token, this.client)
          } catch (error) {
            logger.error('err maybeSendRoshAegisEvent', { error })
          }
        }
      }

      // No blocker changes, don't emit any socket message
      if (!hasValidBlocker && !this.blockCache) {
        return
      }

      // Unblock all, we are disconnected from the match
      if (!hasValidBlocker && this.blockCache) {
        logger.debug('[BETS] Close bets because unblocked all', {
          blockCache: this.blockCache,
          hasValidBlocker,
          name: this.client.name,
          state,
        })

        await sendExtensionPubSubBroadcastMessageIfChanged(this, null).catch((error) => {
          logger.error('err sendExtensionPubSubBroadcastMessageIfChanged', { error })
        })
        this.emitBlockEvent({ blockType: null, state })
        await this.closeBets()
        return
      }
    } catch (error) {
      logger.error('Error in setupOBSBlockers', {
        error,
        name: this.client?.name,
        state,
      })
    }
  }
}

// Register the GSIHandler constructor with the factory
setGSIHandlerConstructor((client: SocketClient) => new GSIHandler(client))
