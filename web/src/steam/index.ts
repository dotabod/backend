import crypto from 'crypto'
import fs from 'fs'

import axios from 'axios'
// @ts-expect-error ???
import Dota2 from 'dota2'
import Long from 'long'
import retry from 'retry'
import Steam from 'steam'
// @ts-expect-error ???
import steamErrors from 'steam-errors'

import CustomError from '../utils/customError.js'
import { promiseTimeout } from '../utils/index.js'
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
    console.log("GC not ready, please listen for the 'ready' event.")
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

interface Game {
  average_mmr: number
  game_mode: number
  league_id: number
  match_id: Long
  lobby_id: Long
  lobby_type: 0
  players: { hero_id: number; account_id: number }[]
  server_steam_id: Long
  weekend_tourney_bracket_round: null
  weekend_tourney_skill_level: null
  createdAt: Date
}

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

const mongo = Mongo.getInstance()

class Dota {
  private static instance: Dota

  private steamClient

  private steamUser

  public dota2

  private interval?: NodeJS.Timer

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
        console.log('[STEAM]', 'Logged on.')

        this.dota2.launch()
      } else {
        try {
          steamErrors(logonResp.eresult, (err: any, errorObject: any) => {
            console.log(errorObject, err)
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
      console.log('hello time out!')
    })
    this.steamClient.on('loggedOff', (eresult: any) => {
      // @ts-expect-error connect is there i swear
      if (process.env.NODE_ENV === 'production') this.steamClient.connect()
      console.log('Logged off from Steam.', eresult)

      try {
        steamErrors(eresult, (err: any, errorObject: any) => {
          console.log(errorObject, err)
        })
      } catch (e) {
        //
      }
    })

    this.steamClient.on('error', (error: any) => {
      console.log(`steam error`, error)
      if (process.env.NODE_ENV !== 'production') this.exit()
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
        console.log('sentryfile saved')

        callback({ sha_file: hashedSentry })
      },
    )

    this.dota2.on('ready', () => {
      console.log('connected to dota game coordinator')
    })

    this.dota2.on('unready', () => {
      console.log('disconnected from dota game coordinator')
    })

    // @ts-expect-error connect is there
    this.steamClient.connect()
  }

  // 2 minute delayed match data if its out of our region
  public getDelayedMatchData = (server_steamid: string) => {
    return new Promise((resolveOuter) => {
      this.GetRealTimeStats(server_steamid, (err, response) => {
        resolveOuter(response)
      })
    })
  }

  public getUserSteamServer = (steam32Id: number | string) => {
    return new Promise((resolveOuter) => {
      this.dota2.spectateFriendGame(
        { steam_id: this.dota2.ToSteamID(Number(steam32Id)) },
        (response: any, err: any) => {
          console.log('response', response, err)

          resolveOuter(response?.server_steamid?.toString())
        },
      )
    })
  }

  public GetRealTimeStats = (steam_server_id: string, cb: (err: any, body: any) => void) => {
    if (!steam_server_id) {
      return cb(new Error('Match not found'), null)
    }

    const operation = retry.operation({
      retries: 8,
      factor: 2,
      minTimeout: 1 * 1000,
    })

    operation.attempt((currentAttempt: number) => {
      console.log('retrying ', currentAttempt)
      axios(
        `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steam_server_id}`,
      )
        .then((response) => {
          let arr: Error | undefined

          if (!response.data?.teams?.[0]?.players?.[0]?.heroid) {
            arr = new Error('Match not found')
          }

          if (operation.retry(arr)) {
            return
          }

          cb(arr ? arr : null, response.data)
        })
        .catch((e) => {
          const arr = new Error('Match not found')

          if (operation.retry(arr)) {
            return
          }

          cb(arr, null)
        })
    })

    // return Promise.reject(new CustomError("Game wasn't found"))
  }

  public getGcMatchData(matchId: number | string, cb: (err: any, body: any) => void) {
    const operation = retry.operation({
      retries: 8,
      factor: 2,
      minTimeout: 1 * 1000,
    })

    operation.attempt((currentAttempt: number) => {
      console.log('retrying ', currentAttempt)

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return this.dota2.requestMatchDetails(Number(matchId), (err: any, body: any) => {
        let arr: Error | undefined
        if (body?.match?.players) {
          body.match.players = body?.match?.players.map((p: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return {
              ...p,
              party_size: body.match.players.filter(
                (matchPlayer: any) => matchPlayer.party_id?.low === p.party_id?.low,
              ).length,
            }
          })

          console.log('received match', matchId)
        } else {
          console.log(err, 'match not found')
          arr = new Error('Match not found')
        }

        if (operation.retry(arr)) {
          return
        }

        cb(arr ? arr : null, body)
      })
    })
  }

  public static getInstance(): Dota {
    if (!Dota.instance) Dota.instance = new Dota()
    return Dota.instance
  }

  public getCards(accounts: number[]): Promise<
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
      const db = await mongo.db
      const promises = []
      const cards = await db
        .collection('cards')
        .find({ id: { $in: accounts } })
        .sort({ createdAt: -1 })
        .toArray()
      const arr: any[] = []
      for (let i = 0; i < accounts.length; i += 1) {
        let needToGetCard = false
        const card: any = cards.find((tempCard) => tempCard.id === accounts[i])
        if (!card || typeof card.rank_tier !== 'number') needToGetCard = true
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
                  await db.collection('cards').updateOne(
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
      clearInterval(this.interval)
      console.log('Clearing getting matches interval')
      this.dota2.exit()
      console.log('Manually closed dota')
      // @ts-expect-error disconnect is there
      this.steamClient.disconnect()
      console.log('Manually closed steam')
      this.steamClient.removeAllListeners()
      this.dota2.removeAllListeners()
      console.log('Removed all listeners from dota and steam')
      resolve(true)
    })
  }
}

export default Dota

const dota = Dota.getInstance()

process
  .on('SIGTERM', () => {
    console.log('Received SIGTERM')

    Promise.all([dota.exit()])
      .then(() => process.exit(0))
      .catch((e) => {
        console.log(e)
      })
  })
  .on('SIGINT', () => {
    console.log('Received SIGINT')

    Promise.all([dota.exit()])
      .then(() => process.exit(0))
      .catch((e) => {
        console.log(e)
      })
  })
  .on('uncaughtException', (e) => console.log('uncaughtException', e))
