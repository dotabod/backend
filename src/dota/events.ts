import { getWL } from '../db/getWL.js'
import { prisma } from '../db/prisma.js'
import RedisClient from '../db/redis.js'
import { DBSettings, getValueOrDefault } from '../db/settings.js'
import Mongo from '../steam/mongo.js'
import { chatClient } from '../twitch/commands/index.js'
import { closeTwitchBet } from '../twitch/lib/closeTwitchBet.js'
import { disabledBets, openTwitchBet } from '../twitch/lib/openTwitchBet.js'
import { DotaEvent, DotaEventTypes, Packet, SocketClient } from '../types.js'
import axios from '../utils/axios.js'
import { fmtMSS, steamID64toSteamID32 } from '../utils/index.js'
import { GSIClient } from './GSIClient.js'
import checkMidas from './lib/checkMidas.js'
import { blockTypes, pickSates } from './lib/consts.js'
import getHero from './lib/getHero.js'
import { isArcade } from './lib/isArcade.js'
import { isPlayingMatch } from './lib/isPlayingMatch.js'
import { isSpectator } from './lib/isSpectator.js'
import { getRankDetail } from './lib/ranks.js'
import { updateMmr } from './lib/updateMmr.js'

import { server } from './index.js'

const mongo = Mongo.getInstance()
const { client: redis, subscriber } = RedisClient.getInstance()

// Finally, we have a user and a GSI client
// That means the user opened OBS and connected to Dota 2 GSI
export class setupMainEvents {
  // Server could reboot and lose these in memory
  // But that's okay they will get reset based on current match state
  aegisPickedUp?: { playerId: number; expireTime: string; expireDate: Date }
  betExists: string | undefined | null = null
  betMyTeam: 'radiant' | 'dire' | 'spectator' | undefined | null = null
  blockCache = new Map<string, string>()
  client: SocketClient
  currentHero: string | undefined | null = null
  endingBets = false
  events: DotaEvent[] = []
  gsi: GSIClient
  heroSlot: number | undefined | null = null
  passiveMidas = { counter: 0 }
  roshanKilled?: {
    minTime: string
    maxTime: string
    minDate: Date
    maxDate: Date
  }

  constructor(client: SocketClient) {
    this.gsi = client.gsi!
    this.client = client

    void this.watchEvents()
  }

  private getMmr() {
    return this.client.mmr
  }

  private getToken() {
    return this.client.token
  }

  private getSockets() {
    return this.client.sockets
  }

  private getChannel() {
    return this.client.name
  }

  private getSteam32() {
    return this.client.steam32Id
  }

  private getChannelId(): string {
    return this.client.Account?.providerAccountId ?? ''
  }

  private addSecondsToNow(seconds: number) {
    return new Date(new Date().getTime() + seconds * 1000)
  }

  // reset vars when a new match begins
  private newMatchNewVars(resetBets = false) {
    this.currentHero = null
    this.heroSlot = null
    this.events = []
    this.passiveMidas = { counter: 0 }

    // Bet stuff should be closed by endBets()
    // This should mean an entire match is over
    if (resetBets) {
      this.endingBets = false
      this.betExists = null
      this.betMyTeam = null

      this.roshanKilled = undefined
      this.aegisPickedUp = undefined

      if (this.getSockets().length) {
        server.io.to(this.getSockets()).emit('aegis-picked-up', {})
        server.io.to(this.getSockets()).emit('roshan-killed', {})
      }
    }
  }

  async saveMatchData() {
    if (!this.client.steam32Id || !this.client.gsi?.gamestate?.map?.matchid) return

    try {
      console.log('Start match data', this.client.name, this.client.gsi.gamestate.map.matchid)

      const db = await mongo.db
      let response = await db
        .collection('delayedGames')
        .findOne({ 'match.match_id': this.client.gsi.gamestate.map.matchid })

      if (!response) {
        console.log(
          'No match data for user, checking from steam',
          this.client.name,
          this.client.gsi.gamestate.map.matchid,
        )

        const steamserverid = await server.dota.getUserSteamServer(this.client.steam32Id)
        // @ts-expect-error asdf
        response = await server.dota.getDelayedMatchData(steamserverid)
        if (!response) {
          console.log(
            'No match data found!',
            this.client.name,
            this.client.gsi.gamestate.map.matchid,
          )
          return
        }

        console.log('Saving match data', this.client.name, this.client.gsi.gamestate.map.matchid)

        await db
          .collection('delayedGames')
          .updateOne(
            { matchid: response.match?.match_id },
            { $set: { ...response, createdAt: new Date() } },
            { upsert: true },
          )
      } else {
        console.log(
          'Match data already found',
          this.client.name,
          this.client.gsi.gamestate.map.matchid,
        )
      }
    } catch (e) {
      console.log(e, 'saving match data failed', this.client.name)
    }
  }

