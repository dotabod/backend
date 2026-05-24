import RedisClient from '../../../db/RedisClient'
import { type AegisPickedUpEvent, DotaEventTypes } from '../../../types'
import { fmtMSS, is8500Plus } from '../../../utils/index'
import { getHeroNameOrColor } from '../../lib/heroes'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import { MatchDataService } from '../../lib/matchData'
import { say } from '../../say'
import eventHandler from '../EventHandler'
import { emitAegisEvent } from './emitAegisEvent'
import { generateAegisMessage } from './generateAegisMessage'

eventHandler.registerEvent(`event:${DotaEventTypes.AegisPickedUp}`, {
  handler: async (dotaClient, event: AegisPickedUpEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const gameTimeDiff =
      (dotaClient.client.gsi?.map?.game_time ?? event.game_time) - event.game_time

    // Aegis of the Immortal expires 5 minutes after pickup (unchanged since patch 7.33)
    const expireS = 5 * 60 - gameTimeDiff
    const expireTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + expireS

    // server time
    const expireDate = dotaClient.addSecondsToNow(expireS)

    const roster = await new MatchDataService(dotaClient.client).resolveRoster()
    const players = roster.players

    const foundIndex = players.findIndex((p) => p.slot === event.player_id)
    const playerIdIndex = foundIndex === -1 ? event.player_id : foundIndex
    const heroId = players[playerIdIndex]?.heroId
    const high = is8500Plus(dotaClient.client)
    // event.player_id is NOT a dependable slot/color index — Dota reshuffles it,
    // mostly in high-immortal/ranked-roles games (~57% of 8500+ vs ~0% of confirmed
    // sub-8500). For 8500+ we only name a hero when we positively matched the
    // player by `slot` in the roster; otherwise we'd be indexing by raw
    // event.player_id (possibly wrong hero) or showing a slot color (possibly
    // wrong side). For <8500 we keep the existing behavior — hero from the
    // index fallback if the roster carries one, otherwise the slot color.
    const heroName = high
      ? foundIndex !== -1 && heroId
        ? getHeroNameOrColor(heroId, playerIdIndex)
        : null
      : getHeroNameOrColor(heroId ?? 0, playerIdIndex)

    const res = {
      expireS,
      playerId: playerIdIndex,
      expireTime: fmtMSS(expireTime),
      expireDate,
      snatched: event.snatched,
      heroName,
    }

    const redisClient = RedisClient.getInstance()
    await redisClient.client.json.set(`${dotaClient.getToken()}:aegis`, '$', res)

    say(dotaClient.client, generateAegisMessage(res, dotaClient.client.locale), {
      chattersKey: 'roshPickup',
    })

    emitAegisEvent(res, dotaClient.getToken(), dotaClient.client)
  },
})
