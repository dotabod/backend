import { announceCapturedCosmetics } from '../../lib/announce-cosmetics.ts'
import { scheduleVisionClip } from '../../lib/clip-schedule.ts'
import { isPlayingMatch } from '../../lib/is-playing-match.ts'
import eventHandler from '../event-handler.ts'

eventHandler.registerEvent('map:game_state', {
  handler: async ({ client }, gameState: string) => {
    if (!isPlayingMatch(client.gsi, false)) {
      return
    }

    // The strategy transition releases the pick announcement once the hero is public.
    await Promise.all([scheduleVisionClip(client, gameState), announceCapturedCosmetics(client)])
  },
})
