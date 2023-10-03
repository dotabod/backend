import crypto from 'crypto'
import fs from 'fs'

// @ts-expect-error no types exist
import Dota2 from 'dota2'
import Steam from 'steam'
// @ts-expect-error no types exist
import steamErrors from 'steam-errors'

import MongoDBSingleton from './MongoDBSingleton.js'
import { Cards } from './types/index.js'
import { logger } from './utils/logger.js'
import { retryCustom } from './utils/retry.js'
import { getCardSocket } from './ws.js'

interface steamUserDetails {
  account_name: string
  password: string
  sha_sentryfile?: Buffer
}

class Dota {
  private static instance: Dota

  private steamClient

  private steamUser

  public dota2

  constructor() {
    this.steamClient = new Steam.SteamClient()
    // @ts-expect-error no types exist
    this.steamUser = new Steam.SteamUser(this.steamClient)
    this.dota2 = new Dota2.Dota2Client(this.steamClient, false, false)

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
      account_name: usernames[2],
      password: passwords[2],
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

  fetchAndUpdateCard = async (accountId: number) => {
    let fetchedCard = {
      rank_tier: -10,
      leaderboard_rank: 0,
    }

    if (accountId) {
      fetchedCard = await retryCustom(() => {
        return new Promise<Cards>((resolve, reject) => {
          getCardSocket.emit('getCard', accountId, (err: any, card: Cards) => {
            if (err) {
              reject(err)
            } else {
              resolve(card)
            }
          })
        })
      }).catch(() => ({
        rank_tier: -10,
        leaderboard_rank: 0,
      }))
    }

    const card = {
      ...fetchedCard,
      account_id: accountId,
      createdAt: new Date(),
      rank_tier: fetchedCard?.rank_tier ?? 0,
      leaderboard_rank: fetchedCard?.leaderboard_rank ?? 0,
    } as Cards

    if (!accountId) return card

    if (fetchedCard?.rank_tier !== -10) {
      const mongo = MongoDBSingleton
      const db = await mongo.connect()

      try {
        await db
          .collection<Cards>('cards')
          .updateOne({ account_id: accountId }, { $set: card }, { upsert: true })
      } finally {
        await mongo.close()
      }
    }

    return card
  }

  public async getCards(accounts: number[], refetchCards = false): Promise<Cards[]> {
    const mongo = MongoDBSingleton
    const db = await mongo.connect()

    try {
      const cardsFromDb = await db
        .collection<Cards>('cards')
        .find({ account_id: { $in: accounts.filter((a) => !!a) } })
        .sort({ createdAt: -1 })
        .toArray()

      const cardsMap = new Map(cardsFromDb.map((card) => [card.account_id, card]))

      const promises = accounts.map(async (accountId) => {
        const existingCard = cardsMap.get(accountId)
        if (refetchCards || !existingCard || typeof existingCard.rank_tier !== 'number') {
          return this.fetchAndUpdateCard(accountId)
        }
        return existingCard
      })

      return Promise.all(promises)
    } finally {
      await mongo.close()
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
