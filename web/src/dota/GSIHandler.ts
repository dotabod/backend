import { t } from 'i18next'

import { delayedGames } from '../../prisma/generated/mongoclient/index.js'
import { getWL } from '../db/getWL.js'
import { prisma } from '../db/prisma.js'
import { DBSettings, getValueOrDefault } from '../db/settings.js'
import Mongo from '../steam/mongo.js'
import { chatClient } from '../twitch/index.js'
import { closeTwitchBet } from '../twitch/lib/closeTwitchBet.js'
import { disabledBets, openTwitchBet } from '../twitch/lib/openTwitchBet.js'
import { DotaEvent, Player, SocketClient } from '../types.js'
import axios from '../utils/axios.js'
import { steamID64toSteamID32 } from '../utils/index.js'
import { logger } from '../utils/logger.js'
import { events } from './globalEventEmitter.js'
import { server } from './index.js'
import { blockTypes, GLOBAL_DELAY, pickSates } from './lib/consts.js'
import { getAccountsFromMatch } from './lib/getAccountsFromMatch.js'
import getHero, { HeroNames } from './lib/getHero.js'
import { isArcade } from './lib/isArcade.js'
import { isSpectator } from './lib/isSpectator.js'
import { getRankDetail } from './lib/ranks.js'
import { updateMmr } from './lib/updateMmr.js'

const mongo = await Mongo.connect()

export const blockCache = new Map<string, string>()

// Finally, we have a user and a GSI client
// That means the user opened OBS and connected to Dota 2 GSI
export class GSIHandler {
  client: SocketClient

  // Server could reboot and lose these in memory
  // But that's okay they will get reset based on current match state
  aegisPickedUp?: { playerId: number; expireTime: string; expireDate: Date }
  playingMatchId: string | undefined | null = null
  playingTeam: 'radiant' | 'dire' | 'spectator' | undefined | null = null
  playingHeroSlot: number | undefined | null = null
  playingHero: HeroNames | undefined | null = null
  playingLobbyType: number | undefined | null = null
  manaSaved = 0
  treadToggles = 0
  players: ReturnType<typeof getAccountsFromMatch> | undefined | null = null
  savingSteamServerId = false
  steamServerTries = 0
  events: DotaEvent[] = []
  passiveMidas = { counter: 0, timer: 0, used: 0 }
  roshanKilled?: {
    minTime: string
    maxTime: string
    minDate: Date
    maxDate: Date
  }
  endingBets = false
  openingBets = false
  creatingSteamAccount = false
  treadsData = { manaAtLastToggle: 0, timeOfLastToggle: 0 }

  constructor(dotaClient: SocketClient) {
    this.client = dotaClient

    // Check if bot is disabled and dont run event handler
    const isBotDisabled = getValueOrDefault(DBSettings.commandDisable, this.client.settings)
    if (isBotDisabled) {
      logger.info('[GSI] Bot is disabled for this user', { name: this.client.name })
      return
    }
  }

  public async enable() {
    // run events
    await chatClient.join(this.client.name)
  }

  public disable() {
    // stop events
    chatClient.part(this.client.name)
  }

