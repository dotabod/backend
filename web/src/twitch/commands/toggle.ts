import { prisma } from '../../db/prisma.js'
import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { events } from '../../dota/server.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

export function tellChatDotabodState(isDisabled: boolean, content: string) {
  const toggled = isDisabled ? 'disabled' : 'enabled'

  return `Dotabod is now ${toggled}. ${
    isDisabled
      ? `Will no longer watch game events nor respond to commands. Type ${
          content.split(' ')[0]
        } again to enable.`
      : `Responding to commands again and watching game events. Type ${
          content.split(' ')[0]
        } again to disable.`
  }`
}

export async function toggleDotabod(
  token: string,
  isBotDisabled: boolean,
  channel: string,
  content = '!toggle',
) {
  if (!isBotDisabled) {
    events.emit('new-gsi-client', token)
    await chatClient.join(channel)
  }

  await chatClient.say(channel, tellChatDotabodState(isBotDisabled, content))

  if (isBotDisabled) {
    events.emit('remove-gsi-client', token)
    chatClient.part(channel)
  }
}

commandHandler.registerCommand('toggle', {
  aliases: ['mute', 'unmute'],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
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
        //
      })
      .catch((e) => {
        //
      })
  },
})
