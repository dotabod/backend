import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { gameEnd } from '../../__tests__/fixtures/gameEnd'
import { events, newData, processChanges } from '../globalEventEmitter'

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
type Call = { args: unknown[] }
const spies = new Map<ListenerName, Call[]>()

// Listeners that existed before installSpies() wiped them. Restored in afterEach.
let savedListeners: Array<[string | symbol, ReturnType<typeof events.rawListeners>]> = []

function installSpies() {
  savedListeners = events.eventNames().map((name) => [name, events.rawListeners(name)])
  events.removeAllListeners()
  spies.clear()
  for (const name of LISTENER_NAMES) {
    const calls: Call[] = []
    spies.set(name, calls)
    events.on(name, (...args: unknown[]) => {
      calls.push({ args })
    })
  }
}

function runPost(body: Record<string, unknown>) {
  const req = { body: { ...body, auth: { token: 'tkn' } } } as never
  const res = { status: () => ({ json: () => undefined }) } as never
  const noop = () => undefined
  processChanges('previously')(req, res, noop)
  processChanges('added')(req, res, noop)
  newData(req, res)
}

function callCount(name: ListenerName): number {
  return spies.get(name)?.length ?? 0
}

function callCountsByName(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [name, calls] of spies) {
    if (calls.length > 0) out[name] = calls.length
  }
  return out
}

beforeEach(() => {
  installSpies()
})

afterEach(() => {
  events.removeAllListeners()
  for (const [name, listeners] of savedListeners) {
    for (const listener of listeners) {
      events.on(name as string, listener as any)
    }
  }
})

describe('recursiveEmit dispatch — scalar leaf cases', () => {
  it('fires hero:alive when previously.hero.alive present and body has the leaf', () => {
    runPost({
      previously: { hero: { alive: true } },
      hero: { alive: false },
    })
    expect(spies.get('hero:alive')).toEqual([{ args: [false, 'tkn'] }])
  })

  it('fires map:game_state and map:win_team in the same POST', () => {
    runPost({
      previously: { map: { game_state: 'X', win_team: 'none' } },
      map: { game_state: 'POST_GAME', win_team: 'radiant' },
    })
    expect(callCount('map:game_state')).toBe(1)
    expect(callCount('map:win_team')).toBe(1)
  })

  it('skips when body has no matching key (guard at recursiveEmit)', () => {
    runPost({
      previously: { hero: { alive: true } },
      hero: { name: 'CM' },
    })
    expect(callCount('hero:alive')).toBe(0)
  })

  it('newdata always fires once per POST', () => {
    runPost({})
    expect(callCount('newdata')).toBe(1)
  })
})

describe('recursiveEmit dispatch — object subtree cases', () => {
  it('does not fire any listener for items:* subtree (no listeners registered there)', () => {
    runPost({
      previously: { items: { slot0: { name: 'foo', purchaser: 1 } } },
      items: { slot0: { name: 'bar', purchaser: 2 } },
    })
    expect(callCountsByName()).toEqual({ newdata: 1 })
  })

  it('does not fire any listener for abilities:* subtree', () => {
    runPost({
      previously: { abilities: { ability0: { name: 'fireball', level: 0 } } },
      abilities: { ability0: { name: 'fireball', level: 1 } },
    })
    expect(callCountsByName()).toEqual({ newdata: 1 })
  })

  it('does not fire any listener for buildings/draft/provider', () => {
    runPost({
      previously: {
        buildings: { radiant: { dota_goodguys_tower1_top: { health: 1600 } } },
        draft: { activeteam: 2 },
        provider: { timestamp: 100 },
      },
      buildings: { radiant: { dota_goodguys_tower1_top: { health: 1500 } } },
      draft: { activeteam: 3 },
      provider: { timestamp: 101 },
    })
    expect(callCountsByName()).toEqual({ newdata: 1 })
  })
})

describe('emitAll edge case — "added shows true at top level"', () => {
  it('fires every listener under hero:* when added.hero === true', () => {
    runPost({
      added: { hero: true },
      hero: { alive: true, name: 'CM', smoked: false },
    })
    expect(spies.get('hero:alive')).toEqual([{ args: [true, 'tkn'] }])
    expect(spies.get('hero:name')).toEqual([{ args: ['CM', 'tkn'] }])
    expect(spies.get('hero:smoked')).toEqual([{ args: [false, 'tkn'] }])
  })

  it('does not fire listenerless leaves under added.hero === true', () => {
    runPost({
      added: { hero: true },
      hero: { alive: true, health: 100, mana: 50 },
    })
    expect(callCount('hero:alive')).toBe(1)
    expect(callCountsByName()).toEqual({ 'hero:alive': 1, newdata: 1 })
  })
})

