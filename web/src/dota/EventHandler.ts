import { GSIHandler } from './GSIHandler.js'

export interface EventOptions {
  handler: (dotaClient: GSIHandler, data: any) => void
}

class EventHandler {
  events = new Map<string, EventOptions>() // Map for storing event information

  registerEvent = (eventName: string, options: EventOptions) => {
    // Check if the event is already registered
    if (this.events.has(eventName)) {
      throw new Error(`Event "${eventName}" is already registered.`)
    }

    // Store the event information in the events map
    this.events.set(eventName, options)
  }
}

const eventHandler = new EventHandler()

export default eventHandler
