import { supabase, trackDisableReason, trackResolveReason } from '@dotabod/shared-utils'
import { DBSettings, getValueOrDefault } from '../../settings.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('toggle', {
  aliases: ['disable', 'enable'],
  permission: 2,
  cooldown: 0,
  handler: async (message, args) => {
    const {
      channel: { client },
    } = message

    const isBotDisabled = getValueOrDefault(
      DBSettings.commandDisable,
      client.settings,
      client.subscription,
    )

    const userId = message.channel.client.token
    const newValue = !isBotDisabled

    // Track the reason for the toggle
    if (newValue) {
      // Enabling - resolve any existing disable reasons
      await trackResolveReason(userId, DBSettings.commandDisable, false)
    } else {
      // Disabling - track manual disable reason
      await trackDisableReason(userId, DBSettings.commandDisable, 'manual_disable', {
        disabled_by: message.user.name,
        command: '!toggle',
        additional_info: `Manually disabled by ${message.user.name} via chat command`,
      })
    }

    await supabase.from('settings').upsert(
      {
        userId,
        key: DBSettings.commandDisable,
        value: newValue,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'userId, key',
      },
    )
  },
})
