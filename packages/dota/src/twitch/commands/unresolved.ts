import { t } from 'i18next'

import { formatUnresolvedMatch, getUnresolvedMatches } from '../../dota/lib/unresolved-matches'
import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

commandHandler.registerCommand('unresolved', {
  aliases: ['pending'],
  cooldown: 10_000,
  // Reuse the same setting as won/lost commands
  dbkey: DBSettings.commandWon,
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
        message.user.messageId
      )
      return
    }

    const matchList = matches.map((m) => formatUnresolvedMatch(m)).join(', ')
    const count = matches.length

    chatClient.say(
      channel,
      t('bets.unresolvedMatches', {
        count,
        emote: 'PauseChamp',
        lng: client.locale,
        matchList,
      }),
      message.user.messageId
    )
  },
  // Mods and broadcaster only,
  permission: 2,
})
