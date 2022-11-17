import { getChatClient } from './setup'
import { getRankDescription } from '../utils/constants'
import prisma from '../db/prisma'
import { findUserByName } from '../dota/dotaGSIClients'
import { isCustomGame, server } from '../dota'
import { toUserName } from '@twurple/chat'
import heroes from 'dotabase/json/heroes.json' assert { type: 'json' }

// Setup twitch chat bot client first
export const chatClient = await getChatClient()

const CooldownManager = {
  // 30 seconds
  cooldownTime: 30 * 1000,
  store: new Map(),

  canUse: function (commandName: string) {
    // Check if the last time you've used the command + 30 seconds has passed
    // (because the value is less then the current time)
    const lastUsed = this.store.get(commandName)
    if (!lastUsed) return true

    return lastUsed + this.cooldownTime < Date.now()
  },

  touch: function (commandName: string) {
    // Store the current timestamp in the store based on the current commandName
    this.store.set(commandName, Date.now())
  },
}

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
  const command = args[0].toLowerCase()
  if (!commands.includes(command)) return
  if (!CooldownManager.canUse(command)) return

  const connectedSocketClient = findUserByName(toUserName(channel))

  switch (command) {
    case '!help':
      chatClient.say(channel, commands.join(' '))
      break
    case '!pleb':
      // Only mod or owner
      if (!msg.userInfo.isBroadcaster && !msg.userInfo.isMod) break

      plebMode.add(channel)
      chatClient.say(channel, '/subscribersoff')
      chatClient.say(channel, 'One pleb IN 👇')
      break
    case '!camps':
      if (!connectedSocketClient?.gsi) break
      if (isCustomGame(connectedSocketClient?.gsi)) break

      const camps = connectedSocketClient?.gsi?.gamestate?.player?.camps_stacked

      if (camps === 0) {
        chatClient.say(channel, 'No camps stacked')
        break
      }

      if (!connectedSocketClient || !camps) {
        chatClient.say(channel, 'Not playing PauseChamp')
        break
      }

      chatClient.say(channel, `Camps stacked: ${camps}`)
      break
    case '!gpm':
      if (!connectedSocketClient?.gsi) break
      if (isCustomGame(connectedSocketClient?.gsi)) break

      const gpm = connectedSocketClient?.gsi?.gamestate?.player?.gpm

      if (gpm === 0) {
        chatClient.say(channel, 'Live GPM: 0')
        break
      }

      if (!connectedSocketClient || !gpm) {
        chatClient.say(channel, 'Not playing PauseChamp')
        break
      }

      chatClient.say(channel, `Live GPM: ${gpm}`)
      break
    case '!hero':
      if (!connectedSocketClient?.gsi) break
      if (isCustomGame(connectedSocketClient?.gsi)) break
      if (!connectedSocketClient || !connectedSocketClient?.gsi?.gamestate?.hero?.name) {
        chatClient.say(channel, 'Not playing PauseChamp')
        break
      }

      const hero = heroes.find(
        (hero) => hero.full_name === connectedSocketClient?.gsi?.gamestate?.hero?.name,
      )

      if (!hero) {
        chatClient.say(channel, "Couldn't find hero Sadge")
        break
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
      if (!msg.userInfo.isBroadcaster && !msg.userInfo.isMod) break

      const mmr = args[1]

      if (!mmr || !Number(mmr)) {
        console.log('Invalid mmr', mmr, channel)

        break
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

  CooldownManager.touch(command)
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
