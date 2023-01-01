import { events } from '../globalEventEmitter.js'
import { GSIHandler } from '../GSIHandler.js'
import { EventOptions } from './EventHandler.js'

class EventRunner {
  dotaClient: GSIHandler
  events = new Map<string, EventOptions>() // Map for storing event information

  constructor(client: GSIHandler) {
    this.dotaClient = client
    this.registerEvents()
  }

  registerEvents = () => {
    this.events.forEach((value: EventOptions, key: string) => {
      events.on(`${this.dotaClient.getToken()}:${key}`, (data: any) => {
        value.handler(this.dotaClient, data)
      })
    })
  }
}

export default EventRunner