  async watchEvents() {
    await subscriber.subscribe(
      `gsievents:${this.getToken()}:${DotaEventTypes.RoshanKilled}`,
      (serialized: string) => {
        const event = JSON.parse(serialized) as DotaEvent
        if (!isPlayingMatch(this.gsi)) return

        // doing map gametime - event gametime in case the user reconnects to a match,
        // and the gametime is over the event gametime
        const gameTimeDiff =
          (this.gsi.gamestate?.map?.game_time ?? event.game_time) - event.game_time

        // min spawn for rosh in 5 + 3 minutes
        const minS = 5 * 60 + 3 * 60 - gameTimeDiff
        const minTime = (this.gsi.gamestate?.map?.clock_time ?? 0) + minS

        // max spawn for rosh in 5 + 3 + 3 minutes
        const maxS = 5 * 60 + 3 * 60 + 3 * 60 - gameTimeDiff
        const maxTime = (this.gsi.gamestate?.map?.clock_time ?? 0) + maxS

        // server time
        const minDate = this.addSecondsToNow(minS)
        const maxDate = this.addSecondsToNow(maxS)

        const res = {
          minS,
          maxS,
          minTime: fmtMSS(minTime),
          maxTime: fmtMSS(maxTime),
          minDate,
          maxDate,
        }

        this.roshanKilled = res
        if (this.getSockets().length) {
          server.io.to(this.getSockets()).emit('roshan-killed', res)
        }
        console.log('[ROSHAN]', 'Roshan killed, setting timer', res, { name: this.getChannel() })
      },
    )

    await subscriber.subscribe(
      `gsievents:${this.getToken()}:${DotaEventTypes.AegisPickedUp}`,
      (serialized: string) => {
        const event = JSON.parse(serialized) as DotaEvent
        if (!isPlayingMatch(this.gsi)) return

        const gameTimeDiff =
          (this.gsi.gamestate?.map?.game_time ?? event.game_time) - event.game_time

        // expire for aegis in 5 minutes
        const expireS = 5 * 60 - gameTimeDiff
        const expireTime = (this.gsi.gamestate?.map?.clock_time ?? 0) + expireS

        // server time
        const expireDate = this.addSecondsToNow(expireS)

        const res = {
          expireS,
          playerId: event.player_id,
          expireTime: fmtMSS(expireTime),
          expireDate,
        }

        this.aegisPickedUp = res

        if (this.getSockets().length) {
          server.io.to(this.getSockets()).emit('aegis-picked-up', res)
        }
        console.log('[ROSHAN]', 'Aegis picked up, setting timer', res, { name: this.getChannel() })
      },
    )

    // Catch all
    await subscriber.subscribe(`gsievents:${this.getToken()}:newdata`, (serialized: string) => {
      const data: Packet = JSON.parse(serialized)

      // New users who dont have a steamaccount saved yet
      // This needs to run first so we have client.steamid on multiple acts
      this.updateSteam32Id()

      // In case they connect to a game in progress and we missed the start event
      this.setupOBSBlockers(data.map?.game_state ?? '')

      if (!isPlayingMatch(this.gsi)) return

      if (Array.isArray(data.events) && data.events.length) {
        data.events.forEach((event) => {
          if (
            !this.events.some(
              (e) => e.game_time === event.game_time && e.event_type === event.event_type,
            )
          ) {
            this.events.push(event)
            void redis.publish(
              `gsievents:${this.getToken()}:${event.event_type}`,
              JSON.stringify(event),
            )

            if (!Object.values(DotaEventTypes).includes(event.event_type)) {
              console.log('[NEWEVENT]', event)
            }
          }
        })
      }

      this.openBets()

      this.endBets()

      const chatterEnabled = getValueOrDefault(DBSettings.chatter, this.client.settings)
      if (chatterEnabled) {
        const isMidasPassive = checkMidas(data, this.passiveMidas)
        if (isMidasPassive) {
          console.log('[MIDAS]', 'Passive midas', { name: this.getChannel() })
          void chatClient.say(this.getChannel(), 'massivePIDAS Use your midas')
        }
      }
    })

    await subscriber.subscribe(`gsievents:${this.getToken()}:hero:name`, (serialized: string) => {
      const name: string = JSON.parse(serialized)
      if (!isPlayingMatch(this.gsi)) return

      this.currentHero = name
    })

    await subscriber.subscribe(`gsievents:${this.getToken()}:hero:alive`, (serialized: string) => {
      const alive: boolean = JSON.parse(serialized)
      // Just died
      if (!alive && this.gsi.gamestate?.previously?.hero?.alive) {
        // console.log('Just died')
      }

      // Just spawned (ignores game start spawn)
      if (alive && this.gsi.gamestate?.previously?.hero?.alive === false) {
        // console.log('Just spawned')
      }
    })

    // Can use this to get hero slot when the hero first spawns at match start
    await subscriber.subscribe(
      `gsievents:${this.getToken()}:items:teleport0:purchaser`,
      (serialized: string) => {
        const purchaser: number = JSON.parse(serialized)
        if (!isPlayingMatch(this.gsi)) return

        // Can't just !this.heroSlot because it can be 0
        if (this.heroSlot === null) {
          console.log('[SLOT]', 'Found hero slot at', purchaser, {
            name: this.getChannel(),
          })
          this.heroSlot = purchaser
          void this.saveMatchData()
          return
        }
      },
    )

    await subscriber.subscribe(`gsievents:${this.getToken()}:hero:smoked`, (serialized: string) => {
      const isSmoked: boolean = JSON.parse(serialized)
      if (!isPlayingMatch(this.gsi)) return
      const chatterEnabled = getValueOrDefault(DBSettings.chatter, this.client.settings)
      if (!chatterEnabled) return

      if (isSmoked) {
        const hero = getHero(this.gsi.gamestate?.hero?.name)
        if (!hero) {
          void chatClient.say(this.getChannel(), 'Shush Smoked!')
          return
        }

        void chatClient.say(this.getChannel(), `Shush ${hero.localized_name} is smoked!`)
      }
    })

    await subscriber.subscribe(`gsievents:${this.getToken()}:map:paused`, (serialized: string) => {
      const isPaused: boolean = JSON.parse(serialized)
      if (!isPlayingMatch(this.gsi)) return
      const chatterEnabled = getValueOrDefault(DBSettings.chatter, this.client.settings)
      if (!chatterEnabled) return

      // Necessary to let the frontend know, so we can pause any rosh / aegis / etc timers
      if (this.getSockets().length) {
        server.io.to(this.getSockets()).emit('paused', isPaused)
      }

      if (isPaused) {
        void chatClient.say(this.getChannel(), `PauseChamp Who paused the game?`)
      }
    })

    // This wont get triggered if they click disconnect and dont wait for the ancient to go to 0
    type TeamTypes = 'radiant' | 'dire'
    await subscriber.subscribe(
      `gsievents:${this.getToken()}:map:win_team`,
      (serialized: string) => {
        const winningTeam: TeamTypes = JSON.parse(serialized)
        if (!isPlayingMatch(this.gsi)) return

        this.endBets(winningTeam)
      },
    )

    await subscriber.subscribe(
      `gsievents:${this.getToken()}:map:clock_time`,
      (serialized: string) => {
        const time: number = JSON.parse(serialized)
        if (!isPlayingMatch(this.gsi)) return

        // Skip pregame
        if ((time + 30) % 300 === 0 && time + 30 > 0) {
          // Open a poll to see if its top or bottom?
          // We might not find out the answer though
          // console.log('Runes coming soon, its currently n:30 minutes', { token: client.token })
        }
      },
    )
  }

