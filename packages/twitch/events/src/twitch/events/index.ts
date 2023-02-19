import { EventSubHttpListener } from '@twurple/eventsub-http'
import { Server } from 'socket.io'

import { events } from './events.js'
import { handleEvent } from './handleEvent.js'
import { listener } from '../lib/listener.js'

export const io = new Server(5015)
export const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'
export let eventsIOConnected = false

io.on('connection', (socket) => {
  void socket.join(DOTABOD_EVENTS_ROOM)
  eventsIOConnected = true

  socket.on('disconnect', () => {
    eventsIOConnected = false
  })
})

type EventSubHttpListenerKey = keyof EventSubHttpListener
export const SubscribeEvents = (accountIds: string[]) => {
  const promises: Promise<any>[] = []
  accountIds.forEach((userId) => {
    try {
      promises.push(
        ...Object.keys(events).map((eventName) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return listener[eventName as EventSubHttpListenerKey](userId, (data: any) =>
              handleEvent(eventName, data),
            )
          } catch (error) {
            console.error({ userId, error })
          }
        }),
      )
    } catch (e) {
      console.log(e)
    }
  })

  console.log('Starting promise waiting')
  Promise.all(promises)
    .then(() => console.log('done subbing to', accountIds.length, 'channels'))
    .catch((e) => {
      console.log(e)
    })
}
