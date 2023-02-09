import axios from 'axios'
import crypto from 'crypto'
// @ts-expect-error ???
import Dota2 from 'dota2'
import fs from 'fs'
import { Long } from 'mongodb'
import retry from 'retry'
import Steam from 'steam'
// @ts-expect-error ???
import steamErrors from 'steam-errors'

import { delayedGames } from '../../prisma/generated/mongoclient/index.js'
import { events } from '../dota/globalEventEmitter.js'
import { getAccountsFromMatch } from '../dota/lib/getAccountsFromMatch.js'
import { GCMatchData } from '../types.js'
import CustomError from '../utils/customError.js'
import { promiseTimeout } from '../utils/index.js'
import { logger } from '../utils/logger.js'
import Mongo from './mongo.js'

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

const waitCustom = (time: number) => new Promise((resolve) => setTimeout(resolve, time || 0))
const retryCustom = (cont: number, fn: () => Promise<any>, delay: number): Promise<any> =>
  fn().catch((err) =>
    cont > 0 ? waitCustom(delay).then(() => retryCustom(cont - 1, fn, delay)) : Promise.reject(err),
  )

const mongo = await Mongo.connect()

interface RealTimeStats {
  steam_server_id: string
  token: string
  itemsOnly?: boolean
  match_id: string
  waitForHeros: boolean
  refetchCards?: boolean
  cb?: (err: Error | null, body: delayedGames | null) => void
}

function hasSteamData(game?: delayedGames | null) {
  const hasTeams = Array.isArray(game?.teams) && game?.teams.length === 2
  const hasPlayers =
    hasTeams &&
    Array.isArray(game.teams[0].players) &&
    Array.isArray(game.teams[1].players) &&
    game.teams[0].players.length === 5 &&
    game.teams[1].players.length === 5
  const hasAccountIds =
    hasPlayers &&
    game.teams[0].players.every((player) => player.accountid) &&
    game.teams[1].players.every((player) => player.accountid)
  const hasHeroes =
    hasPlayers &&
    game.teams[0].players.every((player) => player.heroid) &&
    game.teams[1].players.every((player) => player.heroid)
  return { hasAccountIds, hasHeroes }
}

class Dota {
  private static instance: Dota

  private steamClient

  private steamUser

  public dota2

  constructor() {
    this.steamClient = new Steam.SteamClient()
    // @ts-expect-error ???
    this.steamUser = new Steam.SteamUser(this.steamClient)
    this.dota2 = new Dota2.Dota2Client(this.steamClient, false, false)

    const details: steamUserDetails = {
      account_name: process.env.STEAM_USER!,
      password: process.env.STEAM_PASS!,
    }

    // Load in server list if we've saved one before
    if (fs.existsSync('./src/steam/volumes/servers.json')) {
      try {
        Steam.servers = JSON.parse(fs.readFileSync('./src/steam/volumes/servers.json').toString())
      } catch (e) {
        // Ignore
      }
    }

    if (fs.existsSync('./src/steam/volumes/sentry')) {
      const sentry = fs.readFileSync('./src/steam/volumes/sentry')
      if (sentry.length) details.sha_sentryfile = sentry
    }

    this.steamClient.on('connected', () => {
      this.steamUser.logOn(details)
    })

    this.steamClient.on('logOnResponse', (logonResp: { eresult: any }) => {
      // @ts-expect-error ???
      if (logonResp.eresult == Steam.EResult.OK) {
        logger.info('[STEAM] Logged on.')

        this.dota2.launch()
      } else {
        try {
          steamErrors(logonResp.eresult, (err: any, errorObject: any) => {
            logger.info('[STEAM]', { errorObject, err })
          })
        } catch (e) {
          //
        }
      }
    })

    this.dota2.on('hellotimeout', () => {
      // this.dota2.Logger.debug = () => {};
      this.dota2.exit()
      setTimeout(() => {
        // @ts-expect-error loggedOn is there i swear
        if (this.steamClient.loggedOn) this.dota2.launch()
      }, 30000)
      logger.info('[STEAM] hello time out!')
    })
    this.steamClient.on('loggedOff', (eresult: any) => {
      // @ts-expect-error connect is there i swear
      if (process.env.NODE_ENV === 'production') this.steamClient.connect()
      logger.info('[STEAM] Logged off from Steam.', { eresult })

      try {
        steamErrors(eresult, (err: any, errorObject: any) => {
          logger.info('[STEAM]', { errorObject, err })
        })
      } catch (e) {
        //
      }
    })

    this.steamClient.on('error', (error: any) => {
      logger.info('[STEAM]steam error', { error })
      if (process.env.NODE_ENV !== 'production') void this.exit()
      // @ts-expect-error connect is there i swear
      if (process.env.NODE_ENV === 'production') this.steamClient.connect()
    })
    this.steamClient.on('servers', (servers: { host: string; port: number }) => {
      fs.writeFileSync('./src/steam/volumes/servers.json', JSON.stringify(servers))
    })

    this.steamUser.on(
      'updateMachineAuth',
      (sentry: { bytes: crypto.BinaryLike }, callback: (arg0: { sha_file: Buffer }) => void) => {
        const hashedSentry = crypto.createHash('sha1').update(sentry.bytes).digest()
        fs.writeFileSync('./src/steam/volumes/sentry', hashedSentry)
        logger.info('[STEAM] sentryfile saved')

        callback({ sha_file: hashedSentry })
      },
    )

    this.dota2.on('unready', () => {
      logger.info('[STEAM] disconnected from dota game coordinator')
    })

    // @ts-expect-error connect is there
    this.steamClient.connect()
  }

