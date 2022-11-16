import supabase from '../db'
import { getChatClient } from './setup'
import { getRankDescription } from '../utils/constants'
import { toUserName } from '@twurple/chat'
// import heroes from 'dotabase/json/heroes.json'

// Setup twitch chat bot client first
export const chatClient = await getChatClient()

let plebMode: { [n: string]: boolean } = {}
chatClient.onMessage(function (channel, user, text, msg) {
  // Letting one pleb in
  if (plebMode[channel] && !msg.userInfo.isSubscriber) {
    plebMode[channel] = false
    chatClient.say(channel, '/subscribers')
    chatClient.say(channel, `${user} EZ Clap`)
    return
  }

  if (!text.startsWith('!')) return
  const args = text.slice(1).split('!')

  switch (args[0]) {
    case 'pleb':
      // Only mod or owner
      if (!msg.userInfo.isBroadcaster && !msg.userInfo.isMod) return

      plebMode[channel] = true
      chatClient.say(channel, '/subscribersoff')
      chatClient.say(channel, 'One pleb IN 👇')
      break
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
            console.log('[COMMANDS]', 'mmr SELECT error', error)
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
  !nonfollowersonly = can only chat if you're not a follower xd

When hero alch, show GPM

*/
