import { DBSettings, getValueOrDefault } from '@dotabod/settings'

import supabase from '../../db/supabase.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('toggle', {
  aliases: ['mute', 'unmute'],
  permission: 2,
  cooldown: 0,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message

    const isBotDisabled = getValueOrDefault(DBSettings.commandDisable, client.settings)

    await supabase.from('settings').upsert(
      {
        userId: message.channel.client.token,
        key: DBSettings.commandDisable,
        value: !isBotDisabled,
      },
      {
        onConflict: 'userId, key',
      },
    )
  },
})
