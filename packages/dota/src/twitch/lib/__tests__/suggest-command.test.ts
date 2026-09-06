import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildSharedUtilsMock,
  createSocketClientStub,
  initTestI18n,
  PRO_SUB,
} from '../../../__tests__/shared-mocks.ts'
import type { SettingKeys } from '../../../settings'
import type { MessageType } from '../command-handler'

const noopLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

vi.doMock('@dotabod/shared-utils', () => buildSharedUtilsMock({ logger: noopLogger, supabase: {} }))

// Stub the CommandHandler singleton with just the `.commands` map the
// dispatcher needs for per-candidate dbkey lookup. Avoids dragging in the
// full handler (which would pull in all 50+ command modules).
const fakeCommands = new Map<string, { dbkey?: SettingKeys }>([
  ['today', { dbkey: 'commandToday' }],
  ['lgs', { dbkey: 'commandLGS' }],
  ['wl', { dbkey: 'commandWL' }],
])
vi.doMock('../command-handler.ts', () => ({
  default: { commands: fakeCommands },
}))

await initTestI18n()

const { commandClusters, prepareSuggestionSuffix, suggestionContext, _resetSuggestionState } =
  await import('../suggest-command.ts')

const makeMessage = function makeMessage(
  over: { settings?: { key: string; value: unknown }[] } = {}
): MessageType {
  const settings = over.settings ?? []
  const client = createSocketClientStub({ locale: 'en', settings, subscription: PRO_SUB })
  return {
    channel: {
      client,
      id: 'channel-1',
      name: '#streamer',
      settings,
    },
    content: '!today',
    user: { messageId: 'm-1', name: 'viewer', permission: 0, userId: 'u-1' },
  }
}

// Run prepareSuggestionSuffix `count` times and return the last call's result.
const runUntilSuggestion = function runUntilSuggestion(cmd: string, msg: MessageType, count = 4) {
  let last: string | null = null
  for (let i = 0; i < count; i += 1) {
    last = prepareSuggestionSuffix(cmd, msg, fakeCommands)
  }
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
    for (let i = 0; i < 3; i += 1) {
      expect(prepareSuggestionSuffix('today', msg, fakeCommands)).toBeNull()
    }
    const suffix = prepareSuggestionSuffix('today', msg, fakeCommands)
    expect(suffix).toBeTruthy()
    expect(suffix).toMatch(/!(lgs|wl)/u)
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
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) {
        continue
      }
      const source = readFileSync(join(commandsDir, file), 'utf-8')
      if (!/permission:\s*2\b/u.test(source)) {
        continue
      }
      const match = /registerCommand\(\s*['"]([^'"]+)['"]/u.exec(source)
      if (match) {
        modCommands.add(match[1])
      }
    }
    // sanity: scanner picked something up
    expect(modCommands.size).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const cluster of commandClusters) {
      for (const cmd of cluster) {
        if (modCommands.has(cmd)) {
          offenders.push(cmd)
        }
      }
    }
    expect(offenders).toStrictEqual([])
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
    await expect(a).resolves.toBe('A')
    await expect(b).resolves.toBe('B')
  })
})
