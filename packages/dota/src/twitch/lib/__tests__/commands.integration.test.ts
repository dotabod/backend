import { beforeEach, describe, expect, it } from 'bun:test'
import { flushAsync } from '../../../__tests__/sharedMocks.ts'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// Integration tests that exercise individual chat command handlers via
// `commandHandler.handleMessage()`. Companion to `CommandHandler.integration.test.ts`
// (which focuses on parsing/aliases/permissions/cooldowns).

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!ping', () => {
  it('replies with the ping message', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!ping' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('EZ Clap')
  })

  it('does not echo for plain text', async () => {
    await commandHandler.handleMessage(makeMessage({ content: 'ping' }))
    expect(state.chatSayCalls).toHaveLength(0)
  })
})

describe('!locale', () => {
  it('lists English translators for the default locale', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!locale' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('@techleed')
    expect(state.chatSayCalls[0].message).toContain('crowdin.com/project/dotabod')
  })

  it('falls back to the no-translator message for an unknown locale', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!locale', clientOverrides: { locale: 'xx-XX' } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('crowdin.com/project/dotabod')
  })

  it('routes the !translation alias to the same handler', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!translation' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('@techleed')
  })
})

describe('!delay', () => {
  it('reports no delay when streamDelay is unset', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!delay' }))
    expect(state.chatSayCalls).toHaveLength(1)
    // Default streamDelay is 0 → "no delay" branch.
    expect(state.chatSayCalls[0].message.toLowerCase()).toMatch(/no.*delay|0/)
  })

  it('reports the configured delay in seconds', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!delay',
        clientOverrides: {
          settings: [{ key: 'streamDelay', value: 5000 }] as any,
        },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('5')
  })

  it('blocks when stream is offline (onlyOnline gate)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!delay', clientOverrides: { stream_online: false } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })
})

describe('!wl', () => {
  it('reports the multiAccount message when steam32Id is unset and multiAccount is true', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!wl',
        clientOverrides: { steam32Id: null, multiAccount: true } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/dashboard/features')
  })

  it('reports unknownSteam when steam32Id is unset and not multiAccount', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!wl', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('steam')
  })

  it('reports ranked + unranked W/L from supabase.rpc results', async () => {
    state.groupedBets = [
      { won: true, _count_won: 3, lobby_type: 7, is_party: false, is_doubledown: false },
      { won: false, _count_won: 1, lobby_type: 7, is_party: false, is_doubledown: false },
      { won: true, _count_won: 2, lobby_type: 0, is_party: false, is_doubledown: false },
    ]
    await commandHandler.handleMessage(makeMessage({ content: '!wl' }))
    expect(state.chatSayCalls).toHaveLength(1)
    const msg = state.chatSayCalls[0].message
    expect(msg).toContain('3 W')
    expect(msg).toContain('1 L')
    expect(msg).toContain('2 W')
  })

  it('handles a supabase.rpc error by falling back to no-record output', async () => {
    state.groupedBetsError = { message: 'boom' }
    await commandHandler.handleMessage(makeMessage({ content: '!wl' }))
    // getWL returns { record, msg: null } on error → no chat output.
    expect(state.chatSayCalls).toHaveLength(0)
  })
})

