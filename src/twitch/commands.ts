import supabase from '../db'
import { getChatClient } from './setup'
import { getRankDescription } from '../utils/constants'
import { toUserName } from '@twurple/chat'

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
