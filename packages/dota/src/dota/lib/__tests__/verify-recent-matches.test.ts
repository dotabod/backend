import { describe, expect, it } from 'vitest'

import {
  createGsiHandlerStub,
  createPacketStub,
  createSocketClientStub,
} from '../../../__tests__/shared-mocks.ts'
import type { GSIHandlerType } from '../../gsi-handler-types.ts'
import type { UpdateMmrParams } from '../update-mmr.ts'
import { createMatchVerifier } from '../verify-recent-matches.ts'
import type { MatchVerifierDeps } from '../verify-recent-matches.ts'
import {
  createMemoryStore,
  createRequester,
  valveMatch,
  verifiableMatch,
} from './match-verification-fakes.ts'

const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

const setup = function setup(options: {
  answers?: Map<string, ReturnType<typeof valveMatch> | Error>
  connected?: boolean
  handlers?: Map<string, GSIHandlerType>
  rows: Parameters<typeof createMemoryStore>[0]
}) {
  const { store, table } = createMemoryStore(options.rows)
  const { request, requested } = createRequester(options.answers ?? new Map())
  const mmrCalls: UpdateMmrParams[] = []
  const predictionCalls: [boolean, string, string, string][] = []
  const deps: MatchVerifierDeps = {
    async closePrediction(won, channelId, predictionId, matchId) {
      predictionCalls.push([won, channelId, predictionId, matchId])
      return await Promise.resolve(true)
    },
    handlers: options.handlers ?? new Map(),
    isConnected: () => options.connected ?? true,
    request,
    store,
    async updateMmr(params) {
      mmrCalls.push(params)
      await Promise.resolve()
    },
    wait: async () => {
      await Promise.resolve()
    },
  }
  return { mmrCalls, predictionCalls, requested, table, verify: createMatchVerifier(deps) }
}

const finished = (overrides: Parameters<typeof verifiableMatch>[0]) =>
  verifiableMatch({ created_at: ago(HOUR), updated_at: ago(HOUR), ...overrides })

describe(createMatchVerifier, () => {
  it('does nothing while the steam service is disconnected', async () => {
    const { requested, verify } = setup({ connected: false, rows: [finished({})] })

    await verify()

    expect(requested).toStrictEqual([])
  })

  it('skips a match the streamer is still playing and one that just resolved', async () => {
    const client = createSocketClientStub({ gsi: createPacketStub({ map: { matchid: '2' } }) })
    const { requested, verify } = setup({
      handlers: new Map([['user-2', createGsiHandlerStub(client)]]),
      rows: [
        finished({ id: 'a', matchId: '1' }),
        finished({ id: 'b', matchId: '2', userId: 'user-2' }),
        finished({ id: 'c', matchId: '3', updated_at: ago(30_000), won: true }),
        finished({ id: 'd', matchId: '4', won: true }),
      ],
    })

    await verify()

    expect(requested).toStrictEqual(['1', '4'])
  })

  it('stops asking as soon as Valve is unavailable', async () => {
    const { requested, table, verify } = setup({
      answers: new Map([['1', new Error('Steam not connected')]]),
      rows: [finished({ id: 'a', matchId: '1' }), finished({ id: 'b', matchId: '2' })],
    })

    await verify()

    expect(requested).toStrictEqual(['1'])
    expect([...table.values()].map((row) => row.verification)).toStrictEqual([null, null])
  })

  it('gives up on a match Valve still lacks after six hours, and waits before re-asking', async () => {
    const { requested, table, verify } = setup({
      rows: [
        finished({ created_at: ago(7 * HOUR), id: 'old', matchId: '1' }),
        finished({ id: 'recent', matchId: '2' }),
      ],
    })

    await verify()
    await verify()

    expect(requested).toStrictEqual(['1', '2'])
    expect(table.get('old')?.verification).toBe('not_found')
    expect(table.get('recent')?.verification).toBeNull()
  })

  it('fills in an online streamer’s missing result with MMR and the prediction', async () => {
    const client = createSocketClientStub({ mmr: 4000, steam32Id: 433_314_623, token: 'user-1' })
    const handler = createGsiHandlerStub(client, { getChannelId: () => 'twitch-1' })
    const { mmrCalls, predictionCalls, table, verify } = setup({
      answers: new Map([['9053165578', valveMatch()]]),
      handlers: new Map([['user-1', handler]]),
      rows: [finished({})],
    })

    await verify()

    expect(table.get('row-1')).toMatchObject({ verification: 'resolved', won: true })
    expect(mmrCalls).toMatchObject([{ currentMmr: 4000, newMmr: 4025, steam32Id: 433_314_623 }])
    expect(predictionCalls).toStrictEqual([[true, 'twitch-1', 'prediction-1', '9053165578']])
  })

  it('leaves MMR and the prediction alone for a streamer who is not loaded', async () => {
    const { mmrCalls, predictionCalls, table, verify } = setup({
      answers: new Map([['9053165578', valveMatch()]]),
      rows: [finished({})],
    })

    await verify()

    expect(table.get('row-1')).toMatchObject({ won: true })
    expect(mmrCalls).toStrictEqual([])
    expect(predictionCalls).toStrictEqual([])
  })
})
