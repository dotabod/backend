import { prisma } from '../../db/prisma.js'
import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { events } from '../../dota/server.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

commandHandler.registerCommand('toggle', {
  aliases: ['mute', 'unmute'],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
      content,
    } = message

    const isBotDisabled = getValueOrDefault(DBSettings.commandDisable, client.settings)
    prisma.setting
      .upsert({
        where: {
          key_userId: {
            userId: client.token,
            key: DBSettings.commandDisable,
          },
        },
        create: {
          userId: client.token,
          key: DBSettings.commandDisable,
          value: !isBotDisabled,
        },
        update: {
          value: !isBotDisabled,
        },
      })
      .then((r) => {
        const isDisabled = r.value
        const toggled = isDisabled ? 'disabled' : 'enabled'

        if (isDisabled) {
          events.emit('remove-gsi-client', client.token)
        } else {
          events.emit('new-gsi-client', client.token)
        }

        void chatClient.say(
          channel,
          `Dotabod is now ${toggled}. ${
            isDisabled
              ? `Will no longer watch game events nor respond to commands. Type ${
                  content.split(' ')[0]
                } to enable again.`
              : `Responding to commands again and watching game events. Type ${
                  content.split(' ')[0]
                } to disable again.`
          }`,
        )
      })
      .catch((e) => {
        //
      })
  },
})
