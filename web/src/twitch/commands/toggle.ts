import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { events } from '../../dota/server.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

export async function toggleDotabod(
  token: string,
  isBotDisabled: boolean,
  channel: string,
  lng = 'en',
) {
  if (!isBotDisabled) {
    events.emit('new-gsi-client', token)
    await chatClient.join(channel)
  }

  await chatClient.say(
    channel,
    t('toggle', { context: isBotDisabled ? 'disabled' : 'enabled', lng }),
  )

  if (isBotDisabled) {
    events.emit('remove-gsi-client', token)
    chatClient.part(channel)
  }
}

commandHandler.registerCommand('toggle', {
  aliases: ['mute', 'unmute'],
  permission: 2,

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
