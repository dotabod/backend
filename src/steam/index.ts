import crypto from 'crypto'
import fs from 'fs'

import { ID } from '@node-steam/id'
// @ts-expect-error ???
import Dota2 from 'dota2'
import Long from 'long'
import retry from 'retry'
import Steam from 'steam'
// @ts-expect-error ???
import steamErrors from 'steam-errors'

import { prisma } from '../db/prisma.js'
import CustomError from '../utils/customError.js'
import { promiseTimeout } from '../utils/index.js'
import Mongo from './mongo.js'

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

const generateRP = (txt: string) => {
  const temp: Record<string, any> = {}
  txt.replace(
    // eslint-disable-next-line no-control-regex
    /(?:^\x00([^\x00]*)\x00(.*)\x08$|\x01([^\x00]*)\x00([^\x00]*)\x00)/gm,
    (_match, ...args) => {
      if (args[0]) {
        temp[args[0]] = generateRP(args[1])
      } else if (args[2]) {
        ;[, , , temp[args[2]]] = args
      }
      return ''
    },
  )
  return temp
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

  private steamRichPresence

  public dota2

  private interval?: NodeJS.Timer

  constructor() {
    this.steamClient = new Steam.SteamClient()
    // @ts-expect-error ???
    this.steamUser = new Steam.SteamUser(this.steamClient)
    // @ts-expect-error ???
    this.steamRichPresence = new Steam.SteamRichPresence(this.steamClient, 570)
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

    prisma.steamAccount
      .findMany({ select: { steam32Id: true } })
      .then((account) => {
        const ids = account.map(
          ({ steam32Id }) => this.dota2.ToSteamID(steam32Id).toString() as string,
        )

        this.interval = setInterval(() => {
          this.getRichPresence(ids)
        }, 30000)
      })
      .catch((e) => {
        console.log(e)
      })

    this.steamClient.on('connected', () => {
      this.steamUser.logOn(details)
    })

    this.steamClient.on('logOnResponse', (logonResp: { eresult: any }) => {
      // @ts-expect-error ???
      if (logonResp.eresult == Steam.EResult.OK) {
        console.log('Logged on.')

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

  private getRichPresence(accounts: string[]) {
    // @ts-expect-error asdf
    if (!this.dota2._gcReady || !this.steamClient.loggedOn) return

    this.steamRichPresence.once('info', async (data: { rich_presence: string | any[] }) => {
      const rps = []
      const now = new Date()
      for (const pres of data.rich_presence) {
        const temp = pres.rich_presence_kv?.toString()
        if (!temp?.length) continue
        const object = generateRP(temp)
        if (!object.RP) continue

        const rp = object.RP
        rp.steam_id = Long.fromString(pres.steamid_user)
        if (rp.watching_server) {
          rp.watching_server = Long.fromString(new ID(rp.watching_server).getSteamID64())
        }

        if (rp.WatchableGameID === '0') {
          delete rp.WatchableGameID
        } else if (rp.WatchableGameID) {
          rp.WatchableGameID = Long.fromString(rp.WatchableGameID)
        }

        rp.createdAt = now
        if (!['#DOTA_RP_INIT', '#DOTA_RP_IDLE'].includes(rp.status)) {
          rps.push({
            status: rp.status,
            WatchableGameID: rp.WatchableGameID,
            WatchableGameIDStr: rp.WatchableGameID?.toString(),
            watching_server: rp.watching_server,
            steam_id: rp.steam_id,
            createdAt: rp.createdAt,
            param0: rp.param0,
          })
        }
      }

      const lobbyIds = new Set<Long>()
      const db = await mongo.db

      if (rps.length) {
        if (process.env.NODE_ENV === 'production') {
          await db.collection('rps').insertMany(rps)
        }

        rps
          .filter((rp) => rp.WatchableGameID)
          .forEach((rp) => lobbyIds.add(rp.WatchableGameID as Long))

        this.getGames(Array.from(lobbyIds), now)
      }
    })

    this.steamRichPresence.request(accounts)
  }

  private getGames(lobbyIds: Long[], time: Date) {
    // @ts-expect-error asdf
    if (!this.dota2._gcReady || !this.steamClient.loggedOn) return

    new Promise((resolve, reject) => {
      // @ts-expect-error asdf
      if (!this.dota2._gcReady || !this.steamClient.loggedOn) return
      let games: any = []
      let count = 0
      const start_game = 90
      const callbackSpecificGames = (data: {
        specific_games: boolean
        game_list: any[]
        start_game: number
      }) => {
        if (data.specific_games) {
          games = games.concat(
            data.game_list.filter((game) => game.players && game.players.length > 0),
          )
          count -= 1
          if (count === 0) {
            this.dota2.removeListener('sourceTVGamesData', callbackSpecificGames)
            resolve(
              games.filter(
                (game: { lobby_id: Long }, index: number) =>
                  games.findIndex((g: { lobby_id: Long }) => g.lobby_id === game.lobby_id) ===
                  index,
              ),
            )
          }
        }
      }
      const callbackNotSpecificGames = (data: {
        specific_games: boolean
        game_list: any[]
        league_id: number
        start_game: number
      }) => {
        if (!data.specific_games) {
          games = games.concat(
            data.game_list.filter((game: { players: string | any[] }) => game.players.length > 0),
          )
          if (data.league_id === 0 && start_game === data.start_game) {
            this.dota2.removeListener('sourceTVGamesData', callbackNotSpecificGames)
            if (lobbyIds.length) {
              this.dota2.on('sourceTVGamesData', callbackSpecificGames)
              while (lobbyIds.length > 0) {
                count += 1
                const tempLobbyIds = lobbyIds
                  .splice(0, 20)
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                  .map((lobbyId) => new Long(lobbyId.getLowBits(), lobbyId.getHighBits()))
                setTimeout(() => {
                  this.dota2.requestSourceTVGames({ lobby_ids: tempLobbyIds, start_game: 0 })
                }, 100 * (count - 1))
              }
            } else {
              resolve(
                games.filter(
                  (game: { lobby_id: Long }, index: number) =>
                    games.findIndex((g: { lobby_id: Long }) => g.lobby_id === game.lobby_id) ===
                    index,
                ),
              )
            }
          }
        }
      }
      this.dota2.on('sourceTVGamesData', callbackNotSpecificGames)
      this.dota2.requestSourceTVGames({ start_game: 90 })
    })
      .then(async (games: any) => {
        const db = await mongo.db

        // eslint-disable-next-line no-param-reassign
        games = games
          .map((match: Game) => ({
            average_mmr: match.average_mmr,
            game_mode: match.game_mode,
            league_id: match.league_id,
            lobbyId: new Long(match.lobby_id.low, match.lobby_id.high).toString(),
            matchId: new Long(match.match_id.low, match.match_id.high).toString(),
            match_id: new Long(match.match_id.low, match.match_id.high),
            lobby_id: new Long(match.lobby_id.low, match.lobby_id.high),
            lobby_type: match.lobby_type,
            players: match.players
              ? match.players.map((player: { account_id: number; hero_id: number }) => ({
                  account_id: player.account_id,
                  hero_id: player.hero_id,
                }))
              : null,
            server_steam_id: new Long(match.server_steam_id.low, match.server_steam_id.high),
            weekend_tourney_bracket_round: match.weekend_tourney_bracket_round,
            weekend_tourney_skill_level: match.weekend_tourney_skill_level,
            createdAt: time,
          }))
          // removes duplicates from this array
          .filter(
            (match: { match_id: Long }, index: number, self: { match_id: Long }[]) =>
              index ===
              self.findIndex((tempMatch: { match_id: Long }) =>
                tempMatch.match_id.equals(match.match_id),
              ),
          )
        if (process.env.NODE_ENV === 'production') {
          await db.collection('games').insertMany(games)
        }
        const gamesHistoryQuery = (
          await db
            .collection('gameHistory')
            .find(
              { match_id: { $in: games.map((game: { match_id: Long }) => game.match_id) } },
              { projection: { match_id: 1, players: 1 } },
            )
            .toArray()
        ).map((match) => {
          if (typeof match.match_id === 'number') {
            // eslint-disable-next-line no-param-reassign
            match.match_id = Long.fromNumber(match.match_id)
          }
          return match
        })
        const updateGamesHistoryArray = []
        for (const history of gamesHistoryQuery) {
          const game = games.find((g: { match_id: Long }) => g.match_id.equals(history.match_id))
          if (game) {
            let updated = false
            for (const gamePlayer of game.players) {
              const p = history.players.find(
                (player: { account_id: number }) => player.account_id === gamePlayer.account_id,
              )
              if (p !== undefined && p.hero_id === 0) {
                updated = true
                p.hero_id = gamePlayer.hero_id
              }
            }
            if (updated)
              updateGamesHistoryArray.push({
                updateOne: {
                  filter: { match_id: game.match_id },
                  update: { $set: { players: history.players } },
                },
              })
          } else {
            // console.log(`game not found?? ${history.match_id}`);
          }
        }
        if (updateGamesHistoryArray.length) {
          await db.collection('gameHistory').bulkWrite(updateGamesHistoryArray)
        }
        const filteredGames = games.filter(
          (game: { match_id: Long }) =>
            !gamesHistoryQuery.some((historyGame) => game.match_id.equals(historyGame.match_id)),
        )

        if (filteredGames.length) {
          if (process.env.NODE_ENV === 'production') {
            await db.collection('gameHistory').insertMany(filteredGames)
          }
        }
      })
      .catch((e) => {
        console.log(e)
      })
  }

  public static async findGame(
    channelQuery: {
      accounts?: number[]
      delay?: {
        enabled: boolean
        seconds?: number
      }
    },
    allowSpectating = false,
  ) {
    const db = await mongo.db
    if (!channelQuery.accounts?.length) throw new CustomError('No accounts connected')
    const seconds: number = channelQuery.delay?.enabled ? channelQuery.delay.seconds ?? 30 : 0
    const [gamesQuery, rpsQuery] = await Promise.all([
      db
        .collection('games')
        .aggregate(
          [
            { $match: { createdAt: { $gte: new Date(new Date().getTime() - 900000) } } },
            { $group: { _id: '$createdAt' } },
            { $sort: { _id: -1 } },
            { $skip: seconds / 30 },
            { $limit: 1 },
            {
              $lookup: {
                from: 'games',
                localField: '_id',
                foreignField: 'createdAt',
                as: 'matches',
              },
            },
            { $unwind: '$matches' },
            { $replaceRoot: { newRoot: '$matches' } },
            { $match: { 'players.account_id': { $in: channelQuery.accounts } } },
          ],
          { allowDiskUse: true },
        )
        .toArray(),
      db
        .collection('rps')
        .aggregate(
          [
            { $match: { createdAt: { $gte: new Date(new Date().getTime() - 900000) } } },
            { $group: { _id: '$createdAt' } },
            { $sort: { _id: -1 } },
            { $skip: seconds / 30 },
            { $limit: 1 },
            {
              $lookup: {
                from: 'rps',
                localField: '_id',
                foreignField: 'createdAt',
                as: 'rps',
              },
            },
            { $unwind: '$rps' },
            { $replaceRoot: { newRoot: '$rps' } },
            {
              $match: {
                steam_id: {
                  $in: channelQuery.accounts.map((account) => {
                    const id = this.getInstance().dota2.ToSteamID(account)
                    id._bsontype = 'Long'
                    return id
                  }),
                },
              },
            },
          ],
          { allowDiskUse: true },
        )
        .toArray(),
    ])
    if (gamesQuery.length === 0 || gamesQuery[0] === undefined) {
      if (rpsQuery.length === 0 || !allowSpectating) throw new CustomError("Game wasn't found")
      if (rpsQuery[0].watching_server || rpsQuery[0].WatchableGameID) {
        const match = rpsQuery[0].WatchableGameID
          ? { lobby_id: rpsQuery[0].WatchableGameID }
          : { server_steam_id: rpsQuery[0].watching_server }
        const spectatedGames = await db
          .collection('games')
          .aggregate(
            [
              { $match: { createdAt: { $gte: new Date(new Date().getTime() - 900000) } } },
              { $group: { _id: '$createdAt' } },
              { $sort: { _id: -1 } },
              { $skip: seconds / 30 },
              { $limit: 1 },
              {
                $lookup: {
                  from: 'games',
                  localField: '_id',
                  foreignField: 'createdAt',
                  as: 'matches',
                },
              },
              { $unwind: '$matches' },
              { $replaceRoot: { newRoot: '$matches' } },
              { $match: match },
            ],
            { allowDiskUse: true },
          )
          .toArray()
        if (spectatedGames.length) {
          if (spectatedGames[0] === undefined) throw new CustomError("Game wasn't found")
          return spectatedGames[0]
        }
      }
    }
    if (gamesQuery[0] === undefined) throw new CustomError("Game wasn't found")
    return gamesQuery[0]
  }

  public static getInstance(): Dota {
    if (!Dota.instance) Dota.instance = new Dota()
    return Dota.instance
  }

  public getCards(
    accounts: number[],
    lobbyId: Long,
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
        .find({ id: { $in: accounts }, lobby_id: { $in: [0, lobbyId] } })
        .sort({ createdAt: -1 })
        .toArray()
      const arr: any[] = []
      for (let i = 0; i < accounts.length; i += 1) {
        let needToGetCard = false
        if (lobbyId === Long.fromNumber(0)) {
          const card: any = cards.find(
            (tempCard) =>
              tempCard.id === accounts[i] &&
              tempCard.lobby_id === 0 &&
              new Date(card.createdAt).valueOf() < Date.now() - 1.8e6,
          )
          if (!card) needToGetCard = true
          else arr[i] = card
        } else {
          const card: any = cards.find(
            (tempCard) =>
              tempCard.id === accounts[i] && tempCard.lobby_id.toString() === lobbyId.toString(),
          )
          if (!card || typeof card.rank_tier !== 'number') needToGetCard = true
          else arr[i] = card
        }
        if (needToGetCard) {
          promises.push(
            retryCustom(10, () => this.getCard(accounts[i]), 100)
              .catch(() => ({ rank_tier: -10, leaderboard_rank: 0 }))
              .then(async (temporaryCard) => {
                arr[i] = {
                  ...temporaryCard,
                  id: accounts[i],
                  lobby_id: lobbyId,
                  createdAt: new Date(),
                  rank_tier: temporaryCard.rank_tier || 0,
                  leaderboard_rank: temporaryCard.leaderboard_rank || 0,
                }
                if (temporaryCard.rank_tier !== -10) {
                  await db.collection('cards').updateOne(
                    {
                      id: accounts[i],
                      lobby_id: lobbyId,
                    },
                    {
                      $set: {
                        ...temporaryCard,
                        id: accounts[i],
                        lobby_id: lobbyId,
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
