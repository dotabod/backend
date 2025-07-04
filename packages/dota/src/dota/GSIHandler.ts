import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { Long } from 'mongodb'
import { getWL, LOBBY_TYPE_RANKED, MULTIPLIER_PARTY, MULTIPLIER_SOLO } from '../db/getWL.js'
import { redisClient } from '../db/redisInstance.js'
import { DBSettings, getValueOrDefault } from '../settings.js'
import { notablePlayers } from '../steam/notableplayers.js'
import { steamSocket } from '../steam/ws.js'
import { closeTwitchBet } from '../twitch/lib/closeTwitchBet.js'
import { openTwitchBet } from '../twitch/lib/openTwitchBet.js'
import { refundTwitchBet } from '../twitch/lib/refundTwitchBets.js'
import type { MatchMinimalDetailsResponse } from '../types.js'
import {
  type BlockType,
  type DotaEvent,
  DotaGcTeam,
  EMatchOutcome,
  type SocketClient,
} from '../types.js'
import { getRedisNumberValue, steamID64toSteamID32 } from '../utils/index.js'
import { maybeSendRoshAegisEvent } from './events/gsi-events/maybeSendRoshAegisEvent.js'
import { sendExtensionPubSubBroadcastMessageIfChanged } from './events/gsi-events/sendExtensionPubSubBroadcastMessageIfChanged.js'
import { DataBroadcaster, sendInitialData } from './events/minimap/DataBroadcaster.js'
import type { DataBroadcasterInterface } from './events/minimap/DataBroadcasterTypes.js'
import { minimapParser } from './events/minimap/parser.js'
import { setGSIHandlerConstructor } from './GSIHandlerFactory.js'
import type { GSIHandlerType } from './GSIHandlerTypes.js'
import { getStreamDelay } from './getStreamDelay.js'
import { blockTypes, pickSates } from './lib/consts.js'
import { delayedQueue } from './lib/DelayedQueue.js'
import { getAccountsFromMatch } from './lib/getAccountsFromMatch.js'
import getHero, { type HeroNames } from './lib/getHero.js'
import { getHeroById } from './lib/heroes.js'
import { isArcade } from './lib/isArcade.js'
import { isSpectator } from './lib/isSpectator.js'
import { getRankDetail } from './lib/ranks.js'
import { updateMmr } from './lib/updateMmr.js'
import { NeutralItemTimer } from './NeutralItemTimer.js'
import { say } from './say.js'
import { server } from './server.js'

// Finally, we have a user and a GSI client
interface MMR {
  scores: {
    radiant_score: number | null
    dire_score: number | null
    kda: any
  }
  gameMode: number
  increase: boolean
  lobbyType: number
  matchId: string | number
  isParty?: boolean
  heroSlot?: number | null
  heroName?: string | null
  myTeam?: 'radiant' | 'dire' | null
}

export function emitMinimapBlockerStatus(client: SocketClient) {
  if (!client.stream_online || !client.beta_tester || !client.gsi) return

  const enabled = getValueOrDefault(
    DBSettings['minimap-blocker'],
    client.settings,
    client.subscription,
  )
  if (!enabled) return

  const parsedData = minimapParser.parse(client.gsi)
  sendInitialData(client.token)
  server.io.to(client.token).emit('STATUS', parsedData.status)
}

export async function deleteRedisData(client: SocketClient) {
  const { steam32Id, token } = client
  const matchId = (await redisClient.client.get(`${token}:matchId`)) ?? client.gsi?.map?.matchid

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
      .exec()
  } catch (e) {
    logger.error('err deleteRedisData', { e })
  }
}

// That means the user opened OBS and connected to Dota 2 GSI
export class GSIHandler implements GSIHandlerType {
  client: SocketClient

  // Server could reboot and lose these in memory
  // But that's okay they will get reset based on current match state

  blockCache: string | null = null
  events: DotaEvent[] = []
  bountyHeroNames: string[] = []
  noTpChatter: {
    taskId?: string
    lastRemindedDate?: Date
  } = {}
  bountyTaskId?: string
  killstreakTaskId?: string

  endingBets = false
  openingBets = false
  creatingSteamAccount = false
  checkingEarlyDCWinner = false
  treadsData = { treadToggles: 0, manaSaved: 0, manaAtLastToggle: 0 }
  disabled = false

  mapBlocker: DataBroadcasterInterface
  neutralItemTimer: NeutralItemTimer

