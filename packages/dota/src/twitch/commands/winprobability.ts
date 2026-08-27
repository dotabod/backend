import { t } from 'i18next'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

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
      chatClient.say(
        channel,
        t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
      return
    }

    chatClient.say(
      channel,
      t('matchDataValveDisabled', { emote: 'PoroSad', lng: message.channel.client.locale }),
      message.user.messageId,
    )
  },
})
