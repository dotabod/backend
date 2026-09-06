import type { Json } from '@dotabod/shared-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { gameEnd } from '../../__tests__/fixtures/game-end'
import {
  createGsiHandlerStub,
  createPacketStub,
  createSocketClientStub,
} from '../../__tests__/shared-mocks'
import {
  events,
  newData,
  processChanges,
  processUnmarkedKillListChanges,
} from '../global-event-emitter'
import type { GsiEventData, GsiEventRequest, GsiEventResponse } from '../global-event-emitter'
import { gsiHandlers } from '../lib/consts'

// The 19 listener names registered by dota/events/gsiEventLoader.ts in
// production. Hardcoded so the test file is self-contained and doesn't
// trigger handler imports (which need redis/supabase/twitch).
const LISTENER_NAMES = [
  'hero:alive',
  'hero:id',
  'hero:name',
  'hero:smoked',
  'map:game_state',
  'map:paused',
  'map:win_team',
  'player:deaths',
  'player:kill_list',
  'player:kill_streak',
  'newdata',
  'saveHeroesForMatchId',
  'event:roshan_killed',
  'event:aegis_picked_up',
  'event:aegis_denied',
  'event:tip',
  'event:bounty_rune_pickup',
  'event:chat_message',
  'event:generic_event',
] as const

type ListenerName = (typeof LISTENER_NAMES)[number]
interface Call {
  args: [GsiEventData, string]
}
const spies = new Map<ListenerName, Call[]>()

// Listeners that existed before installSpies() wiped them. Restored in afterEach.
type SavedListener = Parameters<typeof events.on>[1]
let savedListeners: [string, SavedListener[]][] = []
type JsonObject = Extract<Json, Record<string, Json | undefined>>
type TestPacketInput = JsonObject | Parameters<typeof createPacketStub>[0]

const next = function next(): void {}

const response: GsiEventResponse = {
  json: () => response,
  status: () => response,
}

const installHandlerSnapshot = function installHandlerSnapshot() {
  const client = createSocketClientStub({ stream_online: true, token: 'tkn' })
  gsiHandlers.set('tkn', createGsiHandlerStub(client))
}

const installSpies = function installSpies() {
  savedListeners = events.eventNames().map((name) => [name, events.rawListeners(name)])
  events.removeAllListeners()
  spies.clear()
  for (const name of LISTENER_NAMES) {
    const calls: Call[] = []
    spies.set(name, calls)
    events.on(name, (data, token) => {
      calls.push({ args: [data, token] })
    })
  }
}

const runPost = function runPost(body: TestPacketInput) {
  const packet = Object.assign(createPacketStub(), body)
  const req: GsiEventRequest = {
    body: Object.assign(packet, { auth: { token: 'tkn' } }),
  }
  processChanges('previously')(req, response, next)
  processChanges('added')(req, response, next)
  processUnmarkedKillListChanges(req, response, next)
  newData(req, response)
}

const callCount = function callCount(name: ListenerName): number {
  return spies.get(name)?.length ?? 0
}

const callCountsByName = function callCountsByName() {
  return Object.fromEntries(
    [...spies].filter(([, calls]) => calls.length > 0).map(([name, calls]) => [name, calls.length])
  )
}

