import { captureCosmetics } from '../../lib/captureCosmetics'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import eventHandler from '../EventHandler'

// Fires once whenever GSI reports a new hero id (pick or mid-game swap, since
// events only emit on change). We snapshot the equipped cosmetics automatically
// here — no need for chat to run !set — provided wearables are already present
// (captureCosmetics no-ops otherwise).
eventHandler.registerEvent('hero:id', {
  handler: async (dotaClient, heroId: number) => {
    if (!heroId || heroId <= 0) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    await captureCosmetics(dotaClient.client)
  },
})
