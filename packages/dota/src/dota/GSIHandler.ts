import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { getWL } from '../db/getWL.js'
import { prisma } from '../db/prisma.js'
import RedisClient from '../db/redis.js'
import { notablePlayers } from '../steam/notableplayers.js'
import { chatClient } from '../twitch/index.js'
import { closeTwitchBet } from '../twitch/lib/closeTwitchBet.js'
import { openTwitchBet } from '../twitch/lib/openTwitchBet.js'
import { refundTwitchBet } from '../twitch/lib/refundTwitchBets.js'
import { DotaEvent, Player, SocketClient } from '../types.js'
import axios from '../utils/axios.js'
import { steamID64toSteamID32 } from '../utils/index.js'
import { logger } from '../utils/logger.js'
import { AegisRes, emitAegisEvent } from './events/gsi-events/event.aegis_picked_up.js'
import { emitRoshEvent, RoshRes } from './events/gsi-events/event.roshan_killed.js'
import { server } from './index.js'
import { blockTypes, DelayedCommands, GLOBAL_DELAY, pickSates } from './lib/consts.js'
import { getAccountsFromMatch } from './lib/getAccountsFromMatch.js'
import { getCurrentMatchPlayers } from './lib/getCurrentMatchPlayers.js'
import getHero, { HeroNames } from './lib/getHero.js'
import { isArcade } from './lib/isArcade.js'
import { isSpectator } from './lib/isSpectator.js'
import { getRankDetail } from './lib/ranks.js'
import { updateMmr } from './lib/updateMmr.js'

const redisClient = RedisClient.getInstance()

// Finally, we have a user and a GSI client
interface MMR {
  scores: {
    radiant_score: number | null
    dire_score: number | null
    kda: any
  }
  increase: boolean
  lobbyType: number
  matchId: string
  isParty?: boolean
  heroSlot?: number | null
  heroName?: string | null
}

// That means the user opened OBS and connected to Dota 2 GSI
export class GSIHandler {
  client: SocketClient

  // Server could reboot and lose these in memory
  // But that's okay they will get reset based on current match state
  heroDatas: Partial<Record<number, { win: number; lose: number }>> = {}
  blockCache: string | null = null
  playingBetMatchId: string | undefined | null = null
  playingTeam: 'radiant' | 'dire' | 'spectator' | undefined | null = null
  // hero slot can be 0-9
  playingHeroSlot: number | undefined | null = null
  playingHero: HeroNames | undefined | null = null
  playingLobbyType: number | undefined | null = null
  players: ReturnType<typeof getAccountsFromMatch> | undefined | null = null
  savingSteamServerId = false
  steamServerTries = 0
  events: DotaEvent[] = []
  bountyHeroNames: string[] = []
  noTpChatter: {
    timeout?: NodeJS.Timeout
    lastRemindedDate?: Date
  } = {}
  bountyTimeout?: NodeJS.Timeout
  killstreakTimeout?: NodeJS.Timeout
  passiveMidas = { counter: 0, timer: 0, used: 0 }

  endingBets = false
  openingBets = false
  creatingSteamAccount = false
  treadsData = { treadToggles: 0, manaSaved: 0, manaAtLastToggle: 0 }
  disabled = false

  constructor(dotaClient: SocketClient) {
    this.client = dotaClient

    const isBotDisabled = getValueOrDefault(DBSettings.commandDisable, this.client.settings)
    if (isBotDisabled) {
      logger.info('[GSI] Bot is disabled for this user', { name: this.client.name })
      this.disable()
      return
    }

    this.emitBadgeUpdate()
    this.emitWLUpdate()
  }

