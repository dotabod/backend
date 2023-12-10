import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { GetLiveMatch } from '../../stratz/livematch.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

const WinRateCache: {
  [id: string]: string
} = {}

const API_COOLDOWN_SEC = 60
const apiCooldown: { [key: string]: number } = {}

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

    if (!apiCooldown[matchId] || Date.now() - apiCooldown[matchId] >= API_COOLDOWN_SEC * 1000) {
      try {
        apiCooldown[matchId] = Date.now()
        const matchDetails = await GetLiveMatch(parseInt(matchId, 10))

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
          WinRateCache[channel] = t('winprobability.winProbability', {
            winRate,
            emote: winRate > 50 ? 'Pog' : 'BibleThump',
            time: lastWinRate.time,
          })

          WinRateCache[channel] += t('winprobability.cooldown', {
            remainingCooldown: Math.floor(
              (API_COOLDOWN_SEC * 1000 - (Date.now() - apiCooldown[matchId])) / 1000,
            ),
            count: Math.floor(
              (API_COOLDOWN_SEC * 1000 - (Date.now() - apiCooldown[matchId])) / 1000,
            ),
          })
        } else {
          WinRateCache[channel] = t('winprobability.winProbabilityDataNotAvailable')
        }
      } catch (error) {
        console.error('Error fetching win probability:', error)
        WinRateCache[channel] = t('winprobability.winProbabilityDataNotAvailable')
      }
    } else {
      WinRateCache[channel] = t('winprobability.cooldown', {
        remainingCooldown: Math.floor(
          (API_COOLDOWN_SEC * 1000 - (Date.now() - apiCooldown[matchId])) / 1000,
        ),
        count: Math.floor((API_COOLDOWN_SEC * 1000 - (Date.now() - apiCooldown[matchId])) / 1000),
      })
    }

    chatClient.say(channel, WinRateCache[channel])
  },
})
