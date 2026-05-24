import { t } from 'i18next'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch'
import { getStreamersInMatch } from '../../dota/lib/matchData'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('streamers', {
  dbkey: DBSettings.commandStreamers,
  handler: async (message) => {
    const {
      channel: { name: channel, client },
    } = message

    if (!client.stream_online) {
      chatClient.say(
        channel,
        t('notLive', { emote: 'PauseChamp', lng: client.locale }),
        message.user.messageId,
      )
      return
    }

    if (!isPlayingMatch(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: client.locale }),
        message.user.messageId,
      )
      return
    }

    const count = await getStreamersInMatch({ client, excludeUserId: client.token })

    chatClient.say(
      channel,
      t('streamersInMatch', { count, emote: 'Okayge', lng: client.locale }),
      message.user.messageId,
    )
  },
})
