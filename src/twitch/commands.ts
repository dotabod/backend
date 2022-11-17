import { getChatClient } from './setup'
import { getRankDescription } from '../utils/constants'
import prisma from '../db/prisma'
import { findUserByName } from '../dota/dotaGSIClients'
import { server } from '../dota'
import { toUserName } from '@twurple/chat'
import heroes from 'dotabase/json/heroes.json' assert { type: 'json' }

// Setup twitch chat bot client first
export const chatClient = await getChatClient()

let plebMode = new Set()
chatClient.onMessage(function (channel, user, text, msg) {
  // Letting one pleb in
  if (plebMode.has(channel) && !msg.userInfo.isSubscriber) {
    plebMode.delete(channel)
    chatClient.say(channel, '/subscribers')
    chatClient.say(channel, `${user} EZ Clap`)
    return
  }

  if (!text.startsWith('!')) return
  const args = text.split(' ')

  switch (args[0].toLowerCase()) {
    case '!pleb':
      // Only mod or owner
      if (!msg.userInfo.isBroadcaster && !msg.userInfo.isMod) return

      plebMode.add(channel)
      chatClient.say(channel, '/subscribersoff')
      chatClient.say(channel, 'One pleb IN 👇')
      break
    // Return channel owners mmr if its in the db
    case '!hero':
      const connectedSocketClient = findUserByName(toUserName(channel))
      if (!connectedSocketClient || !connectedSocketClient?.gsi?.gamestate?.hero?.name) {
        chatClient.say(channel, 'Not playing PauseChamp')
        return
      }

      const hero = heroes.find(
        (hero) => hero.full_name === connectedSocketClient?.gsi?.gamestate?.hero?.name,
      )

      if (!hero) {
        chatClient.say(channel, "Couldn't find hero Sadge")
        return
      }

      chatClient.say(
        channel,
        `Playing ${hero?.real_name} aka ${hero?.localized_name}. Primary attribute: ${
          hero?.attr_primary
        }. ${hero?.aliases.includes('|') ? hero?.aliases : ''}`,
      )
      break
    case '!mmr=':
      // Only mod or owner
      if (!msg.userInfo.isBroadcaster && !msg.userInfo.isMod) return

      const mmr = args[1]

      if (!mmr || !Number(mmr)) {
        console.log('Invalid mmr', mmr, channel)

        return
      }
      prisma.account
        .update({
          data: {
            user: {
              update: {
                mmr: Number(mmr),
              },
            },
          },
          where: {
            provider_providerAccountId: {
              provider: 'twitch',
              providerAccountId: msg.userInfo.userId,
            },
          },
        })
        .then(() => {
          chatClient.say(channel, `Updated MMR to ${mmr}`)

          const connectedSocketClient = findUserByName(toUserName(channel))
          if (connectedSocketClient && connectedSocketClient.sockets.length) {
            server.io.to(connectedSocketClient.sockets).emit('update-medal')
          }
        })
        .catch(() => {
          chatClient.say(channel, `Failed to update MMR to ${mmr}`)
        })

      break
    case '!mmr':
      prisma.account
        .findFirst({
          select: {
            user: {
              select: {
                mmr: true,
                playerId: true,
              },
            },
          },
          where: {
            providerAccountId: msg.channelId as string,
          },
        })
        .then((account) => {
          if (!account || !account?.user?.mmr || !account?.user?.playerId) return
          getRankDescription(account.user.mmr, account.user.playerId).then((description) => {
            chatClient.say(channel, description)
          })
        })

      break
    case '!ping':
      chatClient.say(channel, 'Pong EZ Clap')
      break
    default:
      break
  }
})

/*
  Required emotes:

  Sadge
  EZ
  Clap
  peepoGamble
  PauseChamp

Commands coming soon:
  !dotabod to show all commands

Commands that are fun:
  !modsonly = enable submode and delete chatters that arent mods
  !nonfollowersonly = can only chat if you're not a follower xd

When hero alch, show GPM

*/
