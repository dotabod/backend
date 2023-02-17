import DOTA_ITEM_IDS from 'dotaconstants/build/item_ids.json' assert { type: 'json' }
import DOTA_ITEMS from 'dotaconstants/build/items.json' assert { type: 'json' }
import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { D2ptResponse, DotaEventTypes, Item, Packet } from '../../../types.js'
import { logger } from '../../../utils/logger.js'
import { events } from '../../globalEventEmitter.js'
import { GSIHandler } from '../../GSIHandler.js'
import checkMidas from '../../lib/checkMidas.js'
import { calculateManaSaved } from '../../lib/checkTreadToggle.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'
import handleGetHero from '../../lib/getHero.js'
import axios from '../../../utils/axios.js'
import { fmtMSS } from '../../../utils/index.js'
import { getHeroPositions } from '../../lib/getLane.js'

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

    const position = getHeroPositions(data)
    logger.info('Position data', position)

    /*
    const hero = handleGetHero(dotaClient.playingHero)
    if (hero?.id) {
      const itemTimingsToCheck = ['item_hand_of_midas', 'item_bfury']
      findNewItems(data, dotaClient.playingHeroSlot)
        .filter((itemName) => itemTimingsToCheck.includes(itemName))
        .forEach((itemName) => {
          const name = itemName.replace('item_', '') as keyof typeof DOTA_ITEMS
          compareItemTiming(data, hero.id, DOTA_ITEMS[name])
        })
    }
    function compareItemTiming(
      data: Packet,
      heroId: number,
      item: (typeof DOTA_ITEMS)[keyof typeof DOTA_ITEMS],
    ) {
      const url = `https://dota2protracker.com/api/v1/timings/?heroId=${heroId}&itemId=${
        item.id
      }&token=${process.env.D2PT_TOKEN!}`

      axios
        .get(url)
        .then((res) => {
          const d2pt = res.data as D2ptResponse

          const [prosTime, prosStd] = d2pt.avg // mean in minutes
          const clockSeconds = dotaClient.client.gsi?.map?.clock_time ?? 0
          const currentClockTime = fmtMSS(clockSeconds)

          // 18 minutes | 15 minutes
          // 3 minutes difference
          const diff = clockSeconds - prosTime * 60
          const absDiff = Math.abs(diff)
          let message = ''

          const id = item.id as unknown as keyof typeof DOTA_ITEM_IDS
          const itemShortname = DOTA_ITEM_IDS[id] as keyof typeof DOTA_ITEMS
          const itemName: string | boolean = item && 'dname' in item && item.dname
          const props = {
            emote: 'PogChamp',
            lng: dotaClient.client.locale,
            seconds: absDiff,
            currentClockTime,
            itemName: itemName || itemShortname,
          }
          if (diff > 0) {
            message =
              absDiff > prosStd
                ? t('timings.fun', { ...props, context: 'slow' })
                : t('timings.fun2', { ...props, context: 'slow' })
          } else {
            message =
              absDiff > prosStd
                ? t('timings.fun', { ...props, context: 'fast' })
                : t('timings.fun2', { ...props, context: 'fast' })
          }

          logger.info(message)
        })
        .catch((e) => {
          console.log(e)
        })
    }

     */

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

function findNewItems(data: Packet, heroSlot?: number | null): string[] {
  const newItems: string[] = []

  if (typeof heroSlot !== 'number') return newItems

  if (data.previously && data.previously.items && data.items) {
    const prevItems = Object.values(data.previously.items).filter(
      (item) => item.purchaser === heroSlot && item.name !== 'empty',
    )
    const currItems = Object.values(data.items).filter(
      (item) => item.purchaser === heroSlot && item.name !== 'empty',
    )

    const prevNames = prevItems.map((item: Item) => item.name)
    const currNames = currItems.map((item: Item) => item.name)

    const addedItems = currNames.filter((name) => !prevNames.includes(name))
    newItems.push(...addedItems)
  }

  return newItems
}