describe('!mmr', () => {
  it('chats chattersRank when a username profile is found', async () => {
    state.openDotaProfile = { rank_tier: 75, leaderboard_rank: 0 }
    state.rankTitle = 'Immortal'
    await commandHandler.handleMessage(makeMessage({ content: '!mmr someguy' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('someguy')
    expect(state.chatSayCalls[0].message).toContain('Immortal')
  })

  it('appends a leaderboard rank when present', async () => {
    state.openDotaProfile = { rank_tier: 80, leaderboard_rank: 42 }
    state.rankTitle = 'Immortal'
    await commandHandler.handleMessage(makeMessage({ content: '!mmr someguy' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('#42')
  })

  it('reports the unknown-mmr message when no SteamAccount and mmr=0', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!mmr', clientOverrides: { mmr: 0, SteamAccount: [] } as any }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/dashboard/features')
  })

  it('chats the rank description for legacy MMR (no SteamAccount, mmr > 0)', async () => {
    state.rankDescription = 'Divine 5 | 6000 MMR'
    await commandHandler.handleMessage(
      makeMessage({ content: '!mmr', clientOverrides: { mmr: 6000, SteamAccount: [] } as any }),
    )
    await flushAsync()
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe('Divine 5 | 6000 MMR')
  })

  it('reports multiAccount when SteamAccount has entries but none match steam32Id', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!mmr',
        clientOverrides: {
          multiAccount: true,
          SteamAccount: [{ steam32Id: 11111, name: 'other', mmr: 4000 }],
        } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/dashboard/features')
  })
})

describe('!gpm', () => {
  it('blocks when the stream is offline', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!gpm', clientOverrides: { stream_online: false } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('chats gpm_zero when GSI is missing', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!gpm' }))
    expect(state.chatSayCalls).toHaveLength(1)
    // gpm_zero translation contains "0"
    expect(state.chatSayCalls[0].message).toMatch(/0/)
  })

  it('chats gpm_other when GSI has a non-zero gpm', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!gpm',
        clientOverrides: {
          gsi: {
            player: { gpm: 650, gold_from_hero_kills: 100, gold_from_creep_kills: 500 },
            hero: { id: 1 },
          },
        } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('650')
  })
})

describe('!dotabuff', () => {
  it('chats a profile URL with no args when steam32Id is known', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!dotabuff' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabuff.com/players/99999')
  })

  it('falls through to the profileLink path when no steam32Id and no match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!dotabuff', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    // profileLink throws notPlaying → caught by handler → chat error.
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })
})

describe('!pleb', () => {
  it('chats plebSubRequired when sub-only mode is OFF', async () => {
    state.subscriberOnlyMode = false
    await commandHandler.handleMessage(makeMessage({ content: '!pleb', permission: 2 }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('sub')
    expect(state.chatSettingsUpdates).toHaveLength(0)
  })

  it('disables sub-only mode and chats pleb when sub-only mode is ON', async () => {
    state.subscriberOnlyMode = true
    await commandHandler.handleMessage(makeMessage({ content: '!pleb', permission: 2 }))
    expect(state.chatSettingsUpdates).toHaveLength(1)
    expect(state.chatSettingsUpdates[0].settings).toEqual({
      emoteOnlyModeEnabled: false,
      subscriberOnlyModeEnabled: false,
    })
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('👇')
  })

  it('does nothing when the bot is banned', async () => {
    state.botBanned = true
    state.subscriberOnlyMode = true
    await commandHandler.handleMessage(makeMessage({ content: '!pleb', permission: 2 }))
    expect(state.chatSayCalls).toHaveLength(0)
    expect(state.chatSettingsUpdates).toHaveLength(0)
  })

  it('blocks viewers (permission=0)', async () => {
    state.subscriberOnlyMode = true
    await commandHandler.handleMessage(
      makeMessage({ content: '!pleb', permission: 0, userName: 'viewer' }),
    )
    expect(state.chatSayCalls).toHaveLength(0)
    expect(state.chatSettingsUpdates).toHaveLength(0)
  })
})

describe('!apm', () => {
  it('chats an error when no GSI match is available', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!apm' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('chats an apm number when GSI has commands_issued and game_time', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!apm',
        clientOverrides: {
          gsi: {
            map: { matchid: '7777777777', game_time: 600 },
            player: { commands_issued: 3000, accountid: 99999 },
            hero: { id: 1 },
          },
        } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    // 3000 commands over 600s = 10min → 300 apm.
    expect(state.chatSayCalls[0].message).toContain('300')
  })
})

describe('!avg', () => {
  it('reports unknownSteam when steam32Id is unset (no multiAccount)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!avg', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('steam')
  })

  it('reports multiAccount when steam32Id is unset and multiAccount is true', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!avg',
        clientOverrides: { steam32Id: null, multiAccount: true } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/dashboard/features')
  })
})