  emitWLUpdate() {
    if (this.getSockets().length) {
      console.log('[STEAM32ID]', 'Emitting WL overlay update', {
        name: this.getChannel(),
      })

      getWL(this.getChannelId())
        .then(({ record }) => {
          server.io.to(this.getSockets()).emit('update-wl', record)
        })
        .catch((e) => {
          // Stream not live
          // console.error('[MMR] emitWLUpdate Error getting WL', e)
        })
    }
  }

  // This array of socket ids is who we want to emit events to:
  // console.log("[SETUP]", { sockets: this.getSockets() })
  emitBadgeUpdate() {
    if (this.getSockets().length) {
      console.log('[STEAM32ID]', 'Emitting badge overlay update', {
        name: this.getChannel(),
      })

      getRankDetail(this.getMmr(), this.getSteam32())
        .then((deets) => {
          server.io.to(this.getSockets()).emit('update-medal', deets)
        })
        .catch((e) => {
          console.error('[MMR] emitBadgeUpdate Error getting rank detail', e)
        })
    }
  }

  // Make sure user has a steam32Id saved in the database
  // This runs once per every match start
  updateSteam32Id() {
    if (!this.gsi.gamestate?.player?.steamid) return

    const steam32Id = steamID64toSteamID32(this.gsi.gamestate.player.steamid)
    if (!steam32Id) return

    // User already has a steam32Id and its saved to the new table
    const foundAct = this.client.SteamAccount.find((act) => act.steam32Id === this.getSteam32())
    if (this.getSteam32() === steam32Id && foundAct) {
      if (this.getMmr() !== foundAct.mmr) {
        this.client.mmr = foundAct.mmr
        this.emitBadgeUpdate()
      }
      return
    }

    console.log('[STEAM32ID]', 'Updating steam32Id', { name: this.getChannel() })

    // Logged into a new account (smurfs vs mains)
    this.client.steam32Id = steam32Id

    // Default to the mmr from `users` table for this brand new steam account
    const mmr = this.client.SteamAccount.length ? 0 : this.getMmr()

    // Get mmr from database for this steamid
    prisma.steamAccount
      .findFirst({ where: { steam32Id } })
      .then((res) => {
        // not found
        if (!res?.id) {
          prisma.steamAccount
            .create({
              data: {
                mmr,
                steam32Id,
                userId: this.getToken(),
                name: this.gsi.gamestate?.player?.name,
              },
            })
            .then((res) => {
              prisma.user
                .update({ where: { id: this.getToken() }, data: { mmr: 0 } })
                .then(() => {
                  //
                })
                .catch((e) => {
                  //
                })
              this.client.mmr = mmr
              this.client.SteamAccount.push({
                name: res.name,
                mmr,
                steam32Id: res.steam32Id,
              })
              this.emitBadgeUpdate()
            })
            .catch((e: any) => {
              console.error('[STEAM32ID]', 'Error updating steam32Id', e)
            })
        }
      })
      .catch((e) => {
        console.log('[DATABASE ERROR]', e)
      })
  }