describe('null/undefined guards in recursiveEmit', () => {
  it('does not fire when body[key] is null', () => {
    runPost({
      previously: { hero: { alive: true } },
      hero: null,
    })
    expect(callCount('hero:alive')).toBe(0)
  })

  it('handles empty previously/added objects', () => {
    runPost({ previously: {}, added: {}, hero: { alive: true } })
    expect(callCountsByName()).toEqual({ newdata: 1 })
  })

  it('handles POST with no previously/added at all', () => {
    runPost({ hero: { alive: true } })
    expect(callCountsByName()).toEqual({ newdata: 1 })
  })
})

describe('gameEnd fixture replay — regression baseline', () => {
  it('produces stable per-listener call counts across the full 12-step game-end flow', () => {
    const steps = gameEnd({
      win_team: 'radiant',
      matchId: 'mt',
      steam32: '1',
      steam64: '2',
      token: 'tkn',
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
        "player:kill_streak": 1,
      }
    `)
  })
})

describe('non-mutation: dispatch middleware leaves req.body intact', () => {
  it('preserves every "dead" subtree (items/abilities/buildings/draft/provider) byte-for-byte', () => {
    const body = {
      previously: {
        items: { slot0: { name: 'tango', cooldown: 0 } },
        abilities: { ability0: { level: 0, cooldown: 0 } },
        buildings: { radiant: { dota_goodguys_tower1_top: { health: 1600 } } },
        draft: { activeteam: 2, pick0_id: 0 },
        provider: { timestamp: 100 },
      },
      items: { slot0: { name: 'magic_wand', cooldown: 0 } },
      abilities: { ability0: { level: 1, cooldown: 5 } },
      buildings: { radiant: { dota_goodguys_tower1_top: { health: 1500 } } },
      draft: { activeteam: 3, pick0_id: 1 },
      provider: { timestamp: 101 },
    }
    const snapshot = structuredClone(body)
    runPost(body)
    expect(body).toEqual(snapshot)
  })

  it('preserves "live" subtrees (hero/map/player/event) byte-for-byte', () => {
    const body = {
      previously: {
        hero: { alive: true, health: 1500 },
        map: { game_state: 'X', clock_time: 100, game_time: 105 },
        player: { kills: 0, gold: 600, deaths: 0 },
      },
      hero: { alive: false, health: 0, id: 74, name: 'CM' },
      map: { game_state: 'Y', clock_time: 105, game_time: 110, win_team: 'radiant' },
      player: { kills: 1, gold: 700, deaths: 0, kill_streak: 1, kill_list: { v_0: 1 } },
    }
    const snapshot = structuredClone(body)
    runPost(body)
    expect(body).toEqual(snapshot)
  })
})

describe('downstream read path: client.gsi.* stays accessible (mirrors actual readers)', () => {
  // validateToken (runs before our middleware) sets client.gsi = req.body.
  // We simulate that here, then verify the field paths that real handlers read
  // are still reachable after processChanges/newData run.
  it('items.teleport0.purchaser (newdata.ts:684 — hero slot detection)', () => {
    const body = {
      items: { teleport0: { name: 'tp_scroll', cooldown: 0, purchaser: 3 } },
      hero: { id: 74 },
    }
    const client = { gsi: body as any }
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
    const client = { gsi: body as any }
    runPost(body)
    expect(client.gsi?.items?.team2?.player0?.slot0?.name).toBe('tango')
  })

  it('abilities.ability0 (newdata.ts:620)', () => {
    const body = {
      abilities: { ability0: { name: 'invoker_quas', level: 1, cooldown: 0 } },
    }
    const client = { gsi: body as any }
    runPost(body)
    expect(client.gsi?.abilities?.ability0?.level).toBe(1)
  })

  it('map.matchid (Draft Clip path, map.game_state.ts:57)', () => {
    const body = {
      previously: { map: { game_state: 'INIT' } },
      map: { matchid: '8817000000', game_state: 'DOTA_GAMERULES_STATE_PLAYER_DRAFT' },
    }
    const client = { gsi: body as any }
    runPost(body)
    expect(client.gsi?.map?.matchid).toBe('8817000000')
    // also verify the listener that drives this feature still fires
    expect(callCount('map:game_state')).toBe(1)
  })

  it('map.game_time / clock_time (NeutralItemTimer.ts:42-45)', () => {
    const body = {
      previously: { map: { game_time: 100 } },
      map: { game_time: 1200, clock_time: 1180 },
    }
    const client = { gsi: body as any }
    runPost(body)
    expect(client.gsi?.map?.game_time).toBe(1200)
    expect(client.gsi?.map?.clock_time).toBe(1180)
  })

  it('hero fields used by midas/treads checks (checkMidas reads client.gsi)', () => {
    const body = {
      hero: { id: 74, alive: true, health: 1500, max_health: 1500, mana: 200 },
      items: { slot0: { name: 'item_hand_of_midas', cooldown: 0 } },
    }
    const client = { gsi: body as any }
    runPost(body)
    expect(client.gsi?.hero?.alive).toBe(true)
    expect(client.gsi?.items?.slot0?.name).toBe('item_hand_of_midas')
  })

  it('full Packet shape with every "dead" subtree present is still queryable end-to-end', () => {
    const body = {
      provider: { name: 'Dota 2', appid: 570, version: 47, timestamp: 1700000000 },
      hero: { id: 74, alive: true },
      map: { game_state: 'X', matchid: 'm1' },
      player: { gold: 600 },
      items: { slot0: { name: 'a' }, neutral0: { name: 'n' } },
      abilities: { ability0: { level: 1 } },
      buildings: { radiant: { fort: { health: 4250 } } },
      draft: { activeteam: 2 },
      events: [],
      wearables: { wearable0: 1234 },
    }
    const client = { gsi: body as any }
    runPost(body)
    expect(client.gsi?.provider?.appid).toBe(570)
    expect(client.gsi?.items?.neutral0?.name).toBe('n')
    expect(client.gsi?.abilities?.ability0?.level).toBe(1)
    expect(client.gsi?.buildings?.radiant?.fort?.health).toBe(4250)
    expect(client.gsi?.draft?.activeteam).toBe(2)
    expect(client.gsi?.wearables?.wearable0).toBe(1234)
  })
})

describe('audit guards (lock in invariants the refactor relies on)', () => {
  const dotaSrc = path.resolve(__dirname, '..', '..')

  function walkTs(root: string): string[] {
    const out: string[] = []
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      if (entry.name === '__tests__') continue
      const full = path.join(root, entry.name)
      if (entry.isDirectory()) out.push(...walkTs(full))
      else if (entry.name.endsWith('.ts')) out.push(full)
    }
    return out
  }

  const allSources = walkTs(dotaSrc)

  it('no listener name in source contains wildcard characters', () => {
    const offenders: string[] = []
    const re = /events\.(on|once|addListener|prependListener)\s*\(\s*[`'"]([^`'"]+)[`'"]/g
    const regRe = /registerEvent\s*\(\s*[`'"]([^`'"]+)[`'"]/g
    for (const f of allSources) {
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(re)) {
        if (m[2].includes('*') || m[2].includes('?')) offenders.push(`${f}: ${m[2]}`)
      }
      for (const m of src.matchAll(regRe)) {
        if (m[1].includes('*') || m[1].includes('?')) offenders.push(`${f}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no calls to events.removeListener / events.off / events.removeAllListeners in source', () => {
    const offenders: string[] = []
    const re = /\bevents\.(off|removeListener|removeAllListeners)\s*\(/g
    for (const f of allSources) {
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(re)) {
        offenders.push(`${f}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no calls to events.once or events.prependListener in source', () => {
    const offenders: string[] = []
    const re = /\bevents\.(once|prependListener|prependOnceListener)\s*\(/g
    for (const f of allSources) {
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(re)) {
        offenders.push(`${f}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the only raw events.on call lives in EventHandler.ts (the wrapper)', () => {
    const callers: string[] = []
    const re = /\bevents\.on\s*\(/g
    for (const f of allSources) {
      const src = fs.readFileSync(f, 'utf8')
      if (src.match(re)) callers.push(path.relative(dotaSrc, f))
    }
    expect(callers).toEqual(['dota/events/EventHandler.ts'])
  })

  it('registered listener names in source match LISTENER_NAMES exactly', () => {
    const found = new Set<string>()
    const re = /registerEvent\s*\(\s*[`'"]([^`'"]+)[`'"]/g
    const templateRe = /registerEvent\s*\(\s*`event:\$\{DotaEventTypes\.(\w+)\}`/g
    const enumMap: Record<string, string> = {
      RoshanKilled: 'roshan_killed',
      AegisPickedUp: 'aegis_picked_up',
      AegisDenied: 'aegis_denied',
      Tip: 'tip',
      BountyPickup: 'bounty_rune_pickup',
      CourierKilled: 'courier_killed',
      ChatMessage: 'chat_message',
      GenericEvent: 'generic_event',
    }
    for (const f of allSources) {
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(re)) {
        if (!m[1].includes('${')) found.add(m[1])
      }
      for (const m of src.matchAll(templateRe)) {
        const enumKey = m[1]
        if (enumMap[enumKey]) found.add(`event:${enumMap[enumKey]}`)
      }
    }
    expect([...found].sort()).toEqual([...LISTENER_NAMES].sort())
  })
})
