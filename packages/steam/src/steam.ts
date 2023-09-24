import crypto from 'crypto'
import fs from 'fs'

import axios from 'axios'
import Dota2 from 'dota2-fork'
import { Long } from 'mongodb'
import retry from 'retry'
import Steam from 'steam-fork'
// @ts-expect-error no types exist
import steamErrors from 'steam-errors'

import MongoDBSingleton from './MongoDBSingleton.js'
import { Cards, DelayedGames, GCMatchData } from './types/index.js'
import CustomError from './utils/customError.js'
import { getAccountsFromMatch } from './utils/getAccountsFromMatch.js'
import { logger } from './utils/logger.js'
import { retryCustom } from './utils/retry.js'

import io from './index.js'

const isDev = process.env.NODE_ENV === 'development'

// Fetches data from MongoDB
const fetchDataFromMongo = async (match_id: string) => {
  const mongo = MongoDBSingleton
  const db = await mongo.connect()

  try {
    return await db.collection<DelayedGames>('delayedGames').findOne({ 'match.match_id': match_id })
  } finally {
    await mongo.close()
  }
}

// Constructs the API URL
const getApiUrl = (steam_server_id: string) => {
  if (!process.env.STEAM_WEB_API) throw new CustomError('STEAM_WEB_API not set')

  return `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steam_server_id}`
}

// Saves the match to MongoDB and fetches new medals if needed
const saveMatch = async ({
  match_id,
  game,
  refetchCards = false,
}: {
  match_id: string
  game: DelayedGames
  refetchCards?: boolean
}) => {
  const mongo = MongoDBSingleton
  const db = await mongo.connect()

  try {
    await db
      .collection<DelayedGames>('delayedGames')
      .updateOne({ 'match.match_id': match_id }, { $set: game }, { upsert: true })

    if (refetchCards) {
      const { accountIds } = await getAccountsFromMatch({
        searchMatchId: game.match.match_id,
      })
      const dota = Dota.getInstance()
      await dota.getCards(accountIds, true)
    }
  } finally {
    await mongo.close()
  }
}

function onGCSpectateFriendGameResponse(message: any, callback: any) {
  const response: { server_steamid: Long; watch_live_result: number } =
    Dota2.schema.CMsgSpectateFriendGameResponse.decode(message)
  if (callback !== undefined) {
    callback(response)
  }
}

Dota2.Dota2Client.prototype.spectateFriendGame = function (
  friend: { steam_id: number; live: boolean },
  callback: any,
) {
  callback = callback || null
  if (!this._gcReady) {
    logger.info("[STEAM] GC not ready, please listen for the 'ready' event.")
    return null
  }
  // CMsgSpectateFriendGame
  const payload = new Dota2.schema.CMsgSpectateFriendGame(friend)
  this.sendToGC(
    Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGame,
    payload,
    onGCSpectateFriendGameResponse,
    callback,
  )
}

const handlers = Dota2.Dota2Client.prototype._handlers
handlers[Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGameResponse] =
  onGCSpectateFriendGameResponse

interface steamUserDetails {
  account_name: string
  password: string
  sha_sentryfile?: Buffer
}

