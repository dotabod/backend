import { announceCapturedCosmetics } from '../../lib/announce-cosmetics.js'
import { scheduleVisionClip } from '../../lib/clip-schedule.js'
import { isPlayingMatch } from '../../lib/is-playing-match.js'
import eventHandler from '../event-handler.js'

eventHandler.registerEvent('map:game_state', {
  handler: async ({ client }, gameState: string) => {
    if (!client.stream_online || !isPlayingMatch(client.gsi, false)) {
      return
    }

    // The strategy transition releases the pick announcement once the hero is public.
    await Promise.all([scheduleVisionClip(client, gameState), announceCapturedCosmetics(client)])
  },
})
