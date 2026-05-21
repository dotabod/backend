import { beforeEach, describe, expect, it } from 'bun:test'
import { modMode } from '../../../dota/lib/consts.ts'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// Mod-only commands that drive updateMmr (mocked -> state.updateMmrCalls) and
// the Twitch chat settings API (mocked -> state.chatSettingsUpdates).

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
  modMode.clear()
})

describe('!setmmr', () => {
  it('rejects an invalid mmr value', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!setmmr notanumber' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('mmr')
    expect(state.updateMmrCalls).toHaveLength(0)
  })

  it('updates mmr for a single-account streamer', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!setmmr 4200' }))
    expect(state.updateMmrCalls).toHaveLength(1)
    expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: '4200', steam32Id: 99999 })
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!setmmr 4200', permission: 0, userName: 'viewer' }),
    )
    expect(state.updateMmrCalls).toHaveLength(0)
    expect(state.chatSayCalls).toHaveLength(0)
  })
})

describe('!modsonly', () => {
  it('enables emote+sub-only mode and announces it on first use', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!modsonly' }))
    expect(state.chatSettingsUpdates).toHaveLength(1)
    expect(state.chatSettingsUpdates[0].settings).toEqual({
      emoteOnlyModeEnabled: true,
      subscriberOnlyModeEnabled: true,
    })
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('BASED Clap')
  })

  it('disables the mode on the second use (toggle off)', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!modsonly' }))
    await commandHandler.handleMessage(makeMessage({ content: '!modsonly' }))
    expect(state.chatSettingsUpdates).toHaveLength(2)
    expect(state.chatSettingsUpdates[1].settings).toEqual({
      emoteOnlyModeEnabled: false,
      subscriberOnlyModeEnabled: false,
    })
  })

  it('skips the Twitch settings call when the bot is banned', async () => {
    state.botBanned = true
    await commandHandler.handleMessage(makeMessage({ content: '!modsonly' }))
    expect(state.chatSettingsUpdates).toHaveLength(0)
    expect(state.chatSayCalls).toHaveLength(1)
  })
})
