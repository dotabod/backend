import eventHandler from '../EventHandler.js'
import { GSIHandler } from '../GSIHandler.js'
import { HeroNames } from '../lib/getHero.js'
import { isPlayingMatch } from '../lib/isPlayingMatch.js'

eventHandler.registerEvent(`hero:name`, {
  handler: (dotaClient: GSIHandler, name: HeroNames) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    dotaClient.playingHero = name
  },
})
