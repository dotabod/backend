import { EventEmitter } from 'node:events'
import WebSocket from 'ws'

export class eventsubSocket extends EventEmitter {
  counter = 0
  closeCodes = {
    4000: 'Internal Server Error',
    4001: 'Client sent inbound traffic',
    4002: 'Client failed ping-pong',
    4003: 'Connection unused',
    4004: 'Reconnect grace time expired',
    4005: 'Network Timeout',
    4006: 'Network error',
    4007: 'Invalid Reconnect',
  }

  constructor({
    url = 'wss://eventsub.wss.twitch.tv/ws',
    connect = true,
    silenceReconnect = true,
    disableAutoReconnect = false,
  }) {
    super()

    this.silenceReconnect = silenceReconnect
    this.disableAutoReconnect = disableAutoReconnect
    this.mainUrl = url

    if (connect) {
      this.connect()
    }
  }

  mainUrl = 'wss://eventsub.wss.twitch.tv/ws'
  //mainUrl = "ws://127.0.0.1:8080/ws";
  backoff = 0
  backoffStack = 100

  connect(url, is_reconnect) {
    this.eventsub = {}
    this.counter++

    url = url ? url : this.mainUrl
    is_reconnect = is_reconnect ? is_reconnect : false

    console.debug(`Connecting to ${url}`)
    // this overrites and kills the old reference
    this.eventsub = new WebSocket(url)
    this.eventsub.counter = this.counter

    this.eventsub.addEventListener('open', () => {
      this.backoff = 0
      console.debug(`Opened Connection to Twitch`)
    })

    // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event
    // https://github.com/Luka967/websocket-close-codes
    this.eventsub.addEventListener('close', (close) => {
      // forward the close event
      this.emit('close', close)

      console.debug(
        `${this.eventsub.twitch_websocket_id}/${this.eventsub.counter} Connection Closed: ${close.code} Reason - ${this.closeCodes[close.code]}`,
      )

      // 4000 well damn
      // 4001 we should never get...
      // 4002 make a new socket
      if (close.code == 4003) {
        console.debug(
          'Did not subscribe to anything, the client should decide to reconnect (when it is ready)',
        )
        return
      }
      if (close.code == 4004) {
        // this is the old connection dying
        // we should of made a new connection to the new socket
        console.debug('Old Connection is 4004-ing')
        return
      }
      // 4005 make a new socket
      // 4006 make a new socket
      // 4007 make a new socket as we screwed up the reconnect?

      // anything else we should auto reconnect
      // but only if the user wants
      if (this.disableAutoReconnect) {
        return
      }

      //console.debug(`for ${this.eventsub.counter} making new`);
      this.backoff++
      console.debug('retry in', this.backoff * this.backoffStack)
      setTimeout(() => {
        this.connect()
      }, this.backoff * this.backoffStack)
    })
    // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/error_event
    this.eventsub.addEventListener('error', (err) => {
      //console.debug(err);
      console.debug(
        `${this.eventsub.twitch_websocket_id}/${this.eventsub.counter} Connection Error`,
      )
    })
    // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/message_event
    this.eventsub.addEventListener('message', (message) => {
      //console.debug('Message');
      //console.debug(this.eventsub.counter, message);
      let { data } = message
      data = JSON.parse(data)

      const { metadata, payload } = data
      const { message_id, message_type, message_timestamp } = metadata
      //console.debug(`Recv ${message_id} - ${message_type}`);

      switch (message_type) {
        case 'session_welcome':
          const { session } = payload
          const { id, keepalive_timeout_seconds } = session

          console.debug(`${this.eventsub.counter} This is Socket ID ${id}`)
          this.eventsub.twitch_websocket_id = id

          console.debug(
            `${this.eventsub.counter} This socket declared silence as ${keepalive_timeout_seconds} seconds`,
          )

          // is this a reconnect?
          if (is_reconnect) {
            // we carried subscriptions over
            this.emit('reconnected', id)
          } else {
            // now you would spawn your topics
            this.emit('connected', id)
          }

          this.silence(keepalive_timeout_seconds)

          break
        case 'session_keepalive':
          //console.debug(`Recv KeepAlive - ${message_type}`);
          this.emit('session_keepalive')
          this.silence()
          break

        case 'notification':
          //console.debug('notification', metadata, payload);
          const { subscription } = payload
          const { type } = subscription

          // chat.message is NOISY
          if (type != 'channel.chat.message') {
            console.debug(
              `${this.eventsub.twitch_websocket_id}/${this.eventsub.counter} Recv notification ${type}`,
            )
          }

          this.emit('notification', { metadata, payload })
          this.emit(type, { metadata, payload })
          this.silence()

          break

        case 'session_reconnect':
          this.eventsub.is_reconnecting = true

          const { reconnect_url } = payload.session

          console.debug(
            `${this.eventsub.twitch_websocket_id}/${this.eventsub.counter} Reconnect request ${reconnect_url}`,
          )

          this.emit('session_reconnect', reconnect_url)
          // stash old socket?
          //this.eventsub_dying = this.eventsub;
          //this.eventsub_dying.dying = true;
          // make new socket
          this.connect(reconnect_url, true)

          break
        case 'websocket_disconnect':
          console.debug(`${this.eventsub.counter} Recv Disconnect`)
          console.debug('websocket_disconnect', payload)

          break

        case 'revocation':
          console.debug(`${this.eventsub.counter} Recv Topic Revocation`)
          console.debug('revocation', payload)
          this.emit('revocation', { metadata, payload })
          break

        default:
          console.debug(`${this.eventsub.counter} unexpected`, metadata, payload)
          break
      }
    })
  }

  trigger() {
    // this function lets you test the disconnect on send method
    this.eventsub.send('cat')
  }
  close() {
    this.eventsub.close()
  }

  silenceHandler = false
  silenceTime = 10 // default per docs is 10 so set that as a good default
  silence(keepalive_timeout_seconds) {
    if (keepalive_timeout_seconds) {
      this.silenceTime = keepalive_timeout_seconds
      this.silenceTime++ // add a little window as it's too anal
    }
    clearTimeout(this.silenceHandler)
    this.silenceHandler = setTimeout(() => {
      this.emit('session_silenced') // -> self reconnecting
      if (this.silenceReconnect) {
        this.close() // close it and let it self loop
      }
    }, this.silenceTime * 1000)
  }
}
