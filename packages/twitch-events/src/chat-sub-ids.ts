import type { TwitchEventSubResponse } from './interfaces'
import type { TwitchEventTypes } from './twitch-event-types'

// Get all existing subscriptions by looping through pages
export type EventSubscriptions = Partial<
  Record<keyof TwitchEventTypes, Pick<TwitchEventSubResponse['data'][0], 'id' | 'status'>>
>

export const eventSubMap = new Map<string, EventSubscriptions>()
