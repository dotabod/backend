import { t } from 'i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import { createPacketStub, flushAsync } from '../../../../__tests__/shared-mocks.ts'
import {
  events,
  gsiHandlers,
  gsiState,
  installGsiMocks,
  makeGsiHandler,
  registerHandler,
  resetGsiState,
} from './gsi-mocks.ts'

// Builds a 17-slot inventory (findItem requires exactly 17) with the given
// names in the first backpack slots.
const inventory = (firstSlots: Record<string, unknown>[]) => {
  const items: Record<string, unknown> = {}
  for (let i = 0; i < 17; i += 1) {
    items[`slot${i}`] = firstSlots[i] ?? { name: 'empty' }
  }
  return items
}

beforeEach(() => {
  resetGsiState()
  gsiHandlers.clear()
  installGsiMocks()
})

describe('player:deaths', () => {
  it('skips when the stream is offline', async () => {
    const handler = makeGsiHandler()
    handler.client.stream_online = false
    registerHandler(handler)
    events.emit('player:deaths', 1, handler.getToken())
    await flushAsync()
    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('skips when there are zero deaths', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    events.emit('player:deaths', 0, handler.getToken())
    await flushAsync()
    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('chats the first-blood-death message when the player died for first blood', async () => {
    const handler = makeGsiHandler()
    Object.assign(handler.client.gsi.map, {
      clock_time: 600,
      dire_score: 1,
      game_time: 600,
      matchid: '7777777777',
      radiant_score: 0,
    })
    handler.client.gsi.player.team_name = 'radiant'
    registerHandler(handler)

    events.emit('player:deaths', 1, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('chatters.firstBloodDeath', { emote: 'PepeLaugh', heroName: 'Lina', lng: 'en' })
    )
  })

  it('chats the passive-death message when a castable lifesaving item was held', async () => {
    const handler = makeGsiHandler()
    Object.assign(handler.client.gsi.map, {
      clock_time: 600,
      dire_score: 3,
      game_time: 600,
      matchid: '7777777777',
      radiant_score: 3,
    })
    handler.client.gsi.items = createPacketStub({
      items: inventory([{ can_cast: true, cooldown: 0, name: 'item_faerie_fire' }]),
    }).items
    registerHandler(handler)

    events.emit('player:deaths', 1, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('chatters.died', {
        emote: 'ICANT',
        heroName: 'Lina',
        itemNames: 'faerie fire',
        lng: 'en',
      })
    )
  })
})
