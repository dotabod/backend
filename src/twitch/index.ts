import { steamID64toSteamID32 } from '../utils/index'
import supabase from '../db'
import getChatClient from './chatClient'
import { getRankDescription } from '../utils/constants'
import { toUserName } from '@twurple/chat'

// TODO: Create predictions using API
// const api = new ApiClient({ authProvider })

// Setup twitch chat bot client first
export const chatClient = await getChatClient()

chatClient.onMessage(function (channel, user, text, msg) {
  if (!text.startsWith('!')) return
  const args = text.slice(1).split('!')

  switch (args[0]) {
    // Return channel owners mmr if its in the db
    case 'mmr':
      supabase
        .from('users')
        .select('mmr, playerId')
        .ilike('name', toUserName(channel))
        .limit(1)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.log('mmr SELECT error', error)
            return
          }

          getRankDescription(data.mmr, data?.playerId).then((description) => {
            chatClient.say(channel, description)
          })
        })
      break
    case 'ping':
      chatClient.say(channel, 'Pong EZ Clap')
      break
    // Watches this user's matches for automation stuff
    case 'addowner':
      // not yet implemented
      break
      const steamid = args[2]

      if (!steamid || steamid.length !== 17 || !Number(steamid)) {
        chatClient.say(channel, 'Could not add owner. Must be 17 numbers, eg 74370493176801532')
        break
      }

      // Account ID used in Dota GSI, save this to supabase
      const accountid = steamID64toSteamID32(steamid)

      // `https://api.opendota.com/api/players/${accountid}`
      supabase
        .from('steam_to_twitch')
        .insert({
          accountid,
          added_by: user,
          steamid,
          channel,
        })
        .select()
        .then(({ data, error }) => {
          if (!error) {
            chatClient.say(channel, `Added owner to ${channel} channel`)
          } else if (error.message.includes('duplicate')) {
            chatClient.say(channel, `Owner already exists on ${channel} channel`)
          } else {
            chatClient.say(channel, `Could not add owner to ${channel} channel`)
          }
        })

      break
    default:
      // dont spam and say anything
      //   chatClient.say(channel, 'Unrecognized command')
      break
  }
})

// ideas

// pleb command
// let one free chatter in during sub only mode lol
// turn sub only mode back on when they're in

// mod only command
// only allow mods to post lol, delete anyone else

// non followers only LUL

// Only mods or owner can run commands
//   if (!msg.userInfo.isBroadcaster && !msg.userInfo.isMod) return
