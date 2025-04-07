import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../settings.js'
import { steamSocket } from '../../../steam/ws.js'
import { getWinProbability2MinAgo } from '../../../stratz/livematch.js'
import {
  type Abilities,
  type Ability,
  type DelayedGames,
  type Hero,
  type Item,
  type Items,
  type Packet,
  type SocketClient,
  validEventTypes,
} from '../../../types.js'
import { logger } from '@dotabod/shared-utils'
import { redisClient } from '../../../db/redisInstance.js'
import { events } from '../../globalEventEmitter.js'
import { server } from '../../server.js'
import { DelayedCommands } from '../../lib/DelayedCommands.js'
import { checkPassiveMidas } from '../../lib/checkMidas.js'
import { checkPassiveTp } from '../../lib/checkPassiveTp.js'
import { calculateManaSaved } from '../../lib/checkTreadToggle.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { isSpectator } from '../../lib/isSpectator.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'
import { minimapParser } from '../minimap/parser.js'
import { getRedisNumberValue, is8500Plus } from '../../../utils/index.js'
import CustomError from '../../../utils/customError.js'
import MongoDBSingleton from '../../../steam/MongoDBSingleton.js'
import { findSpectatorIdx } from '../../../twitch/lib/findGSIByAccountId.js'
import { getSpectatorPlayers } from '../../lib/getSpectatorPlayers.js'
import { sendExtensionPubSubBroadcastMessageIfChanged } from './sendExtensionPubSubBroadcastMessageIfChanged.js'
import type { GSIHandlerType } from '../../GSIHandlerTypes.js'

// Define a type for the global timeouts
declare global {
  var timeoutMap: Record<string, NodeJS.Timeout | null>
}

// Initialize the global map if it doesn't exist
global.timeoutMap = global.timeoutMap || {}

