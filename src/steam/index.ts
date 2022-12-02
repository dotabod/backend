import crypto from 'crypto'
import fs from 'fs'

// @ts-expect-error ???
import Dota2 from 'dota2'
import Steam from 'steam'

import CustomError from '../utils/customError.js'
import { promiseTimeout } from '../utils/index.js'

interface steamUserDetails {
  account_name: string
  password: string
  sha_sentryfile?: Buffer
}

class Dota {
  private static instance: Dota

  private steamClient

  private steamUser

  private steamRichPresence

  public dota2

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

    this.steamClient.on('connected', () => {
      this.steamUser.logOn(details)
    })

    this.steamClient.on('logOnResponse', (logonResp: { eresult: any }) => {
      // @ts-expect-error ???
      if (logonResp.eresult == Steam.EResult.OK) {
        console.log('Logged on.')

        this.dota2.launch()
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
      this.steamClient.connect()
      console.log('Logged off from Steam.')
    })

    this.steamClient.on('error', (error: any) => {
      console.log(`steam error`, error)
      // @ts-expect-error connect is there i swear
      this.steamClient.connect()
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
}

export default Dota
