import express from 'express'
import type { Express } from 'express'

export const createHealthApp = function createHealthApp(isEventsConnected: () => boolean): Express {
  const app = express()
  app.disable('x-powered-by')

  app.get('/webhook', (_request, response) => {
    response.status(200).json({
      eventsConnected: isEventsConnected(),
      status: 'ok',
    })
  })

  return app
}
