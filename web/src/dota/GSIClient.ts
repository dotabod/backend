import { EventEmitter } from 'events'

import { Packet, SocketClient } from '../types.js'

export class GSIClient extends EventEmitter {
  token: string
  gamestate?: Packet
  user?: SocketClient

  constructor(gamestate: Packet, token: string, user: SocketClient) {
    super()

    this.gamestate = gamestate
    this.token = token
    this.user = user
  }
}
