import { announceCapturedCosmetics } from '../../lib/announceCosmetics'
import eventHandler from '../EventHandler'

// A hero:id change is a fresh pick or a mid-game swap (GSI only emits on change). Hand off to
// the shared announcer, which snapshots the equipped cosmetics and — only once the hero is
// publicly visible (strategy phase onward) — posts the captured set in chat. During hero
// selection this no-ops so the pick is never tipped to stream snipers; the strategy-time
// map:game_state trigger releases the held announcement. Mid-game swaps are already past
// strategy, so they post right away.
eventHandler.registerEvent('hero:id', {
  handler: async (dotaClient, heroId: number) => {
    if (!heroId || heroId <= 0) return
    await announceCapturedCosmetics(dotaClient.client)
  },
})
