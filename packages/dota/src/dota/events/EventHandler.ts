import { logger } from '../../utils/logger.js'
import { events } from '../globalEventEmitter.js'
import { GSIHandler } from '../GSIHandler.js'
import { gsiHandlers } from '../lib/consts.js'

export interface EventOptions {
  handler: (dotaClient: GSIHandler, data: any) => Promise<void> | void
}

class EventHandler {
  registerEvent = (eventName: string, options: EventOptions) => {
    events.on(eventName, (data: any, token: string) => {
      if (!gsiHandlers.has(token)) return
      const client = gsiHandlers.get(token)

      if (!client) return

      // if we disabled the backend processing from somewhere else
      // we shouldn't process events
      if (client.disabled) return

      // if we r offline don't process events
      if (!client.client.stream_online) return

      // check if options.handler is a promise first

      options.handler(client, data)?.catch((err) => {
        console.error('Error handling event:', { token, eventName, err })
      })
    })
  }
}

const eventHandler = new EventHandler()

export default eventHandler
