import { t } from 'i18next'

import { gsiHandlers } from '../../dota/lib/consts'
import { server } from '../../dota/server'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('count', {
  handler: async (message, _args) => {
    const sockets = (await server.io.fetchSockets()).length
    const gsiSize = gsiHandlers.size

    const bothParts = `${t('connections.gsi', {
      channel: message.channel.name,
      count: gsiSize,
      lng: message.channel.client.locale,
    })} · ${t('connections.overlay', {
      channel: message.channel.name,
      count: sockets,
      lng: message.channel.client.locale,
    })}`

    chatClient.say(message.channel.name, bothParts, message.user.messageId)
  },
})
