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

logger.info('Starting!')

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
  .watch('/app/locales/**/*.json', { ignoreInitial: true, usePolling: true, interval: 5000 })
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

// Set up the supabase watcher
const supabaseWatcher = new SetupSupabase()
supabaseWatcher.init()
logger.info('Supabase watcher started')

// Here's where we force wait for the redis to connect before starting the server
const redisClient = RedisClient.getInstance()
logger.info('Redis client created')
await redisClient.connectClient()
logger.info('Redis client connected')
await redisClient.connectSubscriber()
logger.info('Redis subscriber connected')

// Then set up the dota gsi server & websocket server
export const server = new GSIServer()
