import { delayedGames } from '@dotabod/prisma/dist/mongo'
import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { getWL } from '../db/getWL.js'
import { prisma } from '../db/prisma.js'
import RedisClient from '../db/redis.js'
import { mongoClient } from '../steam/index.js'
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
import { DataBroadcaster, sendInitialData } from './events/minimap/DataBroadcaster.js'
import minimapParser from './events/minimap/parser.js'
import { server } from './index.js'
import { blockTypes, DelayedCommands, GLOBAL_DELAY, pickSates } from './lib/consts.js'
import { getAccountsFromMatch } from './lib/getAccountsFromMatch.js'
import { getCurrentMatchPlayers } from './lib/getCurrentMatchPlayers.js'
import getHero, { HeroNames } from './lib/getHero.js'
import { isArcade } from './lib/isArcade.js'
import { isSpectator } from './lib/isSpectator.js'
import { getRankDetail } from './lib/ranks.js'
import { updateMmr } from './lib/updateMmr.js'

export const redisClient = RedisClient.getInstance()

// Finally, we have a user and a GSI client
interface MMR {
  scores: {
    radiant_score: number | null
    dire_score: number | null
    kda: any
  }
  increase: boolean
  lobbyType: number
  betsForMatchId: string
  isParty?: boolean
  heroSlot?: number | null
  heroName?: string | null
}

function getStreamDelay(settings: SocketClient['settings']) {
  return Number(getValueOrDefault(DBSettings.streamDelay, settings)) + GLOBAL_DELAY
}

export function emitMinimapBlockerStatus(client: SocketClient) {
  if (!client.stream_online || !client.beta_tester || !client.gsi) return

  const enabled = getValueOrDefault(DBSettings['minimap-blocker'], client.settings)
  if (!enabled) return

  const parsedData = minimapParser.parse(client.gsi)
  sendInitialData(client.token)
  server.io.to(client.token).emit('STATUS', parsedData.status)
}

export function say(
  client: SocketClient,
  message: string,
  { delay = true, beta = false }: { delay?: boolean; beta?: boolean } = {},
) {
  if (beta && !client.beta_tester) return

  const msg = beta ? `${message} ${t('betaFeature', { lng: client.locale })}` : message
  if (!delay) {
    chatClient.say(client.name, msg)
    return
  }

  setTimeout(() => {
    client.name && chatClient.say(client.name, msg)
  }, getStreamDelay(client.settings))
}

// That means the user opened OBS and connected to Dota 2 GSI
export class GSIHandler {
  client: SocketClient

  // Server could reboot and lose these in memory
  // But that's okay they will get reset based on current match state
  blockCache: string | null = null
  playingBetMatchId: string | undefined | null = null
  playingTeam: 'radiant' | 'dire' | 'spectator' | undefined | null = null
  events: DotaEvent[] = []
  bountyHeroNames: string[] = []
  noTpChatter: {
    timeout?: NodeJS.Timeout
    lastRemindedDate?: Date
  } = {}
  bountyTimeout?: NodeJS.Timeout
  killstreakTimeout?: NodeJS.Timeout

  endingBets = false
  openingBets = false
  creatingSteamAccount = false
  treadsData = { treadToggles: 0, manaSaved: 0, manaAtLastToggle: 0 }
  disabled = false

  mapBlocker: DataBroadcaster

  constructor(dotaClient: SocketClient) {
    this.client = dotaClient
    this.mapBlocker = new DataBroadcaster(this.client.token)

    const isBotDisabled = getValueOrDefault(DBSettings.commandDisable, this.client.settings)
    if (isBotDisabled) {
      logger.info('[GSI] Bot is disabled for this user', { name: this.client.name })
      this.disable()
      return
    }

    if (!this.client.stream_online) {
      this.disable()
      return
    }

    this.emitBadgeUpdate()
    this.emitWLUpdate()
  }

  public enable() {
    this.disabled = false
    chatClient.join(this.client.name)
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
  }

