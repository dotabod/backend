import checkHealth from './checkHealth.js'
import checkMidas from './checkMidas.js'
import findUser from './dotaGSIClients.js'
import server from './lib/server.js'
import { minimapStates, pickSates } from './trackingConsts.js'

function stopWin() {
  console.log('win_percent_close')
}

// Finally, we have a user and a GSI client
// That means the user opened OBS and connected to Dota 2 GSI
function setupMainEvents(connectedSocketClient) {
  let betsExist = false
  let passiveMidas = 0
  const recentHealth = Array(25)

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
        console.log('Block minimap')
        blockingMinimap[socketId] = true
        server.io.to(socketId).emit('block-minimap', true)
      }

      if (blockingMinimap[socketId] && !minimapStates.includes(state)) {
        console.log('Unblock minimap')
        blockingMinimap[socketId] = false
        server.io.to(socketId).emit('block-minimap', false)
      }

      if (!blockingPicks[socketId] && pickSates.includes(state)) {
        console.log('Block hero picks for team', client.gamestate.player?.team_name)
        blockingPicks[socketId] = true
        server.io.to(socketId).emit('block-picks', { team: client.gamestate.player?.team_name })
      }

      if (blockingPicks[socketId] && !pickSates.includes(state)) {
        console.log('Unblock picks')
        blockingPicks[socketId] = false
        server.io.to(socketId).emit('block-picks', { team: null })
      }
    })
  }

  client.on('player:activity', (activity) => {
    if (client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
      return
    }

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

        console.log(client.gamestate)
      }
    }
  })

  client.on('hero:name', (name) => {
    const heroName = name.substr(14)
    console.log(`Playing hero ${heroName}`)
  })

  client.on('map:game_state', (state) => {
    setupOBSBlockers(state)
  })

  client.on('abilities:ability0:can_cast', (canCast) => {
    if (canCast) console.log('Ability0 off cooldown!')
  })

  // Catch all
  client.on('newdata', (data) => {
    if ('team2' in data.player) {
      return
    }

    // In case they connect to a game in progress and we missed the start event
    setupOBSBlockers(data?.map?.game_state)

    // User is dead
    if (data.hero?.respawn_seconds > 0) {
      recentHealth.fill(100)
      passiveMidas = -25
      return
    }

    const isMidasPassive = checkMidas(data, passiveMidas)
    if (isMidasPassive) {
      console.log('isMidasPassive', isMidasPassive)
    }

    const isHealingALot = checkHealth(data, recentHealth)
    if (isHealingALot) {
      console.log('isHealingALot', isHealingALot)
    }
  })

  client.on('map:paused', (isPaused) => {
    if (isPaused) {
      console.log('Map is paused, send pauseChamp', isPaused)
    }
  })

  client.on('hero:alive', (isAlive) => {
    if (client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
      return
    }
    if (isAlive && Math.floor(Math.random() * 3) === 1) {
      setTimeout(() => {
        console.log('In 3s after spawning?')
      }, 3000)
    }

    if (!isAlive && Math.floor(Math.random() * 16) === 1) {
      console.log('after dying')
    }
  })

  client.on('map:win_team', (team) => {
    console.log('Winning team: ', team)
    stopWin()

    // TODO: Dont forget to check for spectate mode in other gsi events too
    if (client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
      return
    }

    if (client.gamestate.player.team_name === team) {
      console.log("We won! Let's gooooo")
    } else {
      console.log('We lost :(')
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
    if (client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
      return
    }

    // Skip pregame
    if ((time + 30) % 300 === 0 && time + 30 > 0) {
      console.log('First runes? 5 minutes passed?')
    }

    if (
      time === 15 &&
      client.gamestate.previously.map.clock_time < 15 &&
      client.gamestate.map.name === 'start' &&
      client.gamestate.map.game_state === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'
    ) {
      // TODO: Twitch bot
      console.log({
        event: 'lock_bets',
        data: { token: client.token },
      })
    }
  })
}

// How to check if a client connects multiple times
// Are events already setup? via setupMainEvents()
function checkIfClientIsAlreadySetup(client) {
  return client.events.length > 0
}

server.events.on('new-socket-client', ({ client, socketId }) => {
  // Hopefully there's a GSI already saved for this user?
  const connectedSocketClient = findUser(client.token)

  if (!connectedSocketClient?.gsi) {
    console.log('Waiting for GSI after socket connection')
    return
  }

  const count = connectedSocketClient.gsi.listenerCount('map:clock_time')
  if (count) {
    // So the backend GSI events for twitch bot etc are setup
    // But for this new socketid, we should setup the OBS layer events
    console.log('Already setup event listeners for this client, lets setup OBS events', socketId)
    return
  }

  // Main events were never setup, so do it now that the socket is online
  // Setup main events with the GSI client, assuming it already connected
  console.log('GSI is connected, and now so are sockets!', connectedSocketClient.token)
  setupMainEvents(connectedSocketClient)
})

server.events.on('new-gsi-client', (gsiClient) => {
  if (!gsiClient.token) return

  const connectedSocketClient = findUser(gsiClient.token)

  // Only setup main events if the OBS socket has connected
  if (!connectedSocketClient?.sockets?.length) {
    console.log('Waiting for OBS', gsiClient.token)
    return
  }

  // This means OBS layer is available, but GSI connected AFTER
  console.log('Socket is connected', connectedSocketClient?.token)

  setupMainEvents(connectedSocketClient)
})
