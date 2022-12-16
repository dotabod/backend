import { getWL } from '../db/getWL.js'
import { prisma } from '../db/prisma.js'
import RedisClient from '../db/redis.js'
import { DBSettings, getValueOrDefault } from '../db/settings.js'
import Mongo from '../steam/mongo.js'
import { chatClient } from '../twitch/index.js'
import { closeTwitchBet } from '../twitch/lib/closeTwitchBet.js'
import { disabledBets, openTwitchBet } from '../twitch/lib/openTwitchBet.js'
import { DotaEvent, DotaEventTypes, MapData, Packet, SocketClient } from '../types.js'
import axios from '../utils/axios.js'
import { fmtMSS, steamID64toSteamID32 } from '../utils/index.js'
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
export const blockCache = new Map<string, string>()

// Finally, we have a user and a GSI client
// That means the user opened OBS and connected to Dota 2 GSI
export class setupMainEvents {
  // Server could reboot and lose these in memory
  // But that's okay they will get reset based on current match state
  aegisPickedUp?: { playerId: number; expireTime: string; expireDate: Date }
  betExists: string | undefined | null = null
  betMyTeam: 'radiant' | 'dire' | 'spectator' | undefined | null = null
  currentHero: string | undefined | null = null
  endingBets = false
  openingBets = false
  events: DotaEvent[] = []
  gsi?: Packet
  heroSlot: number | undefined | null = null
  passiveMidas = { counter: 0 }
  roshanKilled?: {
    minTime: string
    maxTime: string
    minDate: Date
    maxDate: Date
  }
  token: string

  constructor(token: SocketClient['token']) {
    console.log('Instantiating a new client', token)
    this.token = token
    void this.watchEvents()
  }

  private async getMmr() {
    const res = await redis.json.get(`users:${this.getToken()}`, { path: '.mmr' })
    return res as SocketClient['mmr']
  }

  private async getSteamAccounts() {
    const res = await redis.json.get(`users:${this.getToken()}`, { path: '.SteamAccount' })
    return res as SocketClient['SteamAccount']
  }

  private async getSettings() {
    const res = await redis.json.get(`users:${this.getToken()}`, { path: '.settings' })
    return res as SocketClient['settings']
  }

  private getToken() {
    return this.token
  }

  private async getChannel() {
    const res = await redis.json.get(`users:${this.getToken()}`, { path: '.name' })
    return res as SocketClient['name']
  }

  private async getSteam32() {
    const res = await redis.json.get(`users:${this.getToken()}`, { path: '.steam32Id' })
    return res as SocketClient['steam32Id']
  }

  private async getMatchId() {
    const res = await redis.json.get(`users:${this.getToken()}`, { path: '.gsi.map.matchid' })
    return res as MapData['matchid']
  }