function chatterMatchFound(client: SocketClient) {
  if (!client.stream_online) return

  const commands = DelayedCommands.filter((cmd) =>
    getValueOrDefault(cmd.key, client.settings, client.subscription),
  )

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

// Use Sets for tracking lookups to avoid duplicates
const steamServerLookupMap = new Set<string>()
const steamDelayDataLookupMap = new Set<string>()

// Debounce map to limit how often we call saveMatchData per client
const saveMatchDataDebounceMap = new Map<string, { lastExecuted: number; inProgress: boolean }>()
// Debounce interval in milliseconds
const DEBOUNCE_INTERVAL = 5000 // 5 seconds

// Cache results in memory for quick lookup
const matchDataCache = new Map<
  string,
  {
    steamServerId: string | null
    lobbyType: string | null
    timestamp: number
  }
>()
// Cache expiration time in milliseconds
const CACHE_EXPIRATION = 60000 // 1 minute

// Runs every gametick
async function saveMatchData(client: SocketClient) {
  // This now waits for the bet to complete before checking match data
  // Since match data is delayed it will run far fewer than before, when checking actual match id of an ingame match
  // the matchid is saved when the hero is selected
  const matchId = await redisClient.client.get(`${client.token}:matchId`)
  if (!matchId || !Number(matchId)) return

  if (!client.steam32Id) return

  const cacheKey = `${matchId}:${client.token}`

  // Check in-memory cache first
  const cachedData = matchDataCache.get(cacheKey)
  if (cachedData) {
    // If cache is still valid, use cached data and return
    if (Date.now() - cachedData.timestamp < CACHE_EXPIRATION) {
      if (cachedData.steamServerId && cachedData.lobbyType !== null) return
    } else {
      // If cache expired, remove it
      matchDataCache.delete(cacheKey)
    }
  }

  // Implement debounce logic
  const debounceKey = `${client.token}`
  const now = Date.now()
  const debounceData = saveMatchDataDebounceMap.get(debounceKey)

  // If this client's function is already in progress or ran recently, skip this execution
  if (debounceData) {
    if (debounceData.inProgress || now - debounceData.lastExecuted < DEBOUNCE_INTERVAL) {
      return
    }
  }

  // Mark this execution as in progress
  saveMatchDataDebounceMap.set(debounceKey, { lastExecuted: now, inProgress: true })

  try {
    // did we already come here before?
    const res = await redisClient.client
      .multi()
      .get(`${matchId}:${client.token}:steamServerId`)
      .get(`${matchId}:${client.token}:lobbyType`)
      .exec()

    const [steamServerId] = res
    const [, lobbyType] = res

    // Update cache with Redis data
    matchDataCache.set(cacheKey, {
      steamServerId: steamServerId ? String(steamServerId) : null,
      lobbyType: lobbyType ? String(lobbyType) : null,
      timestamp: now,
    })

    if (steamServerId && lobbyType !== null) return

    if (!steamServerId && lobbyType === null && !is8500Plus(client)) {
      // Fix: Check if we're already looking up this match to prevent race conditions
      if (steamServerLookupMap.has(matchId)) return

      // Add to lookup map before starting the async operation
      steamServerLookupMap.add(matchId)

      try {
        const getDelayedDataPromise = new Promise<string>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new CustomError(t('matchData8500', { emote: 'PoroSad', lng: client.locale })))
          }, 10000) // 10 second timeout

          steamSocket.emit('getUserSteamServer', client.steam32Id, (err: any, cards: any) => {
            clearTimeout(timeoutId)
            if (err) {
              reject(err)
            } else {
              resolve(cards)
            }
          })
        })

        const steamServerId = await getDelayedDataPromise

        if (steamServerId) {
          await redisClient.client.set(
            `${matchId}:${client.token}:steamServerId`,
            steamServerId.toString(),
          )

          // Update cache
          matchDataCache.set(cacheKey, {
            steamServerId: steamServerId.toString(),
            lobbyType: null,
            timestamp: Date.now(),
          })
        }
      } catch (error) {
        logger.error('Error getting steam server data', { error, matchId })
      } finally {
        // Always remove from the map, even if there was an error
        steamServerLookupMap.delete(matchId)
      }
    }

    // Re-check steamServerId from cache first, then Redis if needed
    let currentSteamServerId = matchDataCache.get(cacheKey)?.steamServerId || null
    if (!currentSteamServerId) {
      currentSteamServerId = await redisClient.client.get(
        `${matchId}:${client.token}:steamServerId`,
      )

      // Update cache if we found it in Redis
      if (currentSteamServerId) {
        const currentCache = matchDataCache.get(cacheKey) || {
          steamServerId: null,
          lobbyType: null,
          timestamp: now,
        }
        matchDataCache.set(cacheKey, {
          ...currentCache,
          steamServerId: currentSteamServerId,
          timestamp: now,
        })
      }
    }

    if (currentSteamServerId && lobbyType === null && !is8500Plus(client)) {
      // Fix: Check if we're already looking up this match to prevent race conditions
      if (steamDelayDataLookupMap.has(matchId)) return

      steamDelayDataLookupMap.add(matchId)

      try {
        const getDelayedDataPromise = new Promise<DelayedGames>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new CustomError(t('matchData8500', { emote: 'PoroSad', lng: client.locale })))
          }, 10000) // 10 second timeout

          steamSocket.emit(
            'getRealTimeStats',
            {
              match_id: matchId,
              refetchCards: true,
              steam_server_id: currentSteamServerId.toString(),
              token: client.token,
            },
            (err: any, data: DelayedGames) => {
              clearTimeout(timeoutId)
              if (err) {
                reject(err)
              } else {
                resolve(data)
              }
            },
          )
        })

        const delayedData = await getDelayedDataPromise

        if (delayedData?.match.lobby_type) {
          await Promise.all([
            redisClient.client.set(
              `${matchId}:${client.token}:lobbyType`,
              delayedData.match.lobby_type,
            ),
            redisClient.client.set(
              `${matchId}:${client.token}:gameMode`,
              delayedData.match.game_mode,
            ),
          ])

          // Update cache with complete data
          matchDataCache.set(cacheKey, {
            steamServerId: currentSteamServerId.toString(),
            lobbyType: String(delayedData.match.lobby_type),
            timestamp: Date.now(),
          })

          chatterMatchFound(client)
        }
      } catch (error) {
        if (!(error instanceof CustomError)) {
          logger.error('Error getting delayed match data', { error, matchId })
        }
      } finally {
        // Always remove from the map, even if there was an error
        steamDelayDataLookupMap.delete(matchId)
      }
    }
  } finally {
    // Update the debounce map to mark execution as complete
    const currentDebounce = saveMatchDataDebounceMap.get(debounceKey)
    if (currentDebounce) {
      saveMatchDataDebounceMap.set(debounceKey, { ...currentDebounce, inProgress: false })

      // Set up an automatic cleanup for the debounce map entry after 5 minutes of inactivity
      setTimeout(() => {
        const entry = saveMatchDataDebounceMap.get(debounceKey)
        if (entry && Date.now() - entry.lastExecuted > 300000) {
          // 5 minutes
          saveMatchDataDebounceMap.delete(debounceKey)
        }
      }, 300000) // 5 minutes
    }
  }
}

// Implement a cleanup function to periodically clear expired cache entries
function cleanupMatchDataCache() {
  const now = Date.now()
  for (const [key, value] of matchDataCache.entries()) {
    if (now - value.timestamp > CACHE_EXPIRATION) {
      matchDataCache.delete(key)
    }
  }
  // Run cleanup every minute
  setTimeout(cleanupMatchDataCache, 60000)
}

