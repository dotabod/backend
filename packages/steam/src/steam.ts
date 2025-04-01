import { Dota2User } from './node-dota2-user'
import {
  type CMsgDOTAMatch,
  type CMsgGCMatchDetailsResponse,
  type CMsgGCToClientFindTopSourceTVGamesResponse,
  EDOTAGCMsg,
} from './node-dota2-user/protobufs/index.js'
import { Long } from 'mongodb'
import retry from 'retry'
// @ts-expect-error no types
import steamErrors from 'steam-errors'
// @ts-expect-error no types
import SteamUser from 'steam-user'
import MongoDBSingleton from './MongoDBSingleton.js'
import { hasSteamData } from './hasSteamData.js'
import { socketIoServer } from './socketServer.js'
import type { Cards, DelayedGames } from './types/index.js'
import CustomError from './utils/customError.js'
import { getAccountsFromMatch } from './utils/getAccountsFromMatch.js'
import { logger } from './utils/logger.js'
import { retryCustom } from './utils/retry.js'

interface steamUserDetails {
  accountName: string
  password: string
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
  private steamClient: SteamUser
  public dota2: Dota2User
  public isLoggedOn = false

  constructor() {
    logger.info('[STEAM] Initializing Steam client')
    this.steamClient = new SteamUser({
      renewRefreshTokens: true,
      // Force TCP protocol instead of WebSocket to avoid connection issues
      protocol: SteamUser.EConnectionProtocol.TCP,
    })
    this.dota2 = new Dota2User(this.steamClient)
    this.dota2.setMaxListeners(12)

    const details = this.getUserDetails()
    this.setupClientEventHandlers(details)
  }

  // Check if the Dota2 game coordinator is ready
  private isDota2Ready(): boolean {
    return this.dota2.haveGCSession
  }

