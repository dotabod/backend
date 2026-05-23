import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { t } from 'i18next'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// Covers the simple, formatting-only commands (no GSI/DB coupling) dispatched
// via commandHandler.handleMessage(). Companion to commands.integration.test.ts.
const notLive = t('notLive', { emote: 'PauseChamp', lng: 'en' })
const unknownSteam = t('unknownSteam', { lng: 'en' })
const multiAccount = t('multiAccount', { lng: 'en', url: 'dotabod.com/dashboard/features' })

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!dotabod', () => {
  it('chats the dotabod info message', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!dotabod' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com')
    expect(state.chatSayCalls[0].message).toContain('@techleed')
  })
})

describe('!commands', () => {
  it('chats a link to the channel commands page', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!commands' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/streamer')
  })
})

describe('!version', () => {
  const original = process.env.COMMIT_HASH

  afterEach(() => {
    if (original === undefined) delete process.env.COMMIT_HASH
    else process.env.COMMIT_HASH = original
  })

  it('reports the unknown-version message when COMMIT_HASH is unset', async () => {
    delete process.env.COMMIT_HASH
    await commandHandler.handleMessage(makeMessage({ content: '!version' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('github.com/dotabod/backend')
  })

  it('reports the commit hash and compare URL when COMMIT_HASH is set', async () => {
    process.env.COMMIT_HASH = 'abc1234'
    await commandHandler.handleMessage(makeMessage({ content: '!version' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('abc1234')
  })
})

describe('!steam', () => {
  it('chats the steamid.xyz link when a steam32Id is known', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!steam' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe('steamid.xyz/99999')
  })

  it('reports unknownSteam when no steam32Id and not multiAccount', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!steam', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(unknownSteam)
  })

  it('reports the multiAccount message when no steam32Id and multiAccount is set', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!steam',
        clientOverrides: { steam32Id: null, multiAccount: true } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(multiAccount)
  })
})

describe('!match', () => {
  it('reports gameNotFound when there is no live match', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!match' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('gameNotFound', { lng: 'en' }))
  })

  it('chats the match id when GSI has one', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!match',
        clientOverrides: { gsi: { map: { matchid: '7777777777' } } } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('7777777777')
  })

  it('blocks when the stream is offline (onlyOnline gate)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!match', clientOverrides: { stream_online: false } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notLive)
  })
})

describe('!song', () => {
  const realFetch = globalThis.fetch
  const origApiKey = process.env.LASTFM_API_KEY

  const lastFmSettings = [
    { key: 'commandLastFm', value: true },
    { key: 'lastFmUsername', value: 'someuser' },
  ]

  function mockLastFm(payload: unknown) {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => payload,
    })) as unknown as typeof fetch
  }

  beforeAll(() => {
    process.env.LASTFM_API_KEY = 'test-key'
  })

  afterAll(() => {
    if (origApiKey === undefined) delete process.env.LASTFM_API_KEY
    else process.env.LASTFM_API_KEY = origApiKey
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('reports lastFmNotConfigured when the command is enabled but no username is set', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!song',
        clientOverrides: { settings: [{ key: 'commandLastFm', value: true }] } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('lastFmNotConfigured', { lng: 'en' }))
  })

  it('blocks when the stream is offline (onlyOnline gate)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!song', clientOverrides: { stream_online: false } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notLive)
  })

  // Last.fm returns HTML-encoded entities in track/artist/album names
  // (e.g. `&#39;` for `'`, `&amp;` for `&`). Forwarding those to chat verbatim
  // shows up as the literal `&#39;` — observed in production on
  // "Fuck Wit Dre Day (And Everybody&#39;s Celebratin&#39;)".
  it('decodes HTML entities from Last.fm in the chat message', async () => {
    // Simulate the wire format Last.fm actually sends.
    mockLastFm({
      recenttracks: {
        track: [
          {
            artist: { '#text': 'Dr. Dre &amp; Friends' },
            name: 'Fuck Wit Dre Day (And Everybody&#39;s Celebratin&#39;)',
            album: { '#text': 'The Chronic' },
            '@attr': { nowplaying: 'true' },
          },
        ],
        '@attr': {},
      },
    } as any)

    await commandHandler.handleMessage(
      makeMessage({ content: '!song', clientOverrides: { settings: lastFmSettings } as any }),
    )

    expect(state.chatSayCalls).toHaveLength(1)
    const msg = state.chatSayCalls[0].message
    expect(msg).not.toContain('&#39;')
    expect(msg).not.toContain('&amp;')
    expect(msg).toContain("Everybody's Celebratin'")
    expect(msg).toContain('Dr. Dre & Friends')
    expect(msg).toContain('[The Chronic]')
  })

  it('runs artist/title/album through moderateText before emitting', async () => {
    state.moderateTextOverride = (text?: string | string[]) => {
      if (typeof text !== 'string') return text
      // Pretend the filter redacted these fields.
      if (text === 'Bad Artist') return '***'
      if (text === 'Bad Title') return '***'
      if (text === 'Bad Album') return '***'
      return text
    }
    mockLastFm({
      recenttracks: {
        track: [
          {
            artist: { '#text': 'Bad Artist' },
            name: 'Bad Title',
            album: { '#text': 'Bad Album' },
            '@attr': { nowplaying: 'true' },
          },
        ],
        '@attr': {},
      },
    } as any)

    await commandHandler.handleMessage(
      makeMessage({ content: '!song', clientOverrides: { settings: lastFmSettings } as any }),
    )

    expect(state.chatSayCalls).toHaveLength(1)
    const msg = state.chatSayCalls[0].message
    expect(msg).not.toContain('Bad Artist')
    expect(msg).not.toContain('Bad Title')
    expect(msg).not.toContain('Bad Album')
    expect(msg).toContain('***')
  })

  it('reports songNotPlaying when Last.fm has no current track', async () => {
    mockLastFm({
      recenttracks: {
        track: [
          {
            artist: { '#text': 'Dr. Dre' },
            name: 'Nuthin But A G Thang',
            album: { '#text': 'The Chronic' },
            // no @attr.nowplaying → not currently playing
            date: { uts: '1700000000', '#text': '...' },
          },
        ],
        '@attr': {},
      },
    } as any)

    await commandHandler.handleMessage(
      makeMessage({ content: '!song', clientOverrides: { settings: lastFmSettings } as any }),
    )

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('songNotPlaying', { lng: 'en' }))
  })
})