// Start the cleanup process
cleanupMatchDataCache()

// Track the last time we saved data for each match
const lastSaveTimeByMatch = new Map<string, number>()
const SAVE_INTERVAL = 60000 // 1 minute in milliseconds

const saveMatchDataDump = async (dotaClient: GSIHandlerType) => {
  if (!isPlayingMatch(dotaClient.client.gsi)) {
    return
  }

  const matchId = dotaClient.client.gsi?.map?.matchid
  if (!matchId) return

  const now = Date.now()
  const lastSaveTime = lastSaveTimeByMatch.get(matchId) || 0
  const winTeam = dotaClient.client.gsi?.map?.win_team

  // Only save if it's been at least 1 minute since the last save for this match
  // OR if the win_team is not "none" (meaning the game has ended)
  if (now - lastSaveTime < SAVE_INTERVAL && winTeam === 'none') {
    return
  }

  const { matchPlayers } = await getAccountsFromMatch({
    gsi: dotaClient.client.gsi,
  })

  const keysToSave = [
    'map',
    'player',
    'minimap',
    'hero',
    'abilities',
    'items',
    'buildings',
    'draft',
    'events',
  ]
  const dumpData = {}
  for (const key of keysToSave) {
    if (dotaClient.client.gsi?.[key]) {
      dumpData[key] = dotaClient.client.gsi[key]
    }
  }

  const mongo = MongoDBSingleton
  const db = await mongo.connect()
  try {
    // save to new mongodb collection, database: match, collection: dump
    await db.collection('dump').insertOne({
      matchId,
      matchPlayers,
      status: winTeam,
      data: dumpData,
      timestamp: now,
    })

    // Update the last save time for this match
    lastSaveTimeByMatch.set(matchId, now)
  } finally {
    await mongo.close()
  }
}

const maybeSendTooltipData = async (dotaClient: GSIHandlerType) => {
  if (!dotaClient.client.beta_tester || !dotaClient.client.stream_online) {
    return
  }

  let hero: Hero | undefined
  let items: Items | undefined
  let abilities: Abilities | undefined

  if (isSpectator(dotaClient.client.gsi)) {
    const spectatorPlayers = getSpectatorPlayers(dotaClient.client.gsi)
    const selectedPlayer = spectatorPlayers.find((a) => 'selected' in a && a.selected === true)

    const { playerN, teamN } =
      findSpectatorIdx(dotaClient.client.gsi, selectedPlayer?.accountid) ?? {}

    // @ts-expect-error we can iterate by team2 and team3
    items = dotaClient.client.gsi?.items?.[teamN]?.[playerN]
    // @ts-expect-error we can iterate by team2 and team3
    hero = dotaClient.client.gsi?.hero?.[teamN]?.[playerN]
  } else {
    hero = dotaClient.client.gsi?.hero
    items = dotaClient.client.gsi?.items
    abilities = dotaClient.client.gsi?.abilities
  }

  if (!hero || !items || !abilities) return

  const inv = Object.values(items ?? {})
  const backpackItems: Item[] = inv.slice(0, 9)
  const { matchPlayers } = await getAccountsFromMatch({
    gsi: dotaClient.client.gsi,
  })

  const messageToSend = {
    items: backpackItems.map((item) => item.name),
    neutral: items?.neutral0?.name,
    hero: hero?.id,
    abilities: abilities ? Object.values(abilities).map((ability: Ability) => ability.name) : [],
    heroes: matchPlayers.map((player) => player.heroid),
  }
  return sendExtensionPubSubBroadcastMessageIfChanged(dotaClient, messageToSend)
}

