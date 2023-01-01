import { events } from '../globalEventEmitter.js'
import { GSIHandler } from '../GSIHandler.js'
import { gsiHandlers } from '../index.js'

export interface EventOptions {
  handler: (dotaClient: GSIHandler, data: any) => void
}

class EventHandler {
  registerEvent = (eventName: string, options: EventOptions) => {
    events.on(eventName, (data: any, token: string) => {
      const dotaClient = gsiHandlers.get(token)
      if (dotaClient) options.handler(dotaClient, data)
    })
  }
}

const eventHandler = new EventHandler()

export default eventHandler
