import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../settings.js'
import { steamSocket } from '../../../steam/ws.js'
import { getWinProbability2MinAgo } from '../../../stratz/livematch.js'
import { DelayedGames, Packet, SocketClient, validEventTypes } from '../../../types.js'
import { logger } from '../../../utils/logger.js'
import { events } from '../../globalEventEmitter.js'
import { GSIHandler, redisClient } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { checkPassiveMidas } from '../../lib/checkMidas.js'
import { checkPassiveTp } from '../../lib/checkPassiveTp.js'
import { calculateManaSaved } from '../../lib/checkTreadToggle.js'
import { isDev } from '../../lib/consts.js'
import { DelayedCommands } from '../../lib/DelayedCommands.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'
import minimapParser from '../minimap/parser.js'

function chatterMatchFound(client: SocketClient) {
  if (!client.stream_online) return

  const commands = DelayedCommands.filter((cmd) => getValueOrDefault(cmd.key, client.settings))

  if (commands.length) {
    say(
      client,
      t('matchFound', {
        commandList: commands.map((c) => c.command).join(' · '),
        lng: client.locale,
      }),
      {
        chattersKey: 'commandsReady',
        delay: false,
      },
    )
  }
}

const steamServerLookupMap = new Set()
const steamDelayDataLookupMap = new Set()

// Runs every gametick
async function saveMatchData(client: SocketClient) {
  // This now waits for the bet to complete before checking match data
  // Since match data is delayed it will run far fewer than before, when checking actual match id of an ingame match
  // the matchid is saved when the hero is selected
  const matchId = await redisClient.client.get(`${client.token}:matchId`)
  if (!Number(matchId)) return

  if (!client.steam32Id) return

  // did we already come here before?
  const res = await redisClient.client
    .multi()
    .get(`${matchId}:steamServerId`)
    .get(`${matchId}:lobbyType`)
    .exec()

  const [steamServerId] = res
  const [, lobbyType] = res

  if (steamServerId && lobbyType) return

  if (!steamServerId && !lobbyType) {
    if (steamServerLookupMap.has(matchId)) return

    const getDelayedDataPromise = new Promise<string>((resolve, reject) => {
      steamSocket.emit('getUserSteamServer', client.steam32Id, (err: any, cards: any) => {
        if (err) {
          reject(err)
        } else {
          resolve(cards)
        }
      })
    })

    steamServerLookupMap.add(matchId)
    const steamServerId = await getDelayedDataPromise
    steamServerLookupMap.delete(matchId) // Remove the promise once it's resolved

    if (!steamServerId) return
    await redisClient.client.set(`${matchId}:steamServerId`, steamServerId.toString())
  }

  if (steamServerId && !lobbyType) {
    if (steamDelayDataLookupMap.has(matchId)) return

    steamDelayDataLookupMap.add(matchId)
    const getDelayedDataPromise = new Promise<DelayedGames>((resolve, reject) => {
      steamSocket.emit(
        'getRealTimeStats',
        {
          match_id: matchId!,
          refetchCards: true,
          steam_server_id: steamServerId?.toString(),
          token: client.token,
        },
        (err: any, data: DelayedGames) => {
          if (err) {
            reject(err)
          } else {
            resolve(data)
          }
        },
      )
    })

    const delayedData = await getDelayedDataPromise
    steamDelayDataLookupMap.delete(matchId)

    if (!delayedData?.match.lobby_type) return
    await redisClient.client.set(`${matchId}:lobbyType`, delayedData.match.lobby_type)
    chatterMatchFound(client)
  }
}

// Catch all
eventHandler.registerEvent(`newdata`, {
  handler: async (dotaClient: GSIHandler, data: Packet) => {
    // New users who dont have a steamaccount saved yet
    // This needs to run first so we have client.steamid on multiple acts
    await dotaClient.updateSteam32Id()

    // In case they connect to a game in progress and we missed the start event
    await dotaClient.setupOBSBlockers(data.map?.game_state ?? '')

    if (!isPlayingMatch(dotaClient.client.gsi)) return

    // Everything below here requires an ongoing match, not a finished match
    const hasWon =
      dotaClient.client.gsi?.map?.win_team && dotaClient.client.gsi.map.win_team !== 'none'
    if (hasWon) return

    await showProbability(dotaClient)

    // only if they're in a match ^ and they're a beta tester
    if (dotaClient.client.beta_tester && dotaClient.client.stream_online) {
      const enabled = getValueOrDefault(DBSettings['minimap-blocker'], dotaClient.client.settings)
      if (enabled) minimapParser.init(data, dotaClient.mapBlocker)
    }

    // Can't just !dotaClient.heroSlot because it can be 0
    const purchaser = dotaClient.client.gsi?.items?.teleport0?.purchaser
    const playingHeroSlot = Number(
      await redisClient.client.get(`${dotaClient.client.token}:playingHeroSlot`),
    )
    if (!(playingHeroSlot >= 0) && typeof purchaser === 'number') {
      await redisClient.client.set(`${dotaClient.client.token}:playingHeroSlot`, purchaser)
      await saveMatchData(dotaClient.client)
      return
    }

    const {
      powerTreads: { enabled: treadsChatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)
    if (treadsChatterEnabled) {
      try {
        await calculateManaSaved(dotaClient)
      } catch (e) {
        logger.error('err calculateManaSaved', { e })
      }
    }

    // saveMatchData checks and returns early if steam is found
    await saveMatchData(dotaClient.client)

    handleNewEvents(data, dotaClient)

    await dotaClient.openBets(dotaClient.client)

    await checkPassiveMidas(dotaClient.client)
    await checkPassiveTp(dotaClient.client)
  },
})

async function showProbability(dotaClient: GSIHandler) {
  const winChanceEnabled = getValueOrDefault(
    DBSettings.winProbabilityOverlay,
    dotaClient.client.settings,
  )

  if (winChanceEnabled) {
    const updateInterval = getValueOrDefault(
      DBSettings.winProbabilityOverlayIntervalMinutes,
      dotaClient.client.settings,
    )

    if (
      dotaClient.client.gsi?.map?.clock_time &&
      (dotaClient.client.gsi?.map?.clock_time || 0) % (updateInterval * 60) === 0
    ) {
      const matchDetails = await getWinProbability2MinAgo(
        parseInt(dotaClient.client.gsi?.map?.matchid, 10),
      )
      const lastWinRate = matchDetails?.data.live.match?.liveWinRateValues.slice(-1).pop()
      if (lastWinRate) {
        server.io.to(dotaClient.client.token).emit('update-radiant-win-chance', {
          value: lastWinRate?.winRate,
          time: lastWinRate?.time * 60, // time in seconds
        })
        setTimeout(() => {
          server.io.to(dotaClient.client.token).emit('update-radiant-win-chance', null)
        }, 10 * 1000)
      }
    }
  }
}

function handleNewEvents(data: Packet, dotaClient: GSIHandler) {
  // Create a set for faster lookup of existing events
  const existingEventsSet = new Set(dotaClient.events.map((e) => `${e.game_time}-${e.event_type}`))

  // Filter new events
  const newEvents = data.events?.filter(
    ({ game_time, event_type }) => !existingEventsSet.has(`${game_time}-${event_type}`),
  )

  if (newEvents?.length) {
    // Merge new and existing events
    dotaClient.events = [...dotaClient.events, ...newEvents]

    // Emit events and log if necessary
    newEvents.forEach((event) => {
      events.emit(`event:${event.event_type}`, event, dotaClient.client.token)
      if (!validEventTypes.has(event.event_type)) {
        logger.info('[NEWEVENT]', event)
      }
    })
  }
}
