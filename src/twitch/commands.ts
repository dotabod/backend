import { getChatClient } from './setup'
import { getRankDescription } from '../utils/constants'
import { toUserName } from '@twurple/chat'
import prisma from '../db/prisma'
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
      prisma.user
        .findFirst({
          select: {
            mmr: true,
            playerId: true,
          },
          where: {
            name: toUserName(channel),
          },
        })
        .then((user) => {
          if (!user || !user.mmr || !user.playerId) return
          getRankDescription(user.mmr, user?.playerId || 0).then((description) => {
            chatClient.say(channel, description)
          })
        })

      break
    case 'ping':
      chatClient.say(channel, 'Pong EZ Clap')
      break
    default:
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
