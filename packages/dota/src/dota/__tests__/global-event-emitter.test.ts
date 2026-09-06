import * as fs from 'node:fs'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { gameEnd } from '../../__tests__/fixtures/game-end'
import {
  events,
  newData,
  processChanges,
  processUnmarkedKillListChanges,
} from '../global-event-emitter'
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
  args: unknown[]
}
const spies = new Map<ListenerName, Call[]>()

// Listeners that existed before installSpies() wiped them. Restored in afterEach.
let savedListeners: [string | symbol, ReturnType<typeof events.rawListeners>][] = []

const installSpies = function installSpies() {
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

const runPost = function runPost(body: Record<string, unknown>) {
  const req = { body: { ...body, auth: { token: 'tkn' } } } as never
  const res = { status: () => ({ json: () => {} }) } as never
  const noop = () => {}
  processChanges('previously')(req, res, noop)
  processChanges('added')(req, res, noop)
  processUnmarkedKillListChanges(req, res, noop)
  newData(req, res)
}

const callCount = function callCount(name: ListenerName): number {
  return spies.get(name)?.length ?? 0
}

const callCountsByName = function callCountsByName(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [name, calls] of spies) {
    if (calls.length > 0) {
      out[name] = calls.length
    }
  }
  return out
}

beforeEach(() => {
  installSpies()
})

afterEach(() => {
  gsiHandlers.delete('tkn')
  events.removeAllListeners()
  for (const [name, listeners] of savedListeners) {
    for (const listener of listeners) {
      events.on(name, listener as any)
    }
  }
})

