import { describe, expect, it } from 'vitest'

import { runBackfill } from '../verification-backfill.ts'
import type { BackfillOptions } from '../verification-backfill.ts'
import {
  createMemoryStore,
  createRequester,
  valveMatch,
  verifiableMatch,
} from './match-verification-fakes.ts'

const options = function options(overrides: Partial<BackfillOptions>): BackfillOptions {
  const { store } = createMemoryStore([])
  const { request } = createRequester(new Map())
  return {
    apply: false,
    request,
    since: '2026-10-01T00:00:00.000Z',
    spacingMs: 0,
    store,
    unresolvedOnly: false,
    until: '2026-10-21T00:00:00.000Z',
    wait: async () => {
      await Promise.resolve()
    },
    ...overrides,
  }
}

const rows = [
  verifiableMatch({ created_at: '2026-10-02T00:00:00.000Z', id: 'unresolved' }),
  verifiableMatch({ created_at: '2026-10-03T00:00:00.000Z', id: 'recorded', won: true }),
  verifiableMatch({ created_at: '2026-10-04T00:00:00.000Z', id: 'missing', matchId: '2' }),
  verifiableMatch({ created_at: '2026-09-01T00:00:00.000Z', id: 'before range' }),
]
const answers = new Map([['9053165578', valveMatch()]])

describe(runBackfill, () => {
  it('reports what it would change without writing on a dry run', async () => {
    const { store, table } = createMemoryStore(rows)
    const { request, requested } = createRequester(answers)

    await expect(runBackfill(options({ request, store }))).resolves.toStrictEqual({
      checked: 3,
      confirmed: 1,
      not_found: 1,
      resolved: 1,
    })
    expect(requested).toStrictEqual(['9053165578', '9053165578', '2'])
    expect([...table.values()].every((row) => row.verification === null)).toBeTruthy()
  })

  it('writes results and marks every checked row when applying', async () => {
    const { store, table } = createMemoryStore(rows)
    const { request } = createRequester(answers)

    await runBackfill(options({ apply: true, request, store }))

    expect(table.get('unresolved')).toMatchObject({ verification: 'resolved', won: true })
    expect(table.get('recorded')?.verification).toBe('confirmed')
    expect(table.get('missing')?.verification).toBe('not_found')
    expect(table.get('before range')?.verification).toBeNull()
  })

  it('pages through more rows than fit in one page', async () => {
    const many = Array.from({ length: 1205 }, (_, index) =>
      verifiableMatch({
        created_at: new Date(Date.UTC(2026, 9, 2, 0, 0, index)).toISOString(),
        id: `row-${String(index).padStart(4, '0')}`,
        won: true,
      })
    )
    const { store } = createMemoryStore(many)
    const { request } = createRequester(answers)

    await expect(runBackfill(options({ request, store }))).resolves.toMatchObject({
      checked: 1205,
      confirmed: 1205,
    })
  })

  it('retries a row after Valve fails, and gives up after repeated failures', async () => {
    const { store } = createMemoryStore([rows[0]])
    let calls = 0
    const flaky: BackfillOptions['request'] = async () => {
      calls += 1
      await Promise.resolve()
      if (calls < 3) {
        throw new Error('Steam not connected')
      }
      return valveMatch()
    }
    await expect(runBackfill(options({ request: flaky, store }))).resolves.toMatchObject({
      resolved: 1,
    })

    const { request: down } = createRequester(new Map([['9053165578', new Error('down')]]))
    await expect(runBackfill(options({ request: down, store }))).rejects.toThrow(
      'Valve requests keep failing'
    )
  })
})
