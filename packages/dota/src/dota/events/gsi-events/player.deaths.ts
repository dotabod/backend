import { t } from 'i18next'

import type { Item } from '../../../types.js'
import { redisClient } from '../../../db/redisInstance.js'
import { findItem } from '../../lib/findItem.js'
import handleGetHero, { type HeroNames } from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'
import type { GSIHandlerType } from '../../GSIHandlerTypes.js'

const passiveItemNames = [
  { name: 'item_magic_stick', title: 'magic stick', charges: true },
  { name: 'item_magic_wand', title: 'magic wand', charges: true },
  { name: 'item_faerie_fire', title: 'faerie fire' },
  { name: 'item_cheese', title: 'cheese' },
  { name: 'item_holy_locket', title: 'holy locket', charges: true },
  { name: 'item_mekansm', title: 'mek' },
  { name: 'item_satanic', title: 'satanic' },
  { name: 'item_guardian_greaves', title: 'greaves' },
]

eventHandler.registerEvent('player:deaths', {
  handler: async (dotaClient, deaths: number) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!deaths) return

    const playingHero = (await redisClient.client.get(
      `${dotaClient.getToken()}:playingHero`,
    )) as HeroNames | null

    const heroName =
      handleGetHero(playingHero ?? dotaClient.client.gsi?.hero?.name)?.localized_name ?? ''

    await firstBloodChat(dotaClient, heroName)
    passiveDeathChat(dotaClient, heroName)
  },
})

async function firstBloodChat(dotaClient: GSIHandlerType, heroName: string) {
  const playingTeam =
    (await redisClient.client.get(`${dotaClient.client.token}:playingTeam`)) ??
    dotaClient.client.gsi?.player?.team_name

  const otherTeam = playingTeam === 'radiant' ? 'dire' : 'radiant'
  const wasFirstBlood =
    playingTeam &&
    dotaClient.client.gsi?.map?.[`${playingTeam as 'radiant' | 'dire'}_score`] === 0 &&
    dotaClient.client.gsi.map[`${otherTeam}_score`] === 1

  if (!wasFirstBlood) return

  say(
    dotaClient.client,
    t('chatters.firstBloodDeath', { emote: 'PepeLaugh', heroName, lng: dotaClient.client.locale }),
    { chattersKey: 'firstBloodDeath' },
  )
}

function cantCastItem(item: Item, dotaClient: GSIHandlerType) {
  return (
    Number(item.cooldown) > 0 ||
    !item.can_cast ||
    dotaClient.client.gsi?.previously?.hero?.muted ||
    dotaClient.client.gsi?.previously?.hero?.hexed ||
    dotaClient.client.gsi?.previously?.hero?.stunned
  )
}

function passiveDeathChat(dotaClient: GSIHandlerType, heroName: string) {
  const couldHaveLivedWith = findItem({
    itemName: passiveItemNames.map((i) => i.name),
    searchStashAlso: false,
    data: dotaClient.client.gsi,
  })

  // None found
  if (!Array.isArray(couldHaveLivedWith) || !couldHaveLivedWith.length) return

  const itemNames = couldHaveLivedWith
    .map((item) => {
      const found = passiveItemNames.find((i) => {
        if (i.name !== item.name) return false
        if (cantCastItem(item, dotaClient)) {
          return false
        }

        if (i.charges) {
          return Number(item.charges) >= 10
        }
        return true
      })
      if (found) return found.title
      return null
    })
    .flatMap((f) => f ?? [])
    .join(', ')

  if (!itemNames) return

  say(
    dotaClient.client,
    t('chatters.died', { emote: 'ICANT', heroName, itemNames, lng: dotaClient.client.locale }),
    { chattersKey: 'passiveDeath' },
  )
}
