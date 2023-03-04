import './events/gsiEventLoader.js'

import chokidar from 'chokidar'
import { lstatSync, readdirSync } from 'fs'
import i18next from 'i18next'
import FsBackend, { FsBackendOptions } from 'i18next-fs-backend'
import path, { join } from 'path'

import RedisClient from '../db/redis.js'
import SetupSupabase from '../db/watcher.js'
import { logger } from '../utils/logger.js'
import GSIServer from './GSIServer.js'

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
      console.log({ _event, filePath })
      const parsedPath = path.parse(filePath)
      const ns = parsedPath.name
      const lng = path.basename(parsedPath.dir)
      i18next
        .reloadResources([lng], [ns])
        .then(() => {
          logger.info(`Translation reloaded`, { filePath })
        })
        .catch((error) => {
          logger.info(`Translation error on reloading`, { error })
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

const startServer = () => {
  const server = new GSIServer()
  server.init()
  logger.info('GSIServer started')

  return server
}

const main = async () => {
  logger.info('Starting on', { env: process.env.NODE_ENV })

  await setupRedisClient()
  await setupTranslations()
  setupSupabaseWatcher()

  return startServer()
}

export const server = await main()
