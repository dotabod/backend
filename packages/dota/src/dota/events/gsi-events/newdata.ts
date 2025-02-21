import { sendExtensionPubSubBroadcastMessage } from '@twurple/ebs-helper'
import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../settings.js'
import { steamSocket } from '../../../steam/ws.js'
import { getWinProbability2MinAgo } from '../../../stratz/livematch.js'
import { findSpectatorIdx } from '../../../twitch/lib/findGSIByAccountId.js'
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
import { logger } from '../../../utils/logger.js'
import { type GSIHandler, redisClient } from '../../GSIHandler.js'
import { events } from '../../globalEventEmitter.js'
import { server } from '../../index.js'
import { DelayedCommands } from '../../lib/DelayedCommands.js'
import { checkPassiveMidas } from '../../lib/checkMidas.js'
import { checkPassiveTp } from '../../lib/checkPassiveTp.js'
import { calculateManaSaved } from '../../lib/checkTreadToggle.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { getSpectatorPlayers } from '../../lib/getSpectatorPlayers.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { isSpectator } from '../../lib/isSpectator.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'
import { minimapParser } from '../minimap/parser.js'

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
          match_id: matchId,
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
    await redisClient.client.set(`${matchId}:gameMode`, delayedData.match.game_mode)
    chatterMatchFound(client)
  }
}

const tooltipsConfig = {
  clientId: process.env.TWITCH_EXT_CLIENT_ID || '',
  secret: process.env.TWITCH_EXT_SECRET || '',
  ownerId: process.env.TWITCH_BOT_PROVIDERID || '',
}

export const sendExtensionPubSubBroadcastMessageIfChanged = async (
  dotaClient: GSIHandler,
  messageToSend: any,
) => {
  const { client } = dotaClient
  const redisKey = `${client.token}:lastMessage`

  // Retrieve the previous message from Redis
  const prevMessageString = await redisClient.client.get(redisKey)

  // Convert the current message to a string for comparison
  const currentMessageString = JSON.stringify(messageToSend)

  // Compare the current message with the previous one
  if (currentMessageString !== prevMessageString) {
    const accountId = client.Account?.providerAccountId ?? ''
    if (!accountId) return

    // If different, send the message and update Redis
    await sendExtensionPubSubBroadcastMessage(tooltipsConfig, accountId, currentMessageString)
    await redisClient.client.set(redisKey, currentMessageString)
  }
}

const maybeSendTooltipData = async (dotaClient: GSIHandler) => {
  if (!dotaClient.client.beta_tester || !dotaClient.client.stream_online) {
    return
  }

  let hero: Hero | undefined
  let items: Items | undefined
  let abilities: Abilities | undefined

  if (isSpectator(dotaClient.client.gsi)) {
    const spectatorPlayers = getSpectatorPlayers(dotaClient.client.gsi)
    const selectedPlayer = spectatorPlayers.find((a) => !!a.selected)

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
  handler: async (dotaClient: GSIHandler, data: Packet) => {
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
    if (hasWon) return

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
      await Promise.all([
        redisClient.client.set(`${dotaClient.client.token}:playingHeroSlot`, purchaser),
        saveMatchData(dotaClient.client),
      ])

      // This is the first time we've seen the hero slot, so we can't check anthing else yet
      return
    }

    const showProbabilityPromise = showProbability(dotaClient)

    const {
      powerTreads: { enabled: treadsChatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)
    let calculateManaSavedPromise: Promise<void> | undefined
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

    await Promise.all([
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
    ])
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
        Number.parseInt(dotaClient.client.gsi?.map?.matchid, 10),
      )

      const lastWinRate = matchDetails?.data.live.match?.liveWinRateValues.slice(-1).pop()
      if (
        lastWinRate &&
        !matchDetails?.data.live.match?.completed &&
        matchDetails?.data.live.match?.isUpdating
      ) {
        const isRadiant = dotaClient.client.gsi?.player?.team_name === 'radiant'
        const winRate = Math.floor(
          (isRadiant ? lastWinRate.winRate : 1 - lastWinRate.winRate) * 100,
        )
        server.io.to(dotaClient.client.token).emit('update-radiant-win-chance', {
          value: winRate,
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
