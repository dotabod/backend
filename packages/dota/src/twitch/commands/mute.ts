import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'

commandHandler.registerCommand('mute', {
  aliases: ['unmute'],
  cooldown: 0,
  handler: async (message) => {
    const {
      channel: { client },
    } = message

    const hasChatters = getValueOrDefault(DBSettings.chatter, client.settings, client.subscription)

    await supabase.from('settings').upsert(
      {
        key: DBSettings.chatter,
        updated_at: new Date().toISOString(),
        userId: message.channel.client.token,
        value: !hasChatters,
      },
      {
        onConflict: 'userId, key',
      }
    )

    chatClient.say(
      message.channel.name,
      hasChatters
        ? t('unmuted', {
            lng: message.channel.client.locale,
          })
        : t('muted', {
            lng: message.channel.client.locale,
          }),
      message.user.messageId
    )
  },
  permission: 2,
})