function hasSteamData(game?: DelayedGames | null) {
  const hasTeams = Array.isArray(game?.teams) && game?.teams.length === 2
  const hasPlayers =
    hasTeams &&
    Array.isArray(game.teams[0].players) &&
    Array.isArray(game.teams[1].players) &&
    game.teams[0].players.length === 5 &&
    game.teams[1].players.length === 5

  // Dev should be able to test in a lobby with bot matches
  const hasAccountIds = isDev
    ? hasPlayers // dev local lobby just needs the players array
    : hasPlayers &&
      game.teams[0].players.every((player) => player.accountid) &&
      game.teams[1].players.every((player) => player.accountid)
  const hasHeroes =
    hasPlayers &&
    game.teams[0].players.every((player) => player.heroid) &&
    game.teams[1].players.every((player) => player.heroid)
  return { hasAccountIds, hasPlayers, hasHeroes }
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
    if (!process.env.STEAM_USER || !process.env.STEAM_PASS) {
      throw new Error('STEAM_USER or STEAM_PASS not set')
    }

    return {
      account_name: process.env.STEAM_USER,
      password: process.env.STEAM_PASS,
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

  public getUserSteamServer = (steam32Id: number | string): Promise<string> => {
    const steam_id = this.dota2.ToSteamID(Number(steam32Id))

    // Set up the retry operation
    const operation = retry.operation({
      retries: 35,
      factor: 1.1,
      minTimeout: 5000, // Minimum retry timeout (1 second)
      maxTimeout: 10_000, // Maximum retry timeout (10 seconds)
    })

    return new Promise((resolve, reject) => {
      operation.attempt(() => {
        this.dota2.spectateFriendGame({ steam_id }, (response: any, err: any) => {
          const theID = response?.server_steamid?.toString()

          const shouldRetry = !theID ? new Error('No ID yet, will keep trying.') : undefined
          if (operation.retry(shouldRetry)) return

          if (theID) resolve(theID)
          else reject('No spectator match found')
        })
      })
    })
  }

  public GetRealTimeStats = async ({
    match_id,
    refetchCards = false,
    steam_server_id,
    token,
    forceRefetchAll = false,
  }: {
    forceRefetchAll?: boolean
    match_id: string
    refetchCards?: boolean
    steam_server_id: string
    token: string
  }): Promise<DelayedGames> => {
    let waitForHeros = forceRefetchAll || false

    if (!steam_server_id) {
      throw new Error('Match not found')
    }

    const currentData = await fetchDataFromMongo(match_id)
    const { hasAccountIds, hasHeroes } = hasSteamData(currentData)

    // can early exit if we have all the data we need
    if (currentData && hasHeroes && hasAccountIds && !forceRefetchAll) {
      return currentData
    }

    const operation = retry.operation({
      retries: 35,
      factor: 1.1,
      minTimeout: 5000, // Minimum retry timeout (1 second)
      maxTimeout: 10_000, // Maximum retry timeout (10 seconds)
    })

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      operation.attempt(async (currentAttempt) => {
        let game: DelayedGames
        try {
          game = (await axios<DelayedGames>(getApiUrl(steam_server_id)))?.data
        } catch (e) {
          return operation.retry(new Error('Match not found'))
        }
        const { hasAccountIds, hasHeroes } = hasSteamData(game)

        // needs account ids
        const retryAttempt = !hasAccountIds || !game ? new Error() : undefined
        if (operation.retry(retryAttempt)) return

        // needs hero data
        const retryAttempt2 = waitForHeros && !hasHeroes ? new Error() : undefined
        if (operation.retry(retryAttempt2)) return

        // 2-minute delay gives "0" match id, so we use the gsi match id instead
        game.match.match_id = match_id
        game.match.server_steam_id = steam_server_id
        const gamePlusMore = { ...game, createdAt: new Date() }

        if (hasHeroes) {
          await saveMatch({ match_id, game: gamePlusMore })
          if (!forceRefetchAll) {
            // forward the msg to dota node app
            io.to('steam').emit('saveHeroesForMatchId', { matchId: match_id, token })
          }
          return resolve(gamePlusMore)
        }

        if (!waitForHeros) {
          await saveMatch({ match_id, game: gamePlusMore, refetchCards })
          waitForHeros = true
          operation.retry(new Error())
        }

        return resolve(gamePlusMore)
      })
    })
  }

  // @DEPRECATED
  public getGcMatchData(
    matchId: number | string,
    cb: (err: number | null, body: GCMatchData | null) => void,
  ) {
    const operation = retry.operation({
      retries: 8,
      factor: 1,
      minTimeout: 2000,
    })

    operation.attempt((currentAttempt: number) => {
      logger.info('[STEAM] requesting match', { matchId, currentAttempt })
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return this.dota2.requestMatchDetails(
        Number(matchId),
        (err: number | null, body: GCMatchData | null) => {
          err && logger.error(err)
          if (operation.retry(err ? new Error('Match not found') : undefined)) return

          let arr: Error | undefined
          if (body?.match?.players) {
            body.match.players = body.match.players.map((p: any) => {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-return
              return {
                ...p,
                party_size: body.match?.players.filter(
                  (matchPlayer: any) => matchPlayer.party_id?.low === p.party_id?.low,
                ).length,
              }
            })

            logger.info('[STEAM] received match', { matchId })
          } else {
            arr = new Error('Match not found')
          }

          if (operation.retry(arr)) return

          cb(err, body)
        },
      )
    })
  }

  public static getInstance(): Dota {
    if (!Dota.instance) Dota.instance = new Dota()
    return Dota.instance
  }

  fetchAndUpdateCard = async (accountId: number) => {
    const fetchedCard = accountId
      ? await retryCustom(() => this.getCard(accountId)).catch(() => ({
          rank_tier: -10,
          leaderboard_rank: 0,
        }))
      : undefined

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

  public async getCard(account: number): Promise<Cards> {
    // @ts-expect-error no types exist for `loggedOn`
    if (!this.dota2._gcReady || !this.steamClient.loggedOn) {
      throw new CustomError('Error getting medal')
    }

    return new Promise((resolve, reject) => {
      this.dota2.requestProfileCard(account, (err: any, card: Cards) => {
        if (err) reject(err)
        else resolve(card)
      })
    })
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
