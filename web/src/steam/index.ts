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

import { delayedGames } from '../../prisma/generated/mongoclient/index.js'
import { getAccountsFromMatch } from '../dota/lib/getAccountsFromMatch.js'
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
    console.log('[STEAM]', "GC not ready, please listen for the 'ready' event.")
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
            console.log('[STEAM]', errorObject, err)
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
      console.log('[STEAM]', 'hello time out!')
    })
    this.steamClient.on('loggedOff', (eresult: any) => {
      // @ts-expect-error connect is there i swear
      if (process.env.NODE_ENV === 'production') this.steamClient.connect()
      console.log('[STEAM]', 'Logged off from Steam.', eresult)

      try {
        steamErrors(eresult, (err: any, errorObject: any) => {
          console.log('[STEAM]', errorObject, err)
        })
      } catch (e) {
        //
      }
    })

    this.steamClient.on('error', (error: any) => {
      console.log('[STEAM]', `steam error`, error)
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
        console.log('[STEAM]', 'sentryfile saved')

        callback({ sha_file: hashedSentry })
      },
    )

    this.dota2.on('ready', () => {
      console.log('[STEAM]', 'connected to dota game coordinator')
    })

    this.dota2.on('unready', () => {
      console.log('[STEAM]', 'disconnected from dota game coordinator')
    })

    // @ts-expect-error connect is there
    this.steamClient.connect()
  }

  // 2 minute delayed match data if its out of our region
  public getDelayedMatchData = (server_steamid: string, refetchCards = false) => {
    return new Promise((resolveOuter) => {
      this.GetRealTimeStats(server_steamid, false, refetchCards, (err, response) => {
        resolveOuter(response)
      })
    })
  }

  public getUserSteamServer = (steam32Id: number | string) => {
    return new Promise((resolveOuter) => {
      this.dota2.spectateFriendGame(
        { steam_id: this.dota2.ToSteamID(Number(steam32Id)) },
        (response: any, err: any) => {
          resolveOuter(response?.server_steamid?.toString())
        },
      )
    })
  }

  public GetRealTimeStats = (
    steam_server_id: string,
    waitForHeros: boolean,
    refetchCards = false,
    cb?: (err: any, body: any) => void,
  ) => {
    if (!steam_server_id) {
      return cb?.(new Error('Match not found'), null)
    }

    const operation = retry.operation({
      retries: 8,
      factor: 2,
      minTimeout: 1 * 1000,
    })

    operation.attempt((currentAttempt: number) => {
      console.log('[STEAM]', 'retrying GetRealTimeStats', currentAttempt)
      axios(
        `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steam_server_id}`,
      )
        .then(async (response) => {
          const game = response.data as delayedGames | undefined
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

          if (!hasAccountIds) {
            operation.retry(new Error('Waiting for account ids'))
            return
          }

          if (waitForHeros && !hasHeroes) {
            operation.retry(new Error('Match found, but waiting for hero ids'))
            return
          }

          if (waitForHeros && hasHeroes) {
            console.log('Saving match data with heroes', game.match.match_id)
            const db = await mongo.db
            await db
              .collection('delayedGames')
              .updateOne(
                { matchid: game.match.match_id },
                { $set: { ...game, createdAt: new Date() } },
                { upsert: true },
              )

            return
          }

          if (!waitForHeros) {
            console.log('Saving match data', game.match.match_id, { hasHeroes })
            try {
              const db = await mongo.db
              await db
                .collection('delayedGames')
                .updateOne(
                  { matchid: game.match.match_id },
                  { $set: { ...game, createdAt: new Date() } },
                  { upsert: true },
                )

              // Force get new medals for this match. They could have updated!
              if (refetchCards) {
                const { accountIds } = getAccountsFromMatch(game)
                void this.getCards(accountIds, true)
              }
            } catch (e) {
              console.log('mongo error saving match', e)
            }

            // Come back in 8 attempts to save the hero ids. With no cb()
            if (!hasHeroes) {
              console.log('Waiting for hero ids', game.match.match_id)
              this.GetRealTimeStats(steam_server_id, true)
            }
          }

          cb?.(null, game)
        })
        .catch((e) => {
          console.log(e)
          operation.retry(new Error('Match not found'))
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
      console.log('[STEAM]', 'retrying getGcMatchData', currentAttempt)

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

          console.log('[STEAM]', 'received match', matchId)
        } else {
          console.log('[STEAM]', err, 'match not found')
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
      this.dota2.exit()
      console.log('[STEAM]', 'Manually closed dota')
      // @ts-expect-error disconnect is there
      this.steamClient.disconnect()
      console.log('[STEAM]', 'Manually closed steam')
      this.steamClient.removeAllListeners()
      this.dota2.removeAllListeners()
      console.log('[STEAM]', 'Removed all listeners from dota and steam')
      resolve(true)
    })
  }
}

export default Dota

const dota = Dota.getInstance()

process
  .on('SIGTERM', () => {
    console.log('[STEAM]', 'Received SIGTERM')

    Promise.all([dota.exit()])
      .then(() => process.exit(0))
      .catch((e) => {
        console.log('[STEAM]', e)
      })
  })
  .on('SIGINT', () => {
    console.log('[STEAM]', 'Received SIGINT')

    Promise.all([dota.exit()])
      .then(() => process.exit(0))
      .catch((e) => {
        console.log('[STEAM]', e)
      })
  })
  .on('uncaughtException', (e) => console.log('[STEAM]', 'uncaughtException', e))
