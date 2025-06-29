import type { TwitchEventSubResponse } from './interfaces.js'
import type { TwitchEventTypes } from './TwitchEventTypes.js'

// Get all existing subscriptions by looping through pages
export const eventSubMap: Record<
  string,
  Record<keyof TwitchEventTypes, Pick<TwitchEventSubResponse['data'][0], 'id' | 'status'>>
> = {}