  constructor(dotaClient: SocketClient) {
    this.client = dotaClient
    this.mapBlocker = new DataBroadcaster(this.client.token)
    this.neutralItemTimer = new NeutralItemTimer(this)

    const isBotDisabled = getValueOrDefault(
      DBSettings.commandDisable,
      this.client.settings,
      this.client.subscription,
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
    return new Date(new Date().getTime() + seconds * 1000)
  }

  private resetPlayerData() {
    this.events = []
    this.treadsData = { treadToggles: 0, manaSaved: 0, manaAtLastToggle: 0 }
    this.creatingSteamAccount = false
    this.checkingEarlyDCWinner = false
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
    if (this.bountyTaskId) {
      delayedQueue.removeTask(this.bountyTaskId)
      this.bountyTaskId = undefined
    }

    if (this.killstreakTaskId) {
      delayedQueue.removeTask(this.killstreakTaskId)
      this.killstreakTaskId = undefined
    }

    if (this.noTpChatter.taskId) {
      delayedQueue.removeTask(this.noTpChatter.taskId)
      this.noTpChatter.taskId = undefined
    }
  }

  public async resetClientState() {
    await deleteRedisData(this.client)
    this.mapBlocker.resetData()
    this.resetPlayerData()
    this.resetBetData()
    this.emitClientResetEvents()
    this.neutralItemTimer.reset()
    this.clearAllTimeouts()

    // Reset multiAccount property to ensure it's cleared when state is reset
    if (this.client) {
      this.client.multiAccount = undefined
    }
  }

  emitWLUpdate() {
    if (!this.client.stream_online) return

    const mmrEnabled = getValueOrDefault(
      DBSettings['mmr-tracker'],
      this.client.settings,
      this.client.subscription,
    )
    getWL({
      lng: this.client.locale,
      channelId: this.getChannelId(),
      startDate: this.client.stream_start_date,
      mmrEnabled,
    })
      .then(({ record }) => {
        server.io.to(this.client.token).emit('update-wl', record)
      })
      .catch(() => {
        // Stream not live
        // console.error('[MMR] emitWLUpdate Error getting WL', {e: e?.message || e})
      })
  }
  async emitNotablePlayers() {
    if (!this.client.stream_online) return

    const { matchPlayers } = await getAccountsFromMatch({
      gsi: this.client.gsi,
    })

    const enableCountries = getValueOrDefault(
      DBSettings.notablePlayersOverlayFlagsCmd,
      this.client.settings,
      this.client.subscription,
    )
    const notablePlayersEnabled = getValueOrDefault(
      DBSettings.notablePlayersOverlay,
      this.client.settings,
      this.client.subscription,
    )
    if (!notablePlayersEnabled) return

    notablePlayers({
      locale: this.client.locale,
      twitchChannelId: this.getChannelId(),
      currentMatchId: this.client.gsi?.map?.matchid,
      players: matchPlayers,
      enableFlags: enableCountries,
      steam32Id: this.getSteam32(),
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

  emitBadgeUpdate() {
    getRankDetail(this.getMmr(), this.getSteam32())
      .then((deets) => {
        server.io.to(this.client.token).emit('update-medal', deets)
      })
      .catch((e) => {
        logger.error('[MMR] emitBadgeUpdate Error getting rank detail', {
          e: e?.message || e,
        })
      })
  }

  // Make sure user has a steam32Id saved in the database
  // This runs once per every match start
  // the user may have a steam account saved, but not this one for this match
  // so add to their list of steam accounts
  async updateSteam32Id() {
    if (this.creatingSteamAccount || !this.client.gsi?.player?.steamid) return

    // Set a flag to prevent concurrent calls
    this.creatingSteamAccount = true

    try {
      const steam32Id = steamID64toSteamID32(this.client.gsi.player.steamid)
      if (!steam32Id) {
        this.creatingSteamAccount = false
        return
      }

      // TODO: Not sure if .accountid actually exists for a solo gsi in non spectate mode
      const isSameAccountId = this.getSteam32() === Number(this.client.gsi.player.accountid)
      const isSameSteam32Id = this.getSteam32() === steam32Id
      const isMultiAccount = this.client.multiAccount === steam32Id

      if (isSameSteam32Id || isMultiAccount || isSameAccountId) return

      // User already has a steam32Id and its saved to the `steam_accounts` table
      const foundAct = this.client.SteamAccount.find((act) => act.steam32Id === steam32Id)
      if (foundAct) {
        // Logged into a new steam account on the same twitch channel
        Object.assign(this.client, {
          mmr: foundAct.mmr,
          steam32Id,
          multiAccount: undefined,
        })
        this.emitBadgeUpdate()
        return
      }

      // Continue to create this act in db
      // Default to the mmr from `users` table for this brand new steam account
      // this.getMmr() should return mmr from `user` table on new accounts without steam acts
      const mmr = this.client.SteamAccount.length ? 0 : this.getMmr()

      this.creatingSteamAccount = true
      const { data: res } = await supabase
        .from('steam_accounts')
        .select('id, userId, mmr, connectedUserIds')
        .eq('steam32Id', steam32Id)
        .single()

      if (res?.id) {
        await this.handleExistingAccount(res, steam32Id)
      } else {
        await this.createNewSteamAccount(mmr, steam32Id)
      }

      this.creatingSteamAccount = false
    } catch (error) {
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
    steam32Id: number,
  ) {
    if (res.userId === this.client.token) {
      Object.assign(this.client, { mmr: res.mmr, steam32Id })
    } else {
      this.client.multiAccount = steam32Id
      const uniqueUserIds = Array.from(
        new Set([...(res?.connectedUserIds ?? []), this.client.token]),
      )
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

    await supabase.from('steam_accounts').insert({
      mmr,
      steam32Id,
      userId: this.client.token,
      name: this.client.gsi?.player?.name,
    })

    await supabase
      .from('users')
      .update({ mmr: 0, updated_at: new Date().toISOString() })
      .eq('id', this.client.token)

    Object.assign(this.client, { mmr, steam32Id, multiAccount: undefined })
    this.emitBadgeUpdate()
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
      name: this.client.name,
      steam32Id: this.client.steam32Id,
      matchId,
      isParty,
      ranked,
      increase,
      lobbyType,
    }

    logger.info('[MMR Update] Begin updating mmr', extraInfo)

    // This also updates WL for the unranked matches
    await supabase
      .from('matches')
      .update({
        won: increase,
        lobby_type: lobbyType,
        game_mode: gameMode,
        hero_slot: heroSlot,
        is_party: isParty,
        hero_name: heroName,
        kda: scores.kda,
        radiant_score: scores.radiant_score,
        dire_score: scores.dire_score,
        updated_at: new Date().toISOString(),
        myTeam: myTeam ?? '',
      })
      .match({ matchId: `${matchId}`, userId: this.client.token })

    logger.info('[DATABASE] Updated bet with winnings', extraInfo)
    this.emitWLUpdate()

    if (!ranked) {
      logger.info('[MMR] Not ranked game, wont update mmr', extraInfo)
      return
    }

    const mmrSize = isParty ? MULTIPLIER_PARTY : MULTIPLIER_SOLO
    const newMMR = this.getMmr() + (increase ? mmrSize : -mmrSize)
    if (this.client.steam32Id) {
      const mmrEnabled = getValueOrDefault(
        DBSettings['mmr-tracker'],
        this.client.settings,
        this.client.subscription,
      )
      if (mmrEnabled) {
        logger.info('[MMR] Found steam32Id, updating mmr', extraInfo)
        await updateMmr({
          currentMmr: this.getMmr(),
          newMmr: newMMR,
          steam32Id: this.client.steam32Id,
          channel: this.client.name,
        })
      }
    } else {
      logger.info('[MMR] Did not find steam32Id, wont update mmr', extraInfo)
    }
  }

  // TODO: CRON Job
  // 1 Find bets that are open and don't equal this match id and close them
  // 2 Next, check if the prediction is still open
  // 3 If it is, steam dota2 api result of match
  // 4 Then, tell twitch to close bets based on win result
  async openBets(client: SocketClient) {
    if (this.openingBets) {
      // console.log('still opening')
      return
    }

    // Why open if not playing?
    if (client.gsi?.player?.activity !== 'playing') {
      // console.log(`if (client.gsi?.player?.activity !== 'playing') {`)
      return
    }

    // Why open if won?
    if (client.gsi.map?.win_team !== 'none') {
      // console.log(`if (client.gsi.map?.win_team !== 'none') {`)
      return
    }

    // We at least want the hero name so it can go in the twitch bet title
    if (!client.gsi.hero?.name || !client.gsi.hero.name.length) {
      // console.log(`if (!client.gsi.hero?.name || !client.gsi.hero.name.length) {`)
      return
    }

    // It's not a live game, so we don't want to open bets nor save it to DB
    if (!client.gsi.map?.matchid || client.gsi.map?.matchid === '0') {
      // console.log(`if (!client.gsi.map.matchid || client.gsi.map.matchid === '0') {`)
      return
    }

    const matchId = (await redisClient.client.get(`${client.token}:matchId`)) ?? undefined

    if (!!matchId && !!client.gsi?.map?.matchid && matchId !== client.gsi.map.matchid) {
      // We have the wrong matchid, reset vars and start over
      logger.info('[BETS] openBets resetClientState because stuck on old match id', {
        name: client.name,
        playingMatchId: matchId,
        gsiMatchId: client.gsi.map.matchid,
        steam32Id: client.steam32Id,
        steamFromGSI: client.gsi.player?.steamid,
        token: client.token,
      })
      await this.resetClientState()
      return
    }

    // The bet was already made
    if (Number(matchId) >= 0) {
      return
    }

    logger.info('[BETS] Begin opening bets', {
      name: client.name,
      playingMatchId: matchId,
      matchId: client.gsi.map.matchid,
      hero: client.gsi.hero.name,
    })

    this.openingBets = true

    const { data: bet } = await supabase
      .from('matches')
      .select('matchId, myTeam, id')
      .eq('matchId', client.gsi.map.matchid)
      .eq('userId', client.token)
      .is('won', null)

    try {
      // Saving to redis so we don't have to query the db again
      await redisClient.client.set(`${client.token}:matchId`, client?.gsi?.map?.matchid || '')

      const playingTeam = bet?.[0]?.myTeam ?? client.gsi?.player?.team_name ?? ''
      await redisClient.client.set(`${client.token}:playingTeam`, playingTeam)
      await redisClient.client.set(`${client.token}:playingHero`, client.gsi?.hero?.name || '')
    } catch (error) {
      logger.error('Error while saving data to Redis:', {
        error,
        client: client.name,
        matchId: client?.gsi?.map?.matchid || '',
        token: client.token,
      })
    }

    // Check if this bet for this match id already exists, dont continue if it does
    if (bet?.[0]?.id) {
      logger.info('[BETS] Found a bet in the database', { id: bet?.[0]?.id })
      this.openingBets = false
      return
    }

    if (!client.stream_online) {
      logger.info('[BETS] Not opening bets bc stream is offline for', {
        name: client.name,
      })
      this.openingBets = false
      return
    }

    if (!client.token) {
      this.openingBets = false
      return
    }

    delayedQueue.addTask(getStreamDelay(client.settings, client.subscription), this.openTheBet)

    // .catch((e: any) => {
    //   logger.error(`[BETS] Could not add bet to channel`, {
    //     channel: client.name,
    //     e: e?.message || e,
    //   })
    //   this.openingBets = false
    // })

    // .catch((e: any) => {
    //   logger.error('[BETS] Error opening bet', {
    //     matchId: client?.gsi?.map?.matchid || '',
    //     channel,
    //     e: e?.message || e,
    //   })
    //   if ((e?.message || e).includes('error')) {
    //     this.openingBets = false
    //   }
    // })
  }

  openTheBet = async () => {
    const { client } = this
    const hero = getHero(client.gsi?.hero?.name)

    const matchId = client?.gsi?.map?.matchid || ''
    let betId: undefined | string

    const betsEnabled = getValueOrDefault(DBSettings.bets, client.settings, client.subscription)

    try {
      if (betsEnabled) {
        const bet = await openTwitchBet({
          heroName: hero?.localized_name,
          client,
        })

        betId = bet?.id
      }
    } catch (e: any) {
      logger.error('[BETS] Error opening twitch bet', {
        channel: client.name,
        e: e?.message || e,
        matchId,
      })

      return
    } finally {
      this.openingBets = false

      // we fill in hero name later when match ends in case they swap heroes
      await supabase.from('matches').insert({
        predictionId: betId,
        matchId,
        userId: client.token,
        myTeam: client.gsi?.player?.team_name ?? '',
        steam32Id: client.steam32Id,
      })
    }

    if (betsEnabled) {
      say(client, t('bets.open', { emote: 'peepoGamble', lng: client.locale }), {
        delay: false,
        key: DBSettings.tellChatBets,
      })

      logger.info('[BETS] open bets', {
        event: 'open_bets',
        matchId,
        user: client.token,
        player_team: client.gsi?.player?.team_name,
      })
    }
  }

  async closeBets(
    winningTeam: 'radiant' | 'dire' | null = null,
    gcData?: MatchMinimalDetailsResponse,
  ) {
    if (this.endingBets) return
    this.endingBets = true

    try {
      const match = gcData?.matches?.[0]
      const longMatchId = match?.match_id
        ? (() => {
            const id = new Long(match.match_id.low, match.match_id.high).toString()
            const numId = Number(id)
            return !Number.isNaN(numId) && numId > 1 ? id : undefined
          })()
        : undefined
      const matchId = (await redisClient.client.get(`${this.client.token}:matchId`)) ?? longMatchId
      const player = match?.players?.find(
        (player) => player.account_id === Number(this.client.gsi?.player?.accountid),
      )
      const stratzTeam =
        player?.team_number === DotaGcTeam.DOTA_GC_TEAM_GOOD_GUYS
          ? 'radiant'
          : player?.team_number === DotaGcTeam.DOTA_GC_TEAM_BAD_GUYS
            ? 'dire'
            : null
      const myTeam: 'radiant' | 'dire' | null =
        typeof player?.team_number === 'number'
          ? (stratzTeam ?? null)
          : (((await redisClient.client.get(`${this.client.token}:playingTeam`)) as
              | 'radiant'
              | 'dire'
              | null) ??
            (this.client.gsi?.player?.team_name === 'radiant' ||
            this.client.gsi?.player?.team_name === 'dire'
              ? this.client.gsi?.player?.team_name
              : null))

      if (this.openingBets || !matchId) {
        logger.info('[BETS] Not closing bets', {
          name: this.client.name,
          openingBets: this.openingBets,
          playingMatchId: matchId,
          endingBets: this.endingBets,
        })

        if (!matchId) await this.resetClientState()
        return
      }

      const betsEnabled = getValueOrDefault(
        DBSettings.bets,
        this.client.settings,
        this.client.subscription,
      )
      const heroSlot =
        player?.player_slot ?? (await getRedisNumberValue(`${this.client.token}:playingHeroSlot`))
      const heroName =
        getHeroById(player?.hero_id)?.key ??
        ((await redisClient.client.get(`${this.client.token}:playingHero`)) as HeroNames | null)

      // An early without waiting for ancient to blow up
      // We have to check every few seconds with an api to see if the match is over
      if (!winningTeam) {
        this.checkEarlyDCWinner(matchId)
        return
      }

      const localWinner = winningTeam
      const scores = {
        kda: {
          kills: player?.kills ?? this.client.gsi?.player?.kills ?? null,
          deaths: player?.deaths ?? this.client.gsi?.player?.deaths ?? null,
          assists: player?.assists ?? this.client.gsi?.player?.assists ?? null,
        },
        radiant_score: match?.radiant_score ?? this.client.gsi?.map?.radiant_score ?? null,
        dire_score: match?.dire_score ?? this.client.gsi?.map?.dire_score ?? null,
      }
      const won = myTeam === localWinner
      logger.info('[BETS] end bets won data', {
        playingMatchId: matchId,
        localWinner,
        myTeam,
        won,
        channel: this.client.name,
      })

      // Both or one undefined
      if (!myTeam) {
        // Very rare case, but it can happen. Once every 7 days
        logger.error('[BETS] trying to end bets but did not find localWinner or myTeam', {
          channel: this.client.name,
          matchId,
        })
        return
      }

      logger.info('[BETS] Running end bets to award mmr and close predictions', {
        name: this.client.name,
        matchId,
      })

      const channel = this.client.name

      // Pretty rare case, 26 times in 7 days. Usually when they test Dotabod in a custom lobby
      // Custom lobbies create a match ID but don't report any stats
      if (
        !this.client.gsi?.map?.dire_score &&
        !this.client.gsi?.map?.radiant_score &&
        this.client.gsi?.map?.matchid
      ) {
        logger.info('This is likely a no stats recorded match', {
          name: this.client.name,
          matchId,
        })

        if (this.client.stream_online) {
          say(
            this.client,
            t('bets.notScored', {
              emote: 'D:',
              lng: this.client.locale,
              matchId,
              key: DBSettings.tellChatBets,
            }),
          )
          const predictionResponse = await supabase
            .from('matches')
            .select('predictionId')
            .eq('matchId', matchId)
            .eq('userId', this.client.token)
            .is('won', null)
            .single()
          if (predictionResponse.data?.predictionId) {
            const oldBetId = await refundTwitchBet(
              this.getChannelId(),
              predictionResponse.data.predictionId,
            )
            if (oldBetId) {
              await supabase
                .from('matches')
                .update({ predictionId: null, updated_at: new Date().toISOString() })
                .eq('predictionId', oldBetId)
            }
          }
        }
        await this.resetClientState()
        return
      }

      // 0 is a correct lobby type meaning unranked
      // https://github.com/dotabod/backend/issues/373#issuecomment-2366822786
      // Default to ranked if we don't have valid data
      const playingLobbyType = await getRedisNumberValue(
        `${matchId}:${this.client.token}:lobbyType`,
      )
      const playingGameMode = await getRedisNumberValue(`${matchId}:${this.client.token}:gameMode`)

      // Use the lobby type from Redis if it exists (including 0)
      // Otherwise default to ranked
      const localLobbyType = playingLobbyType !== null ? playingLobbyType : LOBBY_TYPE_RANKED

      const isParty = getValueOrDefault(DBSettings.onlyParty, this.client.settings)

      await this.updateMMR({
        myTeam,
        scores: scores,
        increase: won,
        lobbyType: localLobbyType,
        gameMode: playingGameMode === null ? 22 : playingGameMode, // 22 is game mode for normal game non turbo
        matchId: matchId,
        isParty: isParty,
        heroSlot,
        heroName,
      })

      const response = await getRankDetail(this.getMmr(), this.getSteam32())
      if (this.client.steam32Id && response && 'standing' in response) {
        await supabase
          .from('steam_accounts')
          .update({ leaderboard_rank: response.standing, updated_at: new Date().toISOString() })
          .eq('steam32Id', this.client.steam32Id)
      }

      const TreadToggleData = this.treadsData
      const toggleHandler = async () => {
        const treadToggleData = (await redisClient.client.json.get(
          `${this.client.token}:treadtoggle`,
        )) as unknown as typeof TreadToggleData | null

        if (treadToggleData?.treadToggles && this.client.stream_online) {
          say(
            this.client,
            t('treadToggle', {
              lng: this.client.locale,
              manaCount: treadToggleData.manaSaved,
              count: treadToggleData.treadToggles,
              matchId,
            }),
          )
        }
      }

      try {
        void toggleHandler()
      } catch (e) {
        logger.error('err toggleHandler', { e })
      }

      delayedQueue.addTask(getStreamDelay(this.client.settings, this.client.subscription), () => {
        const message = won
          ? t('bets.won', { lng: this.client.locale, emote: 'Happi' })
          : t('bets.lost', { lng: this.client.locale, emote: 'Happi' })

        say(this.client, message, { delay: false, chattersKey: 'matchOutcome' })

        if (!betsEnabled) {
          logger.info('Bets are not enabled, stopping here', {
            name: this.client.name,
          })
          this.resetClientState().catch(() => {
            //
          })
          return
        }

        closeTwitchBet(won, this.getChannelId(), matchId)
          .then(() => {
            logger.info('[BETS] end bets', {
              event: 'end_bets',
              matchId,
              name: this.client.name,
              winning_team: localWinner,
              player_team: myTeam,
              didWin: won,
            })
          })
          .catch((e: any) => {
            logger.error('[BETS] Error closing twitch bet', {
              channel,
              e: e?.message || e,
              matchId,
            })
          })
          .finally(() => {
            this.resetClientState().catch((e) => {
              logger.error('Error resetting client state', { e })
            })
          })
      })
    } catch (error) {
      logger.error('Error closing bets', { error, name: this.client.name })
    } finally {
      this.endingBets = false
    }
  }

  private async checkEarlyDCWinner(matchId: string | number) {
    // Prevent multiple concurrent early DC winner checks
    if (this.checkingEarlyDCWinner) {
      logger.info('[BETS] Already checking early DC winner, skipping duplicate call', {
        name: this.client.name,
        matchId,
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

    if (error || !matchData) {
      logger.info('[BETS] Match already closed or not found, skipping early DC winner check', {
        name: this.client.name,
        matchId,
        error: error?.message,
      })
      this.checkingEarlyDCWinner = false
      return
    }

    // Set up retry parameters
    const MAX_RETRIES = 5 // Try up to 5 times
    const RETRY_DELAY = 30000 // 30 seconds between retries (total 2.5 minutes)
    let retryCount = 0

    logger.info('[BETS] Streamer exited the match before it ended with a winner', {
      name: this.client.name,
      matchId,
      openingBets: this.openingBets,
      endingBets: this.endingBets,
    })

    const attemptFetchMatchData = async (): Promise<void> => {
      // Check if they rejoined the match they disconnected from
      if (this.client.gsi?.map?.matchid === matchId) {
        logger.info('[BETS] Streamer rejoined the match, skipping early DC winner check', {
          name: this.client.name,
          matchId,
        })
        return
      }

      // Check if the bet for this match is already closed in the database
      const { data: matchNotEnded, error } = await supabase
        .from('matches')
        .select('won')
        // Null means there is a winner of this match
        .is('won', null)
        .eq('matchId', matchId.toString())
        .eq('userId', this.client.token)
        .single()

      if (!matchNotEnded || error) {
        logger.info('[BETS] Match already ended, skipping early DC winner check', {
          name: this.client.name,
          matchId,
        })
        return
      }

      if (retryCount >= MAX_RETRIES) {
        // Handle refunding bets after exhausting all retries
        if (this.client.stream_online) {
          logger.info('Exceeded maximum retries for early DC match check', {
            name: this.client.name,
            matchId,
          })

          const betsEnabled = getValueOrDefault(
            DBSettings.bets,
            this.client.settings,
            this.client.subscription,
          )
          if (betsEnabled) {
            const predictionResponse = await supabase
              .from('matches')
              .select('predictionId')
              .eq('matchId', matchId.toString())
              .eq('userId', this.client.token)
              .is('won', null)
              .single()
            if (predictionResponse.data?.predictionId) {
              await refundTwitchBet(this.getChannelId(), predictionResponse.data.predictionId)
              const tellChatBets = getValueOrDefault(
                DBSettings.tellChatBets,
                this.client.settings,
                this.client.subscription,
              )
              if (tellChatBets) {
                say(
                  this.client,
                  t('bets.notScored', {
                    emote: 'D:',
                    lng: this.client.locale,
                    matchId,
                  }),
                )
              }
            }
          }
        }

        await this.resetClientState()
        // Reset the flag since we've exhausted retries
        this.checkingEarlyDCWinner = false
        return
      }

      try {
        // Request match data from Steam socket
        const getMatchDetailsPromise = new Promise<MatchMinimalDetailsResponse>(
          (resolve, reject) => {
            steamSocket.emit(
              'getMatchMinimalDetails',
              { match_id: Number(matchId) },
              (err: any, response: any) => {
                if (err) {
                  reject(err)
                } else {
                  resolve(response)
                }
              },
            )
          },
        )

        const response = await getMatchDetailsPromise
        const matchData = response?.matches?.[0]

        // Check if we got a valid response with match outcome
        if (
          matchData &&
          typeof matchData.match_outcome === 'number' &&
          [
            EMatchOutcome.k_EMatchOutcome_RadVictory,
            EMatchOutcome.k_EMatchOutcome_DireVictory,
          ].includes(matchData.match_outcome)
        ) {
          logger.info('Successfully retrieved match result for early DC', {
            matchId,
            name: this.client.name,
            matchOutcome: matchData.match_outcome,
          })

          // Determine winner based on match outcome
          // k_EMatchOutcome_RadVictory = 2, k_EMatchOutcome_DireVictory = 3
          const winningTeam =
            matchData.match_outcome === EMatchOutcome.k_EMatchOutcome_RadVictory
              ? 'radiant'
              : 'dire'

          // Reset flag before calling closeBets to prevent duplicate calls from closeBets
          this.checkingEarlyDCWinner = false
          await this.closeBets(winningTeam, response)
        } else if (
          matchData &&
          typeof matchData.match_outcome === 'number' &&
          matchData.match_outcome > EMatchOutcome.k_EMatchOutcome_DireVictory
        ) {
          // Not scored
          logger.info('Match not scored, skipping early DC winner check', {
            matchId,
            name: this.client.name,
            matchOutcome: matchData.match_outcome,
          })

          // Reset flag before calling closeBets to prevent duplicate calls from closeBets
          this.checkingEarlyDCWinner = false
          logger.info('This is likely a no stats recorded match', {
            name: this.client.name,
            matchId,
          })

          if (this.client.stream_online) {
            say(
              this.client,
              t('bets.notScored', {
                emote: 'D:',
                lng: this.client.locale,
                matchId,
                key: DBSettings.tellChatBets,
              }),
            )
            const predictionResponse = await supabase
              .from('matches')
              .select('predictionId')
              .eq('matchId', matchId.toString())
              .eq('userId', this.client.token)
              .is('won', null)
              .single()
            if (predictionResponse.data?.predictionId) {
              const oldBetId = await refundTwitchBet(
                this.getChannelId(),
                predictionResponse.data.predictionId,
              )
              if (oldBetId) {
                await supabase
                  .from('matches')
                  .update({ predictionId: null, updated_at: new Date().toISOString() })
                  .eq('predictionId', oldBetId)
              }
            }
          }
          await this.resetClientState()
          return
        } else {
          // Invalid response, retry after delay
          retryCount++
          logger.info('Invalid match data response, scheduling retry', {
            name: this.client.name,
            matchId,
            response,
            retryCount,
            maxRetries: MAX_RETRIES,
          })

          setTimeout(attemptFetchMatchData, RETRY_DELAY)
        }
      } catch (error) {
        // Error occurred, retry after delay
        retryCount++
        logger.error('Error in early DC match check, scheduling retry', {
          name: this.client.name,
          matchId,
          error,
          retryCount,
          maxRetries: MAX_RETRIES,
        })

        setTimeout(attemptFetchMatchData, RETRY_DELAY)
      }
    }

    try {
      // Start the first attempt
      await attemptFetchMatchData()
    } catch (error) {
      // If any uncaught error occurs, reset the flag
      logger.error('Uncaught error in checkEarlyDCWinner', {
        error,
        name: this.client.name,
        matchId,
      })
      this.checkingEarlyDCWinner = false
    }
  }

  private emitBlockEvent({ blockType, state }: { state?: string; blockType: BlockType }) {
    if (this.blockCache === blockType) return

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
      type: blockType,
      state,
      team: this.client.gsi?.player?.team_name,
      matchId: this.client.gsi?.map?.matchid,
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
        if (this.blockCache === blockType) return

        this.emitBadgeUpdate()
        this.emitWLUpdate()
        this.emitBlockEvent({ state, blockType })

        if (blockType === 'spectator') {
          await this.emitNotablePlayers()
        }
        return
      }

      // TODO: if the game is matchid 0 also dont show these? ie bot match. hero demo are type 'arcade'

      const heroName = this.client.gsi?.hero?.name
      const heroPicked = this.client.gsi?.hero?.id && this.client.gsi.hero.id > 0
      const heroLockedIn = heroName?.startsWith('npc_')
      const heroNotLockedIn = (heroName as string) === ''
      const pickingPhase = pickSates.includes(state ?? '')

      // Picked hero, but enemy can't see yet
      if (pickingPhase && heroPicked && heroNotLockedIn) {
        // invasive hero blocking overlay that hides all picked hero info
        this.emitBlockEvent({ state, blockType: 'strategy' })
        return
      }

      // Picked hero, enemy can see it now
      if (pickingPhase && heroPicked && heroLockedIn) {
        // less invasive strategy that shows our hero but hides teammates
        this.emitBlockEvent({ state, blockType: 'strategy-2' })
        return
      }

      // Check what needs to be blocked
      const matchingBlocker = blockTypes.find((blocker) => blocker.states.includes(state ?? ''))
      const hasValidBlocker = !!matchingBlocker

      if (matchingBlocker && this.blockCache !== matchingBlocker.type) {
        this.emitBlockEvent({ state, blockType: matchingBlocker.type })

        if (matchingBlocker.type === 'playing') {
          emitMinimapBlockerStatus(this.client)
          this.emitBadgeUpdate()
          this.emitWLUpdate()

          try {
            await maybeSendRoshAegisEvent(this.client.token, this.client)
          } catch (e) {
            logger.error('err maybeSendRoshAegisEvent', { e })
          }
        }
      }

      // No blocker changes, don't emit any socket message
      if (!hasValidBlocker && !this.blockCache) {
        return
      }

      // Unblock all, we are disconnected from the match
      if (!hasValidBlocker && this.blockCache) {
        logger.info('[BETS] Close bets because unblocked all', {
          hasValidBlocker,
          state,
          blockCache: this.blockCache,
          name: this.client.name,
        })

        await sendExtensionPubSubBroadcastMessageIfChanged(this, null).catch((e) => {
          logger.error('err sendExtensionPubSubBroadcastMessageIfChanged', { e })
        })
        this.emitBlockEvent({ state, blockType: null })
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
