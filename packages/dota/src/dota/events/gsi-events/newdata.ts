import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { DotaEventTypes, Packet, SocketClient } from '../../../types.js'
import { logger } from '../../../utils/logger.js'
import { events } from '../../globalEventEmitter.js'
import { GSIHandler, redisClient, say } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { chatMidas, checkMidas } from '../../lib/checkMidas.js'
import { calculateManaSaved } from '../../lib/checkTreadToggle.js'
import { DelayedCommands } from '../../lib/consts.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'
import minimapParser from '../minimap/parser.js'

function chatterMatchFound(client: SocketClient) {
  if (!client.stream_online) return

  const commands = DelayedCommands.filter((cmd) => getValueOrDefault(cmd.key, client.settings))

  const chattersEnabled = getValueOrDefault(DBSettings.chatter, client.settings)
  const {
    commandsReady: { enabled: chatterEnabled },
  } = getValueOrDefault(DBSettings.chatters, client.settings)

  if (commands.length && chattersEnabled && chatterEnabled) {
    say(
      client,
      t('matchFound', {
        commandList: commands.map((c) => c.command).join(' · '),
        lng: client.locale,
      }),
      {
        delay: false,
      },
    )
  }
}

// Runs every gametick
async function saveMatchData(client: SocketClient) {
  // This now waits for the bet to complete before checking match data
  // Since match data is delayed it will run far fewer than before, when checking actual match id of an ingame match
  // the playingBetMatchId is saved when the hero is selected
  const betsForMatchId = await redisClient.client.get(`${client.token}:betsForMatchId`)
  if (!Number(betsForMatchId)) return

  if (!client.steam32Id) return

  let steamServerId = await redisClient.client.get(`${betsForMatchId}:steamServerId`)
  if (steamServerId) return

  steamServerId = await server.dota.getUserSteamServer(client.steam32Id)
  if (!steamServerId) return

  await redisClient.client.set(`${betsForMatchId}:steamServerId`, steamServerId)

  const delayedData = await server.dota.getDelayedMatchData({
    server_steamid: steamServerId,
    match_id: betsForMatchId!,
    refetchCards: true,
    token: client.token,
  })

  if (!delayedData?.match.match_id) {
    logger.info('No match data found!', {
      name: client.name,
      betsForMatchId,
    })
    return
  }

  await redisClient.client.set(`${betsForMatchId}:lobbyType`, delayedData.match.lobby_type)

  const players = await getAccountsFromMatch(client.gsi)

  // letting people know match data is available
  if (players.accountIds.length) chatterMatchFound(client)
}

// Catch all
eventHandler.registerEvent(`newdata`, {
  handler: async (dotaClient: GSIHandler, data: Packet) => {
    // New users who dont have a steamaccount saved yet
    // This needs to run first so we have client.steamid on multiple acts
    dotaClient.updateSteam32Id()

    // In case they connect to a game in progress and we missed the start event
    await dotaClient.setupOBSBlockers(data.map?.game_state ?? '')

    if (!isPlayingMatch(dotaClient.client.gsi)) return

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
      await redisClient.client.get(`${dotaClient.getToken()}:playingHeroSlot`),
    )
    if (!(playingHeroSlot >= 0) && typeof purchaser === 'number') {
      await redisClient.client.set(`${dotaClient.getToken()}:playingHeroSlot`, purchaser)
      await saveMatchData(dotaClient.client)
      return
    }

    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      powerTreads: { enabled: treadsChatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)
    if (chattersEnabled && treadsChatterEnabled) {
      try {
        void calculateManaSaved(dotaClient)
      } catch (e) {
        logger.error('err calculateManaSaved', { e })
      }
    }

    // saveMatchData checks and returns early if steam is found
    await saveMatchData(dotaClient.client)

    // TODO: Move this to server.ts
    const newEvents = data.events?.filter((event) => {
      const existingEvent = dotaClient.events.find(
        (e) => e.game_time === event.game_time && e.event_type === event.event_type,
      )
      return !existingEvent
    })

    if (newEvents?.length) {
      dotaClient.events = [...dotaClient.events, ...newEvents]

      newEvents.forEach((event) => {
        events.emit(`event:${event.event_type}`, event, dotaClient.getToken())

        if (!Object.values(DotaEventTypes).includes(event.event_type)) {
          logger.info('[NEWEVENT]', event)
        }
      })
    }

    await dotaClient.openBets()

    const {
      midas: { enabled: midasChatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)
    if (chattersEnabled && midasChatterEnabled && dotaClient.client.stream_online) {
      const isMidasPassive = await checkMidas(data, dotaClient.getToken())
      chatMidas(dotaClient, isMidasPassive)
    }
  },
})
