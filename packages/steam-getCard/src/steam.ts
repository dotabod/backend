import crypto from 'crypto'
import fs from 'fs'

// @ts-expect-error no types exist
import Dota2 from 'dota2'
import Steam from 'steam'
// @ts-expect-error no types exist
import steamErrors from 'steam-errors'

import { Cards } from './types/index.js'
import CustomError from './utils/customError.js'
import { logger } from './utils/logger.js'

interface steamUserDetails {
  account_name: string
  password: string
  sha_sentryfile?: Buffer
}

interface CacheEntry {
  timestamp: number
  card: Cards
}

const MAX_CACHE_SIZE = 5000
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

class Dota {
  private cache: Map<number, CacheEntry> = new Map()

  private static instance: Dota

  private steamClient

  private steamUser

  public dota2

  constructor() {
    this.steamClient = new Steam.SteamClient()
    // @ts-expect-error no types exist
    this.steamUser = new Steam.SteamUser(this.steamClient)
    this.dota2 = new Dota2.Dota2Client(this.steamClient, true, true)

    const details = this.getUserDetails()

    this.loadServerList()
    this.loadSentry(details)

    this.setupClientEventHandlers(details)
    this.setupUserEventHandlers()
    this.setupDotaEventHandlers()

    // @ts-expect-error no types exist
    this.steamClient.connect()
  }

  getUserDetails() {
    const usernames = process.env.STEAM_USER?.split('|') ?? []
    const passwords = process.env.STEAM_PASS?.split('|') ?? []
    if (!usernames.length || !passwords.length) {
      throw new Error('STEAM_USER or STEAM_PASS not set')
    }

    return {
      account_name: usernames[1],
      password: passwords[1],
    }
  }

  loadServerList() {
    const serverPath = './src/steam/volumes/servers.json'
    if (fs.existsSync(serverPath)) {
      try {
        Steam.servers = JSON.parse(fs.readFileSync(serverPath).toString())
      } catch (e) {
        // Ignore
      }
    }
  }

  loadSentry(details: steamUserDetails) {
    const sentryPath = './src/steam/volumes/sentry'
    if (fs.existsSync(sentryPath)) {
      const sentry = fs.readFileSync(sentryPath)
      if (sentry.length) details.sha_sentryfile = sentry
    }
  }

  setupClientEventHandlers(details: steamUserDetails) {
    this.steamClient.on('connected', () => {
      this.steamUser.logOn(details)
    })
    this.steamClient.on('logOnResponse', this.handleLogOnResponse.bind(this))
    this.steamClient.on('loggedOff', this.handleLoggedOff.bind(this))
    this.steamClient.on('error', this.handleClientError.bind(this))
    this.steamClient.on('servers', this.handleServerUpdate.bind(this))
  }

  handleLogOnResponse(logonResp: any) {
    // @ts-expect-error no types exist
    if (logonResp.eresult == Steam.EResult.OK) {
      logger.info('[STEAM] Logged on.')
      this.dota2.launch()
    } else {
      this.logSteamError(logonResp.eresult)
    }
  }

  handleLoggedOff(eresult: any) {
    // @ts-expect-error no types exist
    if (this.isProduction()) this.steamClient.connect()
    logger.info('[STEAM] Logged off from Steam.', { eresult })
    this.logSteamError(eresult)
  }

  handleClientError(error: any) {
    logger.info('[STEAM] steam error', { error })
    if (!this.isProduction()) {
      this.exit().catch((e) => logger.error('err steam error', { e }))
    }
    // @ts-expect-error no types exist
    if (this.isProduction()) this.steamClient.connect()
  }

  handleServerUpdate(servers: any) {
    fs.writeFileSync('./src/steam/volumes/servers.json', JSON.stringify(servers))
  }

  setupUserEventHandlers() {
    this.steamUser.on('updateMachineAuth', this.handleMachineAuth.bind(this))
  }

  // @ts-expect-error no types exist
  handleMachineAuth(sentry, callback) {
    const hashedSentry = crypto.createHash('sha1').update(sentry.bytes).digest()
    fs.writeFileSync('./src/steam/volumes/sentry', hashedSentry)
    logger.info('[STEAM] sentryfile saved')
    callback({ sha_file: hashedSentry })
  }

