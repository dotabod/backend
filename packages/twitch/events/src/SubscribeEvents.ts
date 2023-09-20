import { middleware } from './listener.js'
import { events } from './twitch/events/events.js'
import { handleEvent } from './twitch/events/handleEvent.js'

export const SubscribeEvents = (accountIds: string[]) => {
  const promises: Promise<void>[] = []
  accountIds.forEach((userId) => {
    try {
      promises.push(
        ...Object.keys(events).map((eventName) => {
          const eventNameTyped = eventName as keyof typeof events
          try {
            const middlewareEvent = middleware[eventNameTyped]
            // @ts-expect-error asdf
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return middlewareEvent(userId, (data) => handleEvent(eventNameTyped, data))
          } catch (error) {
            console.error('[TWITCHEVENTS] Could not sub userId error', { userId, error })
          }
        }),
      )
    } catch (e) {
      console.log('[TWITCHEVENTS] could not sub', { e, userId })
    }
  })

  console.log('[TWITCHEVENTS] Starting promise waiting for length', { length: accountIds.length })
  Promise.all(promises)
    .then(() =>
      console.log('[TWITCHEVENTS] done subbing to channelLength:', {
        channelLength: accountIds.length,
      }),
    )
    .catch((e) => {
      console.log('[TWITCHEVENTS] Could not sub due to error', { error: e })
    })
}
