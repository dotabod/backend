import supabase from '../db'
import getChatClient from '../twitch/chatClient'
import { SocketClient, Dota2 } from '../types'
import checkMidas from './checkMidas'
import findUser from './dotaGSIClients'
import D2GSI, { GSIClient } from './lib/dota2-gsi'
import { minimapStates, pickSates } from './trackingConsts'

// Setup twitch chat bot client first
const chatClient = await getChatClient()

// Then setup the dota gsi server & websocket server
const server = new D2GSI()

// spectator = watching a friend live
// team2 = watching replay or live match
// customgamename = playing arcade or hero demo
function isCustomGame(client: GSIClient) {
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
function setupMainEvents(connectedSocketClient: SocketClient) {
  const client = connectedSocketClient.gsi
  if (client === undefined) return

  console.log('twitch chat isRegistered', chatClient.isRegistered)
  chatClient.join(connectedSocketClient.name)

  // Need to do a DB lookup here instead.
  // Server could reboot and lose this in memory
  let betsExist = false

  const passiveMidas = { counter: 0 }
  // const recentHealth = Array(25) // TODO: #HEALTH

  // This array of socket ids is who we want to emit events to:
  // console.log({ sockets: connectedSocketClient.sockets })

  // We want to reset this to false when a new socket connects?
  const blockingMinimap: { [key: string]: boolean } = {}
  const blockingPicks: { [key: string]: boolean } = {}
  const allUnblocked: { [key: string]: boolean } = {}

  function lockBets() {
    if (!client) return

    // TODO: Twitch bot
    if (chatClient.isConnected && chatClient.isRegistered) {
      chatClient.say(connectedSocketClient.name, `modCheck Lock bets peepoGamble`)
    }

    console.log({
      event: 'lock_bets',
      data: {
        token: client.token,
        matchId: client.gamestate?.map?.matchid,
      },
    })
  }

  function openBets() {
    // The bet was already made
    if (betsExist) return

    // why open if not playing?
    if (client?.gamestate?.player?.activity !== 'playing') return

    // why open if won?
    if (client.gamestate?.map?.win_team !== 'none') return

    // TODO: do a DB lookup here to see if a bet does exist before continuing
    // check match id to match current match id. if they mismatch,
    // close the last one by checking steam results, and open this one if you can

    // what if a mod ends a bet by themselves? maybe the db can be just a twitch lookup?
    // that way its always in sync
    // but how to get match id to the twitch prediction?
    // a db to store the match id and the prediction id? with results updated after?
    // console.log(client.gamestate?.map?.game_time, client.gamestate?.map?.name)

    // TODO: REMOVE !betsExist this is dev logic only for when the server restarts
    // the DB check earlier should take care of this edge case
    if (
      !betsExist ||
      (client.gamestate?.map?.game_time < 20 && client.gamestate?.map?.name === 'start')
    ) {
      betsExist = true

      // check if map.matchid exists, > 0 ?

      const channel = connectedSocketClient.name

      // TODO: Twitch bot
      if (chatClient.isConnected && chatClient.isRegistered) {
        chatClient.say(channel, `modCheck Open bets peepoGamble`)
      }

      supabase
        .from('bets')
        .insert({
          matchId: client.gamestate?.map?.matchid,
          userId: client.token,
          myTeam: client.gamestate?.player?.team_name,
        })
        .select()
        .then(({ data, error }) => {
          if (!error) {
            chatClient.say(channel, `Added owner to ${channel} channel`)
          } else if (error.message.includes('duplicate')) {
            console.log(channel, `Owner already exists on ${channel} channel`)
          } else {
            console.log(channel, `Could not add owner to ${channel} channel`)
          }
        })

      console.log({
        event: 'open_bets',
        data: {
          matchId: client.gamestate?.map?.matchid,
          user: client.token,
          player_team: client.gamestate?.player?.team_name,
        },
      })
    }
  }

  function endBets(winningTeam: 'radiant' | 'dire' | null) {
    if (!betsExist) return
    if (!client) return

    // "none"? Must mean the game hasn't ended yet
    // Would be undefined otherwise if there is no game
    if (!winningTeam && client.gamestate?.map?.win_team === 'none') return

    const localWinner = winningTeam || client.gamestate?.map?.win_team
    const myTeam = client.gamestate?.player?.team_name

    // Both or one undefined
    if (!localWinner || !myTeam) return

    if (winningTeam === null) {
      console.log('Running end bets from newdata', { token: client.token })
    } else {
      console.log('Running end bets from map:win_team', { token: client.token })
    }

    if (myTeam === localWinner) {
      console.log('We won! Lets gooooo', { token: client.token })
    } else {
      console.log('We lost :(', { token: client.token })
    }

    // TODO: Twitch bot
    if (chatClient.isConnected && chatClient.isRegistered) {
      chatClient.say(
        connectedSocketClient.name,
        `modCheck Close bets peepoGamble | ${
          myTeam !== localWinner ? 'Did not win Sadge' : 'Won peepoHappy'
        }`,
      )
    }

    console.log({
      event: 'end_bets',
      data: {
        matchId: client.gamestate?.map?.matchid,
        token: client.token,
        winning_team: localWinner,
        player_team: myTeam,
        didWin: myTeam === localWinner,
      },
    })

    betsExist = false
  }

  function setupOBSBlockers(state: string) {
    if (!client) return

    connectedSocketClient.sockets.forEach((socketId: string) => {
      // Sending a msg to just this socket
      if (!blockingMinimap[socketId] && minimapStates.includes(state)) {
        console.log('Block minimap', { token: client.token })
        blockingMinimap[socketId] = true
        allUnblocked[socketId] = false

        server.io
          .to(socketId)
          .emit('block', { type: 'minimap', team: client.gamestate?.player?.team_name })
      }

      if (blockingMinimap[socketId] && !minimapStates.includes(state)) {
        console.log('Unblock minimap', { token: client.token })
        blockingMinimap[socketId] = false
      }

      if (!blockingPicks[socketId] && pickSates.includes(state)) {
        console.log('Block hero picks for team', client.gamestate?.player?.team_name, {
          token: client.token,
        })
        blockingPicks[socketId] = true
        allUnblocked[socketId] = false

        server.io
          .to(socketId)
          .emit('block', { type: 'picks', team: client.gamestate?.player?.team_name })
      }

      if (blockingPicks[socketId] && !pickSates.includes(state)) {
        console.log('Unblock picks', { token: client.token })
        blockingPicks[socketId] = false
      }

      // Only send unblocker once per socket
      if (!blockingMinimap[socketId] && !blockingPicks[socketId] && !allUnblocked[socketId]) {
        console.log('Unblock all OBS layers', { token: client.token })
        allUnblocked[socketId] = true

        server.io
          .to(socketId)
          .emit('block', { type: null, team: client.gamestate?.player?.team_name })
      }
    })
  }

  client.on('player:activity', (activity: string) => {
    if (isCustomGame(client)) return

    // Just started a game
    if (activity === 'playing') {
      console.log('Open bets from player:activity', { token: client.token })
      openBets()
    }
  })

  client.on('hero:name', (name: string) => {
    if (isCustomGame(client)) return

    const heroName = name.substr(14)

    // Hero name is empty when you first pick
    // It gets filled out after its locked in and no longer bannable
    console.log(`Playing hero ${heroName}`, { token: client.token })
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
      console.log('Passive Midas!', { token: client.token })
    }
  })

  client.on('map:paused', (isPaused: boolean) => {
    if (isCustomGame(client)) return

    if (isPaused) {
      console.log('Map is paused, send pauseChamp', { token: client.token })
    } else {
      console.log('Map unpaused?', { token: client.token })
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

  client.on('map:clock_time', (time: number) => {
    if (isCustomGame(client)) return

    // Skip pregame
    // if ((time + 30) % 300 === 0 && time + 30 > 0) {
    //   console.log('Runes coming soon, its currently x:30 minutes', { token: client.token })
    // }

    // This runs at 0:15 right after bounty runes spawn
    // 4 minutes 45 seconds after a game is created
    if (
      time === 15 &&
      client.gamestate?.previously &&
      client.gamestate?.previously?.map?.clock_time < 15 &&
      client.gamestate?.map?.name === 'start' &&
      client.gamestate?.map?.game_state === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'
    ) {
      lockBets()
    }
  })
}

// These next two events basically just check if Dota or OBS is opened first
// It then has to act appropriately and just call when both are ready

server.events.on('new-socket-client', ({ client, socketId }) => {
  // Hopefully there's a GSI already saved for this user
  const connectedSocketClient = findUser(client.token)

  // Guess not lol, will be handled by `new-gsi-client` event
  if (!connectedSocketClient?.gsi) {
    console.log('Waiting for GSI after socket connection', { token: client.token })
    return
  }

  const count = connectedSocketClient.gsi.listenerCount('map:clock_time')
  if (count) {
    // So the backend GSI events for twitch bot etc are setup
    // The new socketid will automatically get all new events to it as well
    // This usually only happens if they open two browser sources or add it multiple times
    // to obs for some reason
    console.log('Already setup event listeners for this client, lets setup OBS events', socketId, {
      token: client.token,
    })
    return
  }

  // Main events were never setup, so do it now that the socket is online
  // Setup main events with the GSI client, assuming it already connected
  console.log('GSI is connected, and now so is OBS for user:', {
    token: client.token,
  })
  setupMainEvents(connectedSocketClient)
})

server.events.on('new-gsi-client', (client: { token: string }) => {
  if (!client.token) return

  const connectedSocketClient = findUser(client.token)

  // Only setup main events if the OBS socket has connected
  if (!connectedSocketClient?.sockets?.length) {
    console.log('Waiting for OBS', { token: client.token })
    return
  }

  // This means OBS layer is available, but GSI connected AFTER
  console.log('Socket is connected', { token: client.token })

  setupMainEvents(connectedSocketClient)
})
