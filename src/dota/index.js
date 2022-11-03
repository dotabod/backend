import Dota2GSI from 'dota2-gsi'
import { fmtMSS } from '../utils/index.js'
import chatClient from '../twitch/chatClient.js'

const server = new Dota2GSI()
server.events.on('newclient', (client) => {
  console.log(`New client connection, IP address: ${client.ip}, Auth token: ${client.auth}`)

  client.on('player:activity', (activity) => {
    if (activity === 'playing' && Number(client.gamestate.map.matchid)) {
      chatClient.say(mainChannel, 'Just started a game EZ')
      console.log('Game started!', client.gamestate.map.matchid)
    }
  })

  client.on('hero:name', (hero_name) => {
    if (Number(client.gamestate.map.matchid) > 0) {
      chatClient.say(mainChannel, `Picked ${hero_name}`)
      console.log('Hero selected:', hero_name)
    }
  })

  client.on('map:game_state', (state) => {
    console.log(`New state ${state}`)
  })

  client.on('hero:alive', (state) => {
    console.log(`Alive? ${state}`, fmtMSS(client.gamestate.map.clock_time))
  })
})
