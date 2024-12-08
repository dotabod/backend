import type { TwitchEventSubResponse } from './interfaces'
import type { TwitchEventTypes } from './subscribeChatMessagesForUser'

// Get all existing subscriptions by looping through pages
export const eventSubMap: Record<
  string,
  Record<keyof TwitchEventTypes, Pick<TwitchEventSubResponse['data'][0], 'id' | 'status'>>
> = {}
