import { t } from 'i18next'

import supabase from '../../db/supabase.js'
import { DBSettings, getValueOrDefault } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('mute', {
  aliases: ['unmute'],
  permission: 2,
  cooldown: 0,
  handler: async (message, args) => {
    const {
      channel: { client },
    } = message

    const hasChatters = getValueOrDefault(DBSettings.chatter, client.settings)

    await supabase.from('settings').upsert(
      {
        userId: message.channel.client.token,
        key: DBSettings.chatter,
        value: !hasChatters,
      },
      {
        onConflict: 'userId, key',
      },
    )

    chatClient.say(
      message.channel.name,
      !hasChatters
        ? t('muted', {
            lng: message.channel.client.locale,
          })
        : t('unmuted', {
            lng: message.channel.client.locale,
          }),
      message.user.messageId,
    )
  },
})