  // 2 minute delayed match data if it's out of our region
  public getDelayedMatchData = ({
    server_steamid,
    match_id,
    refetchCards = false,
    token,
    itemsOnly = false,
  }: {
    server_steamid: string
    token: string
    match_id: string
    refetchCards?: boolean
    itemsOnly?: boolean
  }) => {
    return new Promise((resolveOuter: (response: delayedGames | null) => void) => {
      void this.GetRealTimeStats({
        steam_server_id: server_steamid,
        token,
        match_id,
        itemsOnly,
        waitForHeros: false,
        refetchCards: refetchCards,
        cb: (err, response) => {
          resolveOuter(response)
        },
      })
    })
  }

  public getUserSteamServer = (steam32Id: number | string) => {
    return new Promise((resolveOuter: (serverSteamId: string | undefined) => void) => {
      this.dota2.spectateFriendGame(
        { steam_id: this.dota2.ToSteamID(Number(steam32Id)) },
        (response: any, err: any) => {
          resolveOuter(response?.server_steamid?.toString())
        },
      )
    })
  }

  public GetRealTimeStats = async ({
    steam_server_id,
    waitForHeros,
    match_id,
    itemsOnly,
    token,
    refetchCards = false,
    cb,
  }: RealTimeStats) => {
    if (!steam_server_id) {
      return cb?.(new Error('Match not found'), null)
    }

    const currentData = (await mongo
      .collection('delayedGames')
      .findOne({ 'match.match_id': match_id })) as unknown as delayedGames | null
    const { hasAccountIds, hasHeroes } = hasSteamData(currentData)
    if (!itemsOnly && currentData && hasHeroes && hasAccountIds) {
      cb?.(null, currentData)
      return
    }

    const operation = retry.operation({
      retries: 8,
      factor: 2,
      minTimeout: 1 * 1000,
    })

    operation.attempt(() => {
      axios(
        `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env
          .STEAM_WEB_API!}&server_steam_id=${steam_server_id}`,
      )
        .then(async (response) => {
          const game = response.data as delayedGames | undefined
          const { hasAccountIds, hasHeroes } = hasSteamData(game)

          if (!hasAccountIds || !game) {
            operation.retry(new Error('Waiting for account ids'))
            return
          }

          if (waitForHeros && !hasHeroes) {
            operation.retry(new Error('Match found, but waiting for hero ids'))
            return
          }

          const delayedData = {
            match: game.match,
            teams: game.teams,
            createdAt: new Date(),
          } as delayedGames

          if ((waitForHeros && hasHeroes) || hasHeroes) {
            const players = getAccountsFromMatch(delayedData)

            if (!itemsOnly) {
              logger.info('Saving match data with heroes', { matchid: match_id })
              await mongo
                .collection('delayedGames')
                .updateOne({ 'match.match_id': match_id }, { $set: delayedData }, { upsert: true })
              events.emit('saveHeroesForMatchId', { matchId: match_id, players }, token)
            }

            cb?.(null, game)

            return
          }

          // No heroes, we have to keep waiting for their items
          if (itemsOnly) {
            operation.retry(new Error('Waiting for hero ids'))
            return
          }

          if (!waitForHeros) {
            logger.info('Saving match data', { matchId: match_id, hasHeroes })
            try {
              await mongo
                .collection('delayedGames')
                .updateOne({ 'match.match_id': match_id }, { $set: delayedData }, { upsert: true })

              // Force get new medals for this match. They could have updated!
              if (refetchCards) {
                const { accountIds } = getAccountsFromMatch(game)
                void this.getCards(accountIds, true)
              }
            } catch (e) {
              logger.info('mongo error saving match', { e })
            }

            // Come back in 8 attempts to save the hero ids. With no cb()
            if (!hasHeroes) {
              logger.info('Waiting for hero ids', { matchId: match_id })
              void this.GetRealTimeStats({
                match_id,
                token,
                steam_server_id: steam_server_id,
                waitForHeros: true,
              })
            }
          }

          cb?.(null, game)
        })
        .catch((e) => {
          logger.info(e?.data)
          operation.retry(new Error('Match not found'))
        })
    })

    // return Promise.reject(new CustomError("Game wasn't found"))
  }

