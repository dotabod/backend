import { t } from 'i18next'

import { type ChatEventData, ChatMessageType, type DotaEvent, DotaEventTypes } from '../../../types'
import { getRedisNumberValue } from '../../../utils/index'
import { delayedQueue } from '../../lib/DelayedQueue'
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
        // Dota only surfaces SMOKE_ACTIVATED to the viewer's own team, but gate on team
        // anyway so we never leak or misreport an enemy smoke — and so we skip spectating,
        // where team_name is 'spectator' and won't match a slot-derived side. The GSI event
        // slot is the stable team convention (0-4 radiant, 5-9 dire; cf. normalize.ts).
        const streamerTeam = dotaClient.client.gsi?.player?.team_name
        const activatorTeam = data.playerid1 <= 4 ? 'radiant' : 'dire'
        if (!streamerTeam || activatorTeam !== streamerTeam) return

        // Did the streamer cast it themselves? Then they're in it by definition.
        const streamerCastIt =
          (await getRedisNumberValue(`${dotaClient.getToken()}:playingHeroSlot`)) === data.playerid1

        // Decide ONE message after the smoke buff settles (~3s): rib the streamer if they
        // weren't actually in it, otherwise name the hero who popped it.
        delayedQueue.addTask(SMOKE_FOMO_DELAY_MS, async () => {
          const { client } = dotaClient
          if (!client.stream_online) return
          if (!isPlayingMatch(client.gsi)) return

          // Caught out: a teammate smoked, the streamer is alive, but never got the buff.
          const caughtOut =
            !streamerCastIt && client.gsi?.hero?.alive !== false && !client.gsi?.hero?.smoked
          if (caughtOut) {
            say(client, t('chatters.smokeWithoutYou', { emote: 'HAH', lng: client.locale }), {
              chattersKey: 'smokeActivated',
            })
            return
          }

          // Grouped up (or cast it): name the activator's hero, tier-aware (8500+ stays
          // anonymous). resolveHeroNameForSlot does the roster lookup + bounded color fallback.
          const { name: heroName } = await new MatchDataService(client).resolveHeroNameForSlot({
            eventPlayerId: data.playerid1,
          })
          say(
            client,
            heroName
              ? t('chatters.smokeActivated', { emote: 'Shush', heroName, lng: client.locale })
              : t('chatters.smokeActivatedUnknown', { emote: 'Shush', lng: client.locale }),
            { chattersKey: 'smokeActivated' },
          )
        })
        return
      }
    } catch {
      return
    }
  },
})
