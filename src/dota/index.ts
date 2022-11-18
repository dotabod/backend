import axios from 'axios'
import { SocketClient, Dota2 } from '../types'
import checkMidas from './checkMidas'
import findUser from './dotaGSIClients'
import D2GSI, { GSIClient } from './lib/dota2-gsi'
import { minimapStates, pickSates } from './trackingConsts'
import { steamID64toSteamID32 } from '../utils'
import { closeTwitchBet, openTwitchBet } from '../twitch/predictions'
import { chatClient } from '../twitch/commands'
import prisma from '../db/prisma'
import { getRankDescription } from '../utils/constants'
import { findHero } from '../db/getHero'

// TODO: We shouldn't use await beyond the getChatClient(), it slows down the server I think

// Then setup the dota gsi server & websocket server
export const server = new D2GSI()

// spectator = watching a friend live
// team2 = watching replay or live match
// customgamename = playing arcade or hero demo
export function isCustomGame(client: GSIClient) {
  // undefined means the client is disconnected from a game
  // so we want to run our obs stuff to unblock anything
  const isArcade =
    client.gamestate?.map?.customgamename !== '' &&
    client.gamestate?.map?.customgamename !== undefined
  if (
    client.gamestate?.player?.team_name === 'spectator' ||
    isArcade ||
    'team2' in (client.gamestate?.player || {})
  ) {
    return true
  }

  return false
}

