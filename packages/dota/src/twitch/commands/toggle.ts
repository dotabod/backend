import { trackDisableReason, trackResolveReason } from '@dotabod/shared-utils'
import { DBSettings, getValueOrDefault } from '../../settings'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('toggle', {
  aliases: ['disable', 'enable'],
  permission: 2,
  cooldown: 0,
  handler: async (message, _args) => {
    const {
      channel: { client },
    } = message

    const isBotDisabled = getValueOrDefault(
      DBSettings.commandDisable,
      client.settings,
      client.subscription,
    )

    const userId = message.channel.client.token

    if (!isBotDisabled) {
      await trackDisableReason(
        userId,
        DBSettings.commandDisable,
        'MANUAL_DISABLE',
        {
          disabled_by: message.user.name,
          command: '!toggle',
          additional_info: `Manually disabled by ${message.user.name} via chat command`,
        },
        { disabledValue: true },
      )
    } else {
      await trackResolveReason(userId, DBSettings.commandDisable, false, { enabledValue: false })
    }
  },
})
