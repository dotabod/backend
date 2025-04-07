import RedisClient from '../../../db/RedisClient.js'
import { type DotaEvent, DotaEventTypes } from '../../../types.js'
import { fmtMSS, getRedisNumberValue } from '../../../utils/index.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'
import { emitRoshEvent, generateRoshanMessage, type RoshRes } from './RoshRes.js'

eventHandler.registerEvent(`event:${DotaEventTypes.RoshanKilled}`, {
  handler: async (dotaClient, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const redisClient = RedisClient.getInstance()
    const matchId = await redisClient.client.get(`${dotaClient.getToken()}:matchId`)

    const playingGameMode = await getRedisNumberValue(
      `${matchId}:${dotaClient.getToken()}:gameMode`,
    )

    // doing map gametime - event gametime in case the user reconnects to a match,
    // and the gametime is over the event gametime
    const gameTimeDiff =
      (dotaClient.client.gsi?.map?.game_time ?? event.game_time) - event.game_time

    // min spawn for rosh in 5 + 3 minutes
    let minS = 5 * 60 + 3 * 60 - gameTimeDiff
    // max spawn for rosh in 5 + 3 + 3 minutes
    let maxS = 5 * 60 + 3 * 60 + 3 * 60 - gameTimeDiff

    // Check if the game mode is Turbo (23)
    if (playingGameMode === 23) {
      minS /= 2
      maxS /= 2
    }

    const minTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + minS
    const maxTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + maxS

    // server time
    const minDate = dotaClient.addSecondsToNow(minS)
    const maxDate = dotaClient.addSecondsToNow(maxS)

    // TODO: move this to a redis handler
    const redisJson = (await redisClient.client.json.get(
      `${dotaClient.getToken()}:roshan`,
    )) as RoshRes | null
    const count = redisJson ? Number(redisJson.count) : 0
    const res = {
      minS,
      maxS,
      minTime: fmtMSS(minTime),
      maxTime: fmtMSS(maxTime),
      minDate,
      maxDate,
      count: count + 1,
    }

    await redisClient.client.json.set(`${dotaClient.getToken()}:roshan`, '$', res)

    say(dotaClient.client, generateRoshanMessage(res, dotaClient.client.locale), {
      chattersKey: 'roshanKilled',
    })

    emitRoshEvent(res, dotaClient.getToken(), dotaClient.client)
  },
})
