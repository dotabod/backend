import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { findItem } from '../../lib/findItem.js'
import getHero from '../../lib/getHero.js'
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

eventHandler.registerEvent(`hero:alive`, {
  handler: (dotaClient: GSIHandler, alive: boolean) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    // Case one, we had aegis, and we die with it. Triggers on an aegis death
    if (!alive && dotaClient.aegisPickedUp?.playerId === dotaClient.playingHeroSlot) {
      dotaClient.aegisPickedUp = undefined
      server.io.to(dotaClient.getToken()).emit('aegis-picked-up', {})
      return
    }

    const chatterEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    if (!chatterEnabled) return

    const heroName =
      getHero(dotaClient.playingHero ?? dotaClient.client.gsi?.hero?.name)?.localized_name ?? ''

    const wasFirstBlood =
      dotaClient.playingTeam &&
      dotaClient.client.gsi?.map?.[`${dotaClient.playingTeam as 'radiant' | 'dire'}_score`] === 0
    if (!alive && wasFirstBlood) {
      dotaClient.say(t('chatters.firstBloodDeath', { heroName, lng: dotaClient.client.locale }))
    }

    const chatters = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    if (!chatters.passiveDeath.enabled) return

    if (
      !alive &&
      dotaClient.client.gsi?.previously?.hero?.alive &&
      dotaClient.client.gsi.previously.player?.deaths !== dotaClient.client.gsi.player?.deaths
    ) {
      const couldHaveLivedWith = findItem(
        passiveItemNames.map((i) => i.name),
        false,
        dotaClient.client.gsi,
      )

      if (Array.isArray(couldHaveLivedWith) && couldHaveLivedWith.length) {
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
    }
  },
})
