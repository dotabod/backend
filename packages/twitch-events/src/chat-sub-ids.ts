import type { TwitchEventType } from '@dotabod/shared-utils/event-sub'

import type { TwitchEventSubResponse } from './interfaces'

type SubscriptionEntry = Pick<TwitchEventSubResponse['data'][0], 'id' | 'status'> & {
  conduitId: string
}

export type EventSubscriptions = Partial<Record<TwitchEventType, SubscriptionEntry>>

export const eventSubMap = new Map<string, EventSubscriptions>()

const inventoryChanges = new Set<Set<string>>()

const noteChange = function noteChange(broadcasterId: string): void {
  for (const refresh of inventoryChanges) {
    refresh.add(broadcasterId)
  }
}

export const storeBroadcasterSubscription = function storeBroadcasterSubscription(
  broadcasterId: string,
  topic: TwitchEventType,
  subscription: SubscriptionEntry
): void {
  noteChange(broadcasterId)
  eventSubMap.set(broadcasterId, { ...eventSubMap.get(broadcasterId), [topic]: subscription })
}

export const takeBroadcasterSubscriptions = function takeBroadcasterSubscriptions(
  broadcasterId: string
): EventSubscriptions | undefined {
  noteChange(broadcasterId)
  const subscriptions = eventSubMap.get(broadcasterId)
  eventSubMap.delete(broadcasterId)
  return subscriptions
}

export const beginSubscriptionRefresh = function beginSubscriptionRefresh(): (
  inventory?: ReadonlyMap<string, EventSubscriptions>
) => void {
  const changed = new Set<string>()
  inventoryChanges.add(changed)
  return (inventory) => {
    inventoryChanges.delete(changed)
    if (inventory === undefined) {
      return
    }
    for (const id of eventSubMap.keys()) {
      if (!changed.has(id) && !inventory.has(id)) {
        eventSubMap.delete(id)
      }
    }
    for (const [id, subscriptions] of inventory) {
      if (!changed.has(id)) {
        eventSubMap.set(id, subscriptions)
      }
    }
  }
}
