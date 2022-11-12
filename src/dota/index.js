import checkHealth from './checkHealth.js'
import checkMidas from './checkMidas.js'
import findUser from './dotaGSIClients.js'
import server from './lib/server.js'
import { minimapStates, pickSates } from './trackingConsts.js'

function stopWin() {}

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
      }
    }
  })

  client.on('hero:name', (name) => {
    const heroName = name.substr(14)
    console.log(`Playing hero ${heroName}`, { token: client.token })
  })

  client.on('map:game_state', (state) => {
    setupOBSBlockers(state)
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
      console.log('isMidasPassive', isMidasPassive, { token: client.token })
    }

    const isHealingALot = checkHealth(data, recentHealth)
    if (isHealingALot) {
      console.log('isHealingALot', isHealingALot, { token: client.token })
    }
  })

  client.on('map:paused', (isPaused) => {
    if (isPaused) {
      console.log('Map is paused, send pauseChamp', isPaused, { token: client.token })
    }
  })

  client.on('hero:alive', (isAlive) => {
    if (client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
      return
    }

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
    console.log('Winning team: ', team, { token: client.token })

    // TODO: Dont forget to check for spectate mode in other gsi events too
    if (client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
      return
    }

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
    if (client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
      return
    }

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
  // Hopefully there's a GSI already saved for this user?
  const connectedSocketClient = findUser(client.token)

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
