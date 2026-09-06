import type { handleNewUser } from '../handle-new-user'

export interface SocketUserLogMetadata {
  error?: string
  providerAccountId: string
}

interface SocketUserLogger {
  error: (message: string, metadata: SocketUserLogMetadata) => void
  info: (message: string, metadata: SocketUserLogMetadata) => void
}

export interface SocketUserActionDependencies {
  handleNewUser: typeof handleNewUser
  logger: SocketUserLogger
}

type SocketUserAction = 'enable' | 'resubscribe'

const actionMessages = {
  enable: {
    failure: '[TWITCHEVENTS] socket enable handleNewUser failed',
    start: '[TWITCHEVENTS] Enabling events for user',
  },
  resubscribe: {
    failure: '[TWITCHEVENTS] socket resubscribe handleNewUser failed',
    start: '[TWITCHEVENTS] Resubscribing to events for user',
  },
} satisfies Record<SocketUserAction, { failure: string; start: string }>

export const createSocketUserActions = function createSocketUserActions(
  dependencies: SocketUserActionDependencies
) {
  const updateUserEvents = async function updateUserEvents(
    providerAccountId: string,
    action: SocketUserAction
  ): Promise<void> {
    const messages = actionMessages[action]
    dependencies.logger.info(messages.start, { providerAccountId })

    try {
      await dependencies.handleNewUser(providerAccountId, true)
    } catch (error) {
      dependencies.logger.error(messages.failure, {
        error: error instanceof Error ? error.message : String(error),
        providerAccountId,
      })
    }
  }

  return {
    onSocketEnable: async (providerAccountId: string): Promise<void> => {
      await updateUserEvents(providerAccountId, 'enable')
    },
    onSocketResubscribe: async (providerAccountId: string): Promise<void> => {
      await updateUserEvents(providerAccountId, 'resubscribe')
    },
  }
}
