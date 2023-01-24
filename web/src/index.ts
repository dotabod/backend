import { use } from 'i18next'
import FsBackend, { FsBackendOptions } from 'i18next-fs-backend'

import { logger } from './utils/logger.js'

await use(FsBackend).init<FsBackendOptions>({
  initImmediate: false,
  lng: 'en',
  fallbackLng: 'en',
  returnEmptyString: false,
  returnNull: false,
  preload: ['cs', 'en', 'es', 'it', 'pt', 'pt-BR', 'ru', 'uk-UA', 'hu', 'fa'],
  defaultNS: 'translation',
  backend: {
    loadPath: 'locales/{{lng}}/{{ns}}.json',
  },
})

import './db/watcher.js'
import './dota/index.js'
import './twitch/index.js'
import './twitch/events.js'

logger.info('Starting!')