describe('global event emitter', () => {
  beforeEach(() => {
    installSpies()
  })

  afterEach(() => {
    gsiHandlers.delete('tkn')
    events.removeAllListeners()
    for (const [name, listeners] of savedListeners) {
      for (const listener of listeners) {
        events.on(name, listener)
      }
    }
  })

  describe('unmarked kill-list fallback', () => {
    it('emits a positive increase when the one-shot kill-list marker packet was skipped', () => {
      installHandlerSnapshot()
      runPost({
        map: { customgamename: '', matchid: 'match-1' },
        player: {
          activity: 'playing',
          kill_list: { victimid_2: 1, victimid_7: 1 },
          team_name: 'radiant',
        },
      })

      runPost({
        map: { customgamename: '', matchid: 'match-1' },
        player: {
          activity: 'playing',
          kill_list: { victimid_2: 2, victimid_7: 1 },
          team_name: 'radiant',
        },
        previously: { player: { gold: 100 } },
      })

      expect(spies.get('player:kill_list')).toStrictEqual([{ args: [{ victimid_2: 2 }, 'tkn'] }])
    })

    it('does not duplicate a normally marked kill-list dispatch', () => {
      installHandlerSnapshot()
      runPost({
        map: { customgamename: '', matchid: 'match-1' },
        player: { activity: 'playing', kill_list: {}, team_name: 'radiant' },
      })

      runPost({
        added: { player: { kill_list: { victimid_8: true } } },
        map: { customgamename: '', matchid: 'match-1' },
        player: {
          activity: 'playing',
          kill_list: { victimid_8: 1 },
          team_name: 'radiant',
        },
      })

      expect(spies.get('player:kill_list')).toStrictEqual([{ args: [{ victimid_8: 1 }, 'tkn'] }])
    })

    it('seeds a reconnect snapshot without treating its cumulative counts as new kills', () => {
      installHandlerSnapshot()
      runPost({
        added: { player: { kill_list: true } },
        map: { customgamename: '', matchid: 'match-1' },
        player: {
          activity: 'playing',
          kill_list: { victimid_8: 3 },
          team_name: 'radiant',
        },
      })

      expect(spies.get('player:kill_list')).toStrictEqual([{ args: [{ victimid_8: 3 }, 'tkn'] }])
    })

    it('does not carry a previous match snapshot into a new match', () => {
      installHandlerSnapshot()
      runPost({
        map: { customgamename: '', matchid: 'match-1' },
        player: {
          activity: 'playing',
          kill_list: { victimid_8: 1 },
          team_name: 'radiant',
        },
      })

      runPost({
        map: { customgamename: '', matchid: 'match-2' },
        player: {
          activity: 'playing',
          kill_list: { victimid_8: 2 },
          team_name: 'radiant',
        },
      })

      expect(spies.get('player:kill_list')).toStrictEqual([])
    })
  })

  describe('recursiveEmit dispatch — scalar leaf cases', () => {
    it('fires hero:alive when previously.hero.alive present and body has the leaf', () => {
      runPost({
        hero: { alive: false },
        previously: { hero: { alive: true } },
      })
      expect(spies.get('hero:alive')).toStrictEqual([{ args: [false, 'tkn'] }])
    })

    it('fires map:game_state and map:win_team in the same POST', () => {
      runPost({
        map: { game_state: 'POST_GAME', win_team: 'radiant' },
        previously: { map: { game_state: 'X', win_team: 'none' } },
      })
      expect(callCount('map:game_state')).toBe(1)
      expect(callCount('map:win_team')).toBe(1)
    })

    it('skips when body has no matching key (guard at recursiveEmit)', () => {
      runPost({
        hero: { name: 'CM' },
        previously: { hero: { alive: true } },
      })
      expect(callCount('hero:alive')).toBe(0)
    })

    it('newdata always fires once per POST', () => {
      runPost({})
      expect(callCount('newdata')).toBe(1)
    })
  })

  describe('recursiveEmit dispatch — object subtree cases', () => {
    it('projects an exact object listener payload to only changed keys', () => {
      runPost({
        player: { kill_list: { victimid_2: 1, victimid_7: 4 } },
        previously: { player: { kill_list: { victimid_2: 0 } } },
      })
      expect(spies.get('player:kill_list')).toStrictEqual([{ args: [{ victimid_2: 1 }, 'tkn'] }])
    })

    it('projects newly added object fields to the exact object listener', () => {
      runPost({
        added: { player: { kill_list: { victimid_8: true } } },
        player: { kill_list: { victimid_3: 2, victimid_8: 1 } },
      })
      expect(spies.get('player:kill_list')).toStrictEqual([{ args: [{ victimid_8: 1 }, 'tkn'] }])
    })

    it('treats added object === true as the complete new object delta', () => {
      runPost({
        added: { player: { kill_list: true } },
        player: { kill_list: { victimid_3: 2, victimid_8: 1 } },
      })
      expect(spies.get('player:kill_list')).toStrictEqual([
        { args: [{ victimid_3: 2, victimid_8: 1 }, 'tkn'] },
      ])
    })

    it('continues dispatching unchanged scalar listener payloads', () => {
      runPost({
        player: { deaths: 3 },
        previously: { player: { deaths: 2 } },
      })
      expect(spies.get('player:deaths')).toStrictEqual([{ args: [3, 'tkn'] }])
    })

    it('does not fire any listener for items:* subtree (no listeners registered there)', () => {
      runPost({
        items: { slot0: { name: 'bar', purchaser: 2 } },
        previously: { items: { slot0: { name: 'foo', purchaser: 1 } } },
      })
      expect(callCountsByName()).toStrictEqual({ newdata: 1 })
    })

    it('does not fire any listener for abilities:* subtree', () => {
      runPost({
        abilities: { ability0: { level: 1, name: 'fireball' } },
        previously: { abilities: { ability0: { level: 0, name: 'fireball' } } },
      })
      expect(callCountsByName()).toStrictEqual({ newdata: 1 })
    })

    it('does not fire any listener for buildings/draft/provider', () => {
      runPost({
        buildings: { radiant: { dota_goodguys_tower1_top: { health: 1500 } } },
        draft: { activeteam: 3 },
        previously: {
          buildings: { radiant: { dota_goodguys_tower1_top: { health: 1600 } } },
          draft: { activeteam: 2 },
          provider: { timestamp: 100 },
        },
        provider: { timestamp: 101 },
      })
      expect(callCountsByName()).toStrictEqual({ newdata: 1 })
    })
  })

  describe('emitAll edge case — "added shows true at top level"', () => {
    it('fires every listener under hero:* when added.hero === true', () => {
      runPost({
        added: { hero: true },
        hero: { alive: true, name: 'npc_dota_hero_crystal_maiden', smoked: false },
      })
      expect(spies.get('hero:alive')).toStrictEqual([{ args: [true, 'tkn'] }])
      expect(spies.get('hero:name')).toStrictEqual([
        { args: ['npc_dota_hero_crystal_maiden', 'tkn'] },
      ])
      expect(spies.get('hero:smoked')).toStrictEqual([{ args: [false, 'tkn'] }])
    })

    it('does not fire listenerless leaves under added.hero === true', () => {
      runPost({
        added: { hero: true },
        hero: { alive: true, health: 100, mana: 50 },
      })
      expect(callCount('hero:alive')).toBe(1)
      expect(callCountsByName()).toStrictEqual({ 'hero:alive': 1, newdata: 1 })
    })
  })

  describe('null/undefined guards in recursiveEmit', () => {
    it('does not fire when body[key] is null', () => {
      runPost({
        hero: null,
        previously: { hero: { alive: true } },
      })
      expect(callCount('hero:alive')).toBe(0)
    })

    it('handles empty previously/added objects', () => {
      runPost({ added: {}, hero: { alive: true }, previously: {} })
      expect(callCountsByName()).toStrictEqual({ newdata: 1 })
    })

    it('handles POST with no previously/added at all', () => {
      runPost({ hero: { alive: true } })
      expect(callCountsByName()).toStrictEqual({ newdata: 1 })
    })
  })

  describe('gameEnd fixture replay — regression baseline', () => {
    it('produces stable per-listener call counts across the full 12-step game-end flow', () => {
      const steps = gameEnd({
        matchId: 'mt',
        steam32: '1',
        steam64: '2',
        token: 'tkn',
        win_team: 'radiant',
      })

      for (const step of steps) {
        runPost(step)
      }

      // Snapshot: this is the contract. The recursiveEmit optimization must
      // preserve every one of these counts. If a count changes, the refactor
      // dropped or duplicated a real dispatch and we have a regression.
      expect(callCountsByName()).toMatchInlineSnapshot(`
      {
        "hero:alive": 1,
        "hero:id": 1,
        "hero:name": 1,
        "hero:smoked": 1,
        "map:game_state": 6,
        "map:win_team": 1,
        "newdata": 12,
        "player:deaths": 1,
        "player:kill_list": 1,
        "player:kill_streak": 1,
      }
    `)
    })
  })

  describe('non-mutation: dispatch middleware leaves req.body intact', () => {
    it('preserves every "dead" subtree (items/abilities/buildings/draft/provider) byte-for-byte', () => {
      const body = {
        abilities: { ability0: { cooldown: 5, level: 1 } },
        buildings: { radiant: { dota_badguys_tower1_top: { health: 1500 } } },
        draft: { activeteam: 3, pick0_id: 1 },
        items: { slot0: { cooldown: 0, name: 'magic_wand' } },
        previously: {
          abilities: { ability0: { cooldown: 0, level: 0 } },
          buildings: { radiant: { dota_badguys_tower1_top: { health: 1600 } } },
          draft: { activeteam: 2, pick0_id: 0 },
          items: { slot0: { cooldown: 0, name: 'tango' } },
          provider: { timestamp: 100 },
        },
        provider: { timestamp: 101 },
      }
      const snapshot = structuredClone(body)
      runPost(body)
      expect(body).toStrictEqual(snapshot)
    })

    it('preserves "live" subtrees (hero/map/player/event) byte-for-byte', () => {
      const body = {
        hero: { alive: false, health: 0, id: 74, name: 'CM' },
        map: { clock_time: 105, game_state: 'Y', game_time: 110, win_team: 'radiant' },
        player: { deaths: 0, gold: 700, kill_list: { v_0: 1 }, kill_streak: 1, kills: 1 },
        previously: {
          hero: { alive: true, health: 1500 },
          map: { clock_time: 100, game_state: 'X', game_time: 105 },
          player: { deaths: 0, gold: 600, kills: 0 },
        },
      }
      const snapshot = structuredClone(body)
      runPost(body)
      expect(body).toStrictEqual(snapshot)
    })
  })

  describe('downstream read path: client.gsi.* stays accessible (mirrors actual readers)', () => {
    // validateToken (runs before our middleware) sets client.gsi = req.body.
    // We simulate that here, then verify the field paths that real handlers read
    // are still reachable after processChanges/newData run.
    it('items.teleport0.purchaser (newdata.ts:684 — hero slot detection)', () => {
      const body = {
        hero: { id: 74 },
        items: { teleport0: { cooldown: 0, name: 'tp_scroll', purchaser: 3 } },
      }
      const client = { gsi: createPacketStub(body) }
      runPost(body)
      expect(client.gsi?.items?.teleport0?.purchaser).toBe(3)
    })

    it('items[team][player].slot0 spectator-mode path (newdata.ts:614)', () => {
      const body = {
        items: {
          team2: {
            player0: {
              slot0: { name: 'tango' },
              slot1: { name: 'magic_wand' },
            },
          },
        },
      }
      const client = { gsi: createPacketStub(body) }
      runPost(body)
      expect(client.gsi?.items?.team2?.player0?.slot0?.name).toBe('tango')
    })

    it('abilities.ability0 (newdata.ts:620)', () => {
      const body = {
        abilities: { ability0: { cooldown: 0, level: 1, name: 'invoker_quas' } },
      }
      const client = { gsi: createPacketStub(body) }
      runPost(body)
      expect(client.gsi?.abilities?.ability0?.level).toBe(1)
    })

    it('map.matchid (Draft Clip path, map.game_state.ts:57)', () => {
      const body = {
        map: { game_state: 'DOTA_GAMERULES_STATE_PLAYER_DRAFT', matchid: '8817000000' },
        previously: { map: { game_state: 'INIT' } },
      }
      const client = { gsi: createPacketStub(body) }
      runPost(body)
      expect(client.gsi?.map?.matchid).toBe('8817000000')
      // also verify the listener that drives this feature still fires
      expect(callCount('map:game_state')).toBe(1)
    })

    it('map.game_time / clock_time (NeutralItemTimer.ts:42-45)', () => {
      const body = {
        map: { clock_time: 1180, game_time: 1200 },
        previously: { map: { game_time: 100 } },
      }
      const client = { gsi: createPacketStub(body) }
      runPost(body)
      expect(client.gsi?.map?.game_time).toBe(1200)
      expect(client.gsi?.map?.clock_time).toBe(1180)
    })

    it('hero fields used by midas/treads checks (checkMidas reads client.gsi)', () => {
      const body = {
        hero: { alive: true, health: 1500, id: 74, mana: 200, max_health: 1500 },
        items: { slot0: { cooldown: 0, name: 'item_hand_of_midas' } },
      }
      const client = { gsi: createPacketStub(body) }
      runPost(body)
      expect(client.gsi?.hero?.alive).toBeTruthy()
      expect(client.gsi?.items?.slot0?.name).toBe('item_hand_of_midas')
    })

    it('full Packet shape with every "dead" subtree present is still queryable end-to-end', () => {
      const body = {
        abilities: { ability0: { level: 1 } },
        buildings: { radiant: { dota_badguys_fort: { health: 4250 } } },
        draft: { activeteam: 2 },
        events: [],
        hero: { alive: true, id: 74 },
        items: { neutral0: { name: 'n' }, slot0: { name: 'a' } },
        map: { game_state: 'X', matchid: 'm1' },
        player: { gold: 600 },
        provider: { appid: 570, name: 'Dota 2', timestamp: 1_700_000_000, version: 47 },
        wearables: { wearable0: 1234 },
      }
      const client = { gsi: createPacketStub(body) }
      runPost(body)
      expect({
        abilityLevel: client.gsi?.abilities?.ability0?.level,
        appId: client.gsi.provider.appid,
        draftTeam: client.gsi?.draft?.activeteam,
        fortHealth: client.gsi?.buildings?.radiant?.dota_badguys_fort?.health,
        neutralName: client.gsi?.items?.neutral0?.name,
        wearable: client.gsi?.wearables?.wearable0,
      }).toStrictEqual({
        abilityLevel: 1,
        appId: 570,
        draftTeam: 2,
        fortHealth: 4250,
        neutralName: 'n',
        wearable: 1234,
      })
    })
  })
})
