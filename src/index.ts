import { CaptureConsole as CaptureConsoleIntegration } from '@sentry/integrations'
import * as Sentry from '@sentry/node'
import '@sentry/tracing'
import { ProfilingIntegration } from '@sentry/profiling-node'
import * as Tracing from '@sentry/tracing'

import { prisma } from './db/prisma.js'
import { server } from './dota/index.js'

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,

  integrations: [
    new CaptureConsoleIntegration(),
    new Tracing.Integrations.Prisma({ client: prisma }),
    // enable HTTP calls tracing
    new Sentry.Integrations.Http({ tracing: true }),
    // Add our Profilling integration
    new ProfilingIntegration(),
    new Tracing.Integrations.Express({
      // to trace all requests to the default router
      app: server.app,
      // alternatively, you can specify the routes you want to trace:
      // router: someRouter,
    }),
  ],
  // Set sampling rate for profiling
  // @ts-expect-error - Profiling options are not typed yet?
  profilesSampleRate: 1.0,
})

import './twitch/index.ts'
import './db/watcher.ts'
