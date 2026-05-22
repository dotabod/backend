import { t } from 'i18next'
import { formatUnresolvedMatch, getUnresolvedMatches } from '../../dota/lib/unresolvedMatches'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'

commandHandler.registerCommand('unresolved', {
  aliases: ['pending'],
  permission: 2, // Mods and broadcaster only
  cooldown: 10000,
  dbkey: DBSettings.commandWon, // Reuse the same setting as won/lost commands
  handler: async (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message

    const matches = await getUnresolvedMatches(client)

    if (matches.length === 0) {
      chatClient.say(
        channel,
        t('bets.noUnresolvedMatches', {
          emote: 'Okayeg',
          lng: client.locale,
        }),
        message.user.messageId,
      )
      return
    }

    const matchList = matches.map((m) => formatUnresolvedMatch(m)).join(', ')
    const count = matches.length

    chatClient.say(
      channel,
      t('bets.unresolvedMatches', {
        count,
        matchList,
        emote: 'PauseChamp',
        lng: client.locale,
      }),
      message.user.messageId,
    )
  },
})
