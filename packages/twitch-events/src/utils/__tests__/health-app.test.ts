import { once } from 'node:events'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createHealthApp } from '../health-app.ts'

const healthResponseSchema = z.object({
  eventsConnected: z.boolean(),
  status: z.literal('ok'),
})

describe(createHealthApp, () => {
  it('reports socket liveness without disclosing the Express version', async () => {
    const app = createHealthApp(() => true)
    const server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')

    try {
      const address = server.address()
      if (!(address instanceof Object) || !('port' in address)) {
        throw new Error('Expected the health server to listen on a TCP port')
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/webhook`)
      const body = healthResponseSchema.parse(await response.json())

      expect({
        body,
        status: response.status,
        xPoweredBy: response.headers.get('x-powered-by'),
      }).toStrictEqual({
        body: { eventsConnected: true, status: 'ok' },
        status: 200,
        xPoweredBy: null,
      })
    } finally {
      const closed = once(server, 'close')
      server.close()
      await closed
    }
  })
})
