import { events } from './events.js'
import { DOTABOD_EVENTS_ROOM, eventsIOConnected, socketIo } from '../../utils/socketUtils.js'

export const handleEvent = (eventName: keyof typeof events, data: any) => {
  const event = events[eventName]

  if ('customHandler' in event) {
    try {
      void event?.customHandler?.(data)
    } catch (e) {
      console.error('could not handle custom event handler', { eventName, e })
    }
  }

  if (event?.sendToSocket && eventsIOConnected) {
    socketIo
      .to(DOTABOD_EVENTS_ROOM)
      .emit('event', eventName, data.broadcasterId, event.sendToSocket(data))
  }
}