  public unset() {
    // Clear any timers etc before destroying this class
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

  public say(
    message: string,
    { delay = true, beta = false }: { delay?: boolean; beta?: boolean } = {},
  ) {
    if (beta && !this.client.beta_tester) return

    const msg = beta ? `${message} ${t('betaFeature', { lng: this.client.locale })}` : message
    if (!delay) {
      void chatClient.say(this.getChannel(), msg)
      return
    }

    setTimeout(() => {
      void chatClient.say(this.getChannel(), msg)
    }, GLOBAL_DELAY)
  }

  // reset vars when a new match begins
  public resetClientState(resetBets = false) {
    logger.info('newMatchNewVars', {
      resetBets,
      name: this.client.name,
      matchid: this.playingMatchId,
    })
    this.playingHero = null
    this.playingHeroSlot = null
    this.events = []
    this.passiveMidas = { counter: 0, timer: 0, used: 0 }
    this.savingSteamServerId = false
    this.steamServerTries = 0

    // Bet stuff should be closed by endBets()
    // This should mean an entire match is over
    if (resetBets) {
      this.client.steamserverid = undefined
      this.endingBets = false
      this.openingBets = false
      this.playingMatchId = null
      this.playingTeam = null
      this.manaSaved = 0
      this.treadToggles = 0

      this.roshanKilled = undefined
      this.aegisPickedUp = undefined

      server.io.to(this.getToken()).emit('aegis-picked-up', {})
      server.io.to(this.getToken()).emit('roshan-killed', {})
    }
  }

  // Runs every gametick
  async saveMatchData() {
    // Not gonna save any when local. Assuming we're just testing in local lobbys
    if (process.env.NODE_ENV === 'development') return

    if (!this.client.steam32Id || !this.client.gsi?.map?.matchid) return
    if (!Number(this.client.gsi.map.matchid)) return
    if (this.client.steamserverid) return
    if (this.savingSteamServerId) return

    this.savingSteamServerId = true
    try {
      // logger.info('Start match data', this.client.name, this.client.gsi.map.matchid)

      const response = (await mongo
        .collection('delayedGames')
        .findOne({ 'match.match_id': this.client.gsi.map.matchid })) as unknown as delayedGames

      if (!response) {
        // logger.info(
        //   'No match data for user, checking from steam',
        //   this.client.name,
        //   this.client.gsi.map.matchid,
        // )

        const steamserverid = (await server.dota.getUserSteamServer(this.client.steam32Id)) as
          | string
          | undefined
        if (!steamserverid) {
          // 35 5s tries
          // that's 3 minutes, should have full hero ids by then...right?
          if (this.steamServerTries > 35) {
            return
          }
          logger.info('Retry steamserverid', {
            tries: this.steamServerTries,
            channel: this.client.name,
            matchid: this.client.gsi.map.matchid,
          })
          setTimeout(() => {
            this.steamServerTries += 1
            this.savingSteamServerId = false
          }, 5000)
          return
        }

        this.client.steamserverid = steamserverid
        this.savingSteamServerId = false

        // Only call once to update our local players variable with hero ids
        events.once(
          `delayedGameHeroes:${this.client.gsi.map.matchid}`,
          (players: ReturnType<typeof getAccountsFromMatch>) => {
            this.players = players
          },
        )

        const delayedData = await server.dota.getDelayedMatchData(steamserverid, true)
        if (!delayedData) {
          logger.info('No match data found!', {
            name: this.client.name,
            matchid: this.client.gsi.map.matchid,
          })
          return
        }

        this.playingLobbyType = delayedData.match.lobby_type
        this.players = getAccountsFromMatch(delayedData)

        if (this.client.stream_online) {
          this.say(
            t('matchFound', {
              commandList: '!np · !smurfs · !gm · !lg · !avg',
              lng: this.client.locale,
            }),
            {
              delay: false,
            },
          )
        }
      } else {
        this.playingLobbyType = response.match.lobby_type
        this.players = getAccountsFromMatch(response)
        logger.info('Match data already found', {
          name: this.client.name,
          matchid: this.client.gsi.map.matchid,
        })
      }
    } catch (e) {
      logger.info('saving match data failed', { name: this.client.name, e })
    }
  }

  emitWLUpdate() {
    if (!this.client.stream_online) return

    getWL(this.getChannelId(), this.client.stream_start_date)
      .then(({ record }) => {
        logger.info('[STEAM32ID] Emitting WL overlay update', {
          name: this.getChannel(),
        })
        server.io.to(this.getToken()).emit('update-wl', record)
      })
      .catch((e) => {
        // Stream not live
        // console.error('[MMR] emitWLUpdate Error getting WL', {e: e?.message || e})
      })
  }

  emitBadgeUpdate() {
    getRankDetail(this.getMmr(), this.getSteam32())
      .then((deets) => {
        logger.info('[STEAM32ID] Emitting badge overlay update', {
          name: this.getChannel(),
        })
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

    // It's the same user, no need to create a new act
    if (this.getSteam32() === steam32Id) return

    // User already has a steam32Id and its saved to the `steam_accounts` table
    const foundAct = this.client.SteamAccount.find((act) => act.steam32Id === steam32Id)
    // Logged into a new account (smurfs vs mains)
    if (foundAct) {
      this.client.mmr = foundAct.mmr
      this.client.steam32Id = steam32Id
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
          this.emitBadgeUpdate()
        } else {
          // We should never arrive here
          logger.info('ERROR We should never be here', { name: this.getChannel() })
          this.client.mmr = res.mmr
          this.client.steam32Id = steam32Id
        }

        this.creatingSteamAccount = false
      })
      .catch((e) => {
        this.creatingSteamAccount = false
        logger.info('[DATABASE ERROR]', { e: e?.message || e })
      })
  }

  updateMMR(
    increase: boolean,
    lobbyType: number,
    matchId: string,
    isParty?: boolean,
    heroSlot?: number | null,
  ) {
    const ranked = lobbyType === 7

    // This also updates WL for the unranked matches
    prisma.bet
      .update({
        where: {
          matchId_userId: {
            matchId: matchId,
            userId: this.getToken(),
          },
        },
        data: {
          won: increase,
          lobby_type: lobbyType,
          hero_slot: heroSlot,
          is_party: isParty,
        },
      })
      .then(() => {
        //
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

    this.emitWLUpdate()

    if (!ranked) {
      return
    }

    const mmrSize = isParty ? 20 : 30
    const newMMR = this.getMmr() + (increase ? mmrSize : -mmrSize)
    if (this.client.steam32Id) {
      updateMmr(newMMR, this.client.steam32Id, this.client.name)
    }
  }

  // TODO: CRON Job
  // 1 Find bets that are open and don't equal this match id and close them
  // 2 Next, check if the prediction is still open
  // 3 If it is, steam dota2 api result of match
  // 4 Then, tell twitch to close bets based on win result
  openBets() {
    if (
      !!this.playingMatchId &&
      !!this.client.gsi?.map?.matchid &&
      this.playingMatchId !== this.client.gsi.map.matchid
    ) {
      // We have the wrong matchid, reset vars and start over
      logger.info('openBets resetClientState because stuck on old match id', {
        name: this.getChannel(),
        playingMatchId: this.playingMatchId,
        matchid: this.client.gsi.map.matchid,
      })
      this.resetClientState(true)
    }

    // The bet was already made
    if (this.playingMatchId !== null) return
    if (this.openingBets) return

    // Why open if not playing?
    if (this.client.gsi?.player?.activity !== 'playing') return

    // Why open if won?
    if (this.client.gsi.map?.win_team !== 'none') return

    // We at least want the hero name so it can go in the twitch bet title
    if (!this.client.gsi.hero?.name || !this.client.gsi.hero.name.length) return

    this.openingBets = true
    const channel = this.getChannel()

    // It's not a live game, so we don't want to open bets nor save it to DB
    if (!this.client.gsi.map.matchid || this.client.gsi.map.matchid === '0') return

    const matchId = this.client.gsi.map.matchid

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
          matchId: matchId,
          won: null,
        },
      })
      .then((bet) => {
        // Saving to local memory so we don't have to query the db again
        if (bet?.id) {
          logger.info('[BETS] Found a bet in the database', { id: bet.id })
          this.playingMatchId = bet.matchId
          this.playingTeam = bet.myTeam as Player['team_name']
          this.openingBets = false
          return
        }

        this.playingMatchId = matchId
        this.playingTeam = this.client.gsi?.player?.team_name ?? null

        prisma.bet
          .create({
            data: {
              predictionId: matchId,
              matchId: matchId,
              userId: this.getToken(),
              myTeam: this.client.gsi?.player?.team_name ?? '',
              steam32Id: this.getSteam32(),
            },
          })
          .then(() => {
            const betsEnabled = getValueOrDefault(DBSettings.bets, this.client.settings)
            if (!betsEnabled) {
              this.openingBets = false
              return
            }

            if (!this.client.stream_online) {
              logger.info('[BETS] Not opening bets bc stream is offline for', {
                name: this.client.name,
              })
              this.openingBets = false
              return
            }

            const hero = getHero(this.client.gsi?.hero?.name)

            setTimeout(() => {
              openTwitchBet(
                this.client.locale,
                this.getToken(),
                hero?.localized_name,
                this.client.settings,
              )
                .then(() => {
                  this.say(t('bets.open', { lng: this.client.locale }), { delay: false })
                  this.openingBets = false
                  logger.info('[BETS] open bets', {
                    event: 'open_bets',
                    data: {
                      matchId: matchId,
                      user: this.getToken(),
                      player_team: this.client.gsi?.player?.team_name,
                    },
                  })
                })
                .catch((e: any) => {
                  if (disabledBets.has(this.getToken())) {
                    // disable the bet in settings for this user
                    prisma.setting
                      .upsert({
                        where: {
                          key_userId: {
                            key: DBSettings.bets,
                            userId: this.getToken(),
                          },
                        },
                        create: {
                          userId: this.getToken(),
                          key: DBSettings.bets,
                          value: false,
                        },
                        update: {
                          value: false,
                        },
                      })
                      .then((r) => {
                        disabledBets.delete(this.getToken())
                        logger.info('[BETS] Disabled bets for user', {
                          channel,
                        })
                        this.openingBets = false
                      })
                      .catch((e) => {
                        logger.info('[BETS] Error disabling bets', { e: e?.message || e })
                        this.openingBets = false
                      })
                  } else {
                    logger.info('[BETS] Error opening twitch bet', { channel, e: e?.message || e })
                    this.openingBets = false
                  }
                })
            }, GLOBAL_DELAY)
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
    if (process.env.NODE_ENV === 'development') {
      this.resetClientState(true)
      return
    }

    if (this.openingBets || !this.playingMatchId || this.endingBets) {
      return
    }

    const matchId = this.playingMatchId
    const betsEnabled = getValueOrDefault(DBSettings.bets, this.client.settings)
    const betsMessage = betsEnabled ? ` ${t('bets.manual', { lng: this.client.locale })} ` : ''

    // An early without waiting for ancient to blow up
    // We have to check every few seconds on Opendota to see if the match is over
    if (!winningTeam) {
      logger.info('[BETS] Streamer exited the match before it ended with a winner', {
        name: this.getChannel(),
        matchId,
        openingBets: this.openingBets,
        endingBets: this.endingBets,
      })

      // Check with opendota to see if the match is over
      axios(`https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/`, {
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
              this.say(`${t('bets.notScored', { lng: this.client.locale, matchId })}${betsMessage}`)
            }
            this.resetClientState(true)
            return
          }

          logger.info('Should be scoring early dc here soon and closing predictions', {
            channel: this.getChannel(),
            winningTeam,
            matchId,
          })
          this.closeBets(winningTeam)
        })
        .catch((e) => {
          try {
            // this could mean match is not over yet. just give up checking after this long (like 3m)
            // resetting vars will mean it will just grab it again on match load
            logger.error('early dc match didnt have data in it, match still going on?', {
              channel: this.getChannel(),
              matchId,
              e: e?.message || e?.result || e?.data || e,
            })

            this.resetClientState(true)
            return
          } catch (e) {
            logger.error(
              'caught an error in axios retry. likely server rebooted and channel was inaccessible',
            )
          }
        })

      return
    }

    const localWinner = winningTeam
    const myTeam = this.playingTeam ?? this.client.gsi?.player?.team_name
    const won = myTeam === localWinner
    logger.info('end bets won data', { localWinner, myTeam, won, channel: this.getChannel() })

    // Both or one undefined
    if (!myTeam) {
      logger.error('trying to end bets but did not find localWinner or myTeam', this.getChannel())
      return
    }

    logger.info('[BETS] Running end bets to award mmr and close predictions', {
      name: this.getChannel(),
      matchid: this.playingMatchId,
    })

    // this was used when endBets() was still in 'newdata' event called every 0.5s
    // TODO: remove endingBets and confirm if needed
    const channel = this.getChannel()
    this.endingBets = true

    // Default ranked
    const localLobbyType = typeof this.playingLobbyType !== 'number' ? 7 : this.playingLobbyType
    const isParty = false // sadge. opendota rate limited us
    this.updateMMR(won, localLobbyType, matchId, isParty, this.playingHeroSlot)

    if (this.treadToggles > 0) {
      this.say(
        t('treadToggle', {
          lng: this.client.locale,
          manaCount: this.manaSaved,
          count: this.treadToggles,
          matchId,
        }),
        {
          beta: true,
        },
      )
    }

    if (!betsEnabled) {
      logger.info('bets are not enabled, stopping here', { name: this.getChannel() })

      this.resetClientState(true)
      return
    }

    if (!this.client.stream_online) {
      logger.info('[BETS] Not closing bets bc stream is offline for', { name: this.client.name })
      this.resetClientState(true)
      return
    }

    setTimeout(() => {
      closeTwitchBet(won, this.getToken())
        .then(() => {
          logger.info('[BETS] end bets', {
            event: 'end_bets',
            data: {
              matchId: matchId,
              name: this.getChannel(),
              winning_team: localWinner,
              player_team: myTeam,
              didWin: won,
            },
          })
        })
        .catch((e: any) => {
          if (disabledBets.has(this.getToken())) {
            // disable the bet in settings for this user
            prisma.setting
              .upsert({
                where: {
                  key_userId: {
                    key: DBSettings.bets,
                    userId: this.getToken(),
                  },
                },
                create: {
                  userId: this.getToken(),
                  key: DBSettings.bets,
                  value: false,
                },
                update: {
                  value: false,
                },
              })
              .then((r) => {
                logger.info('[BETS] Disabled bets for user', {
                  channel,
                })
                disabledBets.delete(this.getToken())
              })
              .catch((e) => {
                logger.info('[BETS] Error disabling bets', { e: e?.message || e })
              })
          } else {
            logger.info('[BETS] Error closing twitch bet', { channel, e: e?.message || e })
          }

          if (won) {
            this.say(t('bets.won', { lng: this.client.locale }), { delay: false })
          } else {
            this.say(t('bets.lost', { lng: this.client.locale }), { delay: false })
          }
        })
        // Always
        .finally(() => {
          this.resetClientState(true)
        })
    }, GLOBAL_DELAY)
  }

  setupOBSBlockers(state?: string) {
    if (isSpectator(this.client.gsi)) {
      if (blockCache.get(this.getToken()) !== 'spectator') {
        this.emitBadgeUpdate()
        this.emitWLUpdate()

        server.io.to(this.getToken()).emit('block', { type: 'spectator' })
        blockCache.set(this.getToken(), 'spectator')
      }

      return
    }

    if (isArcade(this.client.gsi)) {
      if (blockCache.get(this.getToken()) !== 'arcade') {
        this.emitBadgeUpdate()
        this.emitWLUpdate()

        server.io.to(this.getToken()).emit('block', { type: 'arcade' })
        blockCache.set(this.getToken(), 'arcade')
      }

      return
    }

    // TODO: if the game is matchid 0 also dont show these? ie bot match. hero demo are type 'arcade'

    // Edge case:
    // Send strat screen if the player has picked their hero and it's locked in
    // Other players on their team could still be picking
    // -1 is the id of your hero if it gets ban picked when you pick first
    // the id is your hero if you pick last, and strategy screen is shown, but
    // the map state can still be hero selection
    // name is empty if your hero is not locked in
    if ((this.client.gsi?.hero?.id ?? -1) >= 0 && pickSates.includes(state ?? '')) {
      if (blockCache.get(this.getToken()) !== 'strategy') {
        server.io
          .to(this.getToken())
          .emit('block', { type: 'strategy', team: this.client.gsi?.player?.team_name })

        blockCache.set(this.getToken(), 'strategy')
      }

      return
    }

    // Check what needs to be blocked
    const hasValidBlocker = blockTypes.some((blocker) => {
      if (blocker.states.includes(state ?? '')) {
        // Only send if not already what it is
        if (blockCache.get(this.getToken()) !== blocker.type) {
          blockCache.set(this.getToken(), blocker.type)

          // Send the one blocker type
          server.io.to(this.getToken()).emit('block', {
            type: blocker.type,
            team: this.client.gsi?.player?.team_name,
          })

          if (blocker.type === 'playing') {
            this.emitBadgeUpdate()
            this.emitWLUpdate()
          }

          if (this.aegisPickedUp?.expireDate) {
            server.io.to(this.getToken()).emit('aegis-picked-up', this.aegisPickedUp)
          }

          if (this.roshanKilled?.maxDate) {
            server.io.to(this.getToken()).emit('roshan-killed', this.roshanKilled)
          }
        }
        return true
      }

      return false
    })

    // No blocker changes, don't emit any socket message
    if (!hasValidBlocker && !blockCache.has(this.getToken())) {
      return
    }

    // Unblock all, we are disconnected from the match
    if (!hasValidBlocker && blockCache.has(this.getToken())) {
      blockCache.delete(this.getToken())
      server.io.to(this.getToken()).emit('block', { type: null })
      this.closeBets()
      return
    }
  }
}