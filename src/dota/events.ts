import { prisma } from '../db/prisma'
import { chatClient } from '../twitch/commands'
import { closeTwitchBet } from '../twitch/lib/closeTwitchBet'
import { openTwitchBet } from '../twitch/lib/openTwitchBet'
import { Event, Packet, SocketClient } from '../types'
import { steamID64toSteamID32 } from '../utils'
import axios from '../utils/axios'
import checkMidas from './lib/checkMidas'
import { blockTypes, pickSates } from './lib/consts'
import getHero from './lib/getHero'
import { isSpectator } from './lib/isSpectator'
import { getRankDescription } from './lib/ranks'
import { GSIClient } from './server'

import { server } from '.'

// Finally, we have a user and a GSI client
// That means the user opened OBS and connected to Dota 2 GSI
export class setupMainEvents {
  betExists: string | undefined | null
  betMyTeam: 'radiant' | 'dire' | 'spectator' | undefined | null
  blockCache = new Map<string, string>()
  gsi: GSIClient
  client: SocketClient
  currentHero: string | undefined | null
  endingBets = false
  heroSlot: number | undefined | null

  // Server could reboot and lose this in memory
  // But that's okay because we'll just do a db call once in openBets()
  passiveMidas = { counter: 0 }

  // gsi will always be defined here, so remove the null check
  constructor(client: SocketClient & { gsi: GSIClient }) {
    this.gsi = client.gsi
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

  watchEvents() {
    // Catch all
    this.gsi.on('newdata', (data: Packet) => {
      // TODO: Remove this and rely on the findUser global var
      this.gsi.gamestate = data

      if (isSpectator(this.gsi)) return

      // In case they connect to a game in progress and we missed the start event
      this.setupOBSBlockers(data.map?.game_state ?? '')

      this.openBets()

      this.endBets()

      const isMidasPassive = checkMidas(data, this.passiveMidas)
      if (isMidasPassive) {
        console.log('[MIDAS]', 'Passive midas', { name: this.getChannel() })
        void chatClient.say(this.getChannel(), 'massivePIDAS Use your midas')
      }
    })

    this.gsi.on('hero:name', (name: string) => {
      if (isSpectator(this.gsi)) return

      this.currentHero = name
    })

    this.gsi.on('hero:alive', (alive: boolean) => {
      // Just died
      if (!alive && this.gsi.gamestate?.previously?.hero?.alive) {
        console.log('Just died')
      }

      // Just spawned (ignores game start spawn)
      if (alive && this.gsi.gamestate?.previously?.hero?.alive === false) {
        console.log('Just spawned')
      }
    })

    // TODO: This isn't getting called
    this.gsi.on('events', (events: Event[]) => {
      if (Array.isArray(events) && events.length) {
        console.log('[EVENT DATA]', events)
      }
    })

    // Can use this to get hero slot when the hero first spawns at match start
    this.gsi.on('items:teleport0:purchaser', (purchaser: number) => {
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
      if (isSpectator(this.gsi)) return

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
      if (isSpectator(this.gsi)) return

      if (isPaused) {
        void chatClient.say(this.getChannel(), `PauseChamp Who paused the game?`)
      }
    })

    // This wont get triggered if they click disconnect and dont wait for the ancient to go to 0
    this.gsi.on('map:win_team', (winningTeam: 'radiant' | 'dire') => {
      if (isSpectator(this.gsi)) return

      this.endBets(winningTeam)
    })

    this.gsi.on('map:clock_time', (time: number) => {
      if (isSpectator(this.gsi)) return

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

  // Make sure user has a steam32Id saved in the database
  // This runs once per every match start but its just one DB query so hopefully it's fine
  // In the future I'd like to remove this and maybe have FE ask them to enter their steamid?
  updateSteam32Id() {
    // User already has a steam32Id
    if (this.getSteam32()) return

    const steam32Id = steamID64toSteamID32(this.gsi.gamestate?.player?.steamid ?? '')
    if (!steam32Id) return

    prisma.user
      .update({
        data: {
          steam32Id,
        },
        where: {
          id: this.getToken(),
        },
      })
      .then(() => {
        if (this.getSockets().length) {
          console.log('[STEAM32ID]', 'Updated player ID, emitting badge overlay update', {
            name: this.getChannel(),
          })

          server.io.to(this.getSockets()).emit('update-medal', { mmr: this.getMmr(), steam32Id })
        }
      })
      .catch((e: any) => {
        console.error('[STEAM32ID]', 'Error updating steam32Id', e)
      })
  }

  updateMMR(increase: boolean, ranked = true) {
    if (!ranked || !this.getMmr() || this.getMmr() <= 0) {
      server.io.to(this.getSockets()).emit('update-medal', {
        mmr: this.getMmr(),
        steam32Id: this.getSteam32(),
      })
      return
    }

    const newMMR = this.getMmr() + (increase ? 30 : -30)
    prisma.user
      .update({
        data: {
          mmr: newMMR,
        },
        where: {
          id: this.getToken(),
        },
      })
      .then(() => {
        this.getMmr() = newMMR

        if (this.getSockets().length) {
          console.log('[MMR]', 'Emitting mmr update', {
            name: this.getChannel(),
            channel: this.getChannel(),
          })

          getRankDescription(this.getMmr(), this.getSteam32() ?? undefined)
            .then((description) => {
              void chatClient.say(this.getChannel(), description)
            })
            .catch((e: any) => {
              console.error('[MMR]', 'Error getting rank description', e)
            })

          server.io
            .to(this.getSockets())
            .emit('update-medal', { mmr: newMMR, steam32Id: this.getSteam32() })
        }
      })
      .catch((e: any) => {
        console.error('[MMR]', 'Error updating mmr', e)
      })
  }

  handleMMR(increase: boolean, matchId: string) {
    // Do lookup at Opendota API for this match and figure out lobby type
    // TODO: Get just lobby_type from opendota api? That way its a smaller json response
    axios(`https://api.opendota.com/api/matches/${matchId}`)
      .then((response: any) => {
        // Ranked
        if (response?.data?.lobby_type === 7) {
          console.log('[MMR]', 'Match was ranked, updating mmr', {
            matchId,
            channel: this.getChannel(),
          })

          this.updateMMR(increase)
          return
        }

        console.log('[MMR] Non-ranked game. Lobby type:', response?.data?.lobby_type, {
          matchId,
          channel: this.getChannel(),
        })
        this.updateMMR(increase, false)
      })
      .catch((e: any) => {
        console.log('[MMR]', 'Error fetching match details', {
          matchId,
          channel: this.getChannel(),
          error: e?.response?.data,
        })
        // Force update when an error occurs and just let mods take care of the discrepancy
        // We assume the match was ranked
        this.updateMMR(increase)
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

    // It's not a live game, so we don't want to open bets nor save it to DB
    if (!this.gsi.gamestate.map.matchid || this.gsi.gamestate.map.matchid === '0') return

    const channel = this.getChannel()
    const isOpenBetGameCondition =
      this.gsi.gamestate.map.clock_time < 20 && this.gsi.gamestate.map.name === 'start'

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

          this.betExists = this.gsi.gamestate?.map?.matchid ?? null
          this.betMyTeam = this.gsi.gamestate?.player?.team_name ?? null

          this.updateSteam32Id()

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
                  console.log('[BETS]', 'Error opening twitch bet', channel, e)
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
          if (response?.data?.radiant_win === true) {
            this.endBets('radiant', this.betMyTeam)
          } else if (response?.data?.radiant_win === false) {
            this.endBets('dire', this.betMyTeam)
          } else {
            // ??? response was malformed from opendota
          }
        })
        .catch((e: any) => {
          this.betExists = null
          this.betMyTeam = null
          // its not over? just give up checking after this long
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
    this.currentHero = null
    this.passiveMidas.counter = 0
    this.heroSlot = null

    const channel = this.getChannel()
    this.handleMMR(won, matchId)

    prisma.bet
      .update({
        data: {
          won,
        },
        where: {
          matchId_userId: {
            userId: this.getToken(),
            matchId: matchId,
          },
        },
      })
      .then(() => {
        closeTwitchBet(channel, won, this.getToken())
          .then(() => {
            this.betExists = null
            this.betMyTeam = null
            this.endingBets = false

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
            this.betMyTeam = null
            this.betExists = null
            this.endingBets = false
            console.log('[BETS]', 'Error closing twitch bet', channel, e)
          })
      })
      .catch((e: any) => {
        this.betMyTeam = null
        this.betExists = null
        this.endingBets = false
        console.log('[BETS]', 'Error closing bet', e)
      })
  }

  setupOBSBlockers(state?: string) {
    if (!this.getSockets().length) return

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
            type: this.blockCache.get(this.getToken()),
            team: this.gsi.gamestate?.player?.team_name,
          })
        }
        return true
      }

      return false
    })

    // No blocker changes, don't emit any socket message
    if (!hasValidBlocker && !this.blockCache.has(this.getToken())) {
      return
    }

    // Unblock all
    if (!hasValidBlocker && this.blockCache.has(this.getToken())) {
      this.blockCache.delete(this.getToken())
      server.io.to(this.getSockets()).emit('block', { type: null })
      this.currentHero = null
      this.heroSlot = null
      this.passiveMidas.counter = 0
      // betExists = null
      // betMyTeam = null
      return
    }
  }
}
