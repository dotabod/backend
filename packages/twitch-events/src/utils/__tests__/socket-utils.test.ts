import { beforeEach, describe, expect, it } from 'vitest'

import { createSocketUserActions } from '../socket-user-actions.ts'
import type { SocketUserActionDependencies, SocketUserLogMetadata } from '../socket-user-actions.ts'

interface LogCall {
  message: string
  metadata: SocketUserLogMetadata
}

interface HandleNewUserCall {
  providerAccountId: string
  resubscribeEvents: boolean | undefined
}

const completed = Promise.resolve()
const errorLogs: LogCall[] = []
const infoLogs: LogCall[] = []
const handleNewUserCalls: HandleNewUserCall[] = []
let handleNewUserError: Error | null = null

const dependencies: SocketUserActionDependencies = {
  handleNewUser: async (providerAccountId, resubscribeEvents) => {
    await completed
    handleNewUserCalls.push({ providerAccountId, resubscribeEvents })
    if (handleNewUserError !== null) {
      throw handleNewUserError
    }
  },
  logger: {
    error: (message, metadata) => {
      errorLogs.push({ message, metadata })
    },
    info: (message, metadata) => {
      infoLogs.push({ message, metadata })
    },
  },
}

describe(createSocketUserActions, () => {
  const { onSocketEnable, onSocketResubscribe } = createSocketUserActions(dependencies)

  beforeEach(() => {
    errorLogs.length = 0
    handleNewUserCalls.length = 0
    handleNewUserError = null
    infoLogs.length = 0
  })

  describe('enable', () => {
    it('logs the provider and absorbs a subscription failure', async () => {
      handleNewUserError = new Error('critical subscription failed')

      await onSocketEnable('tw-1')

      expect({ errorLogs, handleNewUserCalls, infoLogs }).toStrictEqual({
        errorLogs: [
          {
            message: '[TWITCHEVENTS] socket enable handleNewUser failed',
            metadata: {
              error: 'critical subscription failed',
              providerAccountId: 'tw-1',
            },
          },
        ],
        handleNewUserCalls: [{ providerAccountId: 'tw-1', resubscribeEvents: true }],
        infoLogs: [
          {
            message: '[TWITCHEVENTS] Enabling events for user',
            metadata: { providerAccountId: 'tw-1' },
          },
        ],
      })
    })

    it('completes without an error log when subscriptions succeed', async () => {
      await onSocketEnable('tw-ok')

      expect({ errorLogs, handleNewUserCalls, infoLogs }).toStrictEqual({
        errorLogs: [],
        handleNewUserCalls: [{ providerAccountId: 'tw-ok', resubscribeEvents: true }],
        infoLogs: [
          {
            message: '[TWITCHEVENTS] Enabling events for user',
            metadata: { providerAccountId: 'tw-ok' },
          },
        ],
      })
    })
  })

  describe('resubscribe', () => {
    it('logs the provider and absorbs a subscription failure', async () => {
      handleNewUserError = new Error('rate limited')

      await onSocketResubscribe('tw-2')

      expect({ errorLogs, handleNewUserCalls, infoLogs }).toStrictEqual({
        errorLogs: [
          {
            message: '[TWITCHEVENTS] socket resubscribe handleNewUser failed',
            metadata: { error: 'rate limited', providerAccountId: 'tw-2' },
          },
        ],
        handleNewUserCalls: [{ providerAccountId: 'tw-2', resubscribeEvents: true }],
        infoLogs: [
          {
            message: '[TWITCHEVENTS] Resubscribing to events for user',
            metadata: { providerAccountId: 'tw-2' },
          },
        ],
      })
    })
  })
})
