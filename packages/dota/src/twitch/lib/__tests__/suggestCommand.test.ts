import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../../__tests__/sharedMocks.ts'
import type { MessageType } from '../CommandHandler'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

vi.doMock('@dotabod/shared-utils', () => buildSharedUtilsMock({ supabase: {}, logger: noopLogger }))

// Stub the CommandHandler singleton with just the `.commands` map the
// dispatcher needs for per-candidate dbkey lookup. Avoids dragging in the
// full handler (which would pull in all 50+ command modules).
const fakeCommands = new Map<string, { dbkey?: string }>([
  ['today', { dbkey: 'commandToday' }],
  ['lgs', { dbkey: 'commandLGS' }],
  ['wl', { dbkey: 'commandWL' }],
])
vi.doMock('../CommandHandler.ts', () => ({
  default: { commands: fakeCommands },
}))

await initTestI18n()

const { commandClusters, prepareSuggestionSuffix, suggestionContext, _resetSuggestionState } =
  await import('../suggestCommand.ts')

function makeMessage(over: { settings?: { key: string; value: unknown }[] } = {}): MessageType {
  return {
    user: { name: 'viewer', messageId: 'm-1', permission: 0, userId: 'u-1' },
    content: '!today',
    channel: {
      name: '#streamer',
      id: 'channel-1',
      settings: over.settings ?? [],
      client: {
        locale: 'en',
        subscription: PRO_SUB,
      },
    },
  } as unknown as MessageType
}

// Run prepareSuggestionSuffix `count` times and return the last call's result.
function runUntilSuggestion(cmd: string, msg: MessageType, count = 4) {
  let last: string | null = null
  for (let i = 0; i < count; i++) last = prepareSuggestionSuffix(cmd, msg)
  return last
}

describe('prepareSuggestionSuffix', () => {
  beforeEach(() => {
    _resetSuggestionState()
  })

  it('returns null for a command with no related cluster entry', () => {
    expect(runUntilSuggestion('ping', makeMessage(), 12)).toBeNull()
  })

  it('returns null when commandSuggestions is disabled', () => {
    const msg = makeMessage({ settings: [{ key: 'commandSuggestions', value: false }] })
    expect(runUntilSuggestion('today', msg, 12)).toBeNull()
  })

  it('emits a suffix on the throttle boundary and not before', () => {
    const msg = makeMessage()
    for (let i = 0; i < 3; i++) expect(prepareSuggestionSuffix('today', msg)).toBeNull()
    const suffix = prepareSuggestionSuffix('today', msg)
    expect(suffix).toBeTruthy()
    expect(suffix).toMatch(/!(lgs|wl)/)
  })

  it('does not suggest the command the viewer just used', () => {
    const suffix = runUntilSuggestion('today', makeMessage())
    expect(suffix).not.toContain('!today')
  })

  it('skips candidates whose dbkey is disabled', () => {
    const msg = makeMessage({ settings: [{ key: 'commandLGS', value: false }] })
    const suffix = runUntilSuggestion('today', msg)
    expect(suffix).toContain('!wl')
    expect(suffix).not.toContain('!lgs')
  })

  it('does not repeat the same suggestion within the dedupe window', () => {
    const msg = makeMessage({ settings: [{ key: 'commandWL', value: false }] })
    const first = runUntilSuggestion('today', msg)
    expect(first).toContain('!lgs')
    const second = runUntilSuggestion('today', msg)
    // Only !lgs is eligible and it was just used → no repeat.
    expect(second).toBeNull()
  })
})

describe('commandClusters', () => {
  it('does not include any mod-only command', () => {
    // Scan every command file for `permission: 2` and extract its registered
    // name from registerCommand('<name>', ...). Suggestions go out to all chat
    // viewers, so suggesting a command they cannot run is a bad UX.
    const commandsDir = join(import.meta.dirname, '..', '..', 'commands')
    const modCommands = new Set<string>()
    for (const file of readdirSync(commandsDir)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
      const source = readFileSync(join(commandsDir, file), 'utf8')
      if (!/permission:\s*2\b/.test(source)) continue
      const match = source.match(/registerCommand\(\s*['"]([^'"]+)['"]/)
      if (match) modCommands.add(match[1])
    }
    expect(modCommands.size).toBeGreaterThan(0) // sanity: scanner picked something up

    const offenders: string[] = []
    for (const cluster of commandClusters) {
      for (const cmd of cluster) {
        if (modCommands.has(cmd)) offenders.push(cmd)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('suggestionContext', () => {
  it('propagates the suffix through async/await and lets a consumer null it out', async () => {
    const ctx = { suffix: 'Also try !lgs' }
    await suggestionContext.run(ctx, async () => {
      await Promise.resolve()
      const store = suggestionContext.getStore()
      expect(store?.suffix).toBe('Also try !lgs')
      // Consumer (chatClient.say) is responsible for nulling after first use.
      store!.suffix = null
    })
    // After the run scope, the store is no longer reachable.
    expect(suggestionContext.getStore()).toBeUndefined()
  })

  it('isolates suffixes between concurrent command invocations', async () => {
    const a = suggestionContext.run({ suffix: 'A' }, async () => {
      await Promise.resolve()
      return suggestionContext.getStore()?.suffix
    })
    const b = suggestionContext.run({ suffix: 'B' }, async () => {
      await Promise.resolve()
      return suggestionContext.getStore()?.suffix
    })
    expect(await a).toBe('A')
    expect(await b).toBe('B')
  })
})
