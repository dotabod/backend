import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { GetLiveMatch } from '../../stratz/livematch'

const WinRateCache: {
  [id: string]: string
} = {}

const API_COOLDOWN_SEC = 60
const apiCooldown: { [key: string]: boolean } = {}

commandHandler.registerCommand('winprobability', {
  aliases: ['win%', 'wp'],
  onlyOnline: true,
  dbkey: DBSettings.commandWinProbability,
  handler: async (message) => {
    const {
      channel: { name: channel, client },
    } = message

    const matchId = client.gsi?.map?.matchid
    if (!matchId) {
      chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
      return
    }

    if (!apiCooldown[matchId]) {
      apiCooldown[matchId] = true
      setTimeout(() => delete apiCooldown[matchId], API_COOLDOWN_SEC * 1000)

      const matchDetails = await GetLiveMatch(matchId)

      const lastWinRate = matchDetails?.data.live.match?.liveWinRateValues.slice(-1).pop()
      if (
        lastWinRate &&
        !matchDetails?.data.live.match?.completed &&
        matchDetails?.data.live.match?.isUpdating
      ) {
        const isRadiant = client.gsi?.player?.team_name === 'radiant'
        const winRate = Math.floor(
          (isRadiant ? lastWinRate.winRate : 1 - lastWinRate.winRate) * 100,
        )

        WinRateCache[channel] = `${winRate}% win probability GabeN ${lastWinRate.time}:00 ⏲`
      } else {
        WinRateCache[channel] = 'Win probability data is not available yet'
      }
    }

    chatClient.say(channel, WinRateCache[channel])
  },
})