  private async getChannelId() {
    const res = await redis.json.get(`users:${this.getToken()}`, {
      path: '.Account.providerAccountId',
    })
    return res as string
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
      this.openingBets = false
      this.betExists = null
      this.betMyTeam = null

      this.roshanKilled = undefined
      this.aegisPickedUp = undefined

      server.io.to(this.getToken()).emit('aegis-picked-up', {})
      server.io.to(this.getToken()).emit('roshan-killed', {})
    }
  }

  async saveMatchData() {
    const steam32Id = await this.getSteam32()
    const matchId = await this.getMatchId()
    if (!steam32Id || !matchId) return

    try {
      console.log('Start match data', await this.getChannel(), matchId)

      const db = await mongo.db
      let response = await db.collection('delayedGames').findOne({ 'match.match_id': matchId })

      if (!response) {
        console.log('No match data for user, checking from steam', await this.getChannel(), matchId)

        const steamserverid = await server.dota.getUserSteamServer(steam32Id)
        // @ts-expect-error asdf
        response = await server.dota.getDelayedMatchData(steamserverid)
        if (!response) {
          console.log('No match data found!', await this.getChannel(), matchId)
          return
        }

        console.log('Saving match data', await this.getChannel(), matchId)

        await db
          .collection('delayedGames')
          .updateOne(
            { matchid: response.match?.match_id },
            { $set: { ...response, createdAt: new Date() } },
            { upsert: true },
          )
      } else {
        console.log('Match data already found', await this.getChannel(), matchId)
      }
    } catch (e) {
      console.log(e, 'saving match data failed', await this.getChannel())
    }
  }

  public async watchEvents() {
    console.log('Setting up events', await this.getChannel());

    await subscriber.subscribe(
      `gsievents:${this.getToken()}:${DotaEventTypes.RoshanKilled}`,
      async (serialized: string) => {
        const event = JSON.parse(serialized) as DotaEvent
        if (!isPlayingMatch(this.gsi)) return

        // doing map gametime - event gametime in case the user reconnects to a match,
        // and the gametime is over the event gametime
        const gameTimeDiff = (this.gsi?.map?.game_time ?? event.game_time) - event.game_time

        // min spawn for rosh in 5 + 3 minutes
        const minS = 5 * 60 + 3 * 60 - gameTimeDiff
        const minTime = (this.gsi?.map?.clock_time ?? 0) + minS

        // max spawn for rosh in 5 + 3 + 3 minutes
        const maxS = 5 * 60 + 3 * 60 + 3 * 60 - gameTimeDiff
        const maxTime = (this.gsi?.map?.clock_time ?? 0) + maxS

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
        server.io.to(this.getToken()).emit('roshan-killed', res)
        console.log('[ROSHAN]', 'Roshan killed, setting timer', res, {
          name: await this.getChannel(),
        })
      },
    )

    await subscriber.subscribe(
      `gsievents:${this.getToken()}:${DotaEventTypes.AegisPickedUp}`,
      async (serialized: string) => {
        const event = JSON.parse(serialized) as DotaEvent
        if (!isPlayingMatch(this.gsi)) return

        const gameTimeDiff = (this.gsi?.map?.game_time ?? event.game_time) - event.game_time

        // expire for aegis in 5 minutes
        const expireS = 5 * 60 - gameTimeDiff
        const expireTime = (this.gsi?.map?.clock_time ?? 0) + expireS

        // server time
        const expireDate = this.addSecondsToNow(expireS)

        const res = {
          expireS,
          playerId: event.player_id,
          expireTime: fmtMSS(expireTime),
          expireDate,
        }

        this.aegisPickedUp = res

        server.io.to(this.getToken()).emit('aegis-picked-up', res)
        console.log('[ROSHAN]', 'Aegis picked up, setting timer', res, {
          name: await this.getChannel(),
        })
      },
    )

    // Catch all
    await subscriber.subscribe(
      `gsievents:${this.getToken()}:newdata`,
      async (serialized: string) => {
        const gsi = JSON.parse(serialized)
        const data: Packet = gsi
        this.gsi = data

        // New users who dont have a steamaccount saved yet
        // This needs to run first so we have client.steamid on multiple acts
        void this.updateSteam32Id()

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

        void this.openBets()

        void this.endBets()

        const chatterEnabled = getValueOrDefault(DBSettings.chatter, await this.getSettings())
        if (chatterEnabled) {
          const isMidasPassive = checkMidas(data, this.passiveMidas)
          if (isMidasPassive) {
            const channel = await this.getChannel()

            console.log('[MIDAS]', 'Passive midas', { name: await this.getChannel() })
            void chatClient.say(channel, 'massivePIDAS Use your midas')
          }
        }
      },
    )

    await subscriber.subscribe(`gsievents:${this.getToken()}:hero:name`, (serialized: string) => {
      const name: string = JSON.parse(serialized)
      if (!isPlayingMatch(this.gsi)) return

      this.currentHero = name
    })

    await subscriber.subscribe(`gsievents:${this.getToken()}:hero:alive`, (serialized: string) => {
      const alive: boolean = JSON.parse(serialized)
      // Just died
      if (!alive && this.gsi?.previously?.hero?.alive) {
        // console.log('Just died')
      }

      // Just spawned (ignores game start spawn)
      if (alive && this.gsi?.previously?.hero?.alive === false) {
        // console.log('Just spawned')
      }
    })

    // Can use this to get hero slot when the hero first spawns at match start
    await subscriber.subscribe(
      `gsievents:${this.getToken()}:items:teleport0:purchaser`,
      async (serialized: string) => {
        const purchaser: number = JSON.parse(serialized)
        if (!isPlayingMatch(this.gsi)) return

        // Can't just !this.heroSlot because it can be 0
        if (this.heroSlot === null) {
          console.log('[SLOT]', 'Found hero slot at', purchaser, {
            name: await this.getChannel(),
          })
          this.heroSlot = purchaser
          void this.saveMatchData()
          return
        }
      },
    )

    await subscriber.subscribe(
      `gsievents:${this.getToken()}:hero:smoked`,
      async (serialized: string) => {
        const isSmoked: boolean = JSON.parse(serialized)
        if (!isPlayingMatch(this.gsi)) return
        const chatterEnabled = getValueOrDefault(DBSettings.chatter, await this.getSettings())
        if (!chatterEnabled) return

        if (isSmoked) {
          const channel = await this.getChannel()
          const hero = getHero(this.gsi?.hero?.name)
          if (!hero) {
            void chatClient.say(channel, 'Shush Smoked!')
            return
          }

          void chatClient.say(channel, `Shush ${hero.localized_name} is smoked!`)
        }
      },
    )

    await subscriber.subscribe(
      `gsievents:${this.getToken()}:map:paused`,
      async (serialized: string) => {
        const isPaused: boolean = JSON.parse(serialized)
        if (!isPlayingMatch(this.gsi)) return
        const chatterEnabled = getValueOrDefault(DBSettings.chatter, await this.getSettings())
        if (!chatterEnabled) return

        // Necessary to let the frontend know, so we can pause any rosh / aegis / etc timers
        server.io.to(this.getToken()).emit('paused', isPaused)

        if (isPaused) {
          void chatClient.say(await this.getChannel(), `PauseChamp Who paused the game?`)
        }
      },
    )

    // This wont get triggered if they click disconnect and dont wait for the ancient to go to 0
    type TeamTypes = 'radiant' | 'dire'
    await subscriber.subscribe(
      `gsievents:${this.getToken()}:map:win_team`,
      (serialized: string) => {
        const winningTeam: TeamTypes = JSON.parse(serialized)
        if (!isPlayingMatch(this.gsi)) return

        void this.endBets(winningTeam)
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

  async emitWLUpdate() {
    console.log('[STEAM32ID]', 'Emitting WL overlay update', {
      name: await this.getChannel(),
    })

    getWL(await this.getChannelId())
      .then(({ record }) => {
        server.io.to(this.getToken()).emit('update-wl', record)
      })
      .catch((e) => {
        // Stream not live
        // console.error('[MMR] emitWLUpdate Error getting WL', e)
      })
  }

  async emitBadgeUpdate() {
    console.log('[STEAM32ID]', 'Emitting badge overlay update', {
      name: await this.getChannel(),
    })

    getRankDetail(await this.getMmr(), await this.getSteam32())
      .then((deets) => {
        server.io.to(this.getToken()).emit('update-medal', deets)
      })
      .catch((e) => {
        console.error('[MMR] emitBadgeUpdate Error getting rank detail', e)
      })
  }

  // Make sure user has a steam32Id saved in the database
  // This runs once per every match start
  async updateSteam32Id() {
    if (!this.gsi?.player?.steamid) return

    const steam32Id = steamID64toSteamID32(this.gsi.player.steamid)
    if (!steam32Id) return

    const currentSteam32Id = await this.getSteam32()
    // User already has a steam32Id and its saved to the new table
    const foundAct = (await this.getSteamAccounts()).find(
      (act) => act.steam32Id === currentSteam32Id,
    )
    if (currentSteam32Id === steam32Id && foundAct) {
      if ((await this.getMmr()) !== foundAct.mmr) {
        await redis.json.set(`users:${this.getToken()}`, `$.mmr`, foundAct.mmr)
        void this.emitBadgeUpdate()
      }
      return
    }

    console.log('[STEAM32ID]', 'Updating steam32Id', { name: await this.getChannel() })

    // Logged into a new account (smurfs vs mains)
    await redis.json.set(`users:${this.getToken()}`, `$.steam32Id`, steam32Id)

    // Default to the mmr from `users` table for this brand new steam account
    const mmr = (await this.getSteamAccounts()).length ? 0 : await this.getMmr()

    // Get mmr from database for this steamid
    const res = await prisma.steamAccount.findFirst({ where: { steam32Id } })
    if (!res?.id) {
      await prisma.user.update({
        where: { id: this.getToken() },
        data: {
          mmr: 0,
          SteamAccount: {
            create: {
              mmr,
              steam32Id,
              name: this.gsi.player.name,
            },
          },
        },
      })

      void redis.json.set(`users:${this.getToken()}`, `$.mmr`, mmr)
      void this.emitBadgeUpdate()
    }
  }

  async updateMMR(increase: boolean, lobbyType: number, matchId: string, isParty?: boolean) {
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

    void this.emitWLUpdate()

    if (!ranked) {
      return
    }

    const mmrSize = isParty ? 20 : 30
    const newMMR = (await this.getMmr()) + (increase ? mmrSize : -mmrSize)
    const steam32Id = await this.getSteam32()
    if (steam32Id) {
      updateMmr(newMMR, steam32Id, await this.getChannel())
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
        name: await this.getChannel(),
      })
      void this.updateMMR(increase, lobby_type, matchId)
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
    void this.updateMMR(increase, lobbyType, matchId)
  }

  // TODO: CRON Job
  // 1 Find bets that are open and don't equal this match id and close them
  // 2 Next, check if the prediction is still open
  // 3 If it is, steam dota2 api result of match
  // 4 Then, tell twitch to close bets based on win result
  async openBets() {
    // The bet was already made
    if (this.betExists !== null) return
    if (this.openingBets) return

    // Why open if not playing?
    if (this.gsi?.player?.activity !== 'playing') return

    // Why open if won?
    if (this.gsi.map?.win_team !== 'none') return

    // We at least want the hero name so it can go in the twitch bet title
    if (!this.gsi.hero?.name || !this.gsi.hero.name.length) return

    this.openingBets = true
    const channel = await this.getChannel()
    const isOpenBetGameCondition = this.gsi.map.clock_time < 20 && this.gsi.map.name === 'start'

    // It's not a live game, so we don't want to open bets nor save it to DB
    if (!this.gsi.map.matchid || this.gsi.map.matchid === '0') return

    // Check if this bet for this match id already exists, dont continue if it does
    prisma.bet
      .findFirst({
        select: {
          id: true,
        },
        where: {
          userId: this.getToken(),
          matchId: this.gsi.map.matchid,
          won: null,
        },
      })
      .then(async (bet: { id: string } | null) => {
        // Saving to local memory so we don't have to query the db again
        if (bet?.id) {
          console.log('[BETS]', 'Found a bet in the database', bet.id)
          this.betExists = this.gsi?.map?.matchid ?? null
          this.betMyTeam = this.gsi?.player?.team_name ?? null
        } else {
          if (!isOpenBetGameCondition) {
            return
          }

          // Doing this here instead of on(player:steamid)
          // it wasnt always called for some streamers when connecting to match
          // the user may have a steam account saved, but not this one for this match
          // so add to their list of steam accounts
          void this.updateSteam32Id()

          this.betExists = this.gsi?.map?.matchid ?? null
          this.betMyTeam = this.gsi?.player?.team_name ?? null

          prisma.bet
            .create({
              data: {
                // TODO: Replace prediction id with the twitch api bet id result
                predictionId: this.gsi?.map?.matchid ?? '',
                matchId: this.gsi?.map?.matchid ?? '',
                userId: this.getToken(),
                myTeam: this.gsi?.player?.team_name ?? '',
                steam32Id: await this.getSteam32(),
              },
            })
            .then(async () => {
              const betsEnabled = getValueOrDefault(DBSettings.bets, await this.getSettings())
              if (!betsEnabled) return

              const hero = getHero(this.gsi?.hero?.name)

              openTwitchBet(channel, this.getToken(), hero?.localized_name)
                .then(() => {
                  void chatClient.say(channel, `Bets open peepoGamble`)
                  console.log('[BETS]', {
                    event: 'open_bets',
                    data: {
                      matchId: this.gsi?.map?.matchid,
                      user: this.getToken(),
                      player_team: this.gsi?.player?.team_name,
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
        console.log('[BETS]', 'Error opening bet', this.gsi?.map?.matchid ?? '', channel, e)
      })
  }

  async endBets(
    winningTeam: 'radiant' | 'dire' | null = null,
    streamersTeam: 'radiant' | 'dire' | 'spectator' | null = null,
    lobby_type?: number,
  ) {
    if (!this.betExists || this.endingBets) return

    const matchId = this.betExists

    // A fresh DC without waiting for ancient to blow up
    if (!winningTeam && this.gsi?.previously?.map === true && !this.gsi.map?.matchid) {
      console.log('[BETS]', 'Game ended without a winner, early DC probably', {
        name: await this.getChannel(),
      })

      // Check with opendota to see if the match is over
      axios(`https://api.opendota.com/api/matches/${matchId}`)
        .then((response: any) => {
          if (typeof response.data.radiant_win !== 'boolean') return

          const team = response.data.radiant_win ? 'radiant' : 'dire'
          void this.endBets(team, this.betMyTeam, response?.data?.lobby_type)
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
    if (!winningTeam && this.gsi?.map?.win_team === 'none') return

    const localWinner = winningTeam ?? this.gsi?.map?.win_team
    const myTeam = streamersTeam ?? this.gsi?.player?.team_name
    const won = myTeam === localWinner

    // Both or one undefined
    if (!localWinner || !myTeam) return

    if (winningTeam === null) {
      console.log('[BETS]', 'Running end bets from newdata', {
        name: await this.getChannel(),
      })
    } else {
      console.log('[BETS]', 'Running end bets from map:win_team or custom match look-up', {
        name: await this.getChannel(),
      })
    }

    this.endingBets = true
    const channel = await this.getChannel()
    void this.handleMMR(won, matchId, lobby_type, this.heroSlot)

    const betsEnabled = getValueOrDefault(DBSettings.bets, await this.getSettings())
    if (!betsEnabled) {
      this.newMatchNewVars(true)
      return
    }

    closeTwitchBet(channel, won, this.getToken())
      .then(async () => {
        void chatClient.say(await this.getChannel(), `Bets closed, we have ${won ? 'won' : 'lost'}`)

        console.log('[BETS]', {
          event: 'end_bets',
          data: {
            matchId: matchId,
            name: await this.getChannel(),
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

  setupOBSBlockers(state: string) {
    if (isSpectator(this.gsi)) {
      if (blockCache.get(this.getToken()) !== 'spectator') {
        void this.emitBadgeUpdate()
        void this.emitWLUpdate()

        server.io.to(this.getToken()).emit('block', { type: 'spectator' })
        blockCache.set(this.getToken(), 'spectator')
      }

      return
    }

    if (isArcade(this.gsi)) {
      if (blockCache.get(this.getToken()) !== 'arcade') {
        void this.emitBadgeUpdate()
        void this.emitWLUpdate()

        server.io.to(this.getToken()).emit('block', { type: 'arcade' })
        blockCache.set(this.getToken(), 'arcade')
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
    if ((this.gsi?.hero?.id ?? -1) >= 0 && pickSates.includes(state)) {
      if (blockCache.get(this.getToken()) !== 'strategy') {
        server.io
          .to(this.getToken())
          .emit('block', { type: 'strategy', team: this.gsi?.player?.team_name })

        blockCache.set(this.getToken(), 'strategy')
      }

      return
    }

    // Check what needs to be blocked
    const hasValidBlocker = blockTypes.some((blocker) => {
      if (blocker.states.includes(state)) {
        // Only send if not already what it is
        if (blockCache.get(this.getToken()) !== blocker.type) {
          blockCache.set(this.getToken(), blocker.type)

          // Send the one blocker type
          server.io.to(this.getToken()).emit('block', {
            type: blocker.type,
            team: this.gsi?.player?.team_name,
          })

          if (blocker.type === 'playing') {
            void this.emitBadgeUpdate()
            void this.emitWLUpdate()
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

    // No blocker changes, don't emit any this.getToken() message
    if (!hasValidBlocker && !blockCache.has(this.getToken())) {
      return
    }

    // Unblock all, we are disconnected from the match
    if (!hasValidBlocker && blockCache.has(this.getToken())) {
      blockCache.delete(this.getToken())
      server.io.to(this.getToken()).emit('block', { type: null })
      this.newMatchNewVars()
      return
    }
  }
}
