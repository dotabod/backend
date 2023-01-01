import { events } from '../globalEventEmitter.js'
import { GSIHandler } from '../GSIHandler.js'
import { gsiHandlers } from '../index.js'

export interface EventOptions {
  handler: (dotaClient: GSIHandler, data: any) => void
}

class EventHandler {
  registerEvent = (eventName: string, options: EventOptions) => {
    events.on(eventName, (data: any, token: string) => {
      if (!gsiHandlers.has(token)) return
      options.handler(gsiHandlers.get(token)!, data)
    })
  }
}

const eventHandler = new EventHandler()

export default eventHandler