describe('unmarked kill-list fallback', () => {
  const installHandlerSnapshot = function installHandlerSnapshot() {
    const handler = {
      client: { stream_online: true },
      disabled: false,
      getToken: () => 'tkn',
    } as never
    gsiHandlers.set('tkn', handler)
  }

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
      hero: { alive: true, name: 'CM', smoked: false },
    })
    expect(spies.get('hero:alive')).toStrictEqual([{ args: [true, 'tkn'] }])
    expect(spies.get('hero:name')).toStrictEqual([{ args: ['CM', 'tkn'] }])
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
      buildings: { radiant: { dota_goodguys_tower1_top: { health: 1500 } } },
      draft: { activeteam: 3, pick0_id: 1 },
      items: { slot0: { cooldown: 0, name: 'magic_wand' } },
      previously: {
        abilities: { ability0: { cooldown: 0, level: 0 } },
        buildings: { radiant: { dota_goodguys_tower1_top: { health: 1600 } } },
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
      abilities: { ability0: { cooldown: 0, level: 1, name: 'invoker_quas' } },
    }
    const client = { gsi: body as any }
    runPost(body)
    expect(client.gsi?.abilities?.ability0?.level).toBe(1)
  })

  it('map.matchid (Draft Clip path, map.game_state.ts:57)', () => {
    const body = {
      map: { game_state: 'DOTA_GAMERULES_STATE_PLAYER_DRAFT', matchid: '8817000000' },
      previously: { map: { game_state: 'INIT' } },
    }
    const client = { gsi: body as any }
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
    const client = { gsi: body as any }
    runPost(body)
    expect(client.gsi?.map?.game_time).toBe(1200)
    expect(client.gsi?.map?.clock_time).toBe(1180)
  })

  it('hero fields used by midas/treads checks (checkMidas reads client.gsi)', () => {
    const body = {
      hero: { alive: true, health: 1500, id: 74, mana: 200, max_health: 1500 },
      items: { slot0: { cooldown: 0, name: 'item_hand_of_midas' } },
    }
    const client = { gsi: body as any }
    runPost(body)
    expect(client.gsi?.hero?.alive).toBeTruthy()
    expect(client.gsi?.items?.slot0?.name).toBe('item_hand_of_midas')
  })

  it('full Packet shape with every "dead" subtree present is still queryable end-to-end', () => {
    const body = {
      abilities: { ability0: { level: 1 } },
      buildings: { radiant: { fort: { health: 4250 } } },
      draft: { activeteam: 2 },
      events: [],
      hero: { alive: true, id: 74 },
      items: { neutral0: { name: 'n' }, slot0: { name: 'a' } },
      map: { game_state: 'X', matchid: 'm1' },
      player: { gold: 600 },
      provider: { appid: 570, name: 'Dota 2', timestamp: 1_700_000_000, version: 47 },
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

  const walkTs = function walkTs(root: string): string[] {
    const out: string[] = []
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue
      }
      if (entry.name === '__tests__') {
        continue
      }
      const full = path.join(root, entry.name)
      if (entry.isDirectory()) {
        out.push(...walkTs(full))
      } else if (entry.name.endsWith('.ts')) {
        out.push(full)
      }
    }
    return out
  }

  const allSources = walkTs(dotaSrc)

  it('no listener name in source contains wildcard characters', () => {
    const offenders: string[] = []
    const re = /events\.(on|once|addListener|prependListener)\s*\(\s*[`'"]([^`'"]+)[`'"]/gu
    const regRe = /registerEvent\s*\(\s*[`'"]([^`'"]+)[`'"]/gu
    for (const f of allSources) {
      const src = fs.readFileSync(f, 'utf-8')
      for (const m of src.matchAll(re)) {
        if (m[2].includes('*') || m[2].includes('?')) {
          offenders.push(`${f}: ${m[2]}`)
        }
      }
      for (const m of src.matchAll(regRe)) {
        if (m[1].includes('*') || m[1].includes('?')) {
          offenders.push(`${f}: ${m[1]}`)
        }
      }
    }
    expect(offenders).toStrictEqual([])
  })

  it('no calls to events.removeListener / events.off / events.removeAllListeners in source', () => {
    const offenders: string[] = []
    const re = /\bevents\.(off|removeListener|removeAllListeners)\s*\(/gu
    for (const f of allSources) {
      const src = fs.readFileSync(f, 'utf-8')
      for (const m of src.matchAll(re)) {
        offenders.push(`${f}: ${m[0]}`)
      }
    }
    expect(offenders).toStrictEqual([])
  })

  it('no calls to events.once or events.prependListener in source', () => {
    const offenders: string[] = []
    const re = /\bevents\.(once|prependListener|prependOnceListener)\s*\(/gu
    for (const f of allSources) {
      const src = fs.readFileSync(f, 'utf-8')
      for (const m of src.matchAll(re)) {
        offenders.push(`${f}: ${m[0]}`)
      }
    }
    expect(offenders).toStrictEqual([])
  })

  it('the only raw events.on call lives in event-handler.ts (the wrapper)', () => {
    const callers: string[] = []
    const re = /\bevents\.on\s*\(/gu
    for (const f of allSources) {
      const src = fs.readFileSync(f, 'utf-8')
      if (re.test(src)) {
        callers.push(path.relative(dotaSrc, f))
      }
    }
    expect(callers).toStrictEqual(['dota/events/event-handler.ts'])
  })

  it('registered listener names in source match LISTENER_NAMES exactly', () => {
    const found = new Set<string>()
    const re = /registerEvent\s*\(\s*[`'"]([^`'"]+)[`'"]/gu
    const templateRe = /registerEvent\s*\(\s*`event:\$\{DotaEventTypes\.(\w+)\}`/gu
    const enumMap: Record<string, string> = {
      AegisDenied: 'aegis_denied',
      AegisPickedUp: 'aegis_picked_up',
      BountyPickup: 'bounty_rune_pickup',
      ChatMessage: 'chat_message',
      CourierKilled: 'courier_killed',
      GenericEvent: 'generic_event',
      RoshanKilled: 'roshan_killed',
      Tip: 'tip',
    }
    for (const f of allSources) {
      const src = fs.readFileSync(f, 'utf-8')
      for (const m of src.matchAll(re)) {
        if (!m[1].includes('${')) {
          found.add(m[1])
        }
      }
      for (const m of src.matchAll(templateRe)) {
        const enumKey = m[1]
        if (enumMap[enumKey]) {
          found.add(`event:${enumMap[enumKey]}`)
        }
      }
    }
    expect([...found].sort()).toStrictEqual([...LISTENER_NAMES].sort())
  })
})
