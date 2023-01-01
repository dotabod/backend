import { t } from 'i18next'

import { DotaEvent, DotaEventTypes } from '../../types.js'
import eventHandler from '../EventHandler.js'
import { GSIHandler } from '../GSIHandler.js'
import { getHeroNameById } from '../lib/heroes.js'
import { isPlayingMatch } from '../lib/isPlayingMatch.js'

let bountyTimeout: NodeJS.Timeout
let bountyHeroNames: string[] = []

eventHandler.registerEvent(`event:${DotaEventTypes.BountyPickup}`, {
  handler: (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    // Only for first bounties
    if (
      event.team === dotaClient.playingTeam &&
      Number(dotaClient.client.gsi?.map?.clock_time) <= 120
    ) {
      clearTimeout(bountyTimeout)
      const heroName = getHeroNameById(
        dotaClient.players?.matchPlayers[event.player_id].heroid ?? 0,
        event.player_id,
      )
      bountyHeroNames.push(heroName)
      bountyTimeout = setTimeout(() => {
        dotaClient.say(
          t('bountyPickup', {
            lng: dotaClient.client.locale,
            bountyValue: event.bounty_value * bountyHeroNames.length,
            heroNames: bountyHeroNames.join(', '),
          }),
          {
            beta: true,
          },
        )
        bountyHeroNames = []
      }, 15000)
    }
  },
})
