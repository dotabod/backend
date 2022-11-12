import checkMidas from './checkMidas.js'
import findUser from './dotaGSIClients.js'
import server from './lib/server.js'
import { minimapStates, pickSates } from './trackingConsts.js'

// spectator = watching a friend live
// team2 = watching replay or live match
// customgamename = playing arcade or hero demo
function isCustomGame(client) {
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
function setupMainEvents(connectedSocketClient) {
  let betsExist = false
  const passiveMidas = { counter: 0 }

  // const recentHealth = Array(25) // TODO: #HEALTH

  const client = connectedSocketClient.gsi

  // This array of socket ids is who we want to emit events to:
  // console.log({ sockets: connectedSocketClient.sockets })

  // We want to reset this to false when a new socket connects?
  const blockingMinimap = {}
  const blockingPicks = {}

  function setupOBSBlockers(state) {
    connectedSocketClient.sockets.forEach((socketId) => {
      // Sending a msg to just this socket
      if (!blockingMinimap[socketId] && minimapStates.includes(state)) {
        console.log('Block minimap', { token: client.token })
        blockingMinimap[socketId] = true

        server.io
          .to(socketId)
          .emit('block', { type: 'minimap', team: client.gamestate.player?.team_name })
      }

      if (blockingMinimap[socketId] && !minimapStates.includes(state)) {
        console.log('Unblock minimap', { token: client.token })
        blockingMinimap[socketId] = false
      }

      if (!blockingPicks[socketId] && pickSates.includes(state)) {
        console.log('Block hero picks for team', client.gamestate.player?.team_name, {
          token: client.token,
        })
        blockingPicks[socketId] = true

        server.io
          .to(socketId)
          .emit('block', { type: 'picks', team: client.gamestate.player?.team_name })
      }

      if (blockingPicks[socketId] && !pickSates.includes(state)) {
        console.log('Unblock picks', { token: client.token })
        blockingPicks[socketId] = false
      }

      if (!blockingMinimap[socketId] && !blockingPicks[socketId]) {
        console.log('Unblock all OBS layers', { token: client.token })

        server.io
          .to(socketId)
          .emit('block', { type: null, team: client.gamestate.player?.team_name })
      }
    })
  }

  client.on('player:activity', (activity) => {
    if (isCustomGame(client)) return

    if (activity === 'playing') {
      if (client.gamestate.map.game_time < 20 && client.gamestate.map.name === 'start') {
        betsExist = true

        // TODO: Twitch bot
        console.log({
          event: 'open_bets',
          data: {
            user: client.token,
            player_team: client.gamestate.player.team_name,
          },
        })
      }
    }
  })

  client.on('hero:name', (name) => {
    if (isCustomGame(client)) return

    const heroName = name.substr(14)
    console.log(`Playing hero ${heroName}`, { token: client.token })
  })

  client.on('map:game_state', (state) => {
    if (isCustomGame(client)) return

    setupOBSBlockers(state)
  })

  // Catch all
  client.on('newdata', (data) => {
    if (isCustomGame(client)) return

    // In case they connect to a game in progress and we missed the start event
    setupOBSBlockers(data?.map?.game_state)

    // User is dead
    if (data.hero?.respawn_seconds > 0) {
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

  client.on('map:paused', (isPaused) => {
    if (isCustomGame(client)) return

    if (isPaused) {
      console.log('Map is paused, send pauseChamp', { token: client.token })
    } else {
      console.log('Map unpaused?', { token: client.token })
    }
  })

  client.on('hero:alive', (isAlive) => {
    if (isCustomGame(client)) return

    // A random alive message
    // Keep in mind this activates when a match is started too
    if (isAlive && Math.floor(Math.random() * 3) === 1) {
      setTimeout(() => {
        console.log('In 3s after spawning?', { token: client.token })
      }, 3000)
    }

    if (!isAlive && Math.floor(Math.random() * 16) === 1) {
      console.log('after dying', { token: client.token })
    }
  })

  client.on('map:win_team', (team) => {
    if (isCustomGame(client)) return

    console.log('Winning team: ', team, { token: client.token })

    if (client.gamestate.player.team_name === team) {
      console.log('We won! Lets gooooo', { token: client.token })
    } else {
      console.log('We lost :(', { token: client.token })
    }

    console.log({
      event: 'end_bets',
      data: {
        token: client.token,
        winning_team: team,
        player_team: client.gamestate.player.team_name,
      },
    })
    betsExist = false
  })

  client.on('map:clock_time', (time) => {
    if (isCustomGame(client)) return

    // Skip pregame
    if ((time + 30) % 300 === 0 && time + 30 > 0) {
      console.log('Runes coming soon, its currently x:30 minutes', { token: client.token })
    }

    if (
      time === 15 &&
      client.gamestate.previously.map.clock_time < 15 &&
      client.gamestate.map.name === 'start' &&
      client.gamestate.map.game_state === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'
    ) {
      // This runs at 0:00 right after bounty runes spawn I think

      // TODO: Twitch bot
      console.log({
        event: 'lock_bets',
        data: { token: client.token },
      })
    }
  })
}

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
    // But for this new socketid, we should setup the OBS layer events
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

server.events.on('new-gsi-client', (client) => {
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
