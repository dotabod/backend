import type { TwitchEventType } from '@dotabod/shared-utils/event-sub'

import type { TwitchEventSubResponse } from './interfaces'

// Get all existing subscriptions by looping through pages
export type EventSubscriptions = Partial<
  Record<TwitchEventType, Pick<TwitchEventSubResponse['data'][0], 'id' | 'status'>>
>

export const eventSubMap = new Map<string, EventSubscriptions>()
