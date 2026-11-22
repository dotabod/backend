import './events/gsi-event-loader'
import { lstatSync, readdirSync } from 'node:fs'
import path, { join } from 'node:path'

import { logger } from '@dotabod/shared-utils'
import chokidar from 'chokidar'
import i18next from 'i18next'
import FsBackend from 'i18next-fs-backend'
import type { FsBackendOptions } from 'i18next-fs-backend'

import RedisClient from '../db/redis-client'
import SetupSupabase from '../db/watcher'
import GSIServer from './gsi-server'
import { clipScheduler } from './lib/clip-schedule.js'
import { hydrateInvalidTokens } from './lib/invalid-tokens'
import { startDotaRetentionTelemetry } from './retention-telemetry'
import { server } from './server'

logger.info("Starting 'dota' package")

const setupTranslations = async () => {
  await i18next.use(FsBackend).init<FsBackendOptions>({
    backend: {
      loadPath: join('./locales/{{lng}}/{{ns}}.json'),
    },
    defaultNS: 'translation',
    fallbackLng: 'en',
    initAsync: false,
    lng: 'en',
    preload: readdirSync(join('./locales')).filter((fileName: string) => {
      const joinedPath = join(join('./locales'), fileName)
      const isDirectory = lstatSync(joinedPath).isDirectory()
      return isDirectory
    }),
    returnEmptyString: false,
    returnNull: false,
  })

  chokidar
    .watch('/app/packages/dota/locales/**/*.json', {
      ignoreInitial: true,
      interval: 5000,
      usePolling: true,
    })
    .on('all', (_event, filePath) => {
      logger.info('chokidar updated', { _event, filePath })
      const parsedPath = path.parse(filePath)
      const ns = parsedPath.name
      const lng = path.basename(parsedPath.dir)
      i18next
        .reloadResources([lng], [ns])
        .then(() => {
          logger.info('Translation reloaded', { filePath })
        })
        .catch((error) => {
          logger.info('Translation error on reloading', { error })
        })
    })

  logger.info('Loaded translations')
}

const setupSupabaseWatcher = () => {
  const supabaseWatcher = new SetupSupabase()
  supabaseWatcher.init()
  logger.info('Supabase watcher started')
}

const setupRedisClient = async () => {
  const redisClient = RedisClient.getInstance()
  logger.info('Redis client created')
  await redisClient.connectClient()
  logger.info('Redis client connected')
  await redisClient.connectSubscriber()
  logger.info('Redis subscriber connected')

  // Re-arm clip tasks that a restart dropped from the in-memory DelayedQueue.
  await clipScheduler.rearm()

  // Seed the in-memory invalidTokens cache from Redis so deploys don't re-spam
  // logs for the same population of stale GSI / Twitch tokens.
  await hydrateInvalidTokens()
}

export const startDota = async function startDota(): Promise<void> {
  logger.info('Starting on', { env: process.env.DOTABOD_ENV })
  const [redis, translations] = await Promise.allSettled([setupRedisClient(), setupTranslations()])
  if (redis.status === 'rejected') {
    const reason: unknown = redis.reason
    logger.error('Redis setup failed', { reason })
  }
  if (translations.status === 'rejected') {
    throw new Error('Translation setup failed', { cause: translations.reason })
  }

  const gsiServer = new GSIServer()
  server.setServer(gsiServer)
  gsiServer.listen()
  try {
    setupSupabaseWatcher()
  } catch (error) {
    logger.error('Supabase watcher setup failed', { error })
  }
  startDotaRetentionTelemetry()
}
