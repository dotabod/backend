import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { DotaEventTypes, Packet } from '../../../types.js'
import { logger } from '../../../utils/logger.js'
import { events } from '../../globalEventEmitter.js'
import { GSIHandler } from '../../GSIHandler.js'
import checkMidas from '../../lib/checkMidas.js'
import { calculateManaSaved } from '../../lib/checkTreadToggle.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

// Catch all
eventHandler.registerEvent(`newdata`, {
  handler: (dotaClient: GSIHandler, data: Packet) => {
    // New users who dont have a steamaccount saved yet
    // This needs to run first so we have client.steamid on multiple acts
    dotaClient.updateSteam32Id()

    // In case they connect to a game in progress and we missed the start event
    dotaClient.setupOBSBlockers(data.map?.game_state ?? '')

    if (!isPlayingMatch(dotaClient.client.gsi)) return

    // Everything below here requires an ongoing match, not a finished match
    const hasWon =
      dotaClient.client.gsi?.map?.win_team && dotaClient.client.gsi.map.win_team !== 'none'
    if (hasWon) return

    // Can't just !dotaClient.heroSlot because it can be 0
    const purchaser = dotaClient.client.gsi?.items?.teleport0?.purchaser
    if (typeof dotaClient.playingHeroSlot !== 'number' && typeof purchaser === 'number') {
      dotaClient.playingHeroSlot = purchaser
      void dotaClient.saveMatchData()
      return
    }

    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      powerTreads: { enabled: treadsChatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)
    if (chattersEnabled && treadsChatterEnabled) {
      const mana = calculateManaSaved(dotaClient.treadsData, dotaClient.client.gsi)
      if (mana > 0) {
        dotaClient.treadToggles++
        dotaClient.manaSaved += mana
      }
    }

    // Always runs but only until steam is found
    void dotaClient.saveMatchData()

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

    dotaClient.openBets()

    const {
      midas: { enabled: midasChatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)
    if (chattersEnabled && midasChatterEnabled && dotaClient.client.stream_online) {
      const isMidasPassive = checkMidas(data, dotaClient.passiveMidas)

      if (typeof isMidasPassive === 'number') {
        dotaClient.say(
          t('midasUsed', {
            emote: 'Madge',
            lng: dotaClient.client.locale,
            seconds: isMidasPassive,
          }),
        )
        return
      }

      if (isMidasPassive) {
        logger.info('[MIDAS] Passive midas', { name: dotaClient.getChannel() })
        dotaClient.say(
          t('chatters.midas', { emote: 'massivePIDAS', lng: dotaClient.client.locale }),
        )
        return
      }
    }
  },
})
