import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { DotaEvent, DotaEventTypes } from '../../../types.js'
import { fmtMSS } from '../../../utils/index.js'
import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`event:${DotaEventTypes.RoshanKilled}`, {
  handler: (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    // doing map gametime - event gametime in case the user reconnects to a match,
    // and the gametime is over the event gametime
    const gameTimeDiff =
      (dotaClient.client.gsi?.map?.game_time ?? event.game_time) - event.game_time

    // min spawn for rosh in 5 + 3 minutes
    const minS = 5 * 60 + 3 * 60 - gameTimeDiff
    const minTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + minS

    // max spawn for rosh in 5 + 3 + 3 minutes
    const maxS = 5 * 60 + 3 * 60 + 3 * 60 - gameTimeDiff
    const maxTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + maxS

    // server time
    const minDate = dotaClient.addSecondsToNow(minS)
    const maxDate = dotaClient.addSecondsToNow(maxS)

    const res = {
      minS,
      maxS,
      minTime: fmtMSS(minTime),
      maxTime: fmtMSS(maxTime),
      minDate,
      maxDate,
    }

    dotaClient.roshanKilled = res
    dotaClient.roshanCount++

    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      roshanKilled: { enabled: chatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    if (chattersEnabled && chatterEnabled) {
      const props = {
        num: dotaClient.roshanCount,
        lng: dotaClient.client.locale,
      }

      // Doing it this way so i18n can pick up the t('') strings
      const roshCountMsg =
        props.num === 1
          ? t('roshanCount.1', props)
          : props.num === 2
          ? t('roshanCount.2', props)
          : props.num === 3
          ? t('roshanCount.3', props)
          : t('roshanCount.more', props)

      dotaClient.say(
        `${t('roshanKilled', {
          min: res.minTime,
          max: res.maxTime,
          lng: dotaClient.client.locale,
        })}. ${roshCountMsg}`,
      )
    }

    server.io
      .to(dotaClient.getToken())
      .emit('roshan-killed', { ...res, count: dotaClient.roshanCount })
  },
})
