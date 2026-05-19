import { beforeEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { gameEnd } from '../../__tests__/fixtures/gameEnd.js'
import { events, newData, processChanges } from '../globalEventEmitter.js'

// The 18 listener names registered by dota/events/gsiEventLoader.ts in
// production. Hardcoded so the test file is self-contained and doesn't
// trigger handler imports (which need redis/supabase/twitch).
const LISTENER_NAMES = [
  'hero:alive',
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

function installSpies() {
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
