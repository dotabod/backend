import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { findItem } from '../../lib/findItem.js'
import handleGetHero from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

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

eventHandler.registerEvent(`player:deaths`, {
  handler: (dotaClient: GSIHandler, deaths: number) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!deaths) return

    // Case one, we had aegis, and we die with it. Triggers on an aegis death
    if (dotaClient.aegisPickedUp?.playerId === dotaClient.playingHeroSlot) {
      dotaClient.aegisPickedUp = undefined
      server.io.to(dotaClient.getToken()).emit('aegis-picked-up', {})
    }

    const chatterEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    if (!chatterEnabled) return

    const chatters = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    const heroName =
      handleGetHero(dotaClient.playingHero ?? dotaClient.client.gsi?.hero?.name)?.localized_name ??
      ''

    firstBloodChat(chatters, dotaClient, heroName)
    passiveDeathChat(chatters, dotaClient, heroName)
  },
})

function firstBloodChat(chatters: any, dotaClient: GSIHandler, heroName: string) {
  if (!chatters.firstBloodDeath.enabled) return

  const otherTeam = dotaClient.playingTeam === 'radiant' ? 'dire' : 'radiant'
  const wasFirstBlood =
    dotaClient.playingTeam &&
    dotaClient.client.gsi?.map?.[`${dotaClient.playingTeam as 'radiant' | 'dire'}_score`] === 0 &&
    dotaClient.client.gsi.map[`${otherTeam}_score`] === 1

  if (!wasFirstBlood) return

  dotaClient.say(t('chatters.firstBloodDeath', { heroName, lng: dotaClient.client.locale }))
}

function passiveDeathChat(chatters: any, dotaClient: GSIHandler, heroName: string) {
  if (!chatters.passiveDeath.enabled) return

  const couldHaveLivedWith = findItem(
    passiveItemNames.map((i) => i.name),
    false,
    dotaClient.client.gsi,
  )

  // None found
  if (!Array.isArray(couldHaveLivedWith) || !couldHaveLivedWith.length) return

  const itemNames = couldHaveLivedWith
    .map((item) => {
      const found = passiveItemNames.find((i) => {
        if (i.name !== item.name) return false
        if (Number(item.cooldown) > 0 || !item.can_cast) return false
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

  dotaClient.say(t('chatters.died', { heroName, itemNames, lng: dotaClient.client.locale }))
}