  setupDotaEventHandlers() {
    this.dota2.on('hellotimeout', this.handleHelloTimeout.bind(this))
    this.dota2.on('unready', () => logger.info('[STEAM] disconnected from dota game coordinator'))
  }

  handleHelloTimeout() {
    this.dota2.exit()
    setTimeout(() => {
      // @ts-expect-error no types exist
      if (this.steamClient.loggedOn) this.dota2.launch()
    }, 30000)
    logger.info('[STEAM] hello time out!')
  }

  // @ts-expect-error no types exist
  logSteamError(eresult) {
    try {
      // @ts-expect-error no types exist
      steamErrors(eresult, (err, errorObject) => {
        logger.info('[STEAM]', { errorObject, err })
      })
    } catch (e) {
      // Ignore
    }
  }

  isProduction() {
    return process.env.NODE_ENV === 'production'
  }

  public static getInstance(): Dota {
    if (!Dota.instance) Dota.instance = new Dota()
    return Dota.instance
  }

  promiseTimeout = <T>(promise: Promise<T>, ms: number, reason: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let timeoutCleared = false
      const timeoutId = setTimeout(() => {
        timeoutCleared = true
        reject(new CustomError(reason))
      }, ms)
      promise
        .then((result) => {
          if (!timeoutCleared) {
            clearTimeout(timeoutId)
            resolve(result)
          }
        })
        .catch((err) => {
          if (!timeoutCleared) {
            clearTimeout(timeoutId)
            reject(err)
          }
        })
    })

  private async fetchProfileCard(account: number): Promise<Cards> {
    return new Promise<Cards>((resolve, reject) => {
      // @ts-expect-error no types exist for `loggedOn`
      if (!this.dota2._gcReady || !this.steamClient.loggedOn)
        reject(new CustomError('Error getting medal'))
      else {
        this.dota2.requestProfileCard(account, (err: any, card: Cards) => {
          if (err) reject(err)
          resolve(card)
        })
      }
    })
  }

  public async getCard(account: number): Promise<any> {
    const now = Date.now()
    const cacheEntry = this.cache.get(account)

    if (cacheEntry && now - cacheEntry.timestamp < CACHE_TTL) {
      return cacheEntry.card
    }

    // If not cached or cache is stale, fetch the profile card
    const card = await this.promiseTimeout(
      this.fetchProfileCard(account),
      1000,
      'Error getting medal',
    )

    this.evictOldCacheEntries() // Evict entries based on time
    this.cache.set(account, {
      timestamp: now,
      card: card,
    })

    this.evictExtraCacheEntries() // Evict extra entries if cache size exceeds MAX_CACHE_SIZE

    return card
  }

  private evictOldCacheEntries() {
    const now = Date.now()
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        this.cache.delete(key)
      }
    }
  }

  private evictExtraCacheEntries() {
    while (this.cache.size > MAX_CACHE_SIZE) {
      const oldestKey = [...this.cache.entries()].reduce(
        (oldest, [key, entry]) => {
          if (!oldest) return key
          return entry.timestamp < this.cache.get(oldest)!.timestamp ? key : oldest
        },
        null as number | null,
      )

      if (oldestKey !== null) {
        this.cache.delete(oldestKey)
      }
    }
  }

  public exit(): Promise<boolean> {
    return new Promise((resolve) => {
      this.dota2.exit()
      logger.info('[STEAM] Manually closed dota')
      // @ts-expect-error disconnect is there
      this.steamClient.disconnect()
      logger.info('[STEAM] Manually closed steam')
      this.steamClient.removeAllListeners()
      this.dota2.removeAllListeners()
      logger.info('[STEAM] Removed all listeners from dota and steam')
      resolve(true)
    })
  }
}

export default Dota

process
  .on('SIGTERM', () => {
    logger.info('[STEAM] Received SIGTERM')

    const dota = Dota.getInstance()
    Promise.all([dota.exit()])
      .then(() => process.exit(0))
      .catch((e) => {
        logger.info('[STEAM]', e)
      })
  })
  .on('SIGINT', () => {
    logger.info('[STEAM] Received SIGINT')

    const dota = Dota.getInstance()
    Promise.all([dota.exit()])
      .then(() => process.exit(0))
      .catch((e) => {
        logger.info('[STEAM]', e)
      })
  })
  .on('uncaughtException', (e) => logger.error('uncaughtException', e))
