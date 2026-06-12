import { t } from 'i18next'

import { type ChatEventData, ChatMessageType, type DotaEvent, DotaEventTypes } from '../../../types'
import { getRedisNumberValue, is8500Plus } from '../../../utils/index'
import { delayedQueue } from '../../lib/DelayedQueue'
import { getHeroNameOrColor } from '../../lib/heroes'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import { MatchDataService } from '../../lib/matchData'
import { say } from '../../say'
import eventHandler from '../EventHandler'

// How long after a team smoke to check whether the streamer's own hero got the buff.
const SMOKE_FOMO_DELAY_MS = 3000

eventHandler.registerEvent(`event:${DotaEventTypes.GenericEvent}`, {
  handler: async (dotaClient, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    try {
      const data = JSON.parse(event.data ?? '{}') as ChatEventData

      // Game abandoned type of events
      const gameAbandonedTypes = [
        'CHAT_MESSAGE_WILL_NOT_BE_SCORED',
        'CHAT_MESSAGE_SAFE_TO_LEAVE',
        'CHAT_MESSAGE_CAN_QUIT_WITHOUT_ABANDON',
        'CHAT_MESSAGE_WILL_NOT_BE_SCORED_RANKED',
      ]
      if (gameAbandonedTypes.includes(data.type)) {
        // TODO: Handle game abandoned events
        return
      }

      if (data.type === ChatMessageType.ChatMessageSmokeActivated) {
        // Dota only surfaces SMOKE_ACTIVATED for the viewer's own team, but gate on
        // team anyway so we never leak/misreport an enemy smoke (and skip when
        // spectating, where team_name is 'spectator' and won't match a slot-derived side).
        const streamerTeam = dotaClient.client.gsi?.player?.team_name
        const activatorTeam = data.playerid1 <= 4 ? 'radiant' : 'dire'
        if (!streamerTeam || activatorTeam !== streamerTeam) return

        // Resolve the activator's hero from their slot (playerid1), mirroring
        // event.tip.ts: 8500+ only names a hero when positively matched by slot.
        const { players } = await new MatchDataService(dotaClient.client).resolveRoster()
        const found = players.findIndex((p) => p.slot === data.playerid1)
        const idx = found === -1 ? data.playerid1 : found
        const high = is8500Plus(dotaClient.client)
        const heroId = players[idx]?.heroId
        const heroName = high
          ? found !== -1 && heroId
            ? getHeroNameOrColor(heroId, idx)
            : null
          : getHeroNameOrColor(heroId ?? 0, idx)

        // Did the streamer cast it themselves? Then they're with the team by definition.
        const streamerCastIt =
          (await getRedisNumberValue(`${dotaClient.getToken()}:playingHeroSlot`)) === data.playerid1

        // Send exactly ONE message, decided after the smoke buff has had a moment to
        // settle: rib the streamer if they weren't actually in it, otherwise the normal
        // heads-up. The delay is what lets us read `hero.smoked` to pick the right line.
        delayedQueue.addTask(SMOKE_FOMO_DELAY_MS, () => {
          const { client } = dotaClient
          if (!client.stream_online) return
          if (!isPlayingMatch(client.gsi)) return

          // Caught out: a teammate smoked, the streamer is alive, but never got the buff.
          const caughtOut =
            !streamerCastIt && client.gsi?.hero?.alive !== false && !client.gsi?.hero?.smoked

          const message = caughtOut
            ? t('chatters.smokeWithoutYou', { emote: 'HAH', lng: client.locale })
            : heroName
              ? t('chatters.smokeActivated', { emote: 'Shush', heroName, lng: client.locale })
              : t('chatters.smokeActivatedUnknown', { emote: 'Shush', lng: client.locale })

          say(client, message, { chattersKey: 'smokeActivated' })
        })
        return
      }
    } catch {
      return
    }
  },
})
