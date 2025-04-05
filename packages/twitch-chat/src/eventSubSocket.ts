import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import { logger } from '@dotabod/shared-utils'

type EventsubSocketOptions = {
  url?: string
  connect?: boolean
  silenceReconnect?: boolean
  disableAutoReconnect?: boolean
}

type CloseCodeDescription = {
  [code: number]: string
}

export class EventsubSocket extends EventEmitter {
  private counter = 0
  private readonly closeCodes: CloseCodeDescription = {
    4000: 'Internal Server Error',
    4001: 'Client sent inbound traffic',
    4002: 'Client failed ping-pong',
    4003: 'Connection unused',
    4004: 'Reconnect grace time expired',
    4005: 'Network Timeout',
    4006: 'Network error',
    4007: 'Invalid Reconnect',
  }
  private mainUrl: string
  private silenceReconnect: boolean
  private disableAutoReconnect: boolean
  private backoff = 0
  private backoffStack = 100
  private eventsub!: WebSocket & {
    twitch_websocket_id?: string
    counter?: number
    is_reconnecting?: boolean
  }
  private silenceHandler?: NodeJS.Timeout
  private silenceTime = 10

  constructor({
    url = 'wss://eventsub.wss.twitch.tv/ws',
    connect = true,
    silenceReconnect = true,
    disableAutoReconnect = false,
  }: EventsubSocketOptions = {}) {
    super()
    this.mainUrl = url
    this.silenceReconnect = silenceReconnect
    this.disableAutoReconnect = disableAutoReconnect

    if (connect) {
      this.connect()
    }
  }

  private connect(url = this.mainUrl, isReconnect = false): void {
    this.counter++
    this.eventsub = new WebSocket(url) as WebSocket & { counter?: number }
    this.eventsub.counter = this.counter

    this.eventsub.addEventListener('open', this.handleOpen.bind(this))
    this.eventsub.addEventListener('close', (close) => this.handleClose(close, isReconnect))
    this.eventsub.addEventListener('error', this.handleError.bind(this))
    this.eventsub.addEventListener('message', this.handleMessage.bind(this))
  }

  private handleOpen(): void {
    this.backoff = 0
    console.debug('Opened Connection to Twitch')
  }

  private handleClose(close: WebSocket.CloseEvent, isReconnect: boolean): void {
    this.emit('close', close)
    console.debug(
      `Connection Closed: ${close.code} Reason - ${this.closeCodes[close.code] || 'Unknown'}`,
    )

    if (close.code === 4003) {
      console.debug('Client should decide to reconnect when it is ready')
      return
    }

    if (close.code === 4004) {
      console.debug('Old Connection is 4004-ing')
      return
    }

    if (!this.disableAutoReconnect) {
      this.backoff++
      console.debug('Retrying connection in', this.backoff * this.backoffStack)
      setTimeout(() => this.connect(this.mainUrl, true), this.backoff * this.backoffStack)
    }
  }

  private handleError(err: WebSocket.ErrorEvent): void {
    console.debug('Connection Error', err)
  }

  private handleMessage(message: WebSocket.MessageEvent): void {
    const data = JSON.parse(message.data as string)
    const { metadata, payload } = data
    const { message_type } = metadata

    switch (message_type) {
      case 'session_welcome':
        this.handleSessionWelcome(payload, message.isReconnect)
        break
      case 'session_keepalive':
        this.emit('session_keepalive')
        this.silence()
        break
      case 'notification':
        this.handleNotification(metadata, payload)
        break
      case 'session_reconnect':
        this.handleSessionReconnect(payload)
        break
      case 'websocket_disconnect':
        console.debug('Received Disconnect', payload)
        break
      case 'revocation': {
        logger.info('[TWITCHEVENTS] Revocation', { data })
        this.emit('revocation', { metadata, payload })
        break
      }
      default:
        console.debug('Unexpected message type', metadata, payload)
        break
    }
  }

  private handleSessionWelcome(payload: any, isReconnect: boolean): void {
    const { session } = payload
    const { id, keepalive_timeout_seconds } = session

    this.eventsub.twitch_websocket_id = id
    console.debug(`This is Socket ID ${id}`)
    console.debug(`Silence timeout set to ${keepalive_timeout_seconds} seconds`)

    if (isReconnect) {
      this.emit('reconnected', id)
    } else {
      this.emit('connected', id)
    }

    this.silence(keepalive_timeout_seconds)
  }

  private handleNotification(metadata: any, payload: any): void {
    const { type } = payload.subscription
    this.emit(type, { metadata, payload })
    this.silence()
  }

  private handleSessionReconnect(payload: any): void {
    this.eventsub.is_reconnecting = true
    const { reconnect_url } = payload.session

    console.debug(`Reconnect request to ${reconnect_url}`)
    this.emit('session_reconnect', reconnect_url)
    this.connect(reconnect_url, true)
  }

  private silence(keepalive_timeout_seconds?: number): void {
    if (keepalive_timeout_seconds) {
      this.silenceTime = keepalive_timeout_seconds + 1
    }
    clearTimeout(this.silenceHandler)
    this.silenceHandler = setTimeout(() => {
      this.emit('session_silenced')
      if (this.silenceReconnect) {
        this.close()
      }
    }, this.silenceTime * 1000)
  }

  public trigger(): void {
    this.eventsub.send('cat')
  }

  public close(): void {
    this.eventsub.close()
  }
}