// Catch all
eventHandler.registerEvent('newdata', {
  handler: async (dotaClient, data: Packet) => {
    // New users who don't have a steam account saved yet
    // This needs to run first so we have client.steamid on multiple acts
    const updateSteam32IdPromise = dotaClient.updateSteam32Id()

    // In case they connect to a game in progress and we missed the start event
    const setupOBSBlockersPromise = dotaClient.setupOBSBlockers(data.map?.game_state ?? '')

    if (!isPlayingMatch(dotaClient.client.gsi)) {
      await Promise.all([updateSteam32IdPromise, setupOBSBlockersPromise])
      return
    }

    // Everything below here requires an ongoing match, not a finished match
    const hasWon =
      dotaClient.client.gsi?.map?.win_team && dotaClient.client.gsi.map.win_team !== 'none'
    if (hasWon) {
      return
    }

    // only if they're in a match ^ and they're a beta tester
    if (dotaClient.client.beta_tester && dotaClient.client.stream_online) {
      const enabled = getValueOrDefault(
        DBSettings['minimap-blocker'],
        dotaClient.client.settings,
        dotaClient.client.subscription,
      )
      if (enabled) minimapParser.init(data, dotaClient.mapBlocker)
    }
    // Can't just !dotaClient.heroSlot because it can be 0
    const purchaser = dotaClient.client.gsi?.items?.teleport0?.purchaser
    const playingHeroSlot = await getRedisNumberValue(`${dotaClient.client.token}:playingHeroSlot`)
    if (playingHeroSlot === null && typeof purchaser === 'number') {
      await Promise.all([
        redisClient.client.set(`${dotaClient.client.token}:playingHeroSlot`, purchaser),
        saveMatchData(dotaClient.client),
      ])

      // This is the first time we've seen the hero slot, so we can't check anything else yet
      return
    }

    const showProbabilityPromise = null // showProbability(dotaClient)

    const {
      powerTreads: { enabled: treadsChatterEnabled },
    } = getValueOrDefault(
      DBSettings.chatters,
      dotaClient.client.settings,
      dotaClient.client.subscription,
      'powerTreads',
    )
    let calculateManaSavedPromise: Promise<void> | null = null
    if (treadsChatterEnabled) {
      try {
        calculateManaSavedPromise = calculateManaSaved(dotaClient)
      } catch (e) {
        logger.error('err calculateManaSaved', { e })
      }
    }

    // saveMatchData checks and returns early if steam is found
    const saveMatchDataPromise = saveMatchData(dotaClient.client)
    const handleNewEventsPromise = handleNewEvents(data, dotaClient)
    const openBetsPromise = dotaClient.openBets(dotaClient.client)
    const checkPassiveMidasPromise = checkPassiveMidas(dotaClient.client)
    const checkPassiveTpPromise = checkPassiveTp(dotaClient.client)
    const checkNeutralItemsPromise = dotaClient.neutralItemTimer.checkNeutralItems()

    // Create an array of promises, filtering out any that are undefined or null
    const promisesToExecute = [
      updateSteam32IdPromise,
      setupOBSBlockersPromise,
      showProbabilityPromise,
      saveMatchDataPromise,
      handleNewEventsPromise,
      openBetsPromise,
      calculateManaSavedPromise,
      checkPassiveMidasPromise,
      checkPassiveTpPromise,
      checkNeutralItemsPromise,
    ].filter((promise) => promise !== undefined && promise !== null)

    // Fix: Use Promise.allSettled instead of Promise.all to prevent one failure from stopping all operations
    await Promise.allSettled(promisesToExecute).then((results) => {
      // Log any rejected promises
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error(`Promise at index ${index} failed in newdata handler`, {
            reason: result.reason,
          })
        }
      })
    })
  },
})

async function showProbability(dotaClient: GSIHandlerType) {
  const winChanceEnabled = getValueOrDefault(
    DBSettings.winProbabilityOverlay,
    dotaClient.client.settings,
    dotaClient.client.subscription,
  )

  if (winChanceEnabled) {
    const updateInterval = getValueOrDefault(
      DBSettings.winProbabilityOverlayIntervalMinutes,
      dotaClient.client.settings,
      dotaClient.client.subscription,
    )

    if (
      dotaClient.client.gsi?.map?.clock_time &&
      (dotaClient.client.gsi?.map?.clock_time || 0) % (updateInterval * 60) === 0
    ) {
      const matchDetails = await getWinProbability2MinAgo(
        Number.parseInt(dotaClient.client.gsi?.map?.matchid, 10),
      )

      // Fix: Check if matchDetails is not an error object before accessing data
      if ('data' in matchDetails && matchDetails.data?.live?.match) {
        const lastWinRate = matchDetails.data.live.match.liveWinRateValues?.slice(-1).pop()
        if (
          lastWinRate &&
          !matchDetails.data.live.match.completed &&
          matchDetails.data.live.match.isUpdating
        ) {
          const isRadiant = dotaClient.client.gsi?.player?.team_name === 'radiant'
          const winRate = Math.floor(
            (isRadiant ? lastWinRate.winRate : 1 - lastWinRate.winRate) * 100,
          )
          server.io.to(dotaClient.client.token).emit('update-radiant-win-chance', {
            value: winRate,
            time: lastWinRate?.time * 60, // time in seconds
          })

          // Use clearTimeout to prevent memory leaks if this function is called multiple times
          const timeoutKey = `winChanceTimeout_${dotaClient.client.token}`
          const existingTimeout = global.timeoutMap[timeoutKey]
          if (existingTimeout) {
            clearTimeout(existingTimeout)
          }

          global.timeoutMap[timeoutKey] = setTimeout(() => {
            server.io.to(dotaClient.client.token).emit('update-radiant-win-chance', null)
            global.timeoutMap[timeoutKey] = null
          }, 10 * 1000)
        }
      }
    }
  }
}

function handleNewEvents(data: Packet, dotaClient: GSIHandlerType) {
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
