import crypto from 'node:crypto'
import fs from 'node:fs'
import axios from 'axios'
// @ts-expect-error no types
import Dota2 from 'dota2'
import { Long } from 'mongodb'
import retry from 'retry'
import Steam from 'steam'
// @ts-expect-error no types
import steamErrors from 'steam-errors'
import MongoDBSingleton from './MongoDBSingleton.js'
import { hasSteamData } from './hasSteamData.js'
import { socketIoServer } from './socketServer.js'
import type { SteamMatchDetails } from './types/SteamMatchDetails.js'
import type { Cards, DelayedGames } from './types/index.js'
import CustomError from './utils/customError.js'
import { getAccountsFromMatch } from './utils/getAccountsFromMatch.js'
import { logger } from './utils/logger.js'
import { retryCustom } from './utils/retry.js'

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
    await db.collection<DelayedGames>('delayedGames').updateOne(
      { 'match.match_id': match_id },
      {
        $set: {
          teams: game.teams,
        },
        $setOnInsert: {
          match: game.match,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    )

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

function sortPlayersBySlot(game: DelayedGames) {
  if (!game.teams || !Array.isArray(game.teams) || game.teams.length !== 2) return
  if (!Array.isArray(game.teams[0].players) || !Array.isArray(game.teams[1].players)) return

  for (const team of game.teams) {
    team.players.sort((a, b) => a.team_slot - b.team_slot)
  }
}

class Dota {
  private interval: NodeJS.Timeout | undefined
  private static instance: Dota
  private cache: Map<number, CacheEntry> = new Map()
  private steamClient
  private steamUser
  public dota2

  constructor() {
    this.steamClient = new Steam.SteamClient()
    // @ts-expect-error no types exist
    this.steamUser = new Steam.SteamUser(this.steamClient)
    this.dota2 = new Dota2.Dota2Client(this.steamClient, false, false)
    this.dota2.setMaxListeners(12)

    const details = this.getUserDetails()

    this.loadServerList()
    this.loadSentry(details)

    this.setupClientEventHandlers(details)
    this.setupUserEventHandlers()
    this.setupDotaEventHandlers()

    // @ts-expect-error no types exist
    this.steamClient.connect()
  }

  // Check if the Dota2 game coordinator is ready
  private isDota2Ready(): boolean {
    return this.dota2._gcReady
  }

  // Check if the Steam client is logged on
  private isSteamClientLoggedOn(): boolean {
    // @ts-expect-error no types exist
    return this.steamClient.loggedOn
  }

  private checkAccounts = async () => {
    if (!this.isDota2Ready() || !this.isSteamClientLoggedOn()) return
    this.getGames()

    if (!this.interval) {
      // Get latest games every 30 seconds
      this.interval = setInterval(this.checkAccounts, 30_000)
    }
  }

  private async getGames() {
    // Check if the Dota2 game coordinator and Steam client are ready
    if (!this.isDota2Ready() || !this.isSteamClientLoggedOn()) return

    const time = new Date()

    try {
      const games = await this.fetchGames()
      const uniqueGames = this.getUniqueGames(games, time)

      if (uniqueGames.length) {
        const mongo = MongoDBSingleton
        const db = await mongo.connect()

        try {
          // Prepare bulk operations
          const bulkOps = uniqueGames.map((game) => ({
            updateOne: {
              filter: { 'match.match_id': game.match_id },
              update: {
                $set: {
                  average_mmr: game.average_mmr,
                  players: game.players,
                  spectators: game.spectators,
                },
                $setOnInsert: {
                  'match.game_mode': game.game_mode,
                  'match.lobby_type': game.lobby_type,
                  'match.server_steam_id': game.server_steam_id,
                  createdAt: time,
                  'match.match_id': game.match_id,
                },
              },
              upsert: true,
            },
          }))

          // Perform bulk write
          await db.collection<DelayedGames>('delayedGames').bulkWrite(bulkOps)
        } catch (e) {
          logger.error('Error saving games:', e)
        } finally {
          await mongo.close()
        }
      }
    } catch (error) {
      logger.error('Error fetching games:', error)
    }
  }

  // Fetch games from the Dota2 game coordinator
  private fetchGames(): Promise<SteamMatchDetails[]> {
    return new Promise((resolve, reject) => {
      if (!this.isDota2Ready() || !this.isSteamClientLoggedOn()) return

      let games: SteamMatchDetails[] = []
      const startGame = 90

      // get a count of the match ids that are unique

      const callbackNotSpecificGames = (data: {
        specific_games: boolean
        game_list: any[]
        league_id: number
        start_game: number
      }) => {
        games = games.concat(data?.game_list?.filter((game) => game.players?.length > 0))
        // add match ids to unique set
        if (data?.league_id === 0 && startGame === data?.start_game) {
          this.dota2.removeListener('sourceTVGamesData', callbackNotSpecificGames)
          resolve(this.filterUniqueGames(games))
        }
      }

      this.dota2.removeListener('sourceTVGamesData', callbackNotSpecificGames)
      this.dota2.on('sourceTVGamesData', callbackNotSpecificGames)

      for (let start = 0; start < 100; start += 10) {
        setTimeout(() => {
          try {
            this.dota2.requestSourceTVGames({ start_game: start })
          } catch (error) {
            logger.error('Error in Dota2Client.requestSourceTVGames:', error)
          }
        }, 50 * start)
      }
    })
  }

  // Filter unique games based on lobby_id
  private filterUniqueGames(games: SteamMatchDetails[]): SteamMatchDetails[] {
    return games.filter(
      (game, index, self) => index === self.findIndex((g) => g.lobby_id.equals(game.lobby_id)),
    )
  }

  // Get unique games and map them to the required structure
  private getUniqueGames(games: SteamMatchDetails[], time: Date) {
    return games
      .map((match) => ({
        match_id: new Long(match.match_id.low, match.match_id.high).toString(),
        players:
          // Removing underscores to save to db, so its in the same format as steam web api delayed games
          match.players?.map((player) => ({
            accountid: player.account_id,
            heroid: player.hero_id,
          })) || [],
        server_steam_id: new Long(match.server_steam_id.low, match.server_steam_id.high).toString(),
        game_mode: match.game_mode,
        spectators: match.spectators,
        lobby_type: match.lobby_type,
        average_mmr: match.average_mmr,
        createdAt: time,
      }))
      .filter(
        (match, index, self) =>
          index === self.findIndex((tempMatch) => tempMatch.match_id === match.match_id),
      )
  }

  getUserDetails() {
    const usernames = process.env.STEAM_USER?.split('|') ?? []
    const passwords = process.env.STEAM_PASS?.split('|') ?? []
    if (!usernames.length || !passwords.length) {
      throw new Error('STEAM_USER or STEAM_PASS not set')
    }

    return {
      account_name: usernames[0],
      password: passwords[0],
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
    if (logonResp.eresult === Steam.EResult.OK) {
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
    // Right when we start, check for accounts
    // This will run every 30 seconds otherwise

    // I'm thinking we already get the live data from the steam server web api
    // The code was fixed to display web data earlier, which this was trying to do
    // this.dota2.on('ready', this.checkAccounts.bind(this))
  }

  handleHelloTimeout() {
    this.dota2.exit()
    setTimeout(() => {
      if (this.isSteamClientLoggedOn()) this.dota2.launch()
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
    return process.env.DOTABOD_ENV === 'production'
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

  fetchAndUpdateCard = async (accountId: number) => {
    let fetchedCard = {
      rank_tier: -10,
      leaderboard_rank: 0,
    }

    if (accountId) {
      fetchedCard = await retryCustom(() => this.getCard(accountId)).catch(() => fetchedCard)
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

  private async fetchProfileCard(account: number): Promise<Cards> {
    return new Promise<Cards>((resolve, reject) => {
      if (!this.isDota2Ready() || !this.isSteamClientLoggedOn())
        reject(new CustomError('Error getting medal'))
      else {
        this.dota2.requestProfileCard(account, (err: any, card: Cards) => {
          if (err) reject(err)
          resolve(card)
        })
      }
    })
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

  public async getCard(account: number): Promise<Cards> {
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
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return entry.timestamp < (this.cache.get(oldest)?.timestamp || 0) ? key : oldest
        },
        null as number | null,
      )

      if (oldestKey !== null) {
        this.cache.delete(oldestKey)
      }
    }
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
          // sort players by team_slot
          sortPlayersBySlot(game)

          await saveMatch({ match_id, game: gamePlusMore })
          if (!forceRefetchAll) {
            // forward the msg to dota node app
            socketIoServer.to('steam').emit('saveHeroesForMatchId', { matchId: match_id, token })
          }
          return resolve(gamePlusMore)
        }

        if (!waitForHeros) {
          // sort players by team_slot
          sortPlayersBySlot(game)

          await saveMatch({ match_id, game: gamePlusMore, refetchCards })
          waitForHeros = true
          operation.retry(new Error())
        }

        return resolve(gamePlusMore)
      })
    })
  }

  public static getInstance(): Dota {
    if (!Dota.instance) Dota.instance = new Dota()
    return Dota.instance
  }

  public exit(): Promise<boolean> {
    return new Promise((resolve) => {
      clearInterval(this.interval)
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

export default Dota
