import { beforeEach, describe, expect, it } from 'bun:test'
import { t } from 'i18next'
import { flushAsync } from '../../../../__tests__/sharedMocks.ts'
import {
  events,
  gsiHandlers,
  gsiState,
  installGsiMocks,
  makeGsiHandler,
  registerHandler,
  resetGsiState,
} from './gsiMocks.ts'

// Builds a 17-slot inventory (findItem requires exactly 17) with the given
// names in the first backpack slots.
const inventory = (firstSlots: Array<Record<string, unknown>>) => {
  const items: Record<string, unknown> = {}
  for (let i = 0; i < 17; i++) {
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
    handler.client.gsi.map = {
      matchid: '7777777777',
      clock_time: 600,
      game_time: 600,
      radiant_score: 0,
      dire_score: 1,
    } as any
    handler.client.gsi.player.team_name = 'radiant'
    registerHandler(handler)

    events.emit('player:deaths', 1, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('chatters.firstBloodDeath', { emote: 'PepeLaugh', heroName: 'Lina', lng: 'en' }),
    )
  })

  it('chats the passive-death message when a castable lifesaving item was held', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.map = {
      matchid: '7777777777',
      clock_time: 600,
      game_time: 600,
      radiant_score: 3,
      dire_score: 3,
    } as any
    handler.client.gsi.items = inventory([
      { name: 'item_faerie_fire', can_cast: true, cooldown: 0 },
    ]) as any
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
      }),
    )
  })
})
