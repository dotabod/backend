import { ChatUser, toUserName } from '@twurple/chat'
import { TwitchPrivateMessage } from '@twurple/chat/lib/commands/TwitchPrivateMessage'

import getDBUser, { getSteamByTwitchId } from '../../db/getDBUser'
import { getWL } from '../../db/getWL'
import { prisma } from '../../db/prisma'
import { DBSettings, getValueOrDefault } from '../../db/settings'
import { server } from '../../dota'
import getHero from '../../dota/lib/getHero'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch'
import { getRankDescription } from '../../dota/lib/ranks'
import { updateMmr } from '../../dota/lib/updateMmr'
import { SocketClient } from '../../types'
import axios from '../../utils/axios'
import { getChatClient } from '../lib/getChatClient'
import { CooldownManager } from './CooldownManager'

/*
Commands that are fun for future:
  !nonfollowersonly = can only chat if you're not a follower xd
*/

// Setup twitch chat bot client first
export const chatClient = await getChatClient()

const ADMIN_CHANNELS = (process.env.ADMIN_CHANNELS ?? '').split(',')

function isRegularUser(userInfo: ChatUser) {
  return !userInfo.isBroadcaster && !userInfo.isMod && !ADMIN_CHANNELS.includes(userInfo.userName)
}

const plebMode = new Set()
const modMode = new Set()
const commands = [
  '!gpm',
  '!hero',
  '!mmr',
  '!xpm',
  '!apm',
  '!wl',
  '!pleb',
  '!commands',
  '!modsonly',
  // more
  '!ping',
  '!dotabod',
  '!refresh',
  '!steam',
  '!mmr=',
]
chatClient.onMessage(function (channel, user, text, msg) {
  // Letting one pleb in
  if (plebMode.has(channel) && !msg.userInfo.isSubscriber) {
    plebMode.delete(channel)
    void chatClient.say(channel, '/subscribers')
    void chatClient.say(channel, `${user} EZ Clap`)
    return
  }

  // Letting one pleb in
  if (modMode.has(channel) && !(msg.userInfo.isMod || msg.userInfo.isBroadcaster)) {
    void chatClient.deleteMessage(channel, msg)
    return
  }

  if (!msg.channelId) return
  if (!text.startsWith('!')) return

  const args = text.split(' ')
  const command = args[0].toLowerCase()
  if (!commands.includes(command)) return
  if (!CooldownManager.canUse(channel, command)) return

  // So we can get the users settings cuz some commands are disabled
  // This runs every command, but its cached so no hit on db
  getDBUser(undefined, msg.channelId)
    .then((client) => {
      if (!client) return

      // Execute command checking
      handleCommand(client, channel, msg, command, args)

      // TODO: fix this touching if its not a mod for a mod command
      CooldownManager.touch(channel, command)
    })
    .catch((e) => {
      //
    })
})

