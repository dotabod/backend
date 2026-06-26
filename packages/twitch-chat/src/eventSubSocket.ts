import { EventEmitter } from 'node:events'
import { logger } from '@dotabod/shared-utils'
import WebSocket from 'ws'

// Cap the reconnect backoff factor. The generic branch used to grow this
// unbounded; combined with leaked sockets that pushed it into the hundreds
// (delays of tens of seconds) while thousands of instances hammered Twitch in
// aggregate and got the bot 429'd (connection storm, 2026-06-19).
const MAX_BACKOFF = 10
// When Twitch rate-limits the websocket upgrade (HTTP 429) we must back off hard
// rather than immediately retrying, or we feed the very storm that caused it.
const RATE_LIMIT_COOLDOWN_MS = 30_000

// Spread reconnects across 50%–100% of the base delay so many sockets (or many
// processes) can't reconnect in lockstep and thunder the endpoint.
function withJitter(baseMs: number): number {
  return Math.round(baseMs * (0.5 + Math.random() * 0.5))
}

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
  private reconnectTimer?: NodeJS.Timeout
  private silenceTime = 10
  // Once disposed, every callback short-circuits and no new connect is made, so
  // a replaced socket can't keep reconnecting, re-registering the shard, or
  // writing the shared eventsubConnected flag in the background.
  private disposed = false
  // Set when the last upgrade failed with HTTP 429 so handleClose can apply the
  // rate-limit cooldown instead of an immediate reconnect.
  private got429 = false

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
    if (this.disposed) return
    this.counter++
    this.eventsub = new WebSocket(url) as WebSocket & { counter?: number }
    this.eventsub.counter = this.counter

    this.eventsub.addEventListener('open', this.handleOpen.bind(this))
    this.eventsub.addEventListener('close', (close) => this.handleClose(close, isReconnect))
    this.eventsub.addEventListener('error', this.handleError.bind(this))
    this.eventsub.addEventListener('message', this.handleMessage.bind(this))
  }

  private handleOpen(): void {
    if (this.disposed) return
    this.backoff = 0
    this.got429 = false
    logger.info('[EVENTSUB] WebSocket open', {
      counter: this.eventsub.counter,
      url: this.mainUrl,
    })
  }

  private handleClose(close: WebSocket.CloseEvent, _isReconnect: boolean): void {
    if (this.disposed) return
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

    // A socket told to stay down (e.g. after session_silenced — the conduitSetup
    // backstop owns recovery from there) must not reconnect itself, or we end up
    // with two live sockets fighting over the single conduit shard.
    if (this.disableAutoReconnect) {
      logger.warn('[EVENTSUB] Auto-reconnect disabled — staying down', { code: close.code })
      return
    }

    this.backoff = Math.min(this.backoff + 1, MAX_BACKOFF)

    // HTTP 429 on the upgrade surfaces as an error then a 1006 close. Back off
    // hard so a single socket can't pile onto Twitch's rate limit.
    if (this.got429) {
      this.got429 = false
      const delay = withJitter(RATE_LIMIT_COOLDOWN_MS)
      logger.warn('[EVENTSUB] Reconnecting after 429 (rate limited)', {
        delayMs: delay,
        twitchWsId: wsId,
      })
      this.scheduleReconnect(delay)
      return
    }

    if (close.code === 4003) {
      // Connection unused — Twitch closes a session with no active shard.
      const delay = withJitter(this.backoff * this.backoffStack)
      logger.info('[EVENTSUB] Reconnecting after 4003 (connection unused)', {
        backoff: this.backoff,
        delayMs: delay,
      })
      this.scheduleReconnect(delay)
      return
    }

    if (close.code === 4004) {
      // Reconnect grace expired. Normally this fires on the OLD socket after
      // session_reconnect handed off, in which case the stale check above
      // already skipped us. Reaching this branch means it's the *current*
      // socket — we must reconnect or we'll be stuck silent.
      const delay = withJitter(this.backoff * this.backoffStack)
      logger.warn(
        '[EVENTSUB] 4004 on live socket — reconnect grace expired without handoff, retrying',
        { backoff: this.backoff, delayMs: delay, twitchWsId: wsId },
      )
      this.scheduleReconnect(delay)
      return
    }

    const delay = withJitter(this.backoff * this.backoffStack)
    logger.info('[EVENTSUB] Scheduling reconnect', {
      code: close.code,
      backoff: this.backoff,
      delayMs: delay,
    })
    this.scheduleReconnect(delay)
  }

  // Single reconnect path: only ever one pending timer per socket, and it's
  // cleared on dispose so a replaced socket can't resurrect itself.
  private scheduleReconnect(delayMs: number): void {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connect(this.mainUrl, true), delayMs)
  }

  private handleError(err: WebSocket.ErrorEvent): void {
    if (this.disposed) return
    // ws surfaces a rejected upgrade as "Unexpected server response: 429".
    // Flag it so the following close applies the rate-limit cooldown.
    const rateLimited = typeof err.message === 'string' && err.message.includes('429')
    if (rateLimited) this.got429 = true
    logger.error('[EVENTSUB] WebSocket error', {
      message: err.message,
      type: err.type,
      counter: this.eventsub.counter,
      rateLimited,
    })
  }

  private handleMessage(message: WebSocket.MessageEvent): void {
    if (this.disposed) return
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
    if (this.disposed) return
    if (keepalive_timeout_seconds) {
      this.silenceTime = keepalive_timeout_seconds + 1
    }
    // Any keepalive/notification proves the connection is live — refresh the
    // flag so a stale close can't leave it stuck false while events still flow.
    eventsubConnected = true
    clearTimeout(this.silenceHandler)
    this.silenceHandler = setTimeout(() => {
      if (this.disposed) return
      eventsubConnected = false
      logger.warn('[EVENTSUB] session_silenced — no keepalive in window', {
        silenceTimeSec: this.silenceTime,
        twitchWsId: this.eventsub.twitch_websocket_id,
        wsReadyState: this.eventsub.readyState,
        counter: this.eventsub.counter,
        willClose: this.silenceReconnect,
      })
      // The conduitSetup session_silenced backstop owns recovery (a single
      // guarded re-init that disposes this socket). Disable self-reconnect so
      // closing below doesn't also spin up a competing socket.
      this.disableAutoReconnect = true
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

  public get isDisposed(): boolean {
    return this.disposed
  }

  /**
   * Permanently retire this socket: stop reconnecting, drop every timer and
   * listener, and close the underlying websocket. Idempotent. Call this before
   * replacing a socket so retired instances can't keep reconnecting,
   * re-registering the conduit shard, or writing the shared connection flag in
   * the background — the leak that produced the 2026-06-19 connection storm.
   */
  public dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.disableAutoReconnect = true
    clearTimeout(this.silenceHandler)
    clearTimeout(this.reconnectTimer)
    const ws = this.eventsub
    try {
      ws?.removeAllListeners()
      // Closing a still-CONNECTING socket makes `ws` abort the handshake and emit
      // an 'error' on a LATER tick (process.nextTick) — after this try/catch has
      // already returned, so it can't be caught here. With every listener removed
      // that is an unhandled 'error' event, which crashes the whole process (no
      // uncaughtException handler). The leaked sockets we dispose during a storm
      // are exactly the ones stuck reconnect-looping in CONNECTING, so keep a noop
      // error sink attached through close() to absorb the aborted-handshake error.
      ws?.addEventListener('error', () => {})
      if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        ws.close()
      }
    } catch (error) {
      logger.warn('[EVENTSUB] Error while disposing socket', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    this.removeAllListeners()
    logger.info('[EVENTSUB] Socket disposed', { counter: ws?.counter })
  }
}
