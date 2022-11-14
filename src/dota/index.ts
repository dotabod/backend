import supabase from '../db'
import getChatClient from '../twitch/chatClient'
import { SocketClient, Dota2 } from '../types'
import checkMidas from './checkMidas'
import findUser from './dotaGSIClients'
import D2GSI, { GSIClient } from './lib/dota2-gsi'
import { minimapStates, pickSates } from './trackingConsts'

// TODO: We shouldn't use await beyond the getChatClient(), it slows down the server I think

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
async function setupMainEvents(connectedSocketClient: SocketClient) {
  const client = connectedSocketClient.gsi
  if (client === undefined) return

  console.log('twitch chat isRegistered', chatClient.isRegistered)
  await chatClient.join(connectedSocketClient.name)
  console.log('twitch chat channel joined', connectedSocketClient.name)

  // Server could reboot and lose this in memory
  // But that's okay because we'll just do a db call once in openBets()
  let betExists = false

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

  async function openBets() {
    // The bet was already made
    if (betExists) return

    // why open if not playing?
    if (client?.gamestate?.player?.activity !== 'playing') return

    // why open if won?
    if (client.gamestate?.map?.win_team !== 'none') return

    const channel = connectedSocketClient.name
    const isLiveMatch = client.gamestate?.map?.matchid && client.gamestate?.map?.matchid !== '0'
    const isOpenBetGameCondition =
      client.gamestate?.map?.game_time < 20 && client.gamestate?.map?.name === 'start'

    // A list of accounts that can test in demo mode
    const isDevMatch = ['techleed'].includes(channel)
    if (isDevMatch) {
      // Marking as a valid bet anyway, but will let chat know its fake
      chatClient.say(channel, `This is where bets would open if it was a real match peepoGamble`)
      console.log({
        event: 'open_bets',
        data: {
          matchId: client.gamestate?.map?.matchid,
          user: client.token,
          player_team: client.gamestate?.player?.team_name,
        },
      })
      betExists = true
      return
    }

    // It's not a live game, so we don't want to open bets nor save it to DB
    if (!isLiveMatch) return

    // TODO: Find bets that are won = null that don't equal this match id and close them
    // Next, check if the prediction is still open
    // If it is, steam dota2 api result of match
    // Then, tell twitch to close bets based on win result
    const { data: bet, error } = await supabase
      .from('bets')
      .select()
      .eq('userId', client.token)
      .eq('matchId', client.gamestate?.map?.matchid)
      .is('won', null)
      .limit(1)
      .single()

    // This really should only show if there was a mistake in my query selector above
    if (error) {
      console.log(
        'ERROR: Getting bet from database',
        error,
        client.token,
        client.gamestate?.map?.matchid,
      )
    }

    // Saving to local memory so we don't have to query the db again
    if (bet && bet?.id) {
      betExists = true
      return
    }

    if (!isOpenBetGameCondition) return

    supabase
      .from('bets')
      .insert({
        // TODO: Replace prediction id with the twitch api bet id result
        predictionId: client.gamestate?.map?.matchid,
        matchId: client.gamestate?.map?.matchid,
        userId: client.token,
        myTeam: client.gamestate?.player?.team_name,
      })
      .then(({ data, error }) => {
        if (!error) {
          chatClient.say(channel, `Bets open peepoGamble`)
          betExists = true

          console.log({
            event: 'open_bets',
            data: {
              matchId: client.gamestate?.map?.matchid,
              user: client.token,
              player_team: client.gamestate?.player?.team_name,
            },
          })
        } else if (error.message.includes('duplicate')) {
          console.log(channel, `Bet already exists on ${channel} channel`, error)
        } else {
          console.log(channel, `Could not add bet to ${channel} channel`, error)
        }
      })
  }

  function endBets(winningTeam: 'radiant' | 'dire' | null) {
    if (!betExists) return
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

    betExists = false
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