function handleCommand(
  client: SocketClient,
  channel: string,
  msg: TwitchPrivateMessage,
  command: string,
  args: string[],
) {
  if (!msg.channelId) return

  switch (command) {
    case '!modsonly':
      // Only mod or owner
      if (isRegularUser(msg.userInfo)) break

      if (modMode.has(channel)) {
        void chatClient.say(channel, 'Mods only mode disabled Sadge')
        modMode.delete(channel)
        break
      }

      if (!getValueOrDefault(DBSettings.commandModsonly, client.settings)) {
        return
      }

      // Delete all messages that are not from a mod
      modMode.add(channel)
      void chatClient.say(channel, '/subscribers')
      void chatClient.say(channel, 'Mods only mode enabled BASED Clap')

      break
    case '!commands':
      void chatClient.say(channel, `Available commands: ${commands.join(' | ')}`)
      break
    case '!refresh':
      // Only mod or owner
      if (isRegularUser(msg.userInfo)) break

      if (client.sockets.length) {
        void chatClient.say(channel, 'Refreshing overlay...')
        server.io.to(client.sockets).emit('refresh')
      }

      break
    case '!dotabod':
      void chatClient.say(
        channel,
        `I'm an open source bot made by @techleed. More info: https://dotabod.com`,
      )
      break
    case '!wl': {
      if (!getValueOrDefault(DBSettings.commandWL, client.settings)) {
        return
      }

      if (!client.steam32Id) {
        void chatClient.say(channel, 'Not live PauseChamp')
        break
      }

      console.log('[WL] Checking WL for steam32Id', client.steam32Id)

      getWL(msg.channelId)
        .then(({ msg }) => {
          void chatClient.say(channel, msg || 'Unknown WL')
        })
        .catch((e) => {
          console.log(e)
          void chatClient.say(channel, 'Unknown WL')
        })

      break
    }
    case '!pleb':
      if (!getValueOrDefault(DBSettings.commandPleb, client.settings)) {
        return
      }

      // Only mod or owner
      if (isRegularUser(msg.userInfo)) break

      plebMode.add(channel)
      void chatClient.say(channel, '/subscribersoff')
      void chatClient.say(channel, 'One pleb IN 👇')
      break
    case '!xpm': {
      if (!getValueOrDefault(DBSettings.commandXPM, client.settings)) {
        return
      }
      if (!client.gsi) break
      if (!isPlayingMatch(client.gsi)) break

      const xpm = client.gsi.gamestate?.player?.xpm

      if (!xpm) {
        void chatClient.say(channel, 'Live XPM: 0')
        break
      }

      void chatClient.say(channel, `Live XPM: ${xpm}`)
      break
    }
    case '!apm': {
      if (!getValueOrDefault(DBSettings.commandAPM, client.settings)) {
        return
      }
      if (!client.gsi) break
      if (!isPlayingMatch(client.gsi)) break

      const commandsIssued = client.gsi.gamestate?.player?.commands_issued ?? 0

      if (!commandsIssued) {
        void chatClient.say(channel, 'Live APM: 0 Chatting')
        break
      }

      const gameTime = client.gsi.gamestate?.map?.game_time ?? 1
      const apm = Math.round(commandsIssued / (gameTime / 60))

      void chatClient.say(channel, `Live APM: ${apm} Chatting`)
      break
    }
    case '!gpm': {
      if (!getValueOrDefault(DBSettings.commandGPM, client.settings)) {
        return
      }
      if (!client.gsi) break
      if (!isPlayingMatch(client.gsi)) break

      const gpm = client.gsi.gamestate?.player?.gpm

      if (!gpm) {
        void chatClient.say(channel, 'Live GPM: 0')
        break
      }

      const gold_from_hero_kills = client.gsi.gamestate?.player?.gold_from_hero_kills
      const gold_from_creep_kills = client.gsi.gamestate?.player?.gold_from_creep_kills

      void chatClient.say(
        channel,
        `Live GPM: ${gpm}. ${gold_from_hero_kills ?? 0} from hero kills, ${
          gold_from_creep_kills ?? 0
        } from creep kills.`,
      )
      break
    }
    case '!hero': {
      if (!getValueOrDefault(DBSettings.commandHero, client.settings)) {
        return
      }
      if (!client.gsi || !client.steam32Id) break
      if (!isPlayingMatch(client.gsi)) break
      if (!client.gsi.gamestate?.hero?.name) {
        void chatClient.say(channel, 'Not playing PauseChamp')
        break
      }

      const hero = getHero(client.gsi.gamestate.hero.name)

      if (!hero) {
        void chatClient.say(channel, "Couldn't find hero Sadge")
        break
      }

      axios(
        `https://api.opendota.com/api/players/${client.steam32Id}/wl/?hero_id=${hero.id}&having=1&date=30`,
      )
        .then(({ data }: { data: { win: number; lose: number } }) => {
          if (data.win + data.lose === 0) {
            void chatClient.say(channel, `No matches played as ${hero.localized_name} in 30d.`)
            return
          }

          // Divide by zero error
          if (data.win === 0 && data.lose > 0) {
            void chatClient.say(
              channel,
              `Winrate: 0% as ${hero.localized_name} in 30d of ${data.lose} matches.`,
            )
            return
          }

          const winrate = Math.round((data.win / (data.win + data.lose)) * 100)
          void chatClient.say(
            channel,
            `Winrate: ${winrate}% as ${hero.localized_name} in 30d of ${
              data.lose + data.win
            } matches.`,
          )
        })
        .catch((e) => {
          void chatClient.say(channel, `Playing ${hero.localized_name}`)
          console.log(e)
        })

      break
    }
    case '!mmr=': {
      // Only mod or owner
      if (isRegularUser(msg.userInfo)) break

      const [, mmr, steam32Id] = args

      if (!mmr || !Number(mmr) || Number(mmr) > 20000 || Number(mmr) < 0) {
        void chatClient.say(channel, 'Invalid MMR specified')
        break
      }

      if (!steam32Id) {
        getSteamByTwitchId(msg.channelId)
          .then((res) => {
            const steamAccounts = res?.SteamAccount ?? []

            if (steamAccounts.length === 0) {
              // Sends a `0` steam32id so we can save it to the db,
              // but server will update with steam later when they join a match
              updateMmr(mmr, Number(client.steam32Id), channel, msg.channelId)
            } else if (steamAccounts.length === 1) {
              updateMmr(mmr, steamAccounts[0].steam32Id, channel, msg.channelId)
            } else {
              if (!steam32Id) {
                void chatClient.say(
                  channel,
                  `Multiple steam accounts linked to channel. Please specify steam32Id. !mmr= ${mmr} id_goes_here`,
                )
              }
            }
          })
          .catch((e) => {
            // Sends a `0` steam32id so we can save it to the `user` db, but update `steamaccount` later when they join a match
            updateMmr(mmr, Number(steam32Id), channel, msg.channelId)
          })
      } else if (!Number(steam32Id)) {
        void chatClient.say(channel, `Invalid steam32Id specified. !mmr= ${mmr} id_goes_here`)
        break
      } else {
        updateMmr(mmr, Number(steam32Id), channel, msg.channelId)
      }

      break
    }
    case '!steam': {
      // Only mod or owner
      if (isRegularUser(msg.userInfo)) break

      // TODO: whispers do not work via chatClient, have to use helix api
      // helix api rate limits you to 40 unique whispers a day though ?? so just not gonna do it
      void chatClient.say(channel, `https://steamid.xyz/${client.steam32Id ?? ' Unknown'}`)

      break
    }
    case '!mmr':
      // If connected, we can just respond with the cached MMR
      if (client) {
        const mmrEnabled = getValueOrDefault(DBSettings.mmrTracker, client.settings)
        if (!mmrEnabled) break

        // Didn't have a new account made yet on the new steamaccount table
        if (!client.SteamAccount.length) {
          if (client.mmr === 0) {
            void chatClient.say(
              channel,
              `I don't know ${toUserName(
                channel,
              )}'s MMR yet. Mods have to !mmr= 1234 or set it in dotabod.com/dashboard/features`,
            )
            break
          }

          getRankDescription(client.mmr, client.steam32Id ?? undefined)
            .then((description) => {
              void chatClient.say(channel, description)
            })
            .catch((e) => {
              console.log('[MMR] Failed to get rank description', e, channel)
            })
          break
        }

        client.SteamAccount.forEach((act) => {
          if (act.mmr === 0) {
            void chatClient.say(
              channel,
              `I don't know ${
                act.name ?? toUserName(channel)
              }'s MMR yet. Mods have to !mmr= 1234 or set it in dotabod.com/dashboard/features`,
            )
            return
          }

          getRankDescription(act.mmr, act.steam32Id)
            .then((description) => {
              const say =
                client.SteamAccount.length > 1 && act.name
                  ? `${act.name}: ${description}`
                  : description
              void chatClient.say(channel, say)
            })
            .catch((e) => {
              console.log('[MMR] Failed to get rank description', e, channel)
            })
        })

        break
      }

      console.log('[MMR] Fetching MMR from database', channel)

      // Do a DB lookup if the streamer is offline from OBS or Dota
      // TODO: Multiple steam accounts? Find first may only return first one
      prisma.user
        .findFirst({
          select: {
            settings: {
              select: {
                key: true,
                value: true,
              },
            },
            SteamAccount: {
              select: {
                mmr: true,
                steam32Id: true,
                name: true,
              },
            },
          },
          where: {
            Account: {
              providerAccountId: msg.channelId,
            },
          },
        })
        .then((res) => {
          const mmrEnabled = getValueOrDefault(DBSettings.mmrTracker, res?.settings)
          if (!mmrEnabled) return

          if (!res?.SteamAccount[0]?.mmr) {
            void chatClient.say(
              channel,
              `I don't know ${toUserName(
                channel,
              )}'s MMR yet. Mods have to !mmr= 1234 or set it in dotabod.com/dashboard/features`,
            )
            console.log('[MMR] No MMR found in database', res, channel)
            return
          }
          res.SteamAccount.forEach((steamA) => {
            getRankDescription(steamA.mmr, steamA.steam32Id)
              .then((description) => {
                void chatClient.say(channel, description)
              })
              .catch((e) => {
                console.log('[MMR] Failed to get rank description', e, channel)
              })
          })
        })
        .catch((e) => {
          console.log('[MMR] Error fetching MMR from database', e, channel)
        })

      break
    case '!ping':
      void chatClient.say(channel, 'Pong EZ Clap')
      break
    default:
      break
  }
}
