import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { ChatMessageType } from '../../../../types'
import {
  __resetUnknownEventLogCacheForTests,
  shouldLogUnknownGsiEvent,
} from '../unknownEventDiagnostics'

beforeEach(() => {
  __resetUnknownEventLogCacheForTests()
})

describe('known generic GSI event types', () => {
  it("recognizes Valve's cannot-unpause-team event", () => {
    expect(Object.values(ChatMessageType)).toContain('CHAT_MESSAGE_CANTUNPAUSETEAM')
  })
})

describe('unknown GSI event diagnostics', () => {
  it('rate-limits each unknown type across clients while preserving future visibility', () => {
    expect([
      shouldLogUnknownGsiEvent('message:CHAT_MESSAGE_FUTURE', 1_000),
      shouldLogUnknownGsiEvent('message:CHAT_MESSAGE_FUTURE', 1_001),
      shouldLogUnknownGsiEvent('message:CHAT_MESSAGE_OTHER', 1_001),
      shouldLogUnknownGsiEvent('message:CHAT_MESSAGE_FUTURE', 3_601_000),
    ]).toEqual([true, false, true, true])
  })
})