  // Check if the Steam client is logged on
  private isSteamClientLoggedOn(): boolean {
    return this.isLoggedOn
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
  private fetchGames(): Promise<CMsgGCToClientFindTopSourceTVGamesResponse['gameList']> {
    return new Promise((resolve, reject) => {
      if (!this.isDota2Ready() || !this.isSteamClientLoggedOn()) return

      let games: CMsgGCToClientFindTopSourceTVGamesResponse['gameList'] = []
      let receivedResponses = 0
      const totalRequests = 10 // We'll make 10 requests (0 to 90 by 10)

      // Handler for the response
      const handleSourceTVGamesResponse = (data: CMsgGCToClientFindTopSourceTVGamesResponse) => {
        if (data.gameList && Array.isArray(data.gameList)) {
          const mappedGames = data.gameList
            .filter((game) => game.players?.length > 0)
            .map((game) => game)

          games = games.concat(mappedGames)
        }

        receivedResponses++

        // When we've received all expected responses, resolve the promise
        if (receivedResponses >= totalRequests) {
          this.dota2.router.removeListener(
            EDOTAGCMsg.k_EMsgGCToClientFindTopSourceTVGamesResponse,
            handleSourceTVGamesResponse,
          )
          resolve(this.filterUniqueGames(games))
        }
      }

      // Remove any existing listeners to avoid duplicates
      this.dota2.router.removeListener(
        EDOTAGCMsg.k_EMsgGCToClientFindTopSourceTVGamesResponse,
        handleSourceTVGamesResponse,
      )

      // Set up the listener for responses
      this.dota2.router.on(EDOTAGCMsg.k_EMsgGCToClientFindTopSourceTVGamesResponse, (data) =>
        handleSourceTVGamesResponse(data),
      )

      // Send requests with different start_game values
      for (let start = 0; start < 100; start += 10) {
        setTimeout(() => {
          try {
            this.dota2.sendPartial(EDOTAGCMsg.k_EMsgClientToGCFindTopSourceTVGames, {
              startGame: start,
            })
          } catch (error) {
            logger.error('Error sending FindTopSourceTVGames request:', error)
          }
        }, 50 * start)
      }
    })
  }

  // Filter unique games based on lobby_id
  private filterUniqueGames(
    games: CMsgGCToClientFindTopSourceTVGamesResponse['gameList'],
  ): CMsgGCToClientFindTopSourceTVGamesResponse['gameList'] {
    return games.filter((game, index, self) => {
      if (!game.lobbyId) return false
      return index === self.findIndex((g) => g.lobbyId === game.lobbyId)
    })
  }

  // Get unique games and map them to the required structure
  private getUniqueGames(
    games: CMsgGCToClientFindTopSourceTVGamesResponse['gameList'],
    time: Date,
  ) {
    return games
      .map((match) => ({
        match_id: match.matchId,
        players:
          // Removing underscores to save to db, so its in the same format as steam web api delayed games
          match.players?.map((player) => ({
            accountid: player.accountId,
            heroid: player.heroId,
          })) || [],
        server_steam_id: match.serverSteamId,
        game_mode: match.gameMode,
        spectators: match.spectators,
        lobby_type: match.lobbyType,
        average_mmr: match.averageMmr,
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
      accountName: usernames[0],
      password: passwords[0],
    }
  }

  setupClientEventHandlers(details: steamUserDetails) {
    if (!this.steamClient) {
      logger.error('[STEAM] Steam client not initialized')
      return
    }
    logger.info('[STEAM] Logging on to Steam')
    this.steamClient.logOn(details)
    this.steamClient.on('loggedOn', () => {
      this.isLoggedOn = true
      logger.info('[STEAM] Logged on.')
      this.steamClient.gamesPlayed(Dota2User.STEAM_APPID)
      this.setupDotaEventHandlers()
    })
    this.steamClient.on('logOnResponse', this.handleLogOnResponse.bind(this))
    this.steamClient.on('loggedOff', this.handleLoggedOff.bind(this))
    this.steamClient.on('error', this.handleClientError.bind(this))
  }

  handleLogOnResponse(logonResp: any) {
    // @ts-expect-error no types exist
    if (logonResp.eresult === Steam.EResult.OK) {
      logger.info('[STEAM] Logged on.')
    } else {
      this.logSteamError(logonResp.eresult)
    }
  }

  handleLoggedOff(eresult: any) {
    if (this.isProduction()) this.steamClient.connect()
    logger.info('[STEAM] Logged off from Steam.', { eresult })
    this.logSteamError(eresult)
  }

  handleClientError(error: any) {
    logger.info('[STEAM] steam error', { error })
    if (!this.isProduction()) {
      this.exit().catch((e) => logger.error('err steam error', { e }))
    }
    if (this.isProduction()) this.steamClient.connect()
  }

  setupDotaEventHandlers() {
    this.dota2.on('unready', () => logger.info('[STEAM] disconnected from dota game coordinator'))

    // Right when we start, check for accounts
    // This will run every 30 seconds otherwise
    if (this.isProduction()) {
      this.dota2.on('connectedToGC', () => {
        console.log('connectedToGC prod!')
        this.checkAccounts()
      })
    } else {
      this.dota2.on('connectedToGC', () => {
        console.log('connectedToGC dev!')
        this.fetchProfileCard(387140531)
          .then((res) => {
            console.log({ res })
          })
          .catch((err) => {
            console.log({ err })
          })
      })
    }
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
    const steam_id = new Long(Number(steam32Id)).add('76561197960265728')

    // Set up the retry operation
    const operation = retry.operation({
      retries: 35,
      factor: 1.1,
      minTimeout: 5000, // Minimum retry timeout (1 second)
      maxTimeout: 10_000, // Maximum retry timeout (10 seconds)
    })

    return new Promise((resolve, reject) => {
      operation.attempt(() => {
        // Send WatchGame message to the GC
        this.dota2.send(EDOTAGCMsg.k_EMsgGCSpectateFriendGame, {
          steamId: steam_id.toString(),
          live: false,
        })

        // Set up a one-time listener for the response
        this.dota2.router.once(EDOTAGCMsg.k_EMsgGCSpectateFriendGameResponse, (response) => {
          const theID = response?.serverSteamid?.toString()

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

  public requestMatchMinimalDetails = (
    matchIds: number[],
  ): Promise<{ matches: CMsgDOTAMatch[]; last_match: boolean }> => {
    return new Promise((resolve, reject) => {
      if (!this.isDota2Ready() || !this.isSteamClientLoggedOn())
        reject(new CustomError('Not connected to Dota 2 GC'))
      else {
        // Send the match details request using callback pattern
        this.dota2.sendWithCallback(
          EDOTAGCMsg.k_EMsgGCMatchDetailsRequest,
          {
            matchId: matchIds[0].toString(), // Assuming we want details for the first match ID
          },
          EDOTAGCMsg.k_EMsgGCMatchDetailsResponse,
          (data: CMsgGCMatchDetailsResponse) => {
            if (!data || !data.match) {
              reject(new Error('No match details received'))
              return
            }
            // Convert CMsgGCMatchDetailsResponse to MatchMinimalDetailsResponse format
            const response = {
              matches: [data.match],
              last_match: true,
            }
            resolve(response)
          },
        )
      }
    })
  }

  private async fetchProfileCard(account: number): Promise<Cards> {
    return new Promise<Cards>((resolve, reject) => {
      if (!this.isDota2Ready() || !this.isSteamClientLoggedOn())
        reject(new CustomError('Error getting medal'))
      else {
        // Send the profile card request
        this.dota2.sendWithCallback(
          EDOTAGCMsg.k_EMsgClientToGCGetProfileCard,
          {
            accountId: account,
          },
          EDOTAGCMsg.k_EMsgClientToGCGetProfileCardResponse,
          (data) => {
            if (!data) {
              reject(new Error('No profile card data received'))
              return
            }
            const returnResponse = {
              lifetime_games: data.lifetimeGames,
              account_id: data.accountId,
              leaderboard_rank: data.leaderboardRank,
              rank_tier: data.rankTier,
              createdAt: new Date(),
            }
            resolve(returnResponse)
          },
        )
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

  public static getInstance(): Dota {
    if (!Dota.instance) Dota.instance = new Dota()
    return Dota.instance
  }

  public exit(): Promise<boolean> {
    return new Promise((resolve) => {
      clearInterval(this.interval)
      logger.info('[STEAM] Manually closed dota')
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

// Add a debounce map to track in-flight requests by match_id
const activeRequests = new Map<string, Promise<DelayedGames>>()

export const GetRealTimeStats = async ({
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
  // Debounce: If there's already an active request for this match_id, return that promise
  if (activeRequests.has(match_id)) {
    logger.info(`[STEAM] Reusing in-flight request for match_id: ${match_id}`)
    return activeRequests.get(match_id)!
  }

  let waitForHeros = forceRefetchAll || false

  if (!steam_server_id) {
    throw new Error('Match not found')
  }

  if (process.env.DOTABOD_ENV === 'production') {
    const currentData = await fetchDataFromMongo(match_id)
    const { hasAccountIds, hasHeroes } = hasSteamData(currentData)

    // can early exit if we have all the data we need
    if (currentData && hasHeroes && hasAccountIds && !forceRefetchAll) {
      return currentData
    }
  }

  const operation = retry.operation({
    retries: 35,
    factor: 1.1,
    minTimeout: 5000, // Minimum retry timeout (1 second)
    maxTimeout: 10_000, // Maximum retry timeout (10 seconds)
  })

  const requestPromise = new Promise<DelayedGames>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    operation.attempt(async (currentAttempt) => {
      let game: DelayedGames
      try {
        const apiUrl = getApiUrl(steam_server_id)
        const response = await fetch(apiUrl)

        // Handle rate limiting (403)
        if (response.status === 403 || response.status === 429) {
          logger.warn('[STEAM] Rate limited with 403 response. Backing off...')
          // Exponential backoff with longer delay for rate limiting
          const backoffDelay = Math.min(30000, 5000 * 2 ** (currentAttempt - 1))
          await new Promise((r) => setTimeout(r, backoffDelay))
          return operation.retry(new Error('Rate limited with 403'))
        }

        if (!response.ok) {
          logger.info('apiUrl:', { apiUrl })
          throw new Error(`HTTP error! Status: ${response.status}`)
        }
        game = (await response.json()) as DelayedGames
      } catch (e) {
        logger.error('[STEAM] Failed to fetch game data:', { e })
        return operation.retry(new Error('Match not found'))
      }
      const { hasAccountIds, hasHeroes } = hasSteamData(game)
      // needs account ids
      const retryAttempt = !hasAccountIds || !game ? new Error() : undefined
      if (operation.retry(retryAttempt)) {
        return
      }

      // needs hero data
      const retryAttempt2 = waitForHeros && !hasHeroes ? new Error() : undefined
      if (operation.retry(retryAttempt2)) {
        return
      }

      // 2-minute delay gives "0" match id, so we use the gsi match id instead
      game.match.match_id = match_id
      game.match.server_steam_id = steam_server_id
      const gamePlusMore = { ...game, createdAt: new Date() }

      if (hasHeroes) {
        // sort players by team_slot
        sortPlayersBySlot(game)

        if (process.env.DOTABOD_ENV === 'production') {
          await saveMatch({ match_id, game: gamePlusMore })
        }

        if (!forceRefetchAll) {
          // forward the msg to dota node app
          socketIoServer.to('steam').emit('saveHeroesForMatchId', { matchId: match_id, token })
        }

        // Remove from active requests before resolving
        activeRequests.delete(match_id)
        return resolve(gamePlusMore)
      }

      if (!waitForHeros) {
        // sort players by team_slot
        sortPlayersBySlot(game)

        await saveMatch({ match_id, game: gamePlusMore, refetchCards })
        waitForHeros = true
        operation.retry(new Error())
      }

      // Remove from active requests before resolving
      activeRequests.delete(match_id)
      return resolve(gamePlusMore)
    })
  })

  // Store the request promise in the map to enable debouncing
  activeRequests.set(match_id, requestPromise)

  // Add a cleanup in case of errors to prevent memory leaks
  requestPromise.catch(() => {
    activeRequests.delete(match_id)
  })

  return requestPromise
}

export default Dota