  public enable() {
    this.disabled = false
    return chatClient.join(this.client.name)
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

  public getChannel() {
    return this.client.name
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

  public getStreamDelay() {
    return Number(getValueOrDefault(DBSettings.streamDelay, this.client.settings)) + GLOBAL_DELAY
  }

  public say(
    message: string,
    { delay = true, beta = false }: { delay?: boolean; beta?: boolean } = {},
  ) {
    if (beta && !this.client.beta_tester) return

    const msg = beta ? `${message} ${t('betaFeature', { lng: this.client.locale })}` : message
    if (!delay) {
      chatClient.say(this.getChannel(), msg)
      return
    }

    setTimeout(() => {
      this.getChannel() && chatClient.say(this.getChannel(), msg)
    }, this.getStreamDelay())
  }

  // reset vars when a new match begins
  public resetClientState() {
    this.playingHero = null
    this.playingHeroSlot = null
    this.events = []
    this.passiveMidas = { counter: 0, timer: 0, used: 0 }
    this.savingSteamServerId = false
    this.steamServerTries = 0

    // Bet stuff should be closed by endBets()
    // This should mean an entire match is over
    this.heroDatas = {}
    this.players = null
    this.client.steamServerId = undefined
    this.endingBets = false
    this.openingBets = false
    this.playingBetMatchId = null
    this.playingTeam = null
    this.treadsData = { treadToggles: 0, manaSaved: 0, manaAtLastToggle: 0 }

    this.noTpChatter = {
      timeout: undefined,
      lastRemindedDate: undefined,
    }

    void redisClient.client.json.del(`${this.getSteam32() ?? ''}:medal`)
    void redisClient.client.json.del(`${this.getToken()}:roshan`)
    void redisClient.client.json.del(`${this.getToken()}:aegis`)
    void redisClient.client.json.del(`${this.getToken()}:treadtoggle`)

    server.io.to(this.getToken()).emit('aegis-picked-up', {})
    server.io.to(this.getToken()).emit('roshan-killed', {})
  }

  // Runs every gametick
  async saveMatchData() {
    // This now waits for the bet to complete before checking match data
    // Since match data is delayed it will run far fewer than before, when checking actual match id of an ingame match
    // the playingBetMatchId is saved when the hero is selected
    const matchId = this.playingBetMatchId

    if (this.hasMatchData(matchId)) {
      return
    }

    this.savingSteamServerId = true
    const steamServerId = await server.dota.getUserSteamServer(this.client.steam32Id!)
    if (!steamServerId) {
      if (this.steamServerTries > 35) {
        return
      }
      setTimeout(() => {
        this.steamServerTries += 1
        this.savingSteamServerId = false
      }, 5000)
      return
    }

    this.client.steamServerId = steamServerId
    this.savingSteamServerId = false

    const delayedData = await server.dota.getDelayedMatchData({
      server_steamid: steamServerId,
      match_id: matchId!,
      refetchCards: true,
      token: this.getToken(),
    })

    if (!delayedData?.match.match_id) {
      logger.info('No match data found!', {
        name: this.client.name,
        matchId,
      })
      return
    }

    this.playingLobbyType = delayedData.match.lobby_type
    this.players = getAccountsFromMatch(delayedData)

    // letting people know match data is available
    if (this.client.stream_online && this.players.accountIds.length) {
      const commands = DelayedCommands.filter((cmd) =>
        getValueOrDefault(cmd.key, this.client.settings),
      )

      const chattersEnabled = getValueOrDefault(DBSettings.chatter, this.client.settings)
      const {
        commandsReady: { enabled: chatterEnabled },
      } = getValueOrDefault(DBSettings.chatters, this.client.settings)

      if (commands.length && chattersEnabled && chatterEnabled) {
        this.say(
          t('matchFound', {
            commandList: commands.map((c) => c.command).join(' · '),
            lng: this.client.locale,
          }),
          {
            delay: false,
          },
        )
      }
    }
  }

  private hasMatchData(matchId?: string | null) {
    return (
      !this.client.steam32Id ||
      !Number(matchId) ||
      this.client.gsi?.map?.matchid === '0' ||
      this.client.steamServerId ||
      this.savingSteamServerId
    )
  }

  emitWLUpdate() {
    if (!this.client.stream_online) return

    const mmrEnabled = getValueOrDefault(DBSettings['mmr-tracker'], this.client.settings)
    getWL({
      lng: this.client.locale,
      channelId: this.getChannelId(),
      startDate: this.client.stream_start_date,
      mmrEnabled,
    })
      .then(({ record }) => {
        server.io.to(this.getToken()).emit('update-wl', record)
      })
      .catch((e) => {
        // Stream not live
        // console.error('[MMR] emitWLUpdate Error getting WL', {e: e?.message || e})
      })
  }
  emitNotablePlayers() {
    if (!this.client.stream_online) return

    const matchPlayers = this.players?.matchPlayers ?? getCurrentMatchPlayers(this.client.gsi)
    const enableCountries = getValueOrDefault(
      DBSettings.notablePlayersOverlayFlagsCmd,
      this.client.settings,
    )
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
          server.io.to(this.getToken()).emit('notable-players', response.playerList)

          setTimeout(() => {
            server.io.to(this.getToken()).emit('notable-players', null)
          }, 60 * 2000)
        }
      })
      .catch((e) => {
        // stream not live
      })
  }

  emitBadgeUpdate() {
    getRankDetail(this.getMmr(), this.getSteam32())
      .then((deets) => {
        server.io.to(this.getToken()).emit('update-medal', deets)
      })
      .catch((e) => {
        logger.error('[MMR] emitBadgeUpdate Error getting rank detail', { e: e?.message || e })
      })
  }

  // Make sure user has a steam32Id saved in the database
  // This runs once per every match start
  // the user may have a steam account saved, but not this one for this match
  // so add to their list of steam accounts
  updateSteam32Id() {
    if (this.creatingSteamAccount) return
    if (!this.client.gsi?.player?.steamid) return
    // TODO: Not sure if .accountid actually exists for a solo gsi in non spectate mode
    if (this.getSteam32() === Number(this.client.gsi.player.accountid)) return

    const steam32Id = steamID64toSteamID32(this.client.gsi.player.steamid)
    if (!steam32Id) return

    // Its a multi account, no need to create a new act
    if (this.client.multiAccount === steam32Id) return

    // It's the same user, no need to create a new act
    if (this.getSteam32() === steam32Id) return

    // User already has a steam32Id and its saved to the `steam_accounts` table
    const foundAct = this.client.SteamAccount.find((act) => act.steam32Id === steam32Id)
    // Logged into a new account (smurfs vs mains)
    if (foundAct) {
      this.client.mmr = foundAct.mmr
      this.client.steam32Id = steam32Id
      this.client.multiAccount = undefined
      this.emitBadgeUpdate()
      return
    } // else we create this act in db

    // Default to the mmr from `users` table for this brand new steam account
    // this.getMmr() should return mmr from `user` table on new accounts without steam acts
    const mmr = this.client.SteamAccount.length ? 0 : this.getMmr()

    logger.info('[STEAM32ID] Running steam account lookup to db', { name: this.getChannel() })

    this.creatingSteamAccount = true
    // Get mmr from database for this steamid
    prisma.steamAccount
      .findFirst({ where: { steam32Id } })
      .then(async (res) => {
        // not found, need to make
        if (!res?.id) {
          logger.info('[STEAM32ID] Adding steam32Id', { name: this.getChannel() })
          await prisma.steamAccount.create({
            data: {
              mmr,
              steam32Id,
              userId: this.getToken(),
              name: this.client.gsi?.player?.name,
            },
          })
          await prisma.user.update({ where: { id: this.getToken() }, data: { mmr: 0 } })
          // Logged into a new account (smurfs vs mains)
          this.client.mmr = mmr
          this.client.steam32Id = steam32Id
          this.client.multiAccount = undefined
          this.emitBadgeUpdate()
        } else {
          if (res.userId === this.getToken()) {
            this.client.mmr = res.mmr
            this.client.steam32Id = steam32Id
          } else {
            // This means its currently being used by another account
            logger.info('Found multi-account', { name: this.getChannel() })
            this.client.multiAccount = steam32Id
            // remove duplicates from userIds
            const userIds = [...res.connectedUserIds, this.getToken()].filter(
              (id, i, arr) => arr.indexOf(id) === i,
            )

            await prisma.steamAccount.update({
              where: { id: res.id },
              data: { connectedUserIds: userIds },
            })
          }
        }

        this.creatingSteamAccount = false
      })
      .catch((e) => {
        this.client.multiAccount = undefined
        this.creatingSteamAccount = false
        logger.error('[DATABASE ERROR]', { e: e?.message || e })
      })
  }

  updateMMR({ scores, increase, heroName, lobbyType, matchId, isParty, heroSlot }: MMR) {
    const ranked = lobbyType === 7

    const extraInfo = {
      name: this.getChannel(),
      steam32Id: this.client.steam32Id,
      matchId,
      isParty,
      ranked,
      increase,
      lobbyType,
    }

    logger.info('[MMR Update] Begin updating mmr', extraInfo)

    // This also updates WL for the unranked matches
    prisma.bet
      .update({
        where: {
          matchId_userId: {
            matchId,
            userId: this.getToken(),
          },
        },
        data: {
          won: increase,
          lobby_type: lobbyType,
          hero_slot: heroSlot,
          is_party: isParty,
          hero_name: heroName,
          kda: scores.kda,
          radiant_score: scores.radiant_score,
          dire_score: scores.dire_score,
        },
      })
      .then(() => {
        logger.info('[DATABASE] Updated bet with winnings', extraInfo)
        this.emitWLUpdate()
      })
      .catch((e) => {
        logger.error('[DATABASE ERROR MMR]', {
          e: e?.message || e,
          matchId,
          isParty,
          increase,
          lobbyType,
        })
      })

    if (!ranked) {
      logger.info('[MMR] Not ranked game, wont update mmr', extraInfo)
      return
    }

    const mmrSize = isParty ? 20 : 30
    const newMMR = this.getMmr() + (increase ? mmrSize : -mmrSize)
    if (this.client.steam32Id) {
      const mmrEnabled = getValueOrDefault(DBSettings['mmr-tracker'], this.client.settings)
      if (mmrEnabled) {
        logger.info('[MMR] Found steam32Id, updating mmr', extraInfo)
        updateMmr({
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
  openBets() {
    if (this.openingBets) {
      return
    }

    if (
      !!this.playingBetMatchId &&
      !!this.client.gsi?.map?.matchid &&
      this.playingBetMatchId !== this.client.gsi.map.matchid
    ) {
      // We have the wrong matchid, reset vars and start over
      logger.info('[BETS] openBets resetClientState because stuck on old match id', {
        name: this.getChannel(),
        playingMatchId: this.playingBetMatchId,
        matchId: this.client.gsi.map.matchid,
        steam32Id: this.getSteam32(),
        steamFromGSI: this.client.gsi.player?.steamid,
        token: this.getToken(),
      })
      this.resetClientState()
    }

    // The bet was already made
    if (this.playingBetMatchId !== null) {
      return
    }

    // Why open if not playing?
    if (this.client.gsi?.player?.activity !== 'playing') {
      return
    }

    // Why open if won?
    if (this.client.gsi.map?.win_team !== 'none') {
      return
    }

    // We at least want the hero name so it can go in the twitch bet title
    if (!this.client.gsi.hero?.name || !this.client.gsi.hero.name.length) {
      return
    }

    // It's not a live game, so we don't want to open bets nor save it to DB
    if (!this.client.gsi.map.matchid || this.client.gsi.map.matchid === '0') {
      return
    }

    logger.info('[BETS] Begin opening bets', {
      name: this.getChannel(),
      playingMatchId: this.playingBetMatchId,
      matchId: this.client.gsi.map.matchid,
      hero: this.client.gsi.hero.name,
    })

    const channel = this.getChannel()
    const matchId = this.client.gsi.map.matchid

    this.openingBets = true

    // Check if this bet for this match id already exists, dont continue if it does
    prisma.bet
      .findFirst({
        select: {
          id: true,
          myTeam: true,
          matchId: true,
        },
        where: {
          userId: this.getToken(),
          matchId,
          won: null,
        },
      })
      .then((bet) => {
        // Saving to local memory so we don't have to query the db again
        if (bet?.id) {
          logger.info('[BETS] Found a bet in the database', { id: bet.id })
          this.playingBetMatchId = bet.matchId
          this.playingTeam = bet.myTeam as Player['team_name']
          this.openingBets = false
          return
        }

        this.playingBetMatchId = matchId
        this.playingTeam = this.client.gsi?.player?.team_name ?? null
        this.playingHero = this.client.gsi?.hero?.name

        prisma.bet
          .create({
            data: {
              predictionId: matchId,
              matchId,
              userId: this.getToken(),
              myTeam: this.client.gsi?.player?.team_name ?? '',
              steam32Id: this.getSteam32(),
            },
          })
          .then(() => {
            const hero = getHero(this.client.gsi?.hero?.name)

            if (!this.client.stream_online) {
              logger.info('[BETS] Not opening bets bc stream is offline for', {
                name: this.client.name,
              })
              this.openingBets = false
              return
            }

            const betsEnabled = getValueOrDefault(DBSettings.bets, this.client.settings)
            if (!betsEnabled) {
              this.openingBets = false
              return
            }

            setTimeout(() => {
              this.getToken() &&
                openTwitchBet(
                  this.client.locale,
                  this.getChannelId(),
                  hero?.localized_name,
                  this.client.settings,
                )
                  .then(() => {
                    const tellChatBets = getValueOrDefault(
                      DBSettings.tellChatBets,
                      this.client.settings,
                    )
                    const chattersEnabled = getValueOrDefault(
                      DBSettings.chatter,
                      this.client.settings,
                    )

                    if (chattersEnabled && tellChatBets) {
                      this.say(t('bets.open', { emote: 'peepoGamble', lng: this.client.locale }), {
                        delay: false,
                      })
                    }
                    this.openingBets = false
                    logger.info('[BETS] open bets', {
                      event: 'open_bets',
                      matchId,
                      user: this.getToken(),
                      player_team: this.client.gsi?.player?.team_name,
                    })
                  })
                  .catch((e: any) => {
                    try {
                      // "message\": \"Invalid refresh token\"\n}" means they have to logout and login
                      if (JSON.parse(e?.body)?.message?.includes('refresh token')) {
                        this.say(
                          t('bets.error', {
                            channel: `@${this.getChannel()}`,
                            lng: this.client.locale,
                          }),
                          {
                            delay: false,
                          },
                        )
                      }
                    } catch (e) {
                      // only interested in refresh token err
                    }

                    logger.error('[BETS] Error opening twitch bet', {
                      channel,
                      e: e?.message || e,
                      matchId,
                    })

                    this.openingBets = false
                  })
            }, this.getStreamDelay())
          })
          .catch((e: any) => {
            logger.error(`[BETS] Could not add bet to channel`, {
              channel: this.getChannel(),
              e: e?.message || e,
            })
            this.openingBets = false
          })
      })
      .catch((e: any) => {
        logger.error('[BETS] Error opening bet', {
          matchId,
          channel,
          e: e?.message || e,
        })
        this.openingBets = false
      })
  }

  closeBets(winningTeam: 'radiant' | 'dire' | null = null) {
    if (this.openingBets || !this.playingBetMatchId || this.endingBets) {
      logger.info('[BETS] Not closing bets', {
        name: this.getChannel(),
        openingBets: this.openingBets,
        playingMatchId: this.playingBetMatchId,
        endingBets: this.endingBets,
      })

      if (!this.playingBetMatchId) this.resetClientState()
      return
    }

    const matchId = this.playingBetMatchId
    const betsEnabled = getValueOrDefault(DBSettings.bets, this.client.settings)
    const heroSlot = this.playingHeroSlot
    const heroName = this.playingHero

    // An early without waiting for ancient to blow up
    // We have to check every few seconds with an pi to see if the match is over
    if (!winningTeam) {
      this.checkEarlyDCWinner(matchId)
      return
    }

    const localWinner = winningTeam
    const myTeam = this.playingTeam ?? this.client.gsi?.player?.team_name
    const scores = {
      kda: {
        kills: this.client.gsi?.player?.kills ?? null,
        deaths: this.client.gsi?.player?.deaths ?? null,
        assists: this.client.gsi?.player?.assists ?? null,
      },
      radiant_score: this.client.gsi?.map?.radiant_score ?? null,
      dire_score: this.client.gsi?.map?.dire_score ?? null,
    }
    const won = myTeam === localWinner
    logger.info('[BETS] end bets won data', {
      playingMatchId: this.playingBetMatchId,
      localWinner,
      myTeam,
      won,
      channel: this.getChannel(),
    })

    // Both or one undefined
    if (!myTeam) {
      logger.error('[BETS] trying to end bets but did not find localWinner or myTeam', {
        channel: this.getChannel(),
        matchId,
      })
      return
    }

    logger.info('[BETS] Running end bets to award mmr and close predictions', {
      name: this.getChannel(),
      matchId,
    })

    const channel = this.getChannel()
    this.endingBets = true

    if (
      !this.client.gsi?.map?.dire_score &&
      !this.client.gsi?.map?.radiant_score &&
      this.client.gsi?.map?.matchid
    ) {
      logger.info('This is likely a no stats recorded match', {
        name: this.getChannel(),
        matchId,
      })

      if (this.client.stream_online) {
        const tellChatBets = getValueOrDefault(DBSettings.tellChatBets, this.client.settings)
        const chattersEnabled = getValueOrDefault(DBSettings.chatter, this.client.settings)
        if (chattersEnabled && tellChatBets) {
          this.say(t('bets.notScored', { emote: 'D:', lng: this.client.locale, matchId }))
        }
        refundTwitchBet(this.getChannelId())
          .then(() => {
            //
          })
          .catch((e) => {
            logger.error('ERROR refunding bets', { token: this.getToken(), e })
          })
      }
      this.resetClientState()
      return
    }

    // Default ranked
    const localLobbyType = typeof this.playingLobbyType !== 'number' ? 7 : this.playingLobbyType
    const isParty = getValueOrDefault(DBSettings.onlyParty, this.client.settings)

    server.io
      .in(this.getToken())
      .fetchSockets()
      .then((sockets: any) => {
        if (sockets.length === 0) {
          this.updateMMR({
            scores: scores,
            increase: won,
            lobbyType: localLobbyType,
            matchId: matchId,
            isParty: isParty,
            heroSlot,
            heroName,
          })
          return
        }

        sockets[0]
          .timeout(25000)
          .emit(
            'requestMatchData',
            { matchId, heroSlot },
            (err: any, response?: { isParty: boolean; matchId: number; isPrivate: boolean }) => {
              if (err || !response) {
                this.updateMMR({
                  scores: scores,
                  increase: won,
                  lobbyType: localLobbyType,
                  matchId: matchId,
                  isParty: isParty,
                  heroSlot,
                  heroName,
                })
                return
              }

              const foundParty = typeof response.isParty === 'boolean' ? response.isParty : isParty
              void redisClient.client.set(
                `${this.getToken()}:isPrivate`,
                response.isPrivate ? 1 : 0,
              )

              this.updateMMR({
                scores: scores,
                increase: won,
                lobbyType: localLobbyType,
                matchId: matchId,
                isParty: foundParty,
                heroSlot,
                heroName,
              })

              logger.info('Found match data from overlay', {
                matchId,
                foundParty,
                channel: this.getChannel(),
                response,
                err,
              })
            },
          )
      })
      .catch((e) => {
        // dont log errs
        this.updateMMR({
          scores: scores,
          increase: won,
          lobbyType: localLobbyType,
          matchId: matchId,
          isParty: isParty,
          heroSlot,
          heroName,
        })
      })

    getRankDetail(this.getMmr(), this.getSteam32())
      .then((response) => {
        if (!this.getSteam32() || !response || !('standing' in response)) return

        prisma.steamAccount
          .update({
            where: {
              steam32Id: this.getSteam32() ?? undefined,
            },
            data: {
              leaderboard_rank: response.standing,
            },
          })
          .catch((e) => {
            logger.error('Error updating leaderboard rank', { e })
          })
      })
      .catch((e) => {
        // nothing to do here, user probably doesn't have a rank
      })

    const TreadToggleData = this.treadsData
    const toggleHandler = async () => {
      const treadToggleData = (await redisClient.client.json.get(
        `${this.getToken()}:treadtoggle`,
      )) as unknown as typeof TreadToggleData | null

      if (treadToggleData?.treadToggles && this.client.stream_online) {
        this.say(
          t('treadToggle', {
            lng: this.client.locale,
            manaCount: treadToggleData.manaSaved,
            count: treadToggleData.treadToggles,
            matchId,
          }),
        )
      }
    }

    void toggleHandler()

    if (!betsEnabled || !this.client.stream_online) {
      logger.info('Bets are not enabled, stopping here', { name: this.getChannel() })
      this.resetClientState()
      return
    }

    setTimeout(() => {
      this.getToken() &&
        closeTwitchBet(won, this.getChannelId())
          .then(() => {
            logger.info('[BETS] end bets', {
              event: 'end_bets',
              matchId,
              name: this.getChannel(),
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
            this.resetClientState()

            const chattersEnabled = getValueOrDefault(DBSettings.chatter, this.client.settings)
            const {
              matchOutcome: { enabled: chatterEnabled },
            } = getValueOrDefault(DBSettings.chatters, this.client.settings)

            if (!chattersEnabled || !chatterEnabled) {
              return
            }

            const message = won
              ? t('bets.won', { lng: this.client.locale, emote: 'Happi' })
              : t('bets.lost', { lng: this.client.locale, emote: 'Happi' })

            this.say(message, { delay: false })
          })
    }, this.getStreamDelay())
  }

  private checkEarlyDCWinner(matchId: string) {
    logger.info('[BETS] Streamer exited the match before it ended with a winner', {
      name: this.getChannel(),
      matchId,
      openingBets: this.openingBets,
      endingBets: this.endingBets,
    })

    // Check with steam to see if the match is over
    axios
      .get(`https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/`, {
        params: { key: process.env.STEAM_WEB_API, match_id: matchId },
      })
      .then((response: { data: any }) => {
        logger.info('Found an early dc match data', { matchId, channel: this.getChannel() })

        let winningTeam: 'radiant' | 'dire' | null = null
        if (typeof response.data?.result?.radiant_win === 'boolean') {
          winningTeam = response.data.result.radiant_win ? 'radiant' : 'dire'
        }

        if (winningTeam === null) {
          logger.info('Early dc match wont be scored bc winner is null', {
            name: this.getChannel(),
          })

          if (this.client.stream_online) {
            const tellChatBets = getValueOrDefault(DBSettings.tellChatBets, this.client.settings)
            const chattersEnabled = getValueOrDefault(DBSettings.chatter, this.client.settings)
            if (chattersEnabled && tellChatBets) {
              this.say(t('bets.notScored', { emote: 'D:', lng: this.client.locale, matchId }))
            }
            refundTwitchBet(this.getChannelId())
              .then(() => {
                //
              })
              .catch((e: any) => {
                logger.error('ERROR refunding bets', { token: this.getToken(), e })
              })
          }
          this.resetClientState()
          return
        }

        this.closeBets(winningTeam)
      })
      .catch((err) => {
        // this could mean match is not over yet. just give up checking after this long (like 3m)
        // resetting vars will mean it will just grab it again on match load
        logger.error('Early dc match didnt have data in it, match still going on?', {
          channel: this.getChannel(),
          matchId,
          e: err?.message || err?.result || err?.data || err,
        })

        this.resetClientState()
      })
  }

  private emitBlockEvent({ blockType, state }: { state?: string; blockType: string | null }) {
    if (this.blockCache === blockType) return

    this.blockCache = blockType

    server.io.to(this.getToken()).emit('block', {
      type: blockType,
      state,
      team: this.client.gsi?.player?.team_name,
      matchId: this.client.gsi?.map?.matchid ?? this.playingBetMatchId,
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
  setupOBSBlockers(state?: string) {
    if (isSpectator(this.client.gsi) || isArcade(this.client.gsi)) {
      const blockType = isSpectator(this.client.gsi) ? 'spectator' : 'arcade'
      if (this.blockCache === blockType) return

      this.emitBadgeUpdate()
      this.emitWLUpdate()
      this.emitBlockEvent({ state, blockType })

      if (blockType === 'spectator') {
        this.emitNotablePlayers()
      }
      return
    }

    // TODO: if the game is matchid 0 also dont show these? ie bot match. hero demo are type 'arcade'

    const heroName = this.client.gsi?.hero?.name
    const heroPicked = this.client.gsi?.hero?.id && this.client.gsi.hero.id > 0
    const heroLockedIn = heroName && heroName.startsWith('npc_')
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
    const hasValidBlocker = blockTypes.some((blocker) => {
      if (blocker.states.includes(state ?? '')) {
        if (this.blockCache !== blocker.type) {
          this.emitBlockEvent({ state, blockType: blocker.type })

          if (blocker.type === 'playing') {
            this.emitBadgeUpdate()
            this.emitWLUpdate()
            void this.maybeSendRoshAegisEvent()
          }
        }

        return true
      }
      return false
    })

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
        name: this.getChannel(),
      })

      this.emitBlockEvent({ state, blockType: null })
      this.closeBets()
      return
    }
  }

  private async maybeSendRoshAegisEvent() {
    const aegisRes = (await redisClient.client.json.get(
      `${this.getToken()}:aegis`,
    )) as unknown as AegisRes | null
    const roshRes = (await redisClient.client.json.get(
      `${this.getToken()}:roshan`,
    )) as unknown as RoshRes | null

    if (aegisRes) {
      emitAegisEvent(aegisRes, this.getToken())
    }

    if (roshRes) {
      emitRoshEvent(roshRes, this.getToken())
    }
  }
}
