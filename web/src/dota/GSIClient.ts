import { EventEmitter } from 'events'

import { Packet } from '../types.js'

export class GSIClient extends EventEmitter {
  ip: string
  auth: { token: string }
  token: string
  gamestate?: Packet

  constructor(ip: string, auth: { token: string }) {
    super()

    this.ip = ip
    this.auth = auth
    this.token = auth.token
  }
}
