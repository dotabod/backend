import { Server } from 'socket.io'

import { events } from './events.js'
import { handleEvent } from './handleEvent.js'
import { listener } from '../lib/listener.js'

export const io = new Server(5015)
export const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'
export let eventsIOConnected = false

io.on('connection', (socket) => {
  try {
    void socket.join(DOTABOD_EVENTS_ROOM)
  } catch (e) {
    console.error('could not join socket DOTABOD_EVENTS_ROOM', e)
    return
  }

  eventsIOConnected = true

  socket.on('disconnect', () => {
    eventsIOConnected = false
  })
})

export const SubscribeEvents = (accountIds: string[]) => {
  const promises: Promise<any>[] = []
  accountIds.forEach((userId) => {
    try {
      promises.push(
        ...Object.keys(events).map((eventName) => {
          const eventNameTyped = eventName as keyof typeof events
          try {
            // @ts-expect-error asdf
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return listener[eventName](userId, (data: unknown) => handleEvent(eventNameTyped, data))
          } catch (error) {
            console.error({ userId, error })
          }
        }),
      )
    } catch (e) {
      console.log(e)
    }
  })

  console.log('Starting promise waiting for', accountIds.length)
  Promise.all(promises)
    .then(() => console.log('done subbing to', accountIds.length, 'channels'))
    .catch((e) => {
      console.log(e)
    })
}