  private resetBetData() {
    // Bet stuff should be closed by endBets()
    // This should mean an entire match is over
    this.endingBets = false
    this.openingBets = false
    this.playingTeam = null
  }

  private resetNoTpChatter() {
    this.noTpChatter = {
      timeout: undefined,
      lastRemindedDate: undefined,
    }
  }

  private async deleteRedisData() {
    const steam32 = this.getSteam32() ?? ''
    const { token, gsi } = this.client

    const keysToDelete = [
      `${token}:passiveMidas`,
      `${steam32}:medal`,
      `${token}:roshan`,
      `${token}:aegis`,
      `${token}:treadtoggle`,
      `${token}:heroRecords`,
      `${token}:playingHero`,
      `${token}:playingHeroSlot`,
    ]

    const multi = redisClient.client.multi()
    keysToDelete.forEach((key) => multi.json.del(key))

    try {
      await multi.exec()
    } catch (e) {
      logger.error('err deleteRedisData', { e })
    }
  }

  private emitClientResetEvents() {
    server.io.to(this.client.token).emit('aegis-picked-up', {})
    server.io.to(this.client.token).emit('roshan-killed', {})
  }

  public async resetClientState() {
    await this.deleteRedisData()
    this.mapBlocker.resetData()
    this.resetPlayerData()
    this.resetBetData()
    this.resetNoTpChatter()
    this.emitClientResetEvents()
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
        server.io.to(this.client.token).emit('update-wl', record)
      })
      .catch((e) => {
        // Stream not live
        // console.error('[MMR] emitWLUpdate Error getting WL', {e: e?.message || e})
      })
  }
  async emitNotablePlayers() {
    if (!this.client.stream_online) return

    const { matchPlayers } = await getAccountsFromMatch(this.client.gsi)

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
          server.io.to(this.client.token).emit('notable-players', response.playerList)

          setTimeout(() => {
            server.io.to(this.client.token).emit('notable-players', null)
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
        server.io.to(this.client.token).emit('update-medal', deets)
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

    logger.info('[STEAM32ID] Running steam account lookup to db', { name: this.client.name })

    this.creatingSteamAccount = true
    // Get mmr from database for this steamid
    prisma.steamAccount
      .findFirst({ where: { steam32Id } })
      .then(async (res) => {
        // not found, need to make
        if (!res?.id) {
          logger.info('[STEAM32ID] Adding steam32Id', { name: this.client.name })
          await prisma.steamAccount.create({
            data: {
              mmr,
              steam32Id,
              userId: this.client.token,
              name: this.client.gsi?.player?.name,
            },
          })
          await prisma.user.update({ where: { id: this.client.token }, data: { mmr: 0 } })
          // Logged into a new account (smurfs vs mains)
          this.client.mmr = mmr
          this.client.steam32Id = steam32Id
          this.client.multiAccount = undefined
          this.emitBadgeUpdate()
        } else {
          if (res.userId === this.client.token) {
            this.client.mmr = res.mmr
            this.client.steam32Id = steam32Id
          } else {
            // This means its currently being used by another account
            logger.info('Found multi-account', { name: this.client.name })
            this.client.multiAccount = steam32Id
            // remove duplicates from userIds
            const userIds = [...res.connectedUserIds, this.client.token].filter(
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

  updateMMR({ scores, increase, heroName, lobbyType, betsForMatchId, isParty, heroSlot }: MMR) {
    const ranked = lobbyType === 7

    const extraInfo = {
      name: this.client.name,
      steam32Id: this.client.steam32Id,
      betsForMatchId,
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
            betsForMatchId,
            userId: this.client.token,
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
          betsForMatchId,
          isParty,
          increase,
          lobbyType,
        })
      })

    if (!ranked) {
      logger.info('[MMR] Not ranked game, wont update mmr', extraInfo)
      return
    }

    const mmrSize = isParty ? 20 : 25
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
  async openBets() {
    if (this.openingBets) {
      return
    }

    const betsForMatchId = await redisClient.client.get(`${this.client.token}:betsForMatchId`)

    if (
      !!betsForMatchId &&
      !!this.client.gsi?.map?.matchid &&
      betsForMatchId !== this.client.gsi.map.matchid
    ) {
      // We have the wrong matchid, reset vars and start over
      logger.info('[BETS] openBets resetClientState because stuck on old match id', {
        name: this.client.name,
        playingMatchId: betsForMatchId,
        betsForMatchId: this.client.gsi.map.matchid,
        steam32Id: this.getSteam32(),
        steamFromGSI: this.client.gsi.player?.steamid,
        token: this.client.token,
      })
      await this.resetClientState()
    }

    // The bet was already made
    if (betsForMatchId !== null) {
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
      name: this.client.name,
      playingMatchId: betsForMatchId,
      betsForMatchId: this.client.gsi.map.matchid,
      hero: this.client.gsi.hero.name,
    })

    const channel = this.client.name
    const betsForMatchId = this.client.gsi.map.matchid

    this.openingBets = true

    // Check if this bet for this match id already exists, dont continue if it does
    prisma.bet
      .findFirst({
        select: {
          id: true,
          myTeam: true,
          betsForMatchId: true,
        },
        where: {
          userId: this.client.token,
          betsForMatchId,
          won: null,
        },
      })
      .then(async (bet) => {
        // Saving to local memory so we don't have to query the db again
        await redisClient.client.set(`${this.client.token}:betsForMatchId`, betsForMatchId)

        if (bet?.id) {
          logger.info('[BETS] Found a bet in the database', { id: bet.id })
          this.playingTeam = bet.myTeam as Player['team_name']
          this.openingBets = false
          return
        }

        this.playingTeam = this.client.gsi?.player?.team_name ?? null

        redisClient.client
          .set(`${this.client.token}:playingHero`, this.client.gsi?.hero?.name as string)
          .catch((e) => logger.error('[REDIS ERROR]', { e: e?.message || e }))

        prisma.bet
          .create({
            data: {
              predictionId: betsForMatchId,
              betsForMatchId,
              userId: this.client.token,
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
              this.client.token &&
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
                      say(
                        this.client,
                        t('bets.open', { emote: 'peepoGamble', lng: this.client.locale }),
                        {
                          delay: false,
                        },
                      )
                    }
                    this.openingBets = false
                    logger.info('[BETS] open bets', {
                      event: 'open_bets',
                      betsForMatchId,
                      user: this.client.token,
                      player_team: this.client.gsi?.player?.team_name,
                    })
                  })
                  .catch((e: any) => {
                    try {
                      // "message\": \"Invalid refresh token\"\n}" means they have to logout and login
                      if (JSON.parse(e?.body)?.message?.includes('refresh token')) {
                        say(
                          this.client,
                          t('bets.error', {
                            channel: `@${this.client.name}`,
                            lng: this.client.locale,
                          }),
                          {
                            delay: false,
                          },
                        )

                        logger.error(
                          '[TWITCHSETUP] Failed to refresh twitch tokens in gsi handler',
                          {
                            twitchId: this.getChannelId(),
                          },
                        )

                        prisma.account
                          .update({
                            where: {
                              provider_providerAccountId: {
                                provider: 'twitch',
                                providerAccountId: this.getChannelId(),
                              },
                            },
                            data: {
                              requires_refresh: true,
                            },
                          })
                          .then(() => {
                            //
                          })
                          .catch((e) => {
                            //
                          })
                      }
                    } catch (e) {
                      // only interested in refresh token err
                    }

                    logger.error('[BETS] Error opening twitch bet', {
                      channel,
                      e: e?.message || e,
                      betsForMatchId,
                    })

                    this.openingBets = false
                  })
            }, getStreamDelay(this.client.settings))
          })
          .catch((e: any) => {
            logger.error(`[BETS] Could not add bet to channel`, {
              channel: this.client.name,
              e: e?.message || e,
            })
            this.openingBets = false
          })
      })
      .catch((e: any) => {
        logger.error('[BETS] Error opening bet', {
          betsForMatchId,
          channel,
          e: e?.message || e,
        })
        if ((e?.message || e).includes('error')) this.openingBets = false
      })
  }

  async closeBets(winningTeam: 'radiant' | 'dire' | null = null) {
    const betsForMatchId = await redisClient.client.get(`${this.client.token}:betsForMatchId`)

    if (this.openingBets || !betsForMatchId || this.endingBets) {
      logger.info('[BETS] Not closing bets', {
        name: this.client.name,
        openingBets: this.openingBets,
        playingMatchId: betsForMatchId,
        endingBets: this.endingBets,
      })

      if (!betsForMatchId) await this.resetClientState()
      return
    }

    const betsEnabled = getValueOrDefault(DBSettings.bets, this.client.settings)
    const heroSlot = Number(await redisClient.client.get(`${this.client.token}:playingHeroSlot`))
    const heroName = (await redisClient.client.get(
      `${this.client.token}:playingHero`,
    )) as HeroNames | null

    // An early without waiting for ancient to blow up
    // We have to check every few seconds with an pi to see if the match is over
    if (!winningTeam) {
      this.checkEarlyDCWinner(betsForMatchId)
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
      playingMatchId: betsForMatchId,
      localWinner,
      myTeam,
      won,
      channel: this.client.name,
    })

    // Both or one undefined
    if (!myTeam) {
      logger.error('[BETS] trying to end bets but did not find localWinner or myTeam', {
        channel: this.client.name,
        betsForMatchId,
      })
      return
    }

    logger.info('[BETS] Running end bets to award mmr and close predictions', {
      name: this.client.name,
      betsForMatchId,
    })

    const channel = this.client.name
    this.endingBets = true

    if (
      !this.client.gsi?.map?.dire_score &&
      !this.client.gsi?.map?.radiant_score &&
      this.client.gsi?.map?.matchid
    ) {
      logger.info('This is likely a no stats recorded match', {
        name: this.client.name,
        betsForMatchId,
      })

      if (this.client.stream_online) {
        const tellChatBets = getValueOrDefault(DBSettings.tellChatBets, this.client.settings)
        const chattersEnabled = getValueOrDefault(DBSettings.chatter, this.client.settings)
        if (chattersEnabled && tellChatBets) {
          say(
            this.client,
            t('bets.notScored', { emote: 'D:', lng: this.client.locale, betsForMatchId }),
          )
        }
        refundTwitchBet(this.getChannelId())
          .then(() => {
            //
          })
          .catch((e) => {
            logger.error('ERROR refunding bets', { token: this.client.token, e })
          })
      }
      await this.resetClientState()
      return
    }

    // Default to ranked
    const playingLobbyType = Number(await redisClient.client.get(`${betsForMatchId}:lobbyType`))
    const localLobbyType = playingLobbyType > 0 ? playingLobbyType : 7

    const isParty = getValueOrDefault(DBSettings.onlyParty, this.client.settings)

    this.updateMMR({
      scores: scores,
      increase: won,
      lobbyType: localLobbyType,
      betsForMatchId: betsForMatchId,
      isParty: isParty,
      heroSlot,
      heroName,
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
        `${this.client.token}:treadtoggle`,
      )) as unknown as typeof TreadToggleData | null

      if (treadToggleData?.treadToggles && this.client.stream_online) {
        say(
          this.client,
          t('treadToggle', {
            lng: this.client.locale,
            manaCount: treadToggleData.manaSaved,
            count: treadToggleData.treadToggles,
            betsForMatchId,
          }),
        )
      }
    }

    try {
      void toggleHandler()
    } catch (e) {
      logger.error('err toggleHandler', { e })
    }

    if (!betsEnabled || !this.client.stream_online) {
      logger.info('Bets are not enabled, stopping here', { name: this.client.name })
      await this.resetClientState()
      return
    }

    setTimeout(() => {
      this.client.token &&
        closeTwitchBet(won, this.getChannelId())
          .then(() => {
            logger.info('[BETS] end bets', {
              event: 'end_bets',
              betsForMatchId,
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
              betsForMatchId,
            })
          })
          .finally(() => {
            this.resetClientState().catch((e) => {
              logger.error('Error resetting client state', { e })
            })

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

            say(this.client, message, { delay: false })
          })
    }, getStreamDelay(this.client.settings))
  }

  private checkEarlyDCWinner(betsForMatchId: string) {
    logger.info('[BETS] Streamer exited the match before it ended with a winner', {
      name: this.client.name,
      betsForMatchId,
      openingBets: this.openingBets,
      endingBets: this.endingBets,
    })

    // Check with steam to see if the match is over
    axios
      .get(`https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/`, {
        params: { key: process.env.STEAM_WEB_API, match_id: betsForMatchId },
      })
      .then(async (response: { data: any }) => {
        logger.info('Found an early dc match data', { betsForMatchId, channel: this.client.name })

        let winningTeam: 'radiant' | 'dire' | null = null
        if (typeof response.data?.result?.radiant_win === 'boolean') {
          winningTeam = response.data.result.radiant_win ? 'radiant' : 'dire'
        }

        if (winningTeam === null) {
          logger.info('Early dc match wont be scored bc winner is null', {
            name: this.client.name,
          })

          if (this.client.stream_online) {
            const tellChatBets = getValueOrDefault(DBSettings.tellChatBets, this.client.settings)
            const chattersEnabled = getValueOrDefault(DBSettings.chatter, this.client.settings)
            if (chattersEnabled && tellChatBets) {
              say(
                this.client,
                t('bets.notScored', { emote: 'D:', lng: this.client.locale, betsForMatchId }),
              )
            }
            refundTwitchBet(this.getChannelId())
              .then(() => {
                //
              })
              .catch((e: any) => {
                logger.error('ERROR refunding bets', { token: this.client.token, e })
              })
          }
          await this.resetClientState()
          return
        }

        await this.closeBets(winningTeam)
      })
      .catch((err) => {
        // this could mean match is not over yet. just give up checking after this long (like 3m)
        // resetting vars will mean it will just grab it again on match load
        logger.error('Early dc match didnt have data in it, match still going on?', {
          channel: this.client.name,
          betsForMatchId,
          e: err?.message || err?.result || err?.data || err,
        })

        this.resetClientState().catch((e) => {
          logger.error('Error resetting client state', { e })
        })
      })
  }

  private emitBlockEvent({ blockType, state }: { state?: string; blockType: string | null }) {
    if (this.blockCache === blockType) return

    this.blockCache = blockType

    server.io.to(this.client.token).emit('block', {
      type: blockType,
      state,
      team: this.client.gsi?.player?.team_name,
      betsForMatchId: this.client.gsi?.map?.matchid,
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
            emitMinimapBlockerStatus(this.client)
            this.emitBadgeUpdate()
            this.emitWLUpdate()
            try {
              void this.maybeSendRoshAegisEvent()
            } catch (e) {
              logger.error('err maybeSendRoshAegisEvent', { e })
            }
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
        name: this.client.name,
      })

      this.emitBlockEvent({ state, blockType: null })
      await this.closeBets()
      return
    }
  }

  private async maybeSendRoshAegisEvent() {
    const aegisRes = (await redisClient.client.json.get(
      `${this.client.token}:aegis`,
    )) as unknown as AegisRes | null
    const roshRes = (await redisClient.client.json.get(
      `${this.client.token}:roshan`,
    )) as unknown as RoshRes | null

    if (aegisRes) {
      emitAegisEvent(aegisRes, this.client.token)
    }

    if (roshRes) {
      emitRoshEvent(roshRes, this.client.token)
    }
  }
}
