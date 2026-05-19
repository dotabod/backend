import { t } from 'i18next'

import { gsiHandlers } from '../../dota/lib/consts'
import { server } from '../../dota/server'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('count', {
  handler: async (message, args) => {
    const sockets = (await server.io.fetchSockets()).length
    const gsiSize = gsiHandlers.size

    const bothParts = `${t('connections.gsi', {
      lng: message.channel.client.locale,
      channel: message.channel.name,
      count: gsiSize,
    })} · ${t('connections.overlay', {
      lng: message.channel.client.locale,
      channel: message.channel.name,
      count: sockets,
    })}`

    chatClient.say(message.channel.name, bothParts, message.user.messageId)
  },
})
