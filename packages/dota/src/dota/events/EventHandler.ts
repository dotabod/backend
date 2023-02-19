import { events } from '../globalEventEmitter.js'
import { GSIHandler } from '../GSIHandler.js'
import { gsiHandlers } from '../lib/consts.js'

export interface EventOptions {
  handler: (dotaClient: GSIHandler, data: any) => void
}

class EventHandler {
  registerEvent = (eventName: string, options: EventOptions) => {
    events.on(eventName, (data: any, token: string) => {
      if (!gsiHandlers.has(token)) return
      const client = gsiHandlers.get(token)
      if (client!.disabled) return

      options.handler(client!, data)
    })
  }
}

const eventHandler = new EventHandler()

export default eventHandler
