import RedisClient from '../../../db/RedisClient'
import { type DotaEvent, DotaEventTypes } from '../../../types'
import { fmtMSS } from '../../../utils/index'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch'
import { getHeroNameOrColor } from '../../lib/heroes'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import { say } from '../../say'
import eventHandler from '../EventHandler'
import { emitAegisEvent } from './emitAegisEvent'
import { generateAegisMessage } from './generateAegisMessage'

eventHandler.registerEvent(`event:${DotaEventTypes.AegisPickedUp}`, {
  handler: async (dotaClient, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const gameTimeDiff =
      (dotaClient.client.gsi?.map?.game_time ?? event.game_time) - event.game_time

    // Aegis of the Immortal expires 5 minutes after pickup (unchanged since patch 7.33)
    const expireS = 5 * 60 - gameTimeDiff
    const expireTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + expireS

    // server time
    const expireDate = dotaClient.addSecondsToNow(expireS)

    const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient.client.gsi })

    let playerIdIndex = matchPlayers.findIndex((p) => p.playerid === event.player_id)
    if (playerIdIndex === -1) {
      playerIdIndex = event.player_id
    }
    const heroName = getHeroNameOrColor(matchPlayers[playerIdIndex]?.heroid ?? 0, playerIdIndex)

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
