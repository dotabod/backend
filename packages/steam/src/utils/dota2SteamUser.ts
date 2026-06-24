import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'

/**
 * Bridges DoctorMcKay's `steam-user` to the (unmaintained) `seishun/node-steam`
 * v1 Game-Coordinator interface that our `dotabod/node-dota2` fork is hard-wired
 * to.
 *
 * Why: Valve deprecated node-steam v1's legacy username/password CM logon in
 * 2026 (it now returns EResult 5 `InvalidPassword` even with correct
 * credentials), so the connection must be driven by `steam-user` (modern
 * refresh-token auth + auto-reconnect). But node-dota2 internally does
 * `new steam.SteamGameCoordinator(client, 570)` / `new steam.SteamUser(client)`
 * and speaks node-steam v1's GC dialect. Rather than fork/rewrite node-dota2 (and
 * lose its cache/match/sourcetv handlers), we keep it and feed it these shims.
 *
 * The GC wire contract maps 1:1 onto steam-user, which applies/strips the
 * 0x80000000 protobuf mask itself and does GC job-id matching natively:
 *   - v1 `.send({msg, proto}, buf, cb)`  → `user.sendToGC(appid, msg, {}, buf, cb)`
 *   - v1 `'message'(header, buf, cb)`    ← `user.on('receivedFromGC', (appid, msg, buf))`
 * Every message node-dota2 sends is protobuf-based (it always sets
 * `header.proto`), so the shim always takes the protobuf path (header `{}`).
 * steam-user routes job responses straight to the `sendToGC` callback and emits
 * `receivedFromGC` only for unsolicited pushes — exactly how node-steam v1 splits
 * job replies from its `'message'` event.
 */

/** Options passed to `steam-user`'s `logOn` (only the fields we use). */
export interface SteamLogOnDetails {
  accountName?: string
  password?: string
  refreshToken?: string
  machineName?: string
}

/** The slice of a `steam-user` instance these shims (and steam.ts) depend on. */
export interface SteamUserClient {
  steamID: { toString(): string } | null
  /** Not provided by steam-user; we set it ourselves so node-dota2 can read it. */
  loggedOn?: boolean
  logOn(details: SteamLogOnDetails): void
  logOff(): void
  gamesPlayed(apps: unknown, force?: boolean): void
  sendToGC(
    appid: number,
    msgType: number,
    header: Record<string, unknown> | null,
    body: Buffer,
    callback?: (appid: number, msgType: number, payload: Buffer) => void,
  ): void
  on(
    event: 'receivedFromGC',
    listener: (appid: number, msgType: number, payload: Buffer) => void,
  ): this
  on(event: 'loggedOn', listener: (details: unknown, parental: unknown) => void): this
  on(event: 'refreshToken', listener: (token: string) => void): this
  on(event: 'machineAuthToken', listener: (token: string) => void): this
  on(event: 'disconnected', listener: (eresult: number, msg?: string) => void): this
  on(event: 'error', listener: (err: { eresult?: number; message?: string }) => void): this
  removeAllListeners(): this
}

/** The v1 SteamGameCoordinator header shape node-dota2 constructs. */
interface GCHeader {
  msg: number
  proto?: Record<string, unknown>
}

const toBuffer = (data: Buffer | Uint8Array): Buffer =>
  Buffer.isBuffer(data) ? data : Buffer.from(data)

/** Emulates `steam.SteamGameCoordinator` on top of a `steam-user` instance. */
export class SteamGameCoordinatorShim extends EventEmitter {
  private readonly user: SteamUserClient
  private readonly appid: number

  constructor(user: SteamUserClient, appid: number) {
    super()
    this.user = user
    this.appid = appid

    this.user.on('receivedFromGC', (incomingAppid, msgType, payload) => {
      if (incomingAppid !== this.appid) return
      // node-dota2 reads only `header.msg`. Pushes have no reply channel, so the
      // third 'message' arg (callback) is always null — node-dota2 then calls the
      // handler with `(body)` only, matching v1 behaviour for non-job messages.
      this.emit('message', { msg: msgType, proto: {} }, toBuffer(payload), null)
    })
  }

  /**
   * Mirrors v1 `.send(header, body, callback)`. A `callback` marks a job request:
   * steam-user assigns the source job-id and invokes `(appid, msgType, payload)`
   * on the matching response, which we adapt back to v1's `(header, body)` shape
   * (node-dota2's `_convertCallback` only reads the body).
   */
  send(
    header: GCHeader,
    body: Buffer | Uint8Array,
    callback?: (header: GCHeader, body: Buffer) => void,
  ): void {
    const jobCb = callback
      ? (_appid: number, msgType: number, payload: Buffer) =>
          callback({ msg: msgType, proto: {} }, toBuffer(payload))
      : undefined
    this.user.sendToGC(this.appid, header.msg, {}, toBuffer(body), jobCb)
  }
}

/** Emulates the only slice of `steam.SteamUser` node-dota2 uses: `gamesPlayed`. */
export class SteamUserShim {
  private readonly user: SteamUserClient
  constructor(user: SteamUserClient) {
    this.user = user
  }

  // node-dota2 calls gamesPlayed([{game_id: 570}]) on launch and gamesPlayed([])
  // on exit; steam-user accepts both forms directly.
  gamesPlayed(apps: unknown): void {
    this.user.gamesPlayed(apps)
  }
}

/**
 * Patch the `steam` module instance that the `dotabod/node-dota2` fork loaded so
 * its internal `new steam.SteamGameCoordinator(client, appid)` /
 * `new steam.SteamUser(client)` build the shims above instead of node-steam v1's
 * networking classes.
 *
 * Resolves node-dota2's own `steam` dependency (a different install than this
 * package's `steam`) and mutates its exports; Node returns the same cached module
 * object node-dota2 require()'d, so the patch takes effect for it. Must run after
 * `import 'dota2'` (module cached) and before `new Dota2Client(...)`. Idempotent.
 */
export function patchNodeDota2GcForSteamUser(): void {
  const localRequire = createRequire(import.meta.url)
  const dota2Require = createRequire(localRequire.resolve('dota2'))
  const dota2Steam = dota2Require('steam') as {
    SteamGameCoordinator: unknown
    SteamUser: unknown
  }
  dota2Steam.SteamGameCoordinator = SteamGameCoordinatorShim
  dota2Steam.SteamUser = SteamUserShim
}
