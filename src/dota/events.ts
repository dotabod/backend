import { prisma } from '../db/prisma'
import { DBSettings, getValueOrDefault } from '../db/settings'
import { chatClient } from '../twitch/commands'
import { closeTwitchBet } from '../twitch/lib/closeTwitchBet'
import { disabledBets, openTwitchBet } from '../twitch/lib/openTwitchBet'
import { DotaEvent, DotaEventTypes, Packet, SocketClient } from '../types'
import { fmtMSS, steamID64toSteamID32 } from '../utils'
import axios from '../utils/axios'
import { GSIClient } from './GSIClient'
import checkMidas from './lib/checkMidas'
import { blockTypes, pickSates } from './lib/consts'
import getHero from './lib/getHero'
import { isArcade } from './lib/isArcade'
import { isPlayingMatch } from './lib/isPlayingMatch'
import { isSpectator } from './lib/isSpectator'
import { updateMmr } from './lib/updateMmr'

import { server } from '.'

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

    this.watchEvents()
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

  watchEvents() {
    this.gsi.on(DotaEventTypes.RoshanKilled, (event: DotaEvent) => {
      if (!isPlayingMatch(this.gsi)) return

      // doing map gametime - event gametime in case the user reconnects to a match,
      // and the gametime is over the event gametime
      const gameTimeDiff = (this.gsi.gamestate?.map?.game_time ?? event.game_time) - event.game_time

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
    })

    this.gsi.on(DotaEventTypes.AegisPickedUp, (event: DotaEvent) => {
      if (!isPlayingMatch(this.gsi)) return

      const gameTimeDiff = (this.gsi.gamestate?.map?.game_time ?? event.game_time) - event.game_time

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
    })

    // Catch all
    this.gsi.on('newdata', (data: Packet) => {
      // In case they connect to a game in progress and we missed the start event
      this.setupOBSBlockers(data.map?.game_state ?? '')

      // New users who dont have a steamaccount saved yet
      this.updateSteam32Id()

      if (!isPlayingMatch(this.gsi)) return

      if (Array.isArray(data.events) && data.events.length) {
        data.events.forEach((event) => {
          if (
            !this.events.some(
              (e) => e.game_time === event.game_time && e.event_type === event.event_type,
            )
          ) {
            this.events.push(event)
            this.gsi.emit(event.event_type, event)

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

    this.gsi.on('hero:name', (name: string) => {
      if (!isPlayingMatch(this.gsi)) return

      this.currentHero = name
    })

    this.gsi.on('hero:alive', (alive: boolean) => {
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
    this.gsi.on('items:teleport0:purchaser', (purchaser: number) => {
      if (!isPlayingMatch(this.gsi)) return

      // Can't just !this.heroSlot because it can be 0
      if (this.heroSlot === null) {
        console.log('[SLOT]', 'Found hero slot at', purchaser, {
          name: this.getChannel(),
        })
        this.heroSlot = purchaser
        return
      }
    })

    this.gsi.on('hero:smoked', (isSmoked: boolean) => {
      if (!isPlayingMatch(this.gsi)) return
      const chatterEnabled = getValueOrDefault(DBSettings.chatter, this.client.settings)
      if (!chatterEnabled) return

      if (isSmoked) {
        const hero = getHero(this.gsi.gamestate?.hero?.name)
        if (!hero) {
          void chatClient.say(this.getChannel(), '🚬💣 Smoke!')
          return
        }

        void chatClient.say(this.getChannel(), `🚬💣 ${hero.localized_name} is smoked!`)
      }
    })

    this.gsi.on('map:paused', (isPaused: boolean) => {
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
    this.gsi.on('map:win_team', (winningTeam: 'radiant' | 'dire') => {
      if (!isPlayingMatch(this.gsi)) return

      this.endBets(winningTeam)
    })

    this.gsi.on('map:clock_time', (time: number) => {
      if (!isPlayingMatch(this.gsi)) return

      // Skip pregame
      if ((time + 30) % 300 === 0 && time + 30 > 0) {
        // Open a poll to see if its top or bottom?
        // We might not find out the answer though
        // console.log('Runes coming soon, its currently n:30 minutes', { token: client.token })
      }
    })
  }

  // This array of socket ids is who we want to emit events to:
  // console.log("[SETUP]", { sockets: this.getSockets() })
  emitBadgeUpdate() {
    if (this.getSockets().length) {
      console.log('[STEAM32ID]', 'Emitting badge overlay update', {
        name: this.getChannel(),
      })

      server.io
        .to(this.getSockets())
        .emit('update-medal', { mmr: this.getMmr(), steam32Id: this.getSteam32() })
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

  updateMMR(increase: boolean, lobbyType: number, matchId: string) {
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

    if (!ranked) {
      this.emitBadgeUpdate()
      return
    }

    const mmrEnabled = getValueOrDefault(DBSettings.mmrTracker, this.client.settings)
    if (!mmrEnabled) {
      // TODO: Make a new event for 'update-wl'
      this.emitBadgeUpdate()
      return
    }

    const newMMR = this.getMmr() + (increase ? 30 : -30)
    if (this.client.steam32Id) {
      updateMmr(newMMR, this.client.steam32Id, this.client.name)
    }
  }

  handleMMR(increase: boolean, matchId: string, lobby_type?: number) {
    if (lobby_type !== undefined) {
      console.log('[MMR]', 'lobby_type passed in from early dc', {
        lobby_type,
        name: this.getChannel(),
      })
      this.updateMMR(increase, lobby_type, matchId)
      return
    }

    // Do lookup at Opendota API for this match and figure out lobby type
    // TODO: Get just lobby_type from opendota api? That way its a smaller json response
    axios(`https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/`, {
      params: { key: process.env.STEAM_WEB_API, match_id: matchId },
    })
      .then((response: any) => {
        console.log(response?.data)

        this.updateMMR(increase, response?.data?.result?.lobby_type as number, matchId)
      })
      .catch((e: any) => {
        let lobbyType = 7
        // Force update when an error occurs and just let mods take care of the discrepancy
        if (
          e?.response?.data?.result?.error ===
          'Practice matches are not available via GetMatchDetails'
        ) {
          lobbyType = 1
        }

        this.updateMMR(increase, lobbyType, matchId)

        console.log('[MMR]', 'Error fetching match details', {
          matchId,
          channel: this.getChannel(),
          error: e?.response?.data,
        })
      })
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
      axios(`https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/`, {
        params: { key: process.env.STEAM_WEB_API, match_id: matchId },
      })
        .then((response: any) => {
          if (!response.data.result.radiant_win) return

          const team = response.data.result.radiant_win ? 'radiant' : 'dire'
          this.endBets(team, this.betMyTeam, response?.data?.result?.lobby_type)
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
    this.handleMMR(won, matchId, lobby_type)

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
        server.io.to(this.getSockets()).emit('block', { type: 'spectator' })
        this.blockCache.set(this.getToken(), 'spectator')
      }

      return
    }

    if (isArcade(this.gsi)) {
      if (this.blockCache.get(this.getToken()) !== 'arcade') {
        server.io.to(this.getSockets()).emit('block', { type: 'arcade' })
        this.blockCache.set(this.getToken(), 'arcade')
      }

      return
    }

    // TODO: if the game is matchid 0 also dont show these? ie bot match. hero demo are type 'arcde'

    // Edge case:
    // Send strat screen if the player has picked their hero and it's locked in
    // Other players on their team could still be picking
    if (
      typeof this.currentHero === 'string' &&
      (this.currentHero === '' || this.currentHero.length) &&
      pickSates.includes(state ?? '')
    ) {
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

          this.emitBadgeUpdate()

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
