import { use } from 'i18next'
import FsBackend, { FsBackendOptions } from 'i18next-fs-backend'

await use(FsBackend).init<FsBackendOptions>({
  initImmediate: false,
  lng: 'en',
  fallbackLng: 'en',
  returnEmptyString: false,
  returnNull: false,
  preload: ['en', 'es', 'it', 'pt', 'pt-BR', 'ru'],
  defaultNS: 'translation',
  backend: {
    loadPath: 'locales/{{lng}}/{{ns}}.json',
  },
})

import './db/watcher.js'
import './dota/index.js'
import './twitch/index.js'

import { logger } from './utils/logger.js'

logger.info('Starting!')