  updateMMR(increase: boolean, lobbyType: number, matchId: string, isParty?: boolean) {
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
        },
      })
      .then(() => {
        // Update mmr for ranked matches
      })
      .catch((e) => {
        console.error('[DATABASE ERROR MMR]', e)
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

  async handleMMR(
    increase: boolean,
    matchId: string,
    lobby_type?: number,
    heroSlot?: number | null,
  ) {
    if (lobby_type !== undefined) {
      console.log('[MMR]', 'lobby_type passed in from early dc', {
        lobby_type,
        name: this.getChannel(),
      })
      this.updateMMR(increase, lobby_type, matchId)
      return
    }

    // Do lookup at Opendota API for this match and figure out lobby type
    // TODO: Party size mmr

    const db = await mongo.db
    const response = await db.collection('delayedGames').findOne(
      { 'match.match_id': matchId },
      {
        projection: {
          _id: 0,
          'match.lobby_type': 1,
        },
      },
    )

    // Default ranked
    const lobbyType =
      typeof response?.match?.lobby_type !== 'number' ? 7 : response.match.lobby_type
    this.updateMMR(increase, lobbyType, matchId)
  }

  // TODO: CRON Job
  // 1 Find bets that are open and don't equal this match id and close them
  // 2 Next, check if the prediction is still open
  // 3 If it is, steam dota2 api result of match
  // 4 Then, tell twitch to close bets based on win result
  openBets() {
    // The bet was already made
    if (this.betExists !== null) return

    // Why open if not playing?
    if (this.gsi.gamestate?.player?.activity !== 'playing') return

    // Why open if won?
    if (this.gsi.gamestate.map?.win_team !== 'none') return

    // We at least want the hero name so it can go in the twitch bet title
    if (!this.gsi.gamestate.hero?.name || !this.gsi.gamestate.hero.name.length) return

    const channel = this.getChannel()
    const isOpenBetGameCondition =
      this.gsi.gamestate.map.clock_time < 20 && this.gsi.gamestate.map.name === 'start'

    // It's not a live game, so we don't want to open bets nor save it to DB
    if (!this.gsi.gamestate.map.matchid || this.gsi.gamestate.map.matchid === '0') return

    // Check if this bet for this match id already exists, dont continue if it does
    prisma.bet
      .findFirst({
        select: {
          id: true,
        },
        where: {
          userId: this.getToken(),
          matchId: this.gsi.gamestate.map.matchid,
          won: null,
        },
      })
      .then((bet: { id: string } | null) => {
        // Saving to local memory so we don't have to query the db again
        if (bet?.id) {
          console.log('[BETS]', 'Found a bet in the database', bet.id)
          this.betExists = this.gsi.gamestate?.map?.matchid ?? null
          this.betMyTeam = this.gsi.gamestate?.player?.team_name ?? null
        } else {
          if (!isOpenBetGameCondition) {
            return
          }

          // Doing this here instead of on(player:steamid)
          // it wasnt always called for some streamers when connecting to match
          // the user may have a steam account saved, but not this one for this match
          // so add to their list of steam accounts
          this.updateSteam32Id()

          this.betExists = this.gsi.gamestate?.map?.matchid ?? null
          this.betMyTeam = this.gsi.gamestate?.player?.team_name ?? null

          prisma.bet
            .create({
              data: {
                // TODO: Replace prediction id with the twitch api bet id result
                predictionId: this.gsi.gamestate?.map?.matchid ?? '',
                matchId: this.gsi.gamestate?.map?.matchid ?? '',
                userId: this.getToken(),
                myTeam: this.gsi.gamestate?.player?.team_name ?? '',
                steam32Id: this.getSteam32(),
              },
            })
            .then(() => {
              const betsEnabled = getValueOrDefault(DBSettings.bets, this.client.settings)
              if (!betsEnabled) return

              const hero = getHero(this.gsi.gamestate?.hero?.name)

              openTwitchBet(channel, this.getToken(), hero?.localized_name)
                .then(() => {
                  void chatClient.say(channel, `Bets open peepoGamble`)
                  console.log('[BETS]', {
                    event: 'open_bets',
                    data: {
                      matchId: this.gsi.gamestate?.map?.matchid,
                      user: this.getToken(),
                      player_team: this.gsi.gamestate?.player?.team_name,
                    },
                  })
                })
                .catch((e: any) => {
                  if (disabledBets.has(channel)) {
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
                        disabledBets.delete(channel)
                        console.log('[BETS]', 'Disabled bets for user', {
                          channel,
                        })
                      })
                      .catch((e) => {
                        console.log('[BETS]', 'Error disabling bets', e)
                      })
                  } else {
                    console.log('[BETS]', 'Error opening twitch bet', channel, e)
                  }
                })
            })
            .catch((e: any) => {
              console.log('[BETS]', channel, `Could not add bet to ${channel} channel`, e)
            })
        }
      })
      .catch((e: any) => {
        console.log('[BETS]', 'Error opening bet', e)
      })
  }

  endBets(
    winningTeam: 'radiant' | 'dire' | null = null,
    streamersTeam: 'radiant' | 'dire' | 'spectator' | null = null,
    lobby_type?: number,
  ) {
    if (!this.betExists || this.endingBets) return

    const matchId = this.betExists

    // A fresh DC without waiting for ancient to blow up
    if (
      !winningTeam &&
      this.gsi.gamestate?.previously?.map === true &&
      !this.gsi.gamestate.map?.matchid
    ) {
      console.log('[BETS]', 'Game ended without a winner, early DC probably', {
        name: this.getChannel(),
      })

      // Check with opendota to see if the match is over
      axios(`https://api.opendota.com/api/matches/${matchId}`)
        .then((response: any) => {
          if (typeof response.data.radiant_win !== 'boolean') return

          const team = response.data.radiant_win ? 'radiant' : 'dire'
          this.endBets(team, this.betMyTeam, response?.data?.lobby_type)
        })
        .catch((e: any) => {
          // its not over? just give up checking after this long
          // TODO: if its a close client & open client, mayb dont pass true here
          // confirm this scenario
          this.newMatchNewVars(true)
        })

      return
    }

    // "none"? Must mean the game hasn't ended yet
    // Would be undefined otherwise if there is no game
    if (!winningTeam && this.gsi.gamestate?.map?.win_team === 'none') return

    const localWinner = winningTeam ?? this.gsi.gamestate?.map?.win_team
    const myTeam = streamersTeam ?? this.gsi.gamestate?.player?.team_name
    const won = myTeam === localWinner

    // Both or one undefined
    if (!localWinner || !myTeam) return

    if (winningTeam === null) {
      console.log('[BETS]', 'Running end bets from newdata', {
        name: this.getChannel(),
      })
    } else {
      console.log('[BETS]', 'Running end bets from map:win_team or custom match look-up', {
        name: this.getChannel(),
      })
    }

    this.endingBets = true
    const channel = this.getChannel()
    void this.handleMMR(won, matchId, lobby_type, this.heroSlot)

    const betsEnabled = getValueOrDefault(DBSettings.bets, this.client.settings)
    if (!betsEnabled) {
      this.newMatchNewVars(true)
      return
    }

    closeTwitchBet(channel, won, this.getToken())
      .then(() => {
        void chatClient.say(this.getChannel(), `Bets closed, we have ${won ? 'won' : 'lost'}`)

        console.log('[BETS]', {
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
        if (disabledBets.has(channel)) {
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
              console.log('[BETS]', 'Disabled bets for user', {
                channel,
              })
              disabledBets.delete(channel)
            })
            .catch((e) => {
              console.log('[BETS]', 'Error disabling bets', e)
            })
        } else {
          console.log('[BETS]', 'Error closing twitch bet', channel, e)
        }
      })
      // Always
      .finally(() => {
        this.newMatchNewVars(true)
      })
  }

  setupOBSBlockers(state?: string) {
    if (!this.getSockets().length) return

    if (isSpectator(this.gsi)) {
      if (this.blockCache.get(this.getToken()) !== 'spectator') {
        this.emitBadgeUpdate()
        this.emitWLUpdate()

        server.io.to(this.getSockets()).emit('block', { type: 'spectator' })
        this.blockCache.set(this.getToken(), 'spectator')
      }

      return
    }

    if (isArcade(this.gsi)) {
      if (this.blockCache.get(this.getToken()) !== 'arcade') {
        this.emitBadgeUpdate()
        this.emitWLUpdate()

        server.io.to(this.getSockets()).emit('block', { type: 'arcade' })
        this.blockCache.set(this.getToken(), 'arcade')
      }

      return
    }

    // TODO: if the game is matchid 0 also dont show these? ie bot match. hero demo are type 'arcde'

    // Edge case:
    // Send strat screen if the player has picked their hero and it's locked in
    // Other players on their team could still be picking
    // -1 is the id of your hero if it gets ban picked when you pick first
    // the id is your hero if you pick last, and strategy screen is shown, but
    // the map state can still be hero selection
    // name is empty if your hero is not locked in
    if ((this.gsi.gamestate?.hero?.id ?? -1) >= 0 && pickSates.includes(state ?? '')) {
      if (this.blockCache.get(this.getToken()) !== 'strategy') {
        server.io
          .to(this.getSockets())
          .emit('block', { type: 'strategy', team: this.gsi.gamestate?.player?.team_name })

        this.blockCache.set(this.getToken(), 'strategy')
      }

      return
    }

    // Check what needs to be blocked
    const hasValidBlocker = blockTypes.some((blocker) => {
      if (blocker.states.includes(state ?? '')) {
        // Only send if not already what it is
        if (this.blockCache.get(this.getToken()) !== blocker.type) {
          this.blockCache.set(this.getToken(), blocker.type)

          // Send the one blocker type
          server.io.to(this.getSockets()).emit('block', {
            type: blocker.type,
            team: this.gsi.gamestate?.player?.team_name,
          })

          if (blocker.type === 'playing') {
            this.emitBadgeUpdate()
            this.emitWLUpdate()
          }

          if (this.aegisPickedUp?.expireDate) {
            server.io.to(this.getSockets()).emit('aegis-picked-up', this.aegisPickedUp)
          }

          if (this.roshanKilled?.maxDate) {
            server.io.to(this.getSockets()).emit('roshan-killed', this.roshanKilled)
          }
        }
        return true
      }

      return false
    })

    // No blocker changes, don't emit any socket message
    if (!hasValidBlocker && !this.blockCache.has(this.getToken())) {
      return
    }

    // Unblock all, we are disconnected from the match
    if (!hasValidBlocker && this.blockCache.has(this.getToken())) {
      this.blockCache.delete(this.getToken())
      server.io.to(this.getSockets()).emit('block', { type: null })
      this.newMatchNewVars()
      return
    }
  }
}
