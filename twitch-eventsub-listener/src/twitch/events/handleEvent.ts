import { events } from './events.js'

import { DOTABOD_EVENTS_ROOM, eventsIOConnected, io } from './index.js'

export const handleEvent = (eventName: keyof typeof events, data: any) => {
  if (!eventsIOConnected) {
    return
  }

  const event = events[eventName]

  if (event.customHandler) {
    void event.customHandler(data)
  }

  if (event.sendToSocket) {
    io.to(DOTABOD_EVENTS_ROOM).emit(
      'event',
      eventName,
      data.broadcasterId,
      event.sendToSocket(data),
    )
  }
}
