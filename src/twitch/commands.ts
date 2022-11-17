import { getChatClient } from './setup'
import { getRankDescription } from '../utils/constants'
import prisma from '../db/prisma'
import { findUserByName } from '../dota/dotaGSIClients'
import { isCustomGame, server } from '../dota'
import { toUserName } from '@twurple/chat'
import heroes from 'dotabase/json/heroes.json' assert { type: 'json' }

// Setup twitch chat bot client first
export const chatClient = await getChatClient()

let plebMode = new Set()
const commands = ['!pleb', '!gpm', '!hero', '!mmr', '!mmr=', '!ping', '!help', '!camps']
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
  if (!commands.includes(args[0].toLowerCase())) return

  const connectedSocketClient = findUserByName(toUserName(channel))

  switch (args[0].toLowerCase()) {
    case '!help':
      chatClient.say(channel, commands.join(' '))
      break
    case '!pleb':
      // Only mod or owner
      if (!msg.userInfo.isBroadcaster && !msg.userInfo.isMod) return

      plebMode.add(channel)
      chatClient.say(channel, '/subscribersoff')
      chatClient.say(channel, 'One pleb IN 👇')
      break
    case '!camps':
      if (!connectedSocketClient?.gsi) return
      if (isCustomGame(connectedSocketClient?.gsi)) return

      const camps = connectedSocketClient?.gsi?.gamestate?.player?.camps_stacked

      if (camps === 0) {
        chatClient.say(channel, 'No camps stacked')
        return
      }

      if (!connectedSocketClient || !camps) {
        chatClient.say(channel, 'Not playing PauseChamp')
        return
      }

      chatClient.say(channel, `Camps stacked: ${camps}`)
      break
    case '!gpm':
      if (!connectedSocketClient?.gsi) return
      if (isCustomGame(connectedSocketClient?.gsi)) return

      const gpm = connectedSocketClient?.gsi?.gamestate?.player?.gpm

      if (gpm === 0) {
        chatClient.say(channel, 'Live GPM: 0')
        return
      }

      if (!connectedSocketClient || !gpm) {
        chatClient.say(channel, 'Not playing PauseChamp')
        return
      }

      chatClient.say(channel, `Live GPM: ${gpm}`)
      break
    case '!hero':
      if (!connectedSocketClient?.gsi) return
      if (isCustomGame(connectedSocketClient?.gsi)) return
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
        `${hero?.aliases}. Primary attribute: ${hero?.attr_primary}. ${hero?.roles.replaceAll(
          '|',
          ', ',
        )}`.toLowerCase(),
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
