import { ApiClient } from '@twurple/api'
import dota2Api from 'dota2-api'
import chatClient, { authProvider } from './chatClient.js'
import { steamID64toSteamID32 } from '../utils/index.js'
import supabase from '../db/supabase.js'

// const channel = supabase.channel('db-changes')
// channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
//   console.log('New user to send bot to: ', payload)
// })

// channel.subscribe(async (status) => {
//   if (status === 'SUBSCRIBED') {
//     console.log('Ready to receive database changes!')
//   }
// })

// Just used for testing
const randomMatch = '6862608251'
const playerId = '849473199'

const apiDota = dota2Api.create(process.env.STEAM_WEB_API)

// fetch(`https://api.opendota.com/api/matches/${randomMatch}`)
//   .then((response) => response.json())
//   .then((data) => console.log(data))

// fetch(`https://api.opendota.com/api/players/${playerId}/matches?date=1&game_mode=22`)
//   .then((response) => response.json())
//   .then((data) => console.log(data))

// radiant_win: false || true
// json returned + undefined radiant_win = not scored, refund bets
// {"error":"Match ID not found"} = ongoing match
// function getMatch(id) {
// try {
//   apiDota.getMatchDetails({ match_id: id }).then(
//     ({ result }) => {
//       console.log(JSON.stringify(result))
//     },
//     (e) => {
//       console.log('Game coordinator is down probably. Check again later')
//     },
//   )
// } catch (e) {
//   console.log('Game coordinator is down probably. Check again later')
// }
// }

// // await chatClient.connect()
// chatClient.onMessage((channel, user, text, msg) => {
//   if (!text.startsWith('!dotabod')) return

//   // Only mods or owner can run commands
//   if (!msg.userInfo.isBroadcaster && !msg.userInfo.isMod) return

//   const args = text.slice(1).split(' ')

//   // pleb command
//   // let one free chatter in during sub only mode lol
//   // turn sub only mode back on when they're in

//   // mod only command
//   // only allow mods to post lol, delete anyone else

//   // non followers only LUL

//   switch (args[1]) {
//     case 'ping':
//       chatClient.say(channel, 'Pong EZ Clap')
//       break
//     // Watches this user's matches for automation stuff
//     case 'addowner':
//       const steamid = args[2]

//       if (!steamid || steamid.length !== 17 || !Number(steamid)) {
//         chatClient.say(channel, 'Could not add owner. Must be 17 numbers, eg 74370493176801532')
//         break
//       }

//       // Account ID used in Dota GSI, save this to supabase
//       const accountid = steamID64toSteamID32(steamid)

//       // `https://api.opendota.com/api/players/${accountid}`
//       supabase
//         .from('steam_to_twitch')
//         .insert({
//           accountid,
//           added_by: user,
//           steamid,
//           channel,
//         })
//         .select()
//         .then(({ data, error }) => {
//           if (!error) {
//             chatClient.say(channel, `Added owner to ${channel} channel`)
//           } else if (error.message.includes('duplicate')) {
//             chatClient.say(channel, `Owner already exists on ${channel} channel`)
//           } else {
//             chatClient.say(channel, `Could not add owner to ${channel} channel`)
//           }
//         })
//         .catch((error) => {
//           chatClient.say(channel, `Could not add owner to ${channel} channel`)
//         })

//       break
//     default:
//       chatClient.say(channel, 'Unrecognized command')
//       break
//   }
// })

// TODO: Create predictions using API
// const api = new ApiClient({ authProvider })