// Finally, we have a user and a GSI client
// That means the user opened OBS and connected to Dota 2 GSI
async function setupMainEvents(connectedSocketClient: SocketClient) {
  const client = connectedSocketClient.gsi
  if (client === undefined) return

  // Server could reboot and lose this in memory
  // But that's okay because we'll just do a db call once in openBets()
  let betExists: string | null = null

  const passiveMidas = { counter: 0 }
  // const recentHealth = Array(25) // TODO: #HEALTH

  // This array of socket ids is who we want to emit events to:
  // console.log("[SETUP]",{ sockets: connectedSocketClient.sockets })

  // We want to reset this to false when a new socket connects?
  const blockingMinimap: { [key: string]: boolean } = {}
  const blockingPicks: { [key: string]: boolean } = {}
  const allUnblocked: { [key: string]: boolean } = {}

  function lockBets() {
    if (!client) return

    // TODO: Check if bets get locked at the same time this gets posted
    if (chatClient.isConnected && chatClient.isRegistered) {
      chatClient.say(connectedSocketClient.name, `Bets are locked peepoGamble`)
    }

    console.log('[BETS]', {
      event: 'lock_bets',
      data: {
        token: client.token,
        matchId: client.gamestate?.map?.matchid,
      },
    })
  }

  // Make sure user has a steam32Id saved in the database
  // This runs once per every match start but its just one DB query so hopefully it's fine
  // In the future I'd like to remove this and maybe have FE ask them to enter their steamid?
  function updateSteam32Id() {
    // User already has a steam32Id
    if (connectedSocketClient.steam32Id) return

    const steam32Id = steamID64toSteamID32(client?.gamestate?.player?.steamid || '')
    if (!steam32Id) return

    prisma.user
      .update({
        data: {
          steam32Id,
        },
        where: {
          id: connectedSocketClient.token,
        },
      })
      .then(() => {
        if (connectedSocketClient.sockets.length) {
          console.log('[STEAM32ID]', 'Updated player ID, emitting badge overlay update', {
            token: connectedSocketClient.token,
          })

          server.io
            .to(connectedSocketClient.sockets)
            .emit('update-medal', { mmr: connectedSocketClient.mmr, steam32Id })
        }
      })
  }

  function updateMMR(increase: boolean) {
    const newMMR = connectedSocketClient.mmr + (increase ? 30 : -30)
    prisma.user
      .update({
        data: {
          mmr: newMMR,
        },
        where: {
          id: connectedSocketClient.token,
        },
      })
      .then(() => {
        connectedSocketClient.mmr = newMMR

        if (connectedSocketClient.sockets.length) {
          console.log('[MMR]', 'Emitting mmr update', {
            token: connectedSocketClient.token,
            channel: connectedSocketClient.name,
          })

          getRankDescription(
            connectedSocketClient.mmr,
            connectedSocketClient?.steam32Id || undefined,
          ).then((description) => {
            chatClient.say(connectedSocketClient.name, description)
          })

          server.io
            .to(connectedSocketClient.sockets)
            .emit('update-medal', { mmr: newMMR, steam32Id: connectedSocketClient.steam32Id })
        }
      })
  }

  function handleMMR(increase: boolean, matchId: string) {
    // Do lookup at steam API for this match and figure out lobby type
    axios(`https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/`, {
      params: { key: process.env.STEAM_WEB_API, match_id: matchId },
    })
      .then(({ data }) => {
        // lobby_type
        // -1 - Invalid
        // 0 - Public matchmaking
        // 1 - Practise
        // 2 - Tournament
        // 3 - Tutorial
        // 4 - Co-op with bots.
        // 5 - Team match
        // 6 - Solo Queue
        // 7 - Ranked
        // 8 - 1v1 Mid
        if (data?.result?.error) {
          console.log('[MMR]', 'Error getting match details', {
            error: data.result.error,
            matchId,
            channel: connectedSocketClient.name,
          })
          // Force update when an error occurs and just let mods take care of the discrepancy
          // We assume the match was ranked
          updateMMR(increase)
          return
        }

        // Ranked
        if (data?.result?.lobby_type === 7) {
          console.log('[MMR]', 'Match was ranked, updating mmr', {
            matchId,
            channel: connectedSocketClient.name,
          })

          updateMMR(increase)
          return
        }

        console.log('[MMR] Non-ranked game', data, { matchId, channel: connectedSocketClient.name })
      })
      .catch((e) => {
        console.log('[MMR]', 'Error fetching match details', {
          matchId,
          channel: connectedSocketClient.name,
          error: e,
        })
        // Force update when an error occurs and just let mods take care of the discrepancy
        // We assume the match was ranked
        updateMMR(increase)
      })
  }

  // TODO: CRON Job
  // 1 Find bets that are open and don't equal this match id and close them
  // 2 Next, check if the prediction is still open
  // 3 If it is, steam dota2 api result of match
  // 4 Then, tell twitch to close bets based on win result
  async function openBets() {
    // The bet was already made
    if (betExists !== null) return

    // Why open if not playing?
    if (client?.gamestate?.player?.activity !== 'playing') return

    // Why open if won?
    if (client.gamestate?.map?.win_team !== 'none') return

    // We at least want the hero name so it can go in the twitch bet title
    if (!client.gamestate?.hero?.name || !client.gamestate?.hero?.name.length) return

    // It's not a live game, so we don't want to open bets nor save it to DB
    if (!client.gamestate?.map?.matchid || client.gamestate?.map?.matchid === '0') return

    const channel = connectedSocketClient.name
    const isOpenBetGameCondition =
      client.gamestate?.map?.clock_time < 20 && client.gamestate?.map?.name === 'start'

    // Check if this bet for this match id already exists, dont continue if it does
    prisma.bet
      .findFirst({
        select: {
          id: true,
        },
        where: {
          userId: connectedSocketClient.token,
          matchId: client.gamestate?.map?.matchid,
          won: null,
        },
      })
      .then((bet) => {
        // Saving to local memory so we don't have to query the db again
        if (bet && bet?.id) {
          console.log('[BETS]', 'Found a bet in the database', bet?.id)
          betExists = client.gamestate?.map?.matchid || null
        } else {
          if (!isOpenBetGameCondition) {
            return
          }

          betExists = client.gamestate?.map?.matchid || null
          updateSteam32Id()

          prisma.bet
            .create({
              data: {
                // TODO: Replace prediction id with the twitch api bet id result
                predictionId: client.gamestate?.map?.matchid as string,
                matchId: client.gamestate?.map?.matchid as string,
                userId: client.token,
                myTeam: client.gamestate?.player?.team_name as string,
              },
            })
            .then(() => {
              const hero = findHero(client?.gamestate?.hero?.name || '')

              openTwitchBet(channel, client.token, hero?.localized_name)
                .then(() => {
                  chatClient.say(channel, `Bets open peepoGamble`)
                  console.log('[BETS]', {
                    event: 'open_bets',
                    data: {
                      matchId: client.gamestate?.map?.matchid,
                      user: client.token,
                      player_team: client.gamestate?.player?.team_name,
                    },
                  })
                })
                .catch((e) => {
                  console.log('[BETS]', 'Error opening twitch bet', channel, e)
                })
            })
            .catch((error) => {
              if (error.message.includes('duplicate')) {
                console.log('[BETS]', channel, `Bet already exists on ${channel} channel`)
              } else {
                console.log('[BETS]', channel, `Could not add bet to ${channel} channel`, error)
              }
            })
        }
      })
  }

  let endingBets = false
  function endBets(winningTeam: 'radiant' | 'dire' | null) {
    if (betExists === null || endingBets) return
    if (!client) return

    // "none"? Must mean the game hasn't ended yet
    // Would be undefined otherwise if there is no game
    if (!winningTeam && client.gamestate?.map?.win_team === 'none') return

    const localWinner = winningTeam || client.gamestate?.map?.win_team
    const myTeam = client.gamestate?.player?.team_name
    const won = myTeam === localWinner

    // Both or one undefined
    if (!localWinner || !myTeam) return

    if (winningTeam === null) {
      console.log('[BETS]', 'Running end bets from newdata', { token: client.token })
    } else {
      console.log('[BETS]', 'Running end bets from map:win_team', { token: client.token })
    }

    endingBets = true
    const channel = connectedSocketClient.name
    handleMMR(won, betExists)

    prisma.bet
      .update({
        data: {
          won,
        },
        where: {
          matchId_userId: {
            userId: client.token,
            matchId: client.gamestate?.map?.matchid as string,
          },
        },
      })
      .then(() => {
        closeTwitchBet(channel, won, client.token)
          .then(() => {
            betExists = null
            endingBets = false

            chatClient.say(
              connectedSocketClient.name,
              `Bets closed, we have ${won ? 'won' : 'lost'}`,
            )

            console.log('[BETS]', {
              event: 'end_bets',
              data: {
                matchId: client.gamestate?.map?.matchid,
                token: client.token,
                winning_team: localWinner,
                player_team: myTeam,
                didWin: won,
              },
            })
          })
          .catch((e) => {
            betExists = null
            endingBets = false
            console.log('[BETS]', 'Error closing twitch bet', channel, e)
          })
      })
  }

  function setupOBSBlockers(state: string) {
    if (!client) return

    connectedSocketClient.sockets.forEach((socketId: string) => {
      // Sending a msg to just this socket
      if (!blockingMinimap[socketId] && minimapStates.includes(state)) {
        console.log('[OBS]', 'Block minimap', { token: client.token })
        blockingMinimap[socketId] = true
        allUnblocked[socketId] = false

        server.io
          .to(socketId)
          .emit('block', { type: 'minimap', team: client.gamestate?.player?.team_name })
      }

      if (blockingMinimap[socketId] && !minimapStates.includes(state)) {
        console.log('[OBS]', 'Unblock minimap', { token: client.token })
        blockingMinimap[socketId] = false
      }

      if (!blockingPicks[socketId] && pickSates.includes(state)) {
        console.log('[OBS]', 'Block hero picks for team', client.gamestate?.player?.team_name, {
          token: client.token,
        })
        blockingPicks[socketId] = true
        allUnblocked[socketId] = false

        server.io
          .to(socketId)
          .emit('block', { type: 'picks', team: client.gamestate?.player?.team_name })
      }

      if (blockingPicks[socketId] && !pickSates.includes(state)) {
        console.log('[OBS]', 'Unblock picks', { token: client.token })
        blockingPicks[socketId] = false
      }

      // Only send unblocker once per socket
      if (!blockingMinimap[socketId] && !blockingPicks[socketId] && !allUnblocked[socketId]) {
        console.log('[OBS]', 'Unblock all OBS layers', { token: client.token })
        allUnblocked[socketId] = true

        server.io
          .to(socketId)
          .emit('block', { type: null, team: client.gamestate?.player?.team_name })
      }
    })
  }

  // client.on('player:activity', (activity: string) => {
  //   if (isCustomGame(client)) return

  //   // Just started a game
  //   if (activity === 'playing') {
  //     console.log('[BETS]','Open bets from player:activity', { token: client.token })
  //     openBets()
  //   }
  // })

  client.on('hero:name', (name: string) => {
    if (isCustomGame(client)) return

    const heroName = name.substr(14)

    // Hero name is empty when you first pick
    // It gets filled out after its locked in and no longer bannable
    console.log('[HERO]', `Playing hero ${heroName}`, { token: client.token })
  })

  // Catch all
  client.on('newdata', (data: Dota2) => {
    if (isCustomGame(client)) return

    // In case they connect to a game in progress and we missed the start event
    setupOBSBlockers(data?.map?.game_state)

    openBets()

    endBets(null)

    // User is dead
    if (Number(data.hero?.respawn_seconds) > 0) {
      // recentHealth.fill(100) // TODO: #HEALTH
      passiveMidas.counter = -25
      return
    }

    // TODO: #HEALTH. Find a better way. Dont think this really works
    // const isHealingALot = checkHealth(data, recentHealth)
    // if (isHealingALot) {
    //   console.log('Big heeeeal', { token: client.token })
    // }

    const isMidasPassive = checkMidas(data, passiveMidas)
    if (isMidasPassive) {
      console.log('[MIDAS]', 'Passive Midas!', { token: client.token })
    }
  })

  client.on('hero:smoked', (isSmoked: boolean) => {
    if (isCustomGame(client)) return

    if (isSmoked) {
      chatClient.say(connectedSocketClient.name, `🚬 💣 Shush`)
    }
  })

  client.on('map:paused', (isPaused: boolean) => {
    if (isCustomGame(client)) return

    if (isPaused) {
      chatClient.say(connectedSocketClient.name, `PauseChamp`)
    }
  })

  // Nah not now, disabled
  // client.on('hero:alive', (isAlive) => {
  //   if (isCustomGame(client)) return

  // A random alive message
  // Keep in mind this activates when a match is started too
  // if (isAlive && Math.floor(Math.random() * 3) === 1) {
  //   setTimeout(() => {
  //     console.log('In 3s after spawning?', { token: client.token })
  //   }, 3000)
  // }

  // if (!isAlive && Math.floor(Math.random() * 16) === 1) {
  //   console.log('after dying', { token: client.token })
  // }
  // })

  // This wont get triggered if they click disconnect and dont wait for the ancient to go to 0
  client.on('map:win_team', (winningTeam: 'radiant' | 'dire') => {
    if (isCustomGame(client)) return

    endBets(winningTeam)
  })

  // client.on('map:clock_time', (time: number) => {
  //   if (isCustomGame(client)) return

  //   // Skip pregame
  //   // if ((time + 30) % 300 === 0 && time + 30 > 0) {
  //   //   console.log('Runes coming soon, its currently x:30 minutes', { token: client.token })
  //   // }

  //   // This runs at 0:15 right after bounty runes spawn
  //   // 4 minutes 45 seconds after a game is created
  //   if (
  //     time === 15 &&
  //     client.gamestate?.previously &&
  //     client.gamestate?.previously?.map?.clock_time < 15 &&
  //     client.gamestate?.map?.name === 'start' &&
  //     client.gamestate?.map?.game_state === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'
  //   ) {
  //     // Maybe let bets lock by themselves
  //     // lockBets()
  //   }
  // })
}

