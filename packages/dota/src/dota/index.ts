import './events/gsiEventLoader.js'
import { lstatSync, readdirSync } from 'node:fs'
import path, { join } from 'node:path'
import { logger } from '@dotabod/shared-utils'
import chokidar from 'chokidar'
import i18next from 'i18next'
import FsBackend, { type FsBackendOptions } from 'i18next-fs-backend'
import RedisClient from '../db/RedisClient.js'
import SetupSupabase from '../db/watcher.js'
import GSIServer from './GSIServer.js'
import { server } from './server.js'

logger.info("Starting 'dota' package")

const setupTranslations = async () => {
  await i18next.use(FsBackend).init<FsBackendOptions>({
    initImmediate: false,
    lng: 'en',
    fallbackLng: 'en',
    returnEmptyString: false,
    returnNull: false,
    preload: readdirSync(join('./locales')).filter((fileName: string) => {
      const joinedPath = join(join('./locales'), fileName)
      const isDirectory = lstatSync(joinedPath).isDirectory()
      return !!isDirectory
    }),
    defaultNS: 'translation',
    backend: {
      loadPath: join('./locales/{{lng}}/{{ns}}.json'),
    },
  })

  chokidar
    .watch('/app/packages/dota/locales/**/*.json', {
      ignoreInitial: true,
      usePolling: true,
      interval: 5000,
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
}

const initServer = () => {
  const gsiServer = new GSIServer()
  gsiServer.init()
  logger.info('GSIServer started')
  server.setServer(gsiServer)
  return gsiServer
}

const main = async () => {
  logger.info('Starting on', { env: process.env.DOTABOD_ENV })
  try {
    // Run all setup functions in parallel
    const results = await Promise.allSettled([
      setupRedisClient(),
      setupTranslations(),
      Promise.resolve(setupSupabaseWatcher()),
    ])

    // Check which promises failed
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const setupFunctions = ['Redis', 'Translations', 'Supabase']
        logger.error(`${setupFunctions[index]} setup failed`, {
          reason: result.reason,
        })
      }
    })
  } catch (e) {
    logger.error('Error in setup', { e })
  }

  return initServer()
}

const logAndExit = (err: any) => {
  logger.error('Unhandled error occurred. Exiting...', { error: err })
  console.log(err)
  process.exit(1)
}

// Add event listeners to catch uncaught exceptions and unhandled rejections
process.on('uncaughtException', logAndExit)
process.on('unhandledRejection', logAndExit)

// Start the initialization but don't export the promise
main().catch(logAndExit)
