import { t } from 'i18next'

import { server } from '../../dota/server.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

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
