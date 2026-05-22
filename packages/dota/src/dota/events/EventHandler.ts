import type { GSIHandlerType } from '../GSIHandlerTypes'
import { events } from '../globalEventEmitter'
import { gsiHandlers } from '../lib/consts'

export interface EventOptions<T = unknown> {
  handler: (dotaClient: GSIHandlerType, data: T) => Promise<void> | void
}

class EventHandler {
  registerEvent = <T = unknown>(eventName: string, options: EventOptions<T>) => {
    events.on(eventName, (data: unknown, token: string) => {
      if (!gsiHandlers.has(token)) return
      const client = gsiHandlers.get(token)

      if (!client) return

      // if we disabled the backend processing from somewhere else
      // we shouldn't process events
      if (client.disabled) return

      // if we r offline don't process events
      if (!client.client.stream_online) return

      // dont send events if someone is sharing a computer for another steam account
      if (client.client.multiAccount) return

      // check if options.handler is a promise first
      // the global emitter is untyped; each registration declares the payload type
      options.handler(client, data as T)?.catch((err) => {
        console.error('Error handling event:', { token, eventName, err })
      })
    })
  }
}

const eventHandler = new EventHandler()

export default eventHandler
