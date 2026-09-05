import { commandDisable } from '@dotabod/shared-utils'

import { DBSettings, getValueOrDefault } from '../../settings'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('toggle', {
  aliases: ['disable', 'enable'],
  cooldown: 0,
  handler: async (message, _args) => {
    const {
      channel: { client },
    } = message

    const isBotDisabled = getValueOrDefault(
      DBSettings.commandDisable,
      client.settings,
      client.subscription
    )

    const userId = message.channel.client.token

    if (isBotDisabled) {
      await commandDisable.enable(userId)
    } else {
      await commandDisable.disable(userId, 'MANUAL_DISABLE', {
        additional_info: `Manually disabled by ${message.user.name} via chat command`,
        command: '!toggle',
        disabled_by: message.user.name,
      })
    }
  },
  permission: 2,
})
