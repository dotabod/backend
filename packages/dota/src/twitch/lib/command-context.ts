import { AsyncLocalStorage } from 'node:async_hooks'

import type { SocketClient } from '../../types'

export const commandContext = new AsyncLocalStorage<{
  channelName: string
  client: SocketClient
  suffix: string | null
}>()