  public getGcMatchData(
    matchId: number | string,
    cb: (err: number | null, body: GCMatchData | null) => void,
  ) {
    const operation = retry.operation({
      retries: 8,
      factor: 2,
      minTimeout: 2 * 1000,
    })

    operation.attempt((currentAttempt: number) => {
      logger.info('[STEAM] requesting match', { matchId, currentAttempt })
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return this.dota2.requestMatchDetails(
        Number(matchId),
        (err: number | null, body: GCMatchData | null) => {
          err && logger.error(err)
          if (err) {
            operation.retry(new Error('Match not found'))
            return
          }

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

          if (operation.retry(arr)) {
            return
          }

          cb(err, body)
        },
      )
    })
  }

  public static getInstance(): Dota {
    if (!Dota.instance) Dota.instance = new Dota()
    return Dota.instance
  }

  public getCards(
    accounts: number[],
    refetchCards = false,
  ): Promise<
    {
      id: number
      lobby_id: number
      createdAt: Date
      rank_tier: number
      leaderboard_rank: number
      lifetime_games: number
    }[]
  > {
    return Promise.resolve().then(async () => {
      const promises = []
      const cards = await mongo
        .collection('cards')
        .find({ id: { $in: accounts } })
        .sort({ createdAt: -1 })
        .toArray()
      const arr: any[] | PromiseLike<any[]> = []
      for (let i = 0; i < accounts.length; i += 1) {
        let needToGetCard = false
        const card: any = cards.find((tempCard) => tempCard.id === accounts[i])
        if (refetchCards || !card || typeof card.rank_tier !== 'number') needToGetCard = true
        else arr[i] = card
        if (needToGetCard) {
          promises.push(
            retryCustom(10, () => this.getCard(accounts[i]), 100)
              .catch(() => ({ rank_tier: -10, leaderboard_rank: 0 }))
              .then(async (temporaryCard) => {
                arr[i] = {
                  ...temporaryCard,
                  id: accounts[i],
                  createdAt: new Date(),
                  rank_tier: temporaryCard.rank_tier || 0,
                  leaderboard_rank: temporaryCard.leaderboard_rank || 0,
                }
                if (temporaryCard.rank_tier !== -10) {
                  await mongo.collection('cards').updateOne(
                    {
                      id: accounts[i],
                    },
                    {
                      $set: {
                        ...temporaryCard,
                        id: accounts[i],
                        createdAt: new Date(),
                        rank_tier: temporaryCard.rank_tier || 0,
                        leaderboard_rank: temporaryCard.leaderboard_rank || 0,
                      },
                    },
                    {
                      upsert: true,
                    },
                  )
                }
              }),
          )
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return Promise.all(promises).then(() => arr)
    })
  }

  public getCard(account: any): Promise<any> {
    return promiseTimeout(
      new Promise((resolve, reject) => {
        // @ts-expect-error asdf
        if (!this.dota2._gcReady || !this.steamClient.loggedOn)
          reject(new CustomError('Error getting medal'))
        else {
          this.dota2.requestProfileCard(account, (err: any, card: any) => {
            if (err) reject(err)
            resolve(card)
          })
        }
      }),
      1000,
      'Error getting medal',
    )
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

const dota = Dota.getInstance()

process
  .on('SIGTERM', () => {
    logger.info('[STEAM] Received SIGTERM')

    Promise.all([dota.exit()])
      .then(() => process.exit(0))
      .catch((e) => {
        logger.info('[STEAM]', e)
      })
  })
  .on('SIGINT', () => {
    logger.info('[STEAM] Received SIGINT')

    Promise.all([dota.exit()])
      .then(() => process.exit(0))
      .catch((e) => {
        logger.info('[STEAM]', e)
      })
  })
  .on('uncaughtException', (e) => logger.error('uncaughtException', e))
