import { DBSettings, getValueOrDefault } from '@dotabod/settings'

import supabase from '../../db/supabase.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('toggle', {
  aliases: ['disable', 'enable'],
  permission: 2,
  cooldown: 0,
  handler: async (message, args) => {
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
