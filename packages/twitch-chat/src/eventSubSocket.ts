import { EventEmitter } from 'node:events'
import { logger } from '@dotabod/shared-utils'
import WebSocket from 'ws'

type EventsubSocketOptions = {
  url?: string
  connect?: boolean
  silenceReconnect?: boolean
  disableAutoReconnect?: boolean
}

type CloseCodeDescription = {
  [code: number]: string
}

interface SessionWelcomePayload {
  session: { id: string; keepalive_timeout_seconds: number }
}

interface NotificationPayload {
  subscription: { type: string }
}

interface SessionReconnectPayload {
  session: { reconnect_url: string }
}

let eventsubConnected = false

export function isEventsubConnected(): boolean {
  return eventsubConnected
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
    logger.info('[EVENTSUB] WebSocket open', {
      counter: this.eventsub.counter,
      url: this.mainUrl,
    })
  }

  private handleClose(close: WebSocket.CloseEvent, _isReconnect: boolean): void {
    const reasonText = this.closeCodes[close.code] || 'Unknown'
    const isStale = close.target !== this.eventsub
    const wsId = this.eventsub.twitch_websocket_id

    // Ignore closes from a stale socket (e.g. the old connection shutting down
    // after a session_reconnect handed off to a new one). Otherwise it clobbers
    // the live connection's status and can spawn duplicate reconnects.
    if (isStale) {
      logger.info('[EVENTSUB] Stale close ignored', {
        code: close.code,
        reason: reasonText,
        wsCounter: (close.target as typeof this.eventsub)?.counter,
        currentCounter: this.eventsub.counter,
      })
      return
    }

    eventsubConnected = false
    this.emit('close', close)
    logger.info('[EVENTSUB] WebSocket closed', {
      code: close.code,
      reason: reasonText,
      wasClean: close.wasClean,
      twitchWsId: wsId,
      counter: this.eventsub.counter,
    })

    if (close.code === 4003) {
      // Use exponential backoff for 4003 error (connection unused)
      this.backoff = Math.min(this.backoff + 1, 5) // Cap backoff factor at 5
      const reconnectDelay = this.backoff * this.backoffStack
      logger.info('[EVENTSUB] Reconnecting after 4003 (connection unused)', {
        backoff: this.backoff,
        delayMs: reconnectDelay,
      })
      setTimeout(() => this.connect(this.mainUrl, true), reconnectDelay)
      return
    }

    if (close.code === 4004) {
      // Reconnect grace expired. Normally this fires on the OLD socket after
      // session_reconnect handed off, in which case the stale check above
      // already skipped us. Reaching this branch means it's the *current*
      // socket — we must reconnect or we'll be stuck silent.
      logger.warn(
        '[EVENTSUB] 4004 on live socket — reconnect grace expired without handoff, retrying',
        { backoff: this.backoff, twitchWsId: wsId },
      )
      this.backoff++
      setTimeout(() => this.connect(this.mainUrl, true), this.backoff * this.backoffStack)
      return
    }

    if (!this.disableAutoReconnect) {
      this.backoff++
      logger.info('[EVENTSUB] Scheduling reconnect', {
        code: close.code,
        backoff: this.backoff,
        delayMs: this.backoff * this.backoffStack,
      })
      setTimeout(() => this.connect(this.mainUrl, true), this.backoff * this.backoffStack)
    } else {
      logger.warn('[EVENTSUB] Auto-reconnect disabled — staying down', { code: close.code })
    }
  }

  private handleError(err: WebSocket.ErrorEvent): void {
    logger.error('[EVENTSUB] WebSocket error', {
      message: err.message,
      type: err.type,
      counter: this.eventsub.counter,
    })
  }

  private handleMessage(message: WebSocket.MessageEvent): void {
    const data = JSON.parse(message.data as string)
    const { metadata, payload } = data
    const { message_type } = metadata

    switch (message_type) {
      case 'session_welcome':
        this.handleSessionWelcome(payload, this.eventsub.is_reconnecting || false)
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
        logger.info('[EVENTSUB] Received websocket_disconnect from Twitch', { payload })
        break
      case 'revocation': {
        logger.info('[TWITCHEVENTS] Revocation', { data })
        this.emit('revocation', { metadata, payload })
        break
      }
      default:
        logger.warn('[EVENTSUB] Unexpected message type', { metadata, payload })
        break
    }
  }

  private handleSessionWelcome(payload: SessionWelcomePayload, isReconnect: boolean): void {
    const { session } = payload
    const { id, keepalive_timeout_seconds } = session

    this.eventsub.twitch_websocket_id = id
    logger.info('[EVENTSUB] Session welcome', {
      sessionId: id,
      keepaliveSeconds: keepalive_timeout_seconds,
      isReconnect,
      counter: this.eventsub.counter,
    })

    eventsubConnected = true
    if (isReconnect) {
      this.emit('reconnected', id)
    } else {
      this.emit('connected', id)
    }

    this.silence(keepalive_timeout_seconds)
  }

  private handleNotification(
    metadata: Record<string, unknown>,
    payload: NotificationPayload,
  ): void {
    const { type } = payload.subscription
    this.emit(type, { metadata, payload })
    this.silence()
  }

  private handleSessionReconnect(payload: SessionReconnectPayload): void {
    this.eventsub.is_reconnecting = true
    const { reconnect_url } = payload.session

    logger.info('[EVENTSUB] session_reconnect received', {
      reconnectUrl: reconnect_url,
      oldCounter: this.eventsub.counter,
      oldWsId: this.eventsub.twitch_websocket_id,
    })
    this.emit('session_reconnect', reconnect_url)
    this.connect(reconnect_url, true)
  }

  private silence(keepalive_timeout_seconds?: number): void {
    if (keepalive_timeout_seconds) {
      this.silenceTime = keepalive_timeout_seconds + 1
    }
    // Any keepalive/notification proves the connection is live — refresh the
    // flag so a stale close can't leave it stuck false while events still flow.
    eventsubConnected = true
    clearTimeout(this.silenceHandler)
    this.silenceHandler = setTimeout(() => {
      eventsubConnected = false
      logger.warn('[EVENTSUB] session_silenced — no keepalive in window', {
        silenceTimeSec: this.silenceTime,
        twitchWsId: this.eventsub.twitch_websocket_id,
        wsReadyState: this.eventsub.readyState,
        counter: this.eventsub.counter,
        willClose: this.silenceReconnect,
      })
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
