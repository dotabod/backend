import supabase from '../db'
import { getChatClient } from './setup'
import { getRankDescription } from '../utils/constants'
import { toUserName } from '@twurple/chat'
import heroes from 'dotabase/json/heroes.json'

// Only mods or owner can run commands
//   if (!msg.userInfo.isBroadcaster && !msg.userInfo.isMod) return

// Setup twitch chat bot client first
export const chatClient = await getChatClient()

chatClient.onMessage(function (channel, user, text, msg) {
  if (!text.startsWith('!')) return
  const args = text.slice(1).split('!')

  switch (args[0]) {
    // Return channel owners mmr if its in the db
    case 'hero':
      // coming soon from dotabase
      break
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

/*
  Required emotes:

  EZ
  Clap
  peepoGamble
  PauseChamp

Commands coming soon:
  !dotabod to show all commands
  !mmr= to set mmr manually
  !hero to show hero aliases

Commands that are fun:
  !modsonly = enable submode and delete chatters that arent mods
  !plebs = if submode, disable submode, wait for 1 pleb chatter, then enable sub mode
  !nonfollowersonly = can only chat if you're not a follower xd

*/
