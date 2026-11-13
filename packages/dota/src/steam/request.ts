import { promisify } from 'node:util'

import type { z } from 'zod'

import { steamSocket } from './ws'

// What each steam service handler takes before its ack (packages/steam/src/index.ts)
interface SteamRequestArgs {
  getCard: [accountId: number]
  getCards: [accountIds: number[], refetchCards: boolean]
  getMatchMinimalDetails: [data: { match_id: number }]
  getUserSteamServer: [steam32Id: number | string | null]
}

// The steam service acks with (error, data). emitWithAck resolves with that first, null
// argument, so every reply read through it is empty; the callback form reads both.
export const requestSteam = async function requestSteam<
  E extends keyof SteamRequestArgs,
  S extends z.ZodType,
>(event: E, args: SteamRequestArgs[E], schema: S, timeoutMs: number): Promise<z.output<S>> {
  type Reply = z.input<S> | null
  const send = promisify((done: (error: Error | null, data?: Reply) => void) => {
    const ack = (ackError: Error | null, serverError: string | null, data: Reply) => {
      const serverFailure = serverError === null ? null : new Error(serverError)
      done(ackError ?? serverFailure, data)
    }
    steamSocket.timeout(timeoutMs).emit(event, ...args, ack)
  })
  return schema.parse(await send())
}