// These next two events basically just check if Dota or OBS is opened first
// It then has to act appropriately and just call when both are ready

server.events.on('new-socket-client', ({ client, socketId }) => {
  // Hopefully there's a GSI already saved for this user
  const connectedSocketClient = findUser(client.token)

  // Guess not lol, will be handled by `new-gsi-client` event
  if (!connectedSocketClient?.gsi) {
    console.log('[SOCKET]', 'Waiting for GSI after socket connection', { token: client.token })
    return
  }

  const count = connectedSocketClient.gsi.listenerCount('map:clock_time')
  if (count) {
    // So the backend GSI events for twitch bot etc are setup
    // The new socketid will automatically get all new events to it as well
    // This usually only happens if they open two browser sources or add it multiple times
    // to obs for some reason
    console.log(
      '[SOCKET]',
      'Already setup event listeners for this client, lets setup OBS events',
      socketId,
      {
        token: client.token,
      },
    )
    return
  }

  // Main events were never setup, so do it now that the socket is online
  // Setup main events with the GSI client, assuming it already connected
  console.log('[SOCKET]', 'GSI is connected, and now so is OBS for user:', {
    token: client.token,
  })
  setupMainEvents(connectedSocketClient)
})

server.events.on('new-gsi-client', (client: { token: string }) => {
  if (!client.token) return

  console.log('[GSI]', 'Connecting new GSI client', { token: client.token })
  const connectedSocketClient = findUser(client.token)

  // Only setup main events if the OBS socket has connected
  if (!connectedSocketClient?.sockets?.length) {
    console.log('[GSI]', 'Waiting for OBS', { token: client.token })
    return
  }

  // This means OBS layer is available, but GSI connected AFTER
  console.log('[GSI]', 'Socket is connected', { token: client.token })

  setupMainEvents(connectedSocketClient)
})
